import { type Page } from "@playwright/test"

import { expect, test } from "./helpers/test"

import { hydrated, pickFromSelect, pt } from "./helpers/app"
import { AUTH_ENABLED, AUTH_SKIP_REASON, loadFixtures, storageStatePath } from "./helpers/fixtures"

// Usuário com vínculo em dois grupos: a troca do grupo ativo (seletor da barra lateral) muda os
// dados de todas as telas. Cada grupo tem um único animal, de ID próprio.

test.describe("Grupo ativo", () => {
  test.skip(!AUTH_ENABLED, AUTH_SKIP_REASON)
  test.use({ storageState: storageStatePath("multiOrg") })

  // Filtra a lista pelo prefixo da execução e espera a resposta dessa busca chegar: a troca de
  // grupo com a busca ainda em andamento é um caso à parte (último teste do arquivo).
  async function searchAnimals(page: Page) {
    const search = page.getByPlaceholder(pt.common.search, { exact: true })
    await hydrated(search)
    const loaded = page.waitForResponse(
      (res) => res.url().includes("/api/animals?") && res.url().includes("q="),
    )
    await search.fill(loadFixtures().prefix)
    await loaded
  }

  test("trocar o grupo ativo muda a lista de animais, o dashboard e as pesquisas", async ({
    page,
  }) => {
    const { orgs, multi } = loadFixtures()
    const groups = [
      { org: orgs.multiC, ...multi.c },
      { org: orgs.multiD, ...multi.d },
    ]

    await page.goto("/app/animals")
    const switcher = page.getByRole("combobox").filter({ hasText: /Grupo [CD]$/ })
    await hydrated(switcher)
    // O grupo inicial é o que o servidor escolher; o teste parte dele e vai ao outro.
    const startsAtC = (await switcher.innerText()).includes(orgs.multiC.name)
    const [first, second] = startsAtC ? groups : [groups[1]!, groups[0]!]

    await searchAnimals(page)
    await expect(page.getByRole("row").filter({ hasText: first!.animal.controlId })).toBeVisible()
    await expect(page.getByText(second!.animal.controlId)).toHaveCount(0)

    // Troca sem sair da tela: a lista passa a ser a do outro grupo.
    await pickFromSelect(page, switcher, second!.org.name)
    await expect(switcher).toHaveText(second!.org.name)
    await expect(page.getByRole("row").filter({ hasText: second!.animal.controlId })).toBeVisible()
    await expect(page.getByText(first!.animal.controlId)).toHaveCount(0)

    // A escolha vale para as outras telas e sobrevive a um recarregamento.
    await page.goto("/app/dashboard")
    await expect(page.getByText(`Grupo de pesquisa ativo: ${second!.org.name}.`)).toBeVisible()
    await page.goto("/app/research")
    await expect(page.getByRole("row").filter({ hasText: second!.research.name })).toBeVisible()
    await expect(page.getByText(first!.research.name)).toHaveCount(0)

    // O registro do outro grupo deixa de abrir enquanto ele não é o ativo… e volta ao trocar.
    await page.goto("/app/animals")
    await hydrated(switcher)
    await pickFromSelect(page, switcher, first!.org.name)
    await searchAnimals(page)
    await expect(page.getByRole("row").filter({ hasText: first!.animal.controlId })).toBeVisible()
    await expect(page.getByText(second!.animal.controlId)).toHaveCount(0)

    // "Meus grupos de pesquisa" lista os dois vínculos, com o papel.
    await page.goto("/app/organizations")
    for (const g of groups) {
      await expect(page.getByRole("row").filter({ hasText: g.org.name })).toContainText(
        pt.common.roleAdmin,
      )
    }
  })

  test("trocar de grupo com a lista ainda carregando não deixa na tela os dados do grupo anterior", async ({
    page,
  }) => {
    // Defeito do app: a troca de grupo invalida as consultas em cache, mas uma consulta que
    // ainda está na PRIMEIRA carga não é refeita — a resposta pedida no grupo anterior chega
    // depois e fica na tela como se fosse do grupo novo (até o cache vencer, 60 s).
    // Esperado: depois da troca, a lista mostra só os animais do grupo escolhido.
    test.fail()

    const { orgs, multi } = loadFixtures()
    const groups = [
      { org: orgs.multiC, ...multi.c },
      { org: orgs.multiD, ...multi.d },
    ]

    await page.goto("/app/animals")
    const switcher = page.getByRole("combobox").filter({ hasText: /Grupo [CD]$/ })
    await hydrated(switcher)
    const startsAtC = (await switcher.innerText()).includes(orgs.multiC.name)
    const [first, second] = startsAtC ? groups : [groups[1]!, groups[0]!]
    await expect(page.getByRole("row").filter({ hasText: first!.animal.controlId })).toBeVisible()

    // A resposta da busca (pedida no grupo atual) fica retida até a troca de grupo terminar.
    let release = () => {}
    const switched = new Promise<void>((resolve) => (release = resolve))
    await page.route("**/api/animals?*q=*", async (route) => {
      const response = await route.fetch()
      await switched
      await route.fulfill({ response })
    })
    const requested = page.waitForRequest((req) => req.url().includes("/api/animals?q="))
    await page.getByPlaceholder(pt.common.search, { exact: true }).fill(loadFixtures().prefix)
    await requested

    const done = page.waitForResponse((res) => res.url().endsWith("/api/active-org"))
    await pickFromSelect(page, switcher, second!.org.name)
    expect((await done).status()).toBe(200)
    release()

    await expect(page.getByRole("row").filter({ hasText: second!.animal.controlId })).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByText(first!.animal.controlId)).toHaveCount(0)
  })
})
