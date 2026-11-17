import { type Locator, type Page } from "@playwright/test"

import { as, expect, test } from "./helpers/test"

import { combobox, expectToast, hydrated, pickFromSelect, pt } from "./helpers/app"
import { AUTH_ENABLED, AUTH_SKIP_REASON, loadFixtures, type E2eAnimal } from "./helpers/fixtures"

// Compartilhamento de um indivíduo entre pesquisas do mesmo grupo. A pesquisadora participa
// só da pesquisa de origem: o convite que ela faz à pesquisa de destino nasce pendente e quem
// responde é o outro lado (aqui, o admin do grupo).

const a = pt.animals

async function openDetail(page: Page, animal: E2eAnimal) {
  await page.goto(`/app/animals/${animal.id}`)
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(animal.species)
  await hydrated(page.getByRole("tab", { name: a.detailInfo }))
}

// Grupo do cartão "Pesquisas" pelo rótulo ("Também estudam", "Aguardando resposta").
function group(page: Page, label: string): Locator {
  return page.getByText(label, { exact: true }).locator("xpath=..")
}

async function invite(page: Page, animal: E2eAnimal, research: string) {
  await openDetail(page, animal)
  await pickFromSelect(page, combobox(page, a.shareAddPlaceholder), research)
  await page.getByRole("button", { name: a.shareAddButton, exact: true }).click()
  await expectToast(page, a.shareInviteSent)
  await expect(group(page, a.sharePendingLabel)).toContainText(research)
}

async function listByResearch(page: Page, research: string) {
  await page.goto("/app/animals")
  const filter = combobox(page, a.allResearch)
  await hydrated(filter)
  await filter.click()
  await page.getByRole("option", { name: research, exact: true }).click()
  await page.keyboard.press("Escape")
}

test.describe("Compartilhamento de indivíduo", () => {
  test.skip(!AUTH_ENABLED, AUTH_SKIP_REASON)
  test.describe.configure({ mode: "serial" })

  test("convite aceito: o indivíduo passa a constar nas duas pesquisas; ocultar e desvincular", async ({
    browser,
  }) => {
    const { origin, target, accept } = loadFixtures().work.sharing
    const researcher = await as(browser, "workResearcher")
    const admin = await as(browser, "workAdmin")

    // Antes: a pesquisa de destino não tem o indivíduo.
    await listByResearch(admin, target.name)
    await expect(admin.getByText(pt.common.noResults)).toBeVisible()

    await invite(researcher, accept, target.name)
    // Enquanto pendente, nada muda para a pesquisa de destino.
    await expect(group(researcher, a.shareAlsoLabel)).toContainText(a.shareNone)

    // O outro lado encontra o convite na fila da lista de animais e aceita.
    await admin.goto("/app/animals")
    const queue = admin.getByRole("button", { name: "Compartilhamentos (1)" })
    await hydrated(queue)
    await queue.click()
    const dialog = admin.getByRole("dialog", { name: a.sharesQueueTitle })
    await expect(dialog).toContainText(
      `A pesquisa "${origin.name}" ofereceu o indivíduo ${accept.controlId} à sua pesquisa "${target.name}"`,
    )
    await dialog.getByRole("button", { name: a.shareAccept }).click()
    await expectToast(admin, a.shareAccepted)
    await expect(dialog).toBeHidden()
    await expect(admin.getByRole("button", { name: /^Compartilhamentos \(/ })).toHaveCount(0)

    // O indivíduo aparece nas duas pesquisas.
    await listByResearch(admin, target.name)
    await expect(admin.getByRole("row").filter({ hasText: accept.controlId })).toBeVisible()
    await listByResearch(admin, origin.name)
    await expect(admin.getByRole("row").filter({ hasText: accept.controlId })).toBeVisible()

    await openDetail(admin, accept)
    const also = group(admin, a.shareAlsoLabel)
    await expect(also).toContainText(target.name)
    await expect(group(admin, a.sharePrimaryLabel)).toContainText(origin.name)
    await expect(admin.getByText(a.sharePendingLabel, { exact: true })).toHaveCount(0)
    // A pesquisadora, que convidou, também vê o vínculo efetivado.
    await researcher.reload()
    await expect(group(researcher, a.shareAlsoLabel)).toContainText(target.name)

    // Ocultar na pesquisa participante: some da listagem dela, continua na de origem.
    await also.getByRole("button", { name: a.hideAction }).click()
    await expectToast(admin, a.hideDone)
    await expect(also.getByRole("button", { name: a.unhideAction })).toBeVisible()
    await listByResearch(admin, target.name)
    await expect(admin.getByText(pt.common.noResults)).toBeVisible()
    await listByResearch(admin, origin.name)
    await expect(admin.getByRole("row").filter({ hasText: accept.controlId })).toBeVisible()

    // Reexibir.
    await openDetail(admin, accept)
    await group(admin, a.shareAlsoLabel).getByRole("button", { name: a.unhideAction }).click()
    await expectToast(admin, a.unhideDone)
    await listByResearch(admin, target.name)
    await expect(admin.getByRole("row").filter({ hasText: accept.controlId })).toBeVisible()

    // Desvincular a pesquisa participante.
    await openDetail(admin, accept)
    await group(admin, a.shareAlsoLabel).getByRole("button", { name: a.shareRemove }).click()
    await expectToast(admin, a.shareRemoved)
    await expect(group(admin, a.shareAlsoLabel)).toContainText(a.shareNone)
    await listByResearch(admin, target.name)
    await expect(admin.getByText(pt.common.noResults)).toBeVisible()

    await researcher.context().close()
    await admin.context().close()
  })

  test("convite cancelado por quem convidou sai da fila do outro lado", async ({ browser }) => {
    const { target, cancel } = loadFixtures().work.sharing
    const researcher = await as(browser, "workResearcher")
    const admin = await as(browser, "workAdmin")

    await invite(researcher, cancel, target.name)
    await admin.goto("/app/animals")
    await expect(admin.getByRole("button", { name: "Compartilhamentos (1)" })).toBeVisible()

    await group(researcher, a.sharePendingLabel)
      .getByRole("button", { name: a.shareInviteCancel })
      .click()
    await expectToast(researcher, a.shareInviteCanceled)
    await expect(researcher.getByText(a.sharePendingLabel, { exact: true })).toHaveCount(0)
    // A pesquisa volta a ficar disponível para um novo convite.
    await expect(combobox(researcher, a.shareAddPlaceholder)).toBeVisible()

    await admin.reload()
    await expect(admin.getByRole("heading", { name: a.title, level: 1 })).toBeVisible()
    await expect(admin.getByPlaceholder(pt.common.search, { exact: true })).toBeVisible()
    await expect(admin.getByRole("button", { name: /^Compartilhamentos \(/ })).toHaveCount(0)

    await researcher.context().close()
    await admin.context().close()
  })

  test("convite recusado: o vínculo não é criado e o convite some", async ({ browser }) => {
    const { target, reject } = loadFixtures().work.sharing
    const researcher = await as(browser, "workResearcher")
    const admin = await as(browser, "workAdmin")

    await invite(researcher, reject, target.name)

    await admin.goto("/app/animals")
    const queue = admin.getByRole("button", { name: "Compartilhamentos (1)" })
    await hydrated(queue)
    await queue.click()
    const dialog = admin.getByRole("dialog", { name: a.sharesQueueTitle })
    await expect(dialog).toContainText(reject.controlId)
    await dialog.getByRole("button", { name: a.shareReject }).click()
    await expectToast(admin, a.shareRejected)
    await expect(dialog).toBeHidden()

    await listByResearch(admin, target.name)
    await expect(admin.getByText(pt.common.noResults)).toBeVisible()

    await researcher.reload()
    await expect(researcher.getByRole("heading", { level: 1 })).toHaveText(reject.species)
    await expect(group(researcher, a.shareAlsoLabel)).toContainText(a.shareNone)
    await expect(researcher.getByText(a.sharePendingLabel, { exact: true })).toHaveCount(0)

    await researcher.context().close()
    await admin.context().close()
  })
})
