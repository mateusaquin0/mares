import { type Page } from "@playwright/test"

import { expect, test } from "./helpers/test"

import {
  combobox,
  confirmAlert,
  expectToast,
  openAnimalTab,
  pickFromCombobox,
  pickFromSelect,
  pt,
} from "./helpers/app"
import { AUTH_ENABLED, AUTH_SKIP_REASON, loadFixtures, storageStatePath } from "./helpers/fixtures"

// Laudo de necrópsia de um animal: triagem da carcaça, exame macroscópico por sistema e
// achados histopatológicos. Cada parte é gravada pela interface, conferida depois de recarregar
// a página e procurada no Histórico. Os passos partem um do outro, por isso rodam em série.

const n = pt.necropsy

test.describe("Necrópsia", () => {
  test.skip(!AUTH_ENABLED, AUTH_SKIP_REASON)
  test.describe.configure({ mode: "serial" })
  test.use({ storageState: storageStatePath("workAdmin") })

  const animalId = () => loadFixtures().work.clinical.necropsy.id

  // As três partes do laudo ficam num accordion; o gatilho traz o título e o resumo da parte.
  function section(page: Page, title: string) {
    return page.getByRole("button", { name: title })
  }
  const statusButton = (page: Page, system: string) =>
    page.getByRole("button", { name: `Alterar o estado de ${system}` })
  const screeningSaved = (page: Page) =>
    page.waitForResponse(
      (res) => res.url().includes("/necropsy/screening") && res.request().method() === "PUT",
    )

  async function openNecropsy(page: Page, part?: string) {
    await openAnimalTab(page, animalId(), pt.animals.necropsyTab)
    await expect(section(page, n.screeningTitle)).toBeVisible()
    if (part) await section(page, part).click()
  }

  test("triagem da carcaça: respostas e interação antrópica com grau são gravadas", async ({
    page,
  }) => {
    await openNecropsy(page)
    await expect(section(page, n.screeningTitle)).toContainText("0 de 4 respondidas")

    let saved = screeningSaved(page)
    await pickFromSelect(page, page.getByLabel(n.anthropicInteraction), n.yes)
    expect((await saved).status()).toBe(200)

    // A lista de interações só aparece depois do "sim".
    saved = screeningSaved(page)
    await page.getByRole("checkbox", { name: n.interactionFishery }).check()
    expect((await saved).status()).toBe(200)

    saved = screeningSaved(page)
    await pickFromSelect(
      page,
      page.getByRole("combobox", { name: `Grau da ${n.interactionFishery}` }),
      "Grau 2",
    )
    expect((await saved).status()).toBe(200)

    saved = screeningSaved(page)
    await pickFromSelect(page, page.getByLabel(n.giContentCollected), n.no)
    expect((await saved).status()).toBe(200)

    await expect(section(page, n.screeningTitle)).toContainText("2 de 4 respondidas")

    // Persistência: tudo volta do servidor depois de recarregar.
    await openNecropsy(page)
    await expect(section(page, n.screeningTitle)).toContainText("2 de 4 respondidas")
    await expect(page.getByLabel(n.anthropicInteraction)).toHaveText(n.yes)
    await expect(page.getByRole("checkbox", { name: n.interactionFishery })).toBeChecked()
    await expect(page.getByRole("checkbox", { name: n.interactionWaste })).not.toBeChecked()
    await expect(
      page.getByRole("combobox", { name: `Grau da ${n.interactionFishery}` }),
    ).toHaveText("Grau 2")
    await expect(page.getByLabel(n.giContentCollected)).toHaveText(n.no)
    await expect(page.getByLabel(n.giSolidWaste)).toHaveText(n.notInformed)

    // Histórico: a resposta e a interação (com o grau) ficam registradas.
    await page.getByRole("tab", { name: pt.animals.auditTab }).click()
    const main = page.getByRole("main")
    await expect(main.getByText(n.interactionsLabel, { exact: true }).first()).toBeVisible()
    await expect(main.getByText(`${n.interactionFishery} (grau 2)`)).toBeVisible()
    await expect(main.getByText(n.giContentCollected, { exact: true })).toBeVisible()
  })

  test("macroscópico: adiciona sistemas, dá estado e registra, edita e remove um achado", async ({
    page,
  }) => {
    const { catalog } = loadFixtures()
    const [respiratory, digestive] = catalog.systems.map((s) => s.label)

    await openNecropsy(page, n.macroTitle)
    await expect(page.getByText(n.noSystemsTitle)).toBeVisible()

    // Acrescenta o primeiro sistema: entra no laudo ainda sem estado.
    await page.getByRole("button", { name: n.addSystem }).click()
    await pickFromCombobox(page, combobox(page, n.systemPlaceholder), respiratory!)
    await expect(statusButton(page, respiratory!)).toHaveText(n.statusUnset)
    await expect(section(page, n.macroTitle)).toContainText("0 de 1 sistemas avaliados")

    // "Com alteração" abre o sistema para o primeiro achado.
    await statusButton(page, respiratory!).click()
    await page.getByRole("menuitem", { name: n.statusAltered }).click()
    await expect(page.getByText(n.noFindingsYet)).toBeVisible()
    await page.getByRole("button", { name: n.addFinding }).click()

    const dialog = page.getByRole("dialog", { name: n.addFindingTitle })
    await expect(dialog).toContainText(`${respiratory} · achado 1`)

    // A lesão é obrigatória.
    await dialog.getByRole("button", { name: pt.common.save, exact: true }).click()
    await expect(dialog.getByText(pt.validation.required)).toBeVisible()

    await pickFromCombobox(page, combobox(dialog, n.organOptional), catalog.organ.label)
    await dialog.getByLabel(n.tissue).fill("parênquima")
    await dialog.getByLabel(n.site, { exact: true }).fill("lobo cranial")
    await dialog.getByLabel(n.colLesion).fill("Consolidação pulmonar")
    await pickFromSelect(page, dialog.getByLabel(n.colDistribution), n.distributionMultifocal)
    await pickFromSelect(page, dialog.getByLabel(n.colSeverity), n.severityModerate)
    await dialog.getByLabel(n.colNotes).fill("Áreas firmes e avermelhadas.")
    // A quantidade só abre quando os parasitas foram coletados.
    await expect(dialog.getByLabel(n.colParasiteCount)).toBeDisabled()
    await pickFromSelect(page, dialog.getByLabel(n.colParasitesPresent), n.yes)
    await pickFromSelect(page, dialog.getByLabel(n.colParasitesCollected), n.yes)
    await dialog.getByLabel(n.colParasiteCount).fill("3")
    await dialog.getByRole("button", { name: pt.common.save, exact: true }).click()

    await expectToast(page, n.findingCreated)
    await expect(dialog).toBeHidden()
    const finding = page.getByRole("row").filter({ hasText: "Consolidação pulmonar" })
    await expect(finding).toContainText(`${catalog.organ.label} / parênquima / lobo cranial`)
    await expect(finding).toContainText(n.distributionMultifocal)
    await expect(finding).toContainText(n.severityModerate)
    await expect(finding).toContainText("Áreas firmes e avermelhadas.")
    await expect(finding.getByRole("cell").nth(8)).toHaveText("3")

    // Edita o achado: o formulário abre com o que foi gravado.
    await finding.getByRole("button", { name: pt.common.edit }).click()
    const edit = page.getByRole("dialog", { name: n.editFindingTitle })
    await expect(edit.getByLabel(n.colLesion)).toHaveValue("Consolidação pulmonar")
    await expect(edit.getByLabel(n.tissue)).toHaveValue("parênquima")
    await expect(edit.getByLabel(n.colParasiteCount)).toHaveValue("3")
    await edit.getByLabel(n.colLesion).fill("Pneumonia granulomatosa")
    await pickFromSelect(page, edit.getByLabel(n.colSeverity), n.severityMarked)
    await edit.getByRole("button", { name: pt.common.save, exact: true }).click()
    await expectToast(page, n.findingUpdated)
    const edited = page.getByRole("row").filter({ hasText: "Pneumonia granulomatosa" })
    await expect(edited).toContainText(n.severityMarked)
    await expect(page.getByText("Consolidação pulmonar")).toHaveCount(0)

    // Segundo sistema: "não examinado" exige o motivo.
    await page.getByRole("button", { name: n.addSystem }).click()
    await pickFromCombobox(page, combobox(page, n.systemPlaceholder), digestive!)
    await statusButton(page, digestive!).click()
    await page.getByRole("menuitem", { name: n.statusNotExamined }).click()
    const reason = page.getByRole("dialog", { name: n.reasonTitle })
    await reason.getByRole("button", { name: pt.common.save, exact: true }).click()
    await expect(reason.getByText(pt.validation.required)).toBeVisible()
    await reason.getByLabel(n.reasonLabel).fill("Autólise avançada")
    await reason.getByRole("button", { name: pt.common.save, exact: true }).click()
    await expect(reason).toBeHidden()
    await expect(statusButton(page, digestive!)).toHaveText(n.statusNotExamined)
    await expect(page.getByText("Autólise avançada")).toBeVisible()
    await expect(section(page, n.macroTitle)).toContainText("2 de 2 sistemas avaliados")
    // Todo o catálogo da execução já está no laudo… (o botão só some se não houver outros
    // sistemas cadastrados no banco de testes, então a conferência é pelo conteúdo do laudo.)

    // Persistência do macroscópico inteiro.
    await openNecropsy(page, n.macroTitle)
    await expect(statusButton(page, respiratory!)).toHaveText(n.statusAltered)
    await expect(statusButton(page, digestive!)).toHaveText(n.statusNotExamined)
    await expect(page.getByText("Autólise avançada")).toBeVisible()
    await page.getByRole("button", { name: respiratory!, exact: true }).click()
    const persisted = page.getByRole("row").filter({ hasText: "Pneumonia granulomatosa" })
    await expect(persisted).toContainText(n.severityMarked)
    await expect(persisted).toContainText(`${catalog.organ.label} / parênquima / lobo cranial`)

    // O resumo da aba Informações acompanha o laudo.
    await page.getByRole("tab", { name: pt.animals.detailInfo }).click()
    await expect(page.getByText(/Macroscopia: 1 sistema com alteração/)).toBeVisible()

    // Histórico: criação e edição do achado, e o estado dos sistemas.
    await page.getByRole("tab", { name: pt.animals.auditTab }).click()
    const main = page.getByRole("main")
    await expect(main.getByText(pt.audit.entityGrossFinding).first()).toBeVisible()
    await expect(main.getByText("Pneumonia granulomatosa").first()).toBeVisible()
    await expect(main.getByText(pt.audit.entityNecropsySystem).first()).toBeVisible()
    await expect(main.getByText(n.statusNotExamined).first()).toBeVisible()

    // Remove o achado (com confirmação) e tira o segundo sistema do laudo.
    await page.getByRole("tab", { name: pt.animals.necropsyTab }).click()
    await section(page, n.macroTitle).click()
    await page.getByRole("button", { name: respiratory!, exact: true }).click()
    await page
      .getByRole("row")
      .filter({ hasText: "Pneumonia granulomatosa" })
      .getByRole("button", { name: pt.common.delete })
      .click()
    await confirmAlert(page, n.deleteFindingTitle, pt.common.delete)
    await expectToast(page, n.findingDeleted)
    await expect(page.getByText("Pneumonia granulomatosa")).toHaveCount(0)
    await expect(page.getByText(n.noFindingsYet)).toBeVisible()

    await statusButton(page, digestive!)
      .locator("xpath=..")
      .getByRole("button", { name: n.removeSystem })
      .click()
    await expectToast(page, n.systemRemoved)
    await expect(statusButton(page, digestive!)).toHaveCount(0)

    await openNecropsy(page, n.macroTitle)
    await expect(statusButton(page, respiratory!)).toBeVisible()
    await expect(statusButton(page, digestive!)).toHaveCount(0)
    await expect(section(page, n.macroTitle)).toContainText("1 de 1 sistemas avaliados")
  })

  test("histopatológico: registra em série, edita e remove achados", async ({ page }) => {
    const { catalog } = loadFixtures()

    await openNecropsy(page, n.microTitle)
    await expect(page.getByText(n.microEmptyTitle)).toBeVisible()
    await page.getByRole("button", { name: n.addHisto, exact: true }).click()

    const dialog = page.getByRole("dialog", { name: n.addHistoTitle })
    // Órgão e achado são obrigatórios.
    await dialog.getByRole("button", { name: n.saveAndAdd }).click()
    await expect(dialog.getByText(pt.validation.required)).toHaveCount(2)

    // Entrada em série: o diálogo fica aberto e lista o que entrou.
    await pickFromCombobox(page, combobox(dialog, n.organPlaceholder), catalog.organ.label)
    await dialog.getByLabel(n.finding, { exact: true }).fill("Hepatite necrosante multifocal")
    await dialog.getByRole("button", { name: n.saveAndAdd }).click()
    await expect(dialog.getByText(n.histoAddedNow)).toBeVisible()
    await expect(dialog.getByText("1 achado adicionado nesta sessão")).toBeVisible()
    await expect(dialog.getByLabel(n.finding, { exact: true })).toHaveValue("")

    await pickFromCombobox(page, combobox(dialog, n.organPlaceholder), catalog.organ2.label)
    await dialog.getByLabel(n.finding, { exact: true }).fill("Edema alveolar difuso")
    await dialog.getByRole("button", { name: n.saveAndAdd }).click()
    await expect(dialog.getByText("2 achados adicionados nesta sessão")).toBeVisible()
    await dialog.getByRole("button", { name: pt.common.close, exact: true }).first().click()
    await expect(dialog).toBeHidden()

    const liver = page.getByRole("listitem").filter({ hasText: "Hepatite necrosante multifocal" })
    const lung = page.getByRole("listitem").filter({ hasText: "Edema alveolar difuso" })
    await expect(liver).toContainText(catalog.organ.label)
    await expect(lung).toContainText(catalog.organ2.label)
    await expect(section(page, n.microTitle)).toContainText("2 achados registrados")

    // Edita o segundo.
    await lung.getByRole("button", { name: pt.common.edit }).click()
    const edit = page.getByRole("dialog", { name: n.editHistoTitle })
    await expect(edit.getByLabel(n.finding, { exact: true })).toHaveValue("Edema alveolar difuso")
    await edit.getByLabel(n.finding, { exact: true }).fill("Edema alveolar acentuado")
    await edit.getByRole("button", { name: pt.common.save, exact: true }).click()
    await expectToast(page, n.histoUpdated)

    // Persistência.
    await openNecropsy(page, n.microTitle)
    await expect(
      page.getByRole("listitem").filter({ hasText: "Edema alveolar acentuado" }),
    ).toContainText(catalog.organ2.label)
    await expect(page.getByText("Edema alveolar difuso")).toHaveCount(0)

    // Remove o primeiro, com confirmação.
    await page
      .getByRole("listitem")
      .filter({ hasText: "Hepatite necrosante multifocal" })
      .getByRole("button", { name: pt.common.delete })
      .click()
    await confirmAlert(page, n.deleteHistoTitle, pt.common.delete)
    await expectToast(page, n.histoDeleted)
    await expect(page.getByText("Hepatite necrosante multifocal")).toHaveCount(0)
    await expect(section(page, n.microTitle)).toContainText("1 achado registrado")

    // Histórico: os achados histopatológicos aparecem com o texto registrado.
    await page.getByRole("tab", { name: pt.animals.auditTab }).click()
    const main = page.getByRole("main")
    await expect(main.getByText(pt.audit.entityHistopathology).first()).toBeVisible()
    await expect(main.getByText("Edema alveolar acentuado").first()).toBeVisible()
  })
})
