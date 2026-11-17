import { type Page, type Route } from "@playwright/test"

import { expect, test } from "./helpers/test"

import { confirmAlert, expectToast, hydrated, pt, rowMenu } from "./helpers/app"
import { AUTH_ENABLED, AUTH_SKIP_REASON, loadFixtures, storageStatePath } from "./helpers/fixtures"

// Membros do grupo, pelo admin (ORG_ADMIN). O grupo é só deste arquivo: um admin e dois
// pesquisadores, com uma pesquisa (o que impede o único admin de sair deixando dados sem dono).
//
// CONVITE: o botão de adicionar chama o Supabase real, que enviaria e-mail. A requisição do
// navegador é respondida pela suíte, e o teste cobre só o comportamento da tela — o efeito no
// servidor é dos testes de integração. Nenhum POST de membro chega ao app neste arquivo.

const m = pt.members

async function openMembers(page: Page) {
  await page.goto("/app/members")
  await hydrated(page.getByPlaceholder(m.searchPlaceholder))
}
const memberRow = (page: Page, email: string) => page.getByRole("row").filter({ hasText: email })

test.describe("Membros do grupo", () => {
  test.skip(!AUTH_ENABLED, AUTH_SKIP_REASON)
  test.describe.configure({ mode: "serial" })
  test.use({ storageState: storageStatePath("membersAdmin") })

  test("adicionar membro (requisição interceptada): validação, convite, vínculo e erro", async ({
    page,
  }) => {
    const { orgs } = loadFixtures()
    const posted: unknown[] = []
    let answer: { status: number; body: unknown } = { status: 201, body: { invited: true } }
    let lookup: unknown = { exists: false }

    await page.route("**/api/users/lookup?*", (route) => route.fulfill({ json: lookup }))
    await page.route("**/api/organizations/*/members", (route: Route) => {
      if (route.request().method() !== "POST") return route.fallback()
      posted.push(route.request().postDataJSON())
      return route.fulfill({ status: answer.status, json: answer.body })
    })

    await openMembers(page)
    await expect(page.getByText(orgs.members.name).first()).toBeVisible()
    await page.getByRole("button", { name: m.addMember }).click()
    const dialog = page.getByRole("dialog", { name: m.addMember })
    const email = dialog.getByLabel(m.emailLabel)
    const name = dialog.getByLabel(m.nameLabel)
    const search = dialog.getByRole("button", { name: m.lookupTitle })
    const submit = dialog.getByRole("button", { name: pt.common.add, exact: true })

    // E-mail malformado: a busca nem é feita.
    await email.fill("nao-e-email")
    await search.click()
    await expect(dialog.getByText(pt.validation.email)).toBeVisible()
    await expect(dialog.getByText(m.nameLookupHint)).toBeVisible()

    // E-mail novo na plataforma: pede o nome e sai como convite.
    await email.fill("convidada.e2e@test.local")
    await search.click()
    await expect(dialog.getByText(m.nameNewUserHint)).toBeVisible()
    await name.fill("Convidada da Suíte")
    await submit.click()
    await expectToast(page, m.invitedToast)
    await expect(dialog).toBeHidden()
    expect(posted).toEqual([
      { email: "convidada.e2e@test.local", name: "Convidada da Suíte", role: "RESEARCHER" },
    ])

    // E-mail que já tem conta: o nome vem preenchido e travado, e o resultado é só o vínculo.
    lookup = { exists: true, name: "Pessoa Existente" }
    answer = { status: 201, body: { invited: false } }
    await page.getByRole("button", { name: m.addMember }).click()
    await expect(email).toHaveValue("")
    await email.fill("existente.e2e@test.local")
    await search.click()
    await expect(dialog.getByText(m.lookupFound)).toBeVisible()
    await expect(name).toHaveValue("Pessoa Existente")
    await expect(name).toHaveAttribute("readonly", "")
    await submit.click()
    await expectToast(page, m.addedToast)
    await expect(dialog).toBeHidden()

    // Recusa do servidor: o erro aparece e o formulário continua aberto, com o que foi digitado.
    lookup = { exists: false }
    answer = {
      status: 409,
      body: { error: "Usuário já é membro desta organização", code: "alreadyMember" },
    }
    await page.getByRole("button", { name: m.addMember }).click()
    await email.fill("repetida.e2e@test.local")
    await name.fill("Repetida")
    await submit.click()
    await expectToast(page, m.addErrorTitle)
    await expect(dialog).toBeVisible()
    await expect(email).toHaveValue("repetida.e2e@test.local")
    expect(posted).toHaveLength(3)
  })

  test("único admin: não pode deixar de ser admin nem sair do grupo com dados", async ({
    page,
  }) => {
    const { users } = loadFixtures()

    await openMembers(page)
    const self = memberRow(page, users.membersAdmin.email)
    await expect(self).toContainText(pt.common.roleAdmin)

    await self.getByRole("button", { name: m.colActions }).click()
    await expect(page.getByRole("menuitem", { name: m.makeResearcher })).toBeDisabled()
    await page.getByRole("menuitem", { name: pt.common.leave, exact: true }).click()
    await confirmAlert(page, m.leaveTitle, pt.common.leave)
    await expectToast(page, m.leaveErrorTitle)

    // Continua no grupo, como admin.
    await page.reload()
    await expect(memberRow(page, users.membersAdmin.email)).toContainText(pt.common.roleAdmin)
    await expect(page.getByRole("button", { name: m.addMember })).toBeVisible()
  })

  test("busca, promove um pesquisador a admin e remove outro membro", async ({ page }) => {
    const { users } = loadFixtures()
    const promote = users.memberPromote
    const remove = users.memberRemove

    await openMembers(page)
    await expect(memberRow(page, promote.email)).toContainText(pt.common.roleResearcher)

    // Busca por nome ou e-mail.
    await page.getByPlaceholder(m.searchPlaceholder).fill(remove.email)
    await expect(memberRow(page, remove.email)).toBeVisible()
    await expect(memberRow(page, promote.email)).toHaveCount(0)
    await page.getByPlaceholder(m.searchPlaceholder).fill("ninguém com esse nome")
    await expect(page.getByText(pt.common.noResults)).toBeVisible()
    await page.getByPlaceholder(m.searchPlaceholder).fill("")

    // Promoção, com confirmação.
    await rowMenu(page, memberRow(page, promote.email), m.makeAdmin, m.colActions)
    await expect(page.getByRole("alertdialog", { name: m.promoteTitle })).toContainText(
      promote.email,
    )
    await confirmAlert(page, m.promoteTitle, m.makeAdmin)
    await expect(memberRow(page, promote.email)).toContainText(pt.common.roleAdmin)
    // Um admin não mexe em outro admin: as ações da linha ficam desabilitadas.
    await memberRow(page, promote.email).getByRole("button", { name: m.colActions }).click()
    await expect(page.getByRole("menuitem", { name: pt.common.remove, exact: true })).toBeDisabled()
    await page.keyboard.press("Escape")

    // Remoção, com confirmação.
    await rowMenu(page, memberRow(page, remove.email), pt.common.remove, m.colActions)
    await expect(page.getByRole("alertdialog", { name: m.removeTitle })).toContainText(remove.email)
    await confirmAlert(page, m.removeTitle, pt.common.remove)
    await expectToast(page, m.memberRemoved)
    await expect(memberRow(page, remove.email)).toHaveCount(0)

    await page.reload()
    await expect(memberRow(page, promote.email)).toContainText(pt.common.roleAdmin)
    await expect(memberRow(page, remove.email)).toHaveCount(0)
  })

  test("edita o nome do grupo", async ({ page }) => {
    const { orgs } = loadFixtures()
    const renamed = `${orgs.members.name} (renomeado)`
    // Estado/cidade vêm de um serviço externo (CountryStateCity) atrás de /api/geo.
    await page.route("**/api/geo/**", (route) => route.fulfill({ json: [] }))

    await openMembers(page)
    await page.getByRole("button", { name: m.editOrg }).click()
    const dialog = page.getByRole("dialog", { name: m.editOrg })
    await expect(dialog.getByLabel(m.orgName)).toHaveValue(orgs.members.name)

    await dialog.getByLabel(m.orgName).fill("ab")
    await dialog.getByRole("button", { name: pt.common.save, exact: true }).click()
    await expect(dialog.getByText(pt.validation.min3)).toBeVisible()

    await dialog.getByLabel(m.orgName).fill(renamed)
    await dialog.getByRole("button", { name: pt.common.save, exact: true }).click()
    await expectToast(page, m.orgUpdated)
    await expect(dialog).toBeHidden()
    await expect(page.getByText(renamed).first()).toBeVisible()
    await page.reload()
    await expect(page.getByText(renamed).first()).toBeVisible()
  })

  test("com outro admin no grupo: deixa de ser admin e depois sai do grupo", async ({ page }) => {
    const { users, orgs } = loadFixtures()

    await openMembers(page)
    const self = memberRow(page, users.membersAdmin.email)
    await rowMenu(page, self, m.makeResearcher, m.colActions)
    await confirmAlert(page, m.demoteTitle, m.makeResearcher)
    await expectToast(page, m.selfDemoted)
    await expect(page).toHaveURL(/\/app\/dashboard$/)

    // Como pesquisador, a tela de membros é só leitura.
    await openMembers(page)
    await expect(memberRow(page, users.membersAdmin.email)).toContainText(pt.common.roleResearcher)
    await expect(page.getByRole("button", { name: m.addMember })).toHaveCount(0)

    // Sair do grupo é pela tela "Meus grupos de pesquisa".
    await page.goto("/app/organizations")
    const row = page.getByRole("row").filter({ hasText: orgs.members.name })
    const leave = row.getByRole("button", { name: pt.common.leave, exact: true })
    await hydrated(leave)
    await leave.click()
    await confirmAlert(page, pt.myOrgs.leaveTitle, pt.common.leave)
    await expectToast(page, pt.myOrgs.leftOrg)

    // Sem grupo nenhum, a área do grupo deixa de abrir.
    await expect(page).toHaveURL(/\/app\/no-organization$/)
    await expect(page.getByText(pt.noOrg.title)).toBeVisible()
    await page.goto("/app/members")
    await expect(page).toHaveURL(/\/app\/no-organization$/)
  })
})
