import { type Page } from "@playwright/test"

import { expect, test } from "./helpers/test"

import { expectToast, hydrated, pt, rowMenu } from "./helpers/app"
import { AUTH_ENABLED, AUTH_SKIP_REASON, loadFixtures, storageStatePath } from "./helpers/fixtures"

// Solicitação de acesso: o formulário público (/request-access) e a fila do admin global, além
// das listagens da administração (usuários e grupos).
//
// APROVAR uma solicitação cria o grupo e dispara um convite por e-mail de verdade — a suíte
// nunca aprova pela interface (a regra é coberta pelos testes de integração), e a rota de
// aprovação fica bloqueada no navegador para garantir. A rejeição não envia nada.

const ra = pt.requestAccess
const ar = pt.adminRequests

const requestOf = () => {
  const { prefix } = loadFixtures()
  return {
    name: `${prefix} Pessoa Solicitante`,
    email: `${prefix}-solicitante@test.local`,
    org: `${prefix} Grupo Solicitado`,
  }
}

async function fillRequest(page: Page, data: { name: string; email: string; org: string }) {
  await page.getByLabel(ra.name).fill(data.name)
  await page.getByLabel(pt.common.email).fill(data.email)
  await page.getByLabel(ra.orgName).fill(data.org)
}

test.describe("Solicitação de acesso", () => {
  test.skip(!AUTH_ENABLED, AUTH_SKIP_REASON)
  test.describe.configure({ mode: "serial" })

  test("formulário público: valida os campos, registra a solicitação e recusa a repetida", async ({
    browser,
  }) => {
    const data = requestOf()
    // A rota limita as solicitações por endereço de origem (5 por hora). Cada execução se
    // apresenta com um endereço próprio, para o limite — que vive na memória do servidor da
    // suíte — não somar com o das execuções anteriores.
    const context = await browser.newContext({
      extraHTTPHeaders: { "x-forwarded-for": `10.99.${Date.now() % 250}.${Date.now() % 199}` },
    })
    const page = await context.newPage()

    await page.goto("/login")
    await page.getByRole("link", { name: pt.login.requestAccess }).click()
    await expect(page).toHaveURL(/\/request-access$/)
    await expect(page.getByRole("heading", { name: ra.title })).toBeVisible()
    const submit = page.getByRole("button", { name: ra.submit })
    await hydrated(submit)

    // Vazio: cada campo acusa o que falta, inclusive o aceite dos termos.
    await submit.click()
    await expect(page.getByText(pt.validation.name)).toBeVisible()
    await expect(page.getByText(pt.validation.email)).toBeVisible()
    await expect(page.getByText(pt.validation.min3)).toBeVisible()
    await expect(page.getByText(pt.validation.termsRequired)).toBeVisible()

    await fillRequest(page, { ...data, email: "sem-arroba" })
    await submit.click()
    await expect(page.getByText(pt.validation.email)).toBeVisible()
    await expect(page.getByText(pt.validation.termsRequired)).toBeVisible()

    await fillRequest(page, data)
    await page.getByRole("checkbox").check()
    await expect(page.getByText(pt.validation.termsRequired)).toHaveCount(0)
    await submit.click()
    await expect(page.getByRole("heading", { name: ra.sentTitle })).toBeVisible()
    await expect(page.getByText(ra.sentDescription)).toBeVisible()
    await page.getByRole("link", { name: pt.common.backToLogin }).click()
    await expect(page).toHaveURL(/\/login$/)

    // Mesma pessoa de novo, com a primeira ainda pendente.
    await page.goto("/request-access")
    await hydrated(page.getByRole("button", { name: ra.submit }))
    await fillRequest(page, data)
    await page.getByRole("checkbox").check()
    await page.getByRole("button", { name: ra.submit }).click()
    await expectToast(page, ra.errorTitle)
    await expect(
      page.getByText("Já existe uma solicitação pendente para este e-mail"),
    ).toBeVisible()
    await expect(page.getByRole("heading", { name: ra.sentTitle })).toHaveCount(0)

    await context.close()
  })

  test("admin global vê a solicitação na fila e a rejeita", async ({ browser }) => {
    const data = requestOf()
    const context = await browser.newContext({ storageState: storageStatePath("systemAdmin") })
    const page = await context.newPage()
    await page.setViewportSize({ width: 1440, height: 900 })
    // Trava: nenhuma aprovação sai deste navegador (ela enviaria e-mail).
    await page.route("**/api/admin/access-requests/*/approve", (route) => route.abort())

    await page.goto("/app/admin/access-requests")
    await expect(page.getByRole("heading", { name: ar.title, level: 1 })).toBeVisible()
    const row = page.getByRole("row").filter({ hasText: data.org })
    await expect(row).toContainText(data.name)
    await expect(row).toContainText(data.email)
    // A fila conta no menu lateral.
    await expect(
      page.getByRole("link", { name: pt.sidebar.adminRequests }).getByRole("status"),
    ).toBeVisible()

    await hydrated(row.getByRole("button", { name: ar.colActions }))
    await rowMenu(page, row, ar.reject, ar.colActions)
    await expectToast(page, ar.rejected)
    await expect(row).toHaveCount(0)

    await page.reload()
    await expect(page.getByRole("heading", { name: ar.title, level: 1 })).toBeVisible()
    await expect(page.getByRole("columnheader", { name: ar.colOrg })).toBeVisible()
    await expect(page.getByText(data.org)).toHaveCount(0)

    await context.close()
  })
})

test.describe("Administração global: listagens", () => {
  test.skip(!AUTH_ENABLED, AUTH_SKIP_REASON)
  test.use({ storageState: storageStatePath("systemAdmin") })

  test("usuários: busca, vínculos, status e a proteção da própria conta de admin", async ({
    page,
  }) => {
    const { users, orgs, prefix } = loadFixtures()
    const u = pt.adminUsers

    await page.goto("/app/admin/users")
    await expect(page.getByRole("heading", { name: u.title, level: 1 })).toBeVisible()
    const search = page.getByPlaceholder(pt.common.search, { exact: true })
    await hydrated(search)

    await search.fill(users.workAdmin.email)
    const admin = page.getByRole("row").filter({ hasText: users.workAdmin.email })
    await expect(admin).toContainText(users.workAdmin.name)
    await expect(admin).toContainText(`${orgs.work.name} (${pt.common.roleAdmin})`)
    await expect(admin).toContainText(u.statusActive)
    await expect(admin.getByRole("button", { name: pt.common.delete })).toBeEnabled()

    // Quem pertence a dois grupos aparece com os dois.
    await search.fill(users.multiOrg.email)
    const multi = page.getByRole("row").filter({ hasText: users.multiOrg.email })
    await expect(multi).toContainText(orgs.multiC.name)
    await expect(multi).toContainText(orgs.multiD.name)

    // O admin da aplicação não pode ser excluído por aqui.
    await search.fill(users.systemAdmin.email)
    const self = page.getByRole("row").filter({ hasText: users.systemAdmin.email })
    await expect(self.getByLabel(u.globalAdmin)).toBeVisible()
    await expect(self).toContainText(u.noOrg)
    await expect(self.getByRole("button", { name: pt.common.delete })).toBeDisabled()

    // Busca pelo nome do grupo e ordenação por e-mail.
    await search.fill(`${prefix} Grupo de Trabalho`)
    await expect(
      page.getByRole("row").filter({ hasText: users.workResearcher.email }),
    ).toBeVisible()
    await expect(page.getByRole("row").filter({ hasText: users.orgAdmin.email })).toHaveCount(0)
    const byEmail = page.getByRole("button", { name: u.colEmail, exact: true })
    await byEmail.click()
    await expect(page.getByRole("columnheader").filter({ has: byEmail })).toHaveAttribute(
      "aria-sort",
      "ascending",
    )
    // admin < membro < pesq, na ordem alfabética do e-mail.
    await expect(page.getByRole("row").nth(1)).toContainText(users.workAdmin.email)
    await byEmail.click()
    await expect(page.getByRole("row").nth(1)).toContainText(users.workResearcher.email)

    await search.fill(`${prefix} ninguém`)
    await expect(page.getByText(pt.common.noResults)).toBeVisible()
  })

  test("grupos de pesquisa: busca, contagens e os membros no detalhe", async ({ page }) => {
    const { users, orgs } = loadFixtures()
    const o = pt.adminOrgs

    await page.goto("/app/admin/organizations")
    await expect(page.getByRole("heading", { name: o.title, level: 1 })).toBeVisible()
    const search = page.getByPlaceholder(pt.common.search, { exact: true })
    await hydrated(search)

    await search.fill(orgs.b.name)
    const row = page.getByRole("row").filter({ hasText: orgs.b.name })
    // Grupo B: 1 membro e 1 pesquisa (colunas "Membros" e "Pesquisas").
    await expect(row.getByRole("cell").nth(2)).toHaveText("1")
    await expect(row.getByRole("cell").nth(3)).toHaveText("1")
    await expect(page.getByRole("row").filter({ hasText: orgs.a.name })).toHaveCount(0)

    // A busca também acha o grupo pelo e-mail de um membro.
    await search.fill(users.otherOrg.email)
    await expect(row).toBeVisible()

    await row.click()
    const dialog = page.getByRole("dialog", { name: orgs.b.name })
    await expect(dialog).toContainText(users.otherOrg.email)
    await expect(dialog).toContainText(users.otherOrg.name)
    await expect(dialog).not.toContainText(users.orgAdmin.email)
  })
})
