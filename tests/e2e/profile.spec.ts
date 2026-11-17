import { randomBytes } from "node:crypto"
import { type Page } from "@playwright/test"

import { expect, test } from "./helpers/test"

import { confirmAlert, expectToast, fillLogin, hydrated, pt, toast } from "./helpers/app"
import { AUTH_ENABLED, AUTH_SKIP_REASON, loadFixtures } from "./helpers/fixtures"

// Perfil do usuário: nome, tipos de amostra, senha e exclusão do próprio perfil. As duas contas
// são descartáveis e só deste arquivo — o teste troca a senha de uma e apaga a outra —, e por
// isso entram pelo formulário de login em vez de usar uma sessão salva.

const p = pt.profile
const st = pt.profile.sampleTypes

async function signIn(page: Page, email: string, password: string) {
  await fillLogin(page, email, password)
  await page.waitForURL(/\/app\//, { timeout: 120_000 })
}

async function openProfile(page: Page) {
  await page.goto("/app/profile")
  await expect(page.getByRole("heading", { name: p.title, level: 1 })).toBeVisible()
  await hydrated(page.getByRole("button", { name: p.changePassword }))
}

test.describe("Perfil", () => {
  test.skip(!AUTH_ENABLED, AUTH_SKIP_REASON)

  test("altera o nome, gerencia os tipos de amostra, troca a senha e entra com a nova", async ({
    page,
  }) => {
    const { users, password, prefix } = loadFixtures()
    const user = users.profileEdit
    const newName = `${prefix} Perfil Renomeado`
    const newPassword = `${randomBytes(12).toString("base64url")}bB2!`

    await signIn(page, user.email, password)
    await openProfile(page)

    // ── Nome ──
    const name = page.getByLabel(p.nameLabel)
    await expect(name).toHaveValue(user.name)
    await expect(page.getByLabel(p.emailLabel)).toBeDisabled()
    await expect(page.getByLabel(p.emailLabel)).toHaveValue(user.email)
    const saveName = page.getByRole("button", { name: pt.common.save, exact: true })
    await name.fill("a")
    await saveName.click()
    await expect(page.getByText(pt.validation.name)).toBeVisible()
    await name.fill(newName)
    await saveName.click()
    await expectToast(page, p.saved)
    // O menu do usuário, no topo, passa a mostrar o novo nome.
    await expect(page.getByRole("button", { name: newName, exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByLabel(p.nameLabel)).toHaveValue(newName)

    // ── Tipos de amostra ──
    await expect(page.getByText(st.empty)).toBeVisible()
    const draft = page.getByRole("textbox", { name: st.addLabel })
    const add = page.getByRole("button", { name: st.add, exact: true })
    await expect(add).toBeDisabled()
    await draft.fill("lâmina histológica")
    await add.click()
    const item = (value: string) => page.getByRole("listitem").filter({ hasText: value })
    await expect(item("lâmina histológica")).toBeVisible()
    await expect(draft).toHaveValue("")
    await draft.fill("soro")
    await add.click()
    await expect(item("soro")).toBeVisible()
    // Repetido é recusado.
    await draft.fill("soro")
    await add.click()
    await expectToast(page, st.addError)
    await draft.fill("")

    await item("soro").getByRole("button", { name: pt.common.edit }).click()
    const rename = page.getByRole("textbox", { name: st.renameLabel })
    await expect(rename).toHaveValue("soro")
    await rename.fill("soro congelado")
    await rename.press("Enter")
    await expect(item("soro congelado")).toBeVisible()

    await item("lâmina histológica").getByRole("button", { name: pt.common.delete }).click()
    await expect(item("lâmina histológica")).toHaveCount(0)

    await page.reload()
    await expect(item("soro congelado")).toBeVisible()
    await expect(item("lâmina histológica")).toHaveCount(0)

    // ── Senha ──
    await hydrated(page.getByRole("button", { name: p.changePassword }))
    const pw = page.getByLabel(p.newPassword, { exact: true })
    const confirm = page.getByLabel(p.confirmPassword, { exact: true })
    await pw.fill(newPassword)
    await confirm.fill(`${newPassword}x`)
    await page.getByRole("button", { name: p.changePassword }).click()
    await expect(page.getByText(pt.validation.passwordsNoMatch)).toBeVisible()
    await confirm.fill(newPassword)
    await page.getByRole("button", { name: p.changePassword }).click()
    await expectToast(page, p.passwordChanged)
    await expect(pw).toHaveValue("")

    // Sai e confere: a senha antiga não entra mais, a nova entra.
    await page.getByRole("button", { name: newName, exact: true }).click()
    await page.getByRole("menuitem", { name: pt.sidebar.signOut }).click()
    await expect(page).toHaveURL(/\/login$/)

    await fillLogin(page, user.email, password)
    await expect(toast(page, pt.login.errorTitle)).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)

    await signIn(page, user.email, newPassword)
    await expect(page).toHaveURL(/\/app\/dashboard$/)
    await expect(page.getByRole("button", { name: newName, exact: true })).toBeVisible()
  })

  test("exclui o próprio perfil: a sessão acaba e o login deixa de funcionar", async ({ page }) => {
    const { users, password } = loadFixtures()
    const user = users.profileDelete

    await signIn(page, user.email, password)
    await openProfile(page)

    // Cancelar não exclui.
    const remove = page.getByRole("button", { name: p.deleteButton })
    await remove.click()
    const confirm = page.getByRole("alertdialog", { name: p.deleteTitle })
    await confirm.getByRole("button", { name: pt.common.cancel }).click()
    await expect(confirm).toBeHidden()
    await page.reload()
    await expect(page.getByLabel(p.emailLabel)).toHaveValue(user.email)

    await hydrated(remove)
    await remove.click()
    await confirmAlert(page, p.deleteTitle, p.deleteButton)
    await expect(page).toHaveURL(/\/login/, { timeout: 60_000 })

    // A área logada fechou…
    await page.goto("/app/profile")
    await expect(page).toHaveURL(/\/login\?redirectTo=/)
    // …e a conta não existe mais.
    await fillLogin(page, user.email, password)
    await expect(toast(page, pt.login.errorTitle)).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })
})
