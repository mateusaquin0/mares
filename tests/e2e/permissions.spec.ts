import { type Page } from "@playwright/test"

import { expect, test } from "./helpers/test"

import { hydrated, pt, toast } from "./helpers/app"
import { AUTH_ENABLED, AUTH_SKIP_REASON, loadFixtures, storageStatePath } from "./helpers/fixtures"

// Permissões por papel (docs/PERMISSOES.md): o que cada papel alcança pela interface, pela URL
// direta e pela API. Os dados vêm do global-setup: a pesquisadora participa da pesquisa
// "compartilhada" e NÃO participa da "restrita", ambas do mesmo grupo.

const DENIED = [403, 404]

// Filtra a listagem de animais pelo prefixo da execução (o banco de testes tem outros dados).
async function searchAnimals(page: Page, text: string) {
  await page.goto("/app/animals")
  const search = page.getByPlaceholder(pt.common.search, { exact: true })
  await hydrated(search)
  await search.fill(text)
}

test.describe("Pesquisadora (RESEARCHER)", () => {
  test.skip(!AUTH_ENABLED, AUTH_SKIP_REASON)
  test.use({ storageState: storageStatePath("researcher") })

  test("vê os membros do grupo só para leitura e não consegue gerenciá-los", async ({ page }) => {
    const { orgs, users } = loadFixtures()

    await page.goto("/app/members")
    await expect(page.getByRole("heading", { name: pt.members.title, level: 1 })).toBeVisible()
    // A lista carrega (leitura é permitida ao pesquisador)…
    await expect(page.getByRole("row").filter({ hasText: users.orgAdmin.email })).toBeVisible()
    // …mas sem nenhuma ação de gestão.
    await expect(page.getByRole("button", { name: pt.members.addMember })).toHaveCount(0)
    await expect(page.getByRole("button", { name: pt.members.editOrg })).toHaveCount(0)

    // A regra vale no servidor, não só na tela: as rotas de gestão recusam o papel.
    const add = await page.request.post(`/api/organizations/${orgs.a.id}/members`, { data: {} })
    expect(add.status()).toBe(403)
    const rename = await page.request.patch(`/api/organizations/${orgs.a.id}`, {
      data: { name: "nome que não deve ser gravado" },
    })
    expect(rename.status()).toBe(403)
    const remove = await page.request.delete(
      `/api/organizations/${orgs.a.id}/members/${users.signIn.id}`,
    )
    expect(remove.status()).toBe(403)
  })

  test("não alcança a administração global", async ({ page }) => {
    await page.goto("/app/admin/access-requests")
    await expect(page).toHaveURL(/\/app\/dashboard$/)
    await expect(page.getByRole("heading", { name: pt.dashboard.title, level: 1 })).toBeVisible()
    await expect(page.locator('a[href^="/app/admin"]')).toHaveCount(0)

    for (const path of ["/app/admin/organizations", "/app/admin/users", "/app/admin/feedback"]) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/app\/dashboard$/)
    }

    for (const api of [
      "/api/admin/users",
      "/api/admin/organizations",
      "/api/admin/access-requests",
    ]) {
      expect((await page.request.get(api)).status(), api).toBe(403)
    }
  })

  test("só enxerga os animais das pesquisas de que participa", async ({ page }) => {
    const { prefix, animals, research } = loadFixtures()

    await searchAnimals(page, prefix)
    await expect(page.getByRole("row").filter({ hasText: animals.shared.controlId })).toBeVisible()
    await expect(page.getByText(animals.restricted.controlId)).toHaveCount(0)

    // Acesso direto ao detalhe do animal da pesquisa restrita: é devolvida à listagem.
    await page.goto(`/app/animals/${animals.restricted.id}`)
    await expect(toast(page, pt.animals.accessEnded)).toBeVisible()
    await expect(page).toHaveURL(/\/app\/animals$/)

    // E a API não entrega o registro nem os dados pendurados nele.
    for (const api of [
      `/api/animals/${animals.restricted.id}`,
      `/api/animals/${animals.restricted.id}/samples`,
      `/api/animals/${animals.restricted.id}/grid`,
      `/api/animals/${animals.restricted.id}/audit`,
      `/api/research/${research.restricted.id}`,
      `/api/research/${research.restricted.id}/results`,
      `/api/research/${research.restricted.id}/export/darwin-core`,
    ]) {
      const res = await page.request.get(api)
      expect(DENIED, api).toContain(res.status())
      expect(await res.text(), api).not.toContain(animals.restricted.controlId)
    }

    // O animal da pesquisa em que participa continua acessível.
    const own = await page.request.get(`/api/animals/${animals.shared.id}`)
    expect(own.status()).toBe(200)
  })

  test("vê a pesquisa restrita só como vitrine: pode pedir acesso, não abrir", async ({ page }) => {
    const { prefix, research } = loadFixtures()

    await page.goto("/app/research")
    const search = page.getByPlaceholder(pt.research.searchPlaceholder)
    await hydrated(search)
    await search.fill(prefix)

    const member = page.getByRole("row").filter({ hasText: research.shared.name })
    await expect(member).toContainText(pt.research.accessMember)

    const showcase = page.getByRole("row").filter({ hasText: research.restricted.name })
    await expect(showcase.getByRole("button", { name: pt.research.accessRequest })).toBeVisible()
    // Sem vínculo, a linha não navega para o detalhe.
    await showcase.getByText(research.restricted.name).click()
    await expect(page).toHaveURL(/\/app\/research$/)

    await page.goto(`/app/research/${research.restricted.id}`)
    await expect(page.getByText(pt.research.notFound)).toBeVisible()
    await expect(page.getByRole("heading", { name: research.restricted.name })).toHaveCount(0)
  })
})

test.describe("Admin do grupo (ORG_ADMIN)", () => {
  test.skip(!AUTH_ENABLED, AUTH_SKIP_REASON)
  test.use({ storageState: storageStatePath("orgAdmin") })

  test("gerencia os membros e enxerga todas as pesquisas do grupo, sem alcançar a administração global", async ({
    page,
  }) => {
    const { prefix, animals } = loadFixtures()

    await page.goto("/app/members")
    await expect(page.getByRole("button", { name: pt.members.addMember })).toBeVisible()
    await expect(page.getByRole("button", { name: pt.members.editOrg })).toBeVisible()

    // O mesmo filtro que escondia o animal da pesquisadora mostra os dois ao admin.
    await searchAnimals(page, prefix)
    await expect(page.getByRole("row").filter({ hasText: animals.shared.controlId })).toBeVisible()
    await expect(
      page.getByRole("row").filter({ hasText: animals.restricted.controlId }),
    ).toBeVisible()

    await page.goto("/app/admin/users")
    await expect(page).toHaveURL(/\/app\/dashboard$/)
    expect((await page.request.get("/api/admin/users")).status()).toBe(403)
  })
})

test.describe("Admin global", () => {
  test.skip(!AUTH_ENABLED, AUTH_SKIP_REASON)
  test.use({ storageState: storageStatePath("systemAdmin") })

  test("alcança a administração e é levado a ela ao entrar", async ({ page }) => {
    const { orgs, animals } = loadFixtures()

    // Sem grupo próprio, a tela inicial do admin global são as solicitações de acesso.
    await page.goto("/app/dashboard")
    await expect(page).toHaveURL(/\/app\/admin\/access-requests$/)
    await expect(
      page.getByRole("heading", { name: pt.adminRequests.title, level: 1 }),
    ).toBeVisible()
    // A navegação é a da administração, com o nome no lugar do grupo.
    await expect(
      page.getByText(pt.sidebar.globalAdminOrg, { exact: true }).filter({ visible: true }),
    ).toBeVisible()
    await expect(page.getByRole("link", { name: pt.sidebar.adminUsers, exact: true })).toBeVisible()
    await expect(page.getByRole("link", { name: pt.sidebar.dashboard, exact: true })).toHaveCount(0)

    await page.goto("/app/admin/organizations")
    await expect(page).toHaveURL(/\/app\/admin\/organizations$/)
    await expect(page.getByText(orgs.a.name).first()).toBeVisible()

    expect((await page.request.get("/api/admin/users")).status()).toBe(200)

    // Administrar a aplicação não dá acesso aos dados científicos dos grupos.
    const animal = await page.request.get(`/api/animals/${animals.shared.id}`)
    expect(DENIED).toContain(animal.status())
  })
})
