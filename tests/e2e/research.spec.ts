import { type Page } from "@playwright/test"

import { as, expect, test } from "./helpers/test"

import {
  combobox,
  confirmAlert,
  expectToast,
  hydrated,
  pickFromCombobox,
  pt,
  rowMenu,
} from "./helpers/app"
import { AUTH_ENABLED, AUTH_SKIP_REASON, loadFixtures, storageStatePath } from "./helpers/fixtures"

// Gestão de uma pesquisa: dados (nome, descrição, visibilidade), entradas do protocolo
// (desativar, reativar, excluir), membros, pedido de acesso de uma pesquisadora com a resposta
// do admin, e exclusão de uma pesquisa vazia. Os passos alteram a mesma pesquisa ("a gerir"),
// por isso rodam em série.

const rs = pt.research
const pr = pt.protocol

async function openResearchList(page: Page, search: string) {
  await page.goto("/app/research")
  const input = page.getByPlaceholder(rs.searchPlaceholder)
  await hydrated(input)
  await input.fill(search)
}

test.describe("Gestão da pesquisa", () => {
  test.skip(!AUTH_ENABLED, AUTH_SKIP_REASON)
  test.describe.configure({ mode: "serial" })
  test.use({ storageState: storageStatePath("workAdmin") })

  const manage = () => loadFixtures().work.manage.research
  const renamed = () => `${manage().name} (editada)`

  async function openDetail(page: Page) {
    await page.goto(`/app/research/${manage().id}`)
    await hydrated(page.getByRole("button", { name: pt.common.edit, exact: true }))
  }

  test("edita nome, descrição e visibilidade pelo detalhe e pela lista", async ({ page }) => {
    await openDetail(page)
    await expect(page.getByRole("heading", { name: manage().name, level: 1 })).toBeVisible()
    await page.getByRole("button", { name: pt.common.edit, exact: true }).click()

    const dialog = page.getByRole("dialog", { name: rs.editTitle })
    await expect(dialog.getByLabel(rs.nameLabel)).toHaveValue(manage().name)
    await expect(dialog.getByRole("checkbox", { name: rs.isPublicHint })).not.toBeChecked()

    // Nome curto demais é recusado na própria tela.
    await dialog.getByLabel(rs.nameLabel).fill("ab")
    await dialog.getByRole("button", { name: pt.common.save, exact: true }).click()
    await expect(dialog.getByText(pt.validation.min3)).toBeVisible()

    await dialog.getByLabel(rs.nameLabel).fill(renamed())
    await dialog.getByLabel(rs.descriptionLabel).fill("Descrição editada pela suíte.")
    await dialog.getByRole("checkbox", { name: rs.isPublicHint }).check()
    await dialog.getByRole("button", { name: pt.common.save, exact: true }).click()
    await expectToast(page, rs.edited)
    await expect(dialog).toBeHidden()

    for (const reload of [false, true]) {
      if (reload) await page.reload()
      await expect(page.getByRole("heading", { name: renamed(), level: 1 })).toBeVisible()
      await expect(page.getByText("Descrição editada pela suíte.")).toBeVisible()
      await expect(page.getByText(rs.public, { exact: true })).toBeVisible()
    }

    // Pela lista: a linha mostra a visibilidade, e o menu abre o mesmo formulário.
    await openResearchList(page, renamed())
    const row = page.getByRole("row").filter({ hasText: renamed() })
    await expect(row).toContainText(rs.public)
    await rowMenu(page, row, pt.common.edit, rs.colActions)
    const listDialog = page.getByRole("dialog", { name: rs.editTitle })
    await expect(listDialog.getByLabel(rs.nameLabel)).toHaveValue(renamed())
    await expect(listDialog.getByLabel(rs.descriptionLabel)).toHaveValue(
      "Descrição editada pela suíte.",
    )
    await listDialog.getByRole("checkbox", { name: rs.isPublicHint }).uncheck()
    await listDialog.getByRole("button", { name: pt.common.save, exact: true }).click()
    await expectToast(page, rs.edited)
    await expect(row).toContainText(rs.private)
  })

  test("protocolo: busca, desativa, reativa e exclui uma entrada", async ({ page }) => {
    const { catalog } = loadFixtures()
    await openDetail(page)

    const liver = page.getByRole("row").filter({ hasText: catalog.organ.label })
    const lung = page.getByRole("row").filter({ hasText: catalog.organ2.label })
    await expect(liver).toBeVisible()
    await expect(lung).toBeVisible()

    // Busca dentro do protocolo.
    await page.getByPlaceholder(pr.searchPlaceholder).fill(catalog.organ2.label)
    await expect(lung).toBeVisible()
    await expect(liver).toHaveCount(0)
    await page.getByPlaceholder(pr.searchPlaceholder).fill("")

    // Desativar: sai da lista padrão e volta, marcada, com "mostrar inativos".
    await expect(page.getByRole("checkbox", { name: pr.showInactive })).toHaveCount(0)
    await rowMenu(page, lung, pr.deactivate, pr.actions)
    await confirmAlert(page, pr.deactivateTitle, pr.deactivate)
    await expectToast(page, pr.deactivated)
    await expect(lung).toHaveCount(0)
    await page.getByRole("checkbox", { name: pr.showInactive }).check()
    await expect(lung).toContainText(pr.inactive)

    await page.reload()
    await page.getByRole("checkbox", { name: pr.showInactive }).check()
    await expect(lung).toContainText(pr.inactive)

    // Reativar.
    await rowMenu(page, lung, pr.reactivate, pr.actions)
    await expectToast(page, pr.reactivated)
    await expect(lung).not.toContainText(pr.inactive)
    await expect(page.getByRole("checkbox", { name: pr.showInactive })).toHaveCount(0)

    // Excluir, com confirmação.
    await rowMenu(page, lung, pr.delete, pr.actions)
    await confirmAlert(page, pr.deleteTitle, pr.delete)
    await expectToast(page, pr.removed)
    await expect(lung).toHaveCount(0)
    await page.reload()
    await expect(liver).toBeVisible()
    await expect(lung).toHaveCount(0)
  })

  test("membros da pesquisa: adiciona e remove um pesquisador do grupo", async ({ page }) => {
    const { users } = loadFixtures()
    const member = users.workMember

    await openDetail(page)
    await page.getByRole("button", { name: rs.membersTitle }).click()
    await expect(page.getByRole("row").filter({ hasText: member.email })).toHaveCount(0)

    const add = page.getByRole("button", { name: pt.common.add, exact: true })
    await expect(add).toBeDisabled()
    await pickFromCombobox(
      page,
      combobox(page, rs.selectResearcher),
      `${member.name} · ${member.email}`,
    )
    await add.click()
    await expectToast(page, rs.memberAdded)
    const row = page.getByRole("row").filter({ hasText: member.email })
    await expect(row).toContainText(member.name)

    await page.reload()
    await page.getByRole("button", { name: rs.membersTitle }).click()
    await expect(row).toBeVisible()

    await row.getByRole("button", { name: pt.common.remove }).click()
    await confirmAlert(page, rs.memberRemoveTitle, pt.common.remove)
    await expectToast(page, rs.memberRemoved)
    await expect(row).toHaveCount(0)
  })

  test("pedido de acesso: a pesquisadora pede, o admin aprova um e recusa outro", async ({
    browser,
  }) => {
    const { users, work } = loadFixtures()
    const empty = work.manage.empty
    const researcher = await as(browser, "workResearcher")
    const admin = await as(browser, "workAdmin")

    // A pesquisadora vê as duas pesquisas só como vitrine e pede acesso às duas.
    await openResearchList(researcher, loadFixtures().prefix)
    const wanted = researcher.getByRole("row").filter({ hasText: renamed() })
    const other = researcher.getByRole("row").filter({ hasText: empty.name })
    await wanted.getByRole("button", { name: rs.accessRequest }).click()
    await expectToast(researcher, rs.accessRequested)
    await expect(wanted).toContainText(rs.accessPending)
    await other.getByRole("button", { name: rs.accessRequest }).click()
    await expect(other).toContainText(rs.accessPending)

    // O admin encontra os dois pedidos na fila.
    await admin.goto("/app/research")
    const queue = admin.getByRole("button", { name: "Pedidos (2)" })
    await hydrated(queue)
    await queue.click()
    const dialog = admin.getByRole("dialog", { name: rs.accessQueueTitle })
    const line = (research: string) =>
      dialog.getByRole("listitem").filter({
        hasText: `${users.workResearcher.name} pediu acesso à pesquisa "${research}"`,
      })
    await line(renamed()).getByRole("button", { name: rs.accessApprove }).click()
    await expectToast(admin, rs.accessApproved)
    await expect(line(renamed())).toHaveCount(0)
    await line(empty.name).getByRole("button", { name: rs.accessReject }).click()
    await expectToast(admin, rs.accessRejectedDone)
    // Fila vazia: o diálogo fecha e o botão some.
    await expect(dialog).toBeHidden()
    await expect(admin.getByRole("button", { name: /^Pedidos \(/ })).toHaveCount(0)

    // Do lado da pesquisadora: participa da aprovada e pode abri-la; a recusada volta a
    // oferecer o pedido, com o aviso.
    await researcher.reload()
    await researcher.getByPlaceholder(rs.searchPlaceholder).fill(loadFixtures().prefix)
    await expect(wanted).toContainText(rs.accessMember)
    await expect(other.getByRole("button", { name: rs.accessRequest })).toBeVisible()
    await expect(other.getByRole("img", { name: rs.accessRejected })).toBeVisible()
    await wanted.getByText(renamed()).click()
    await expect(researcher).toHaveURL((url) => url.pathname === `/app/research/${manage().id}`)
    await expect(researcher.getByRole("heading", { name: renamed(), level: 1 })).toBeVisible()

    // E o admin a vê na lista de membros da pesquisa.
    await admin.goto(`/app/research/${manage().id}`)
    const members = admin.getByRole("button", { name: rs.membersTitle })
    await hydrated(members)
    await members.click()
    await expect(
      admin.getByRole("row").filter({ hasText: users.workResearcher.email }),
    ).toBeVisible()

    await researcher.context().close()
    await admin.context().close()
  })

  test("exclui uma pesquisa vazia, com confirmação", async ({ page }) => {
    const { empty } = loadFixtures().work.manage

    await openResearchList(page, empty.name)
    const row = page.getByRole("row").filter({ hasText: empty.name })
    await expect(row).toBeVisible()

    await rowMenu(page, row, pt.common.delete, rs.colActions)
    const confirm = page.getByRole("alertdialog", { name: rs.deleteTitle })
    await expect(confirm).toContainText(`Excluir a pesquisa "${empty.name}"?`)
    await confirm.getByRole("button", { name: pt.common.cancel }).click()
    await expect(row).toBeVisible()

    await rowMenu(page, row, pt.common.delete, rs.colActions)
    await confirmAlert(page, rs.deleteTitle, pt.common.delete)
    await expectToast(page, rs.deleted)
    await expect(row).toHaveCount(0)

    // O endereço da pesquisa deixa de existir.
    expect((await page.request.get(`/api/research/${empty.id}`)).status()).toBe(404)
    await page.goto(`/app/research/${empty.id}`)
    await expect(
      page.getByRole("heading", { name: "Esta página foi levada pela maré" }),
    ).toBeVisible()
  })
})
