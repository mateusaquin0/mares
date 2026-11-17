import { expect, test } from "./helpers/test"

import { fillLogin, hydrated, pt, toast } from "./helpers/app"
import { AUTH_ENABLED, AUTH_SKIP_REASON, loadFixtures } from "./helpers/fixtures"

// Autenticação por e-mail e senha: entrada, credencial errada, proteção das rotas /app e saída.
// Usa uma conta própria e sem sessão salva — sair encerra as sessões do usuário no Auth, o que
// invalidaria as sessões compartilhadas pelos demais arquivos.

test.describe("Autenticação", () => {
  test.skip(!AUTH_ENABLED, AUTH_SKIP_REASON)

  test("rota da área logada sem sessão redireciona ao login, preservando o destino", async ({
    page,
  }) => {
    await page.goto("/app/animals")

    await expect(page).toHaveURL(/\/login\?redirectTo=%2Fapp%2Fanimals$/)
    await expect(page.getByRole("heading", { name: pt.login.title })).toBeVisible()
  })

  test("credencial errada mostra erro e não entra", async ({ page }) => {
    const { users } = loadFixtures()
    await fillLogin(page, users.signIn.email, "senha-que-nao-e-a-certa")

    await expect(toast(page, pt.login.errorTitle)).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)

    // Nenhuma sessão foi criada: a área logada continua fechada.
    await page.goto("/app/dashboard")
    await expect(page).toHaveURL(/\/login\?redirectTo=/)
  })

  test("login leva ao dashboard do grupo e sair volta ao login", async ({ page }) => {
    const { users, orgs, password } = loadFixtures()
    await fillLogin(page, users.signIn.email, password)

    await expect(page).toHaveURL(/\/app\/dashboard$/)
    await expect(page.getByRole("heading", { name: pt.dashboard.title, level: 1 })).toBeVisible()
    await expect(page.getByText(`Grupo de pesquisa ativo: ${orgs.a.name}.`)).toBeVisible()

    // Menu do usuário, no canto direito do topo.
    const userMenu = page.getByRole("button", { name: users.signIn.name, exact: true })
    await hydrated(userMenu)
    await userMenu.click()
    await page.getByRole("menuitem", { name: pt.sidebar.signOut }).click()

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole("heading", { name: pt.login.title })).toBeVisible()

    // A sessão acabou de verdade, não foi só uma navegação.
    await page.goto("/app/dashboard")
    await expect(page).toHaveURL(/\/login\?redirectTo=%2Fapp%2Fdashboard$/)
  })
})
