import { expect, test } from "./helpers/test"

import { hydrated, pt } from "./helpers/app"
import { AUTH_ENABLED, AUTH_SKIP_REASON, loadFixtures, storageStatePath } from "./helpers/fixtures"

// Isolamento entre grupos de pesquisa: quem pertence só ao grupo B não alcança nada do grupo A
// — nem pelas listagens, nem digitando a URL do detalhe, nem chamando a API com a própria sessão.

const DENIED = [403, 404]

test.describe("Isolamento entre grupos de pesquisa", () => {
  test.skip(!AUTH_ENABLED, AUTH_SKIP_REASON)
  test.use({ storageState: storageStatePath("otherOrg") })

  test("as listagens mostram só os dados do próprio grupo", async ({ page }) => {
    const { prefix, animals, research, orgs } = loadFixtures()

    await page.goto("/app/animals")
    const search = page.getByPlaceholder(pt.common.search, { exact: true })
    await hydrated(search)
    // O prefixo é comum aos dois grupos: sem isolamento, os animais de A apareceriam aqui.
    await search.fill(prefix)
    await expect(page.getByRole("row").filter({ hasText: animals.orgB.controlId })).toBeVisible()
    await expect(page.getByText(animals.shared.controlId)).toHaveCount(0)
    await expect(page.getByText(animals.restricted.controlId)).toHaveCount(0)
    await expect(page.getByText(animals.mapPublic.controlId)).toHaveCount(0)

    await page.goto("/app/research")
    const researchSearch = page.getByPlaceholder(pt.research.searchPlaceholder)
    await hydrated(researchSearch)
    await researchSearch.fill(prefix)
    await expect(page.getByRole("row").filter({ hasText: research.orgB.name })).toBeVisible()
    await expect(page.getByText(research.shared.name)).toHaveCount(0)
    await expect(page.getByText(research.restricted.name)).toHaveCount(0)
    await expect(page.getByText(research.publicMap.name)).toHaveCount(0)

    await page.goto("/app/members")
    await expect(page.getByRole("heading", { name: pt.members.title, level: 1 })).toBeVisible()
    await expect(page.getByText(orgs.b.name).first()).toBeVisible()
    await expect(page.getByText(orgs.a.name)).toHaveCount(0)
  })

  test("a URL direta do detalhe de outro grupo não abre", async ({ page }) => {
    const { animals, research } = loadFixtures()

    await page.goto(`/app/animals/${animals.shared.id}`)
    await expect(page).toHaveURL(/\/app\/animals$/)
    await expect(page.getByText(animals.shared.controlId)).toHaveCount(0)

    await page.goto(`/app/research/${research.shared.id}`)
    await expect(page).toHaveURL(/\/app\/research$/)
    await expect(page.getByRole("heading", { name: pt.research.title, level: 1 })).toBeVisible()
    await expect(page.getByText(research.shared.name)).toHaveCount(0)
  })

  test("a API recusa leitura e escrita nos dados de outro grupo", async ({ request }) => {
    const { animals, research, orgs } = loadFixtures()
    const animal = animals.shared

    for (const api of [
      `/api/animals/${animal.id}`,
      `/api/animals/${animal.id}/samples`,
      `/api/animals/${animal.id}/grid`,
      `/api/animals/${animal.id}/audit`,
      `/api/animals/${animal.id}/media`,
      `/api/research/${research.shared.id}`,
      `/api/research/${research.shared.id}/results`,
      `/api/research/${research.shared.id}/members`,
      `/api/research/${research.shared.id}/export/darwin-core`,
      `/api/research/${research.shared.id}/export/xlsx`,
      `/api/organizations/${orgs.a.id}/members`,
    ]) {
      const res = await request.get(api)
      expect(DENIED, api).toContain(res.status())
      expect(await res.text(), api).not.toContain(animal.controlId)
    }

    // Pesquisa pública também não abre a API interna para quem é de fora do grupo.
    const publicResearch = await request.get(`/api/research/${research.publicMap.id}/results`)
    expect(DENIED).toContain(publicResearch.status())

    const edit = await request.put(`/api/animals/${animal.id}`, {
      data: { municipality: "alterado por outro grupo" },
    })
    expect(DENIED).toContain(edit.status())
    const remove = await request.delete(`/api/animals/${animal.id}`)
    expect(DENIED).toContain(remove.status())

    // Não dá para "entrar" no outro grupo trocando a organização ativa.
    const switchOrg = await request.post("/api/active-org", { data: { orgId: orgs.a.id } })
    expect(switchOrg.status()).toBe(403)

    // As recusas acima são de autorização, não de sessão: o próprio animal responde normalmente.
    const own = await request.get(`/api/animals/${animals.orgB.id}`)
    expect(own.status()).toBe(200)
    expect(await own.text()).toContain(animals.orgB.controlId)
  })
})

test.describe("Isolamento visto do grupo dono", () => {
  test.skip(!AUTH_ENABLED, AUTH_SKIP_REASON)
  test.use({ storageState: storageStatePath("orgAdmin") })

  test("o animal que o grupo B tentou alterar e excluir continua intacto", async ({ request }) => {
    const { animals } = loadFixtures()

    const res = await request.get(`/api/animals/${animals.shared.id}`)
    expect(res.status()).toBe(200)
    const body = (await res.json()) as { controlId: string; municipality: string }
    expect(body.controlId).toBe(animals.shared.controlId)
    expect(body.municipality).toBe("Florianópolis")
  })
})
