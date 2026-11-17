import { type Page } from "@playwright/test"

import { expect, test } from "./helpers/test"

import { expectToast, hydrated, openAnimalTab, pickFromSelect, pt, rowMenu } from "./helpers/app"
import { AUTH_ENABLED, AUTH_SKIP_REASON, loadFixtures, storageStatePath } from "./helpers/fixtures"

// Edição de animal: o formulário abre com os dados do animal certo (inclusive quando dois são
// abertos em sequência), grava as alterações, e elas aparecem no detalhe e no Histórico. A
// visibilidade pública é controle só do admin do grupo.

const a = pt.animals

function editDialog(page: Page) {
  return page.getByRole("dialog", { name: a.editTitle })
}

test.describe("Edição de animal (admin do grupo)", () => {
  test.skip(!AUTH_ENABLED, AUTH_SKIP_REASON)
  test.describe.configure({ mode: "serial" })
  test.use({ storageState: storageStatePath("workAdmin") })

  test.beforeEach(async ({ page }) => {
    // O campo de espécie consulta o WoRMS enquanto se digita; a suíte responde no lugar dele.
    await page.route("**/api/worms?*", (route) => route.fulfill({ json: [] }))
  })

  test("dois animais abertos em sequência: cada formulário traz os dados do seu animal", async ({
    page,
  }) => {
    const { prefix, work } = loadFixtures()
    const { first, second, research } = work.edit

    await page.goto("/app/animals")
    const search = page.getByPlaceholder(pt.common.search, { exact: true })
    await hydrated(search)
    await search.fill(`${prefix}-ED`)
    const firstRow = page.getByRole("row").filter({ hasText: first.controlId })
    const secondRow = page.getByRole("row").filter({ hasText: second.controlId })
    await expect(firstRow).toBeVisible()
    await expect(secondRow).toBeVisible()

    const dialog = editDialog(page)
    const expectForm = async (
      animal: typeof first,
      beach: string,
      sex: string,
      eventDate: string,
    ) => {
      await expect(dialog.getByLabel(a.controlId)).toHaveValue(animal.controlId)
      await expect(dialog.getByLabel(a.species)).toHaveValue(animal.species)
      await expect(dialog.getByLabel(a.municipality)).toHaveValue(animal.municipality)
      await expect(dialog.getByLabel(a.strandingBeach)).toHaveValue(beach)
      await expect(dialog.getByLabel(a.eventDate)).toHaveValue(eventDate)
      await expect(dialog.getByRole("combobox", { name: a.sex })).toHaveText(sex)
      // A pesquisa não muda na edição: aparece travada, com o nome dela.
      await expect(dialog.locator("input[disabled]").first()).toHaveValue(research.name)
    }

    await rowMenu(page, firstRow, pt.common.edit)
    await expectForm(first, "Praia Um", a.sexMale, "2026-02-01")
    await dialog.getByRole("button", { name: pt.common.cancel }).click()
    await expect(dialog).toBeHidden()

    // O segundo logo em seguida: nenhum campo pode ter ficado do primeiro.
    await rowMenu(page, secondRow, pt.common.edit)
    await expectForm(second, "Praia Dois", a.sexFemale, "2026-02-02")
    await dialog.getByRole("button", { name: pt.common.cancel }).click()
    await expect(dialog).toBeHidden()

    // E de volta ao primeiro.
    await rowMenu(page, firstRow, pt.common.edit)
    await expectForm(first, "Praia Um", a.sexMale, "2026-02-01")
  })

  test("altera campos pelo detalhe: valida, salva, mostra no detalhe e registra no Histórico", async ({
    page,
  }) => {
    const { first } = loadFixtures().work.edit

    await page.goto(`/app/animals/${first.id}`)
    const editButton = page.getByRole("button", { name: pt.common.edit, exact: true }).first()
    await hydrated(editButton)
    await editButton.click()
    const dialog = editDialog(page)
    await expect(dialog.getByLabel(a.controlId)).toHaveValue(first.controlId)

    // Campo obrigatório vazio e latitude fora do intervalo: nada é gravado.
    // (o animal foi cadastrado sem coordenadas: os dois campos abrem como "sem informação")
    await expect(dialog.getByLabel(a.strandingLat)).toBeDisabled()
    await dialog.getByRole("button", { name: a.noInfoEnable }).first().click()
    await dialog.getByRole("button", { name: a.noInfoEnable }).first().click()
    await dialog.getByLabel(a.municipality).fill("")
    await dialog.getByLabel(a.strandingLat).fill("123")
    await dialog.getByLabel(a.strandingLon).fill("-48.6")
    await dialog.getByRole("button", { name: pt.common.save, exact: true }).click()
    await expectToast(page, a.formInvalid)
    await expect(dialog.getByText(pt.validation.latRange)).toBeVisible()
    await expect(dialog).toBeVisible()

    await dialog.getByLabel(a.municipality).fill("Bombinhas")
    await dialog.getByLabel(a.strandingLat).fill("-27.14")
    await dialog.getByLabel(a.strandingBeach).fill("Praia de Bombas")
    await pickFromSelect(page, dialog.getByRole("combobox", { name: a.sex }), a.sexFemale)
    await pickFromSelect(
      page,
      dialog.getByRole("combobox", { name: a.lifeStage }),
      a.lifeStageJuvenile,
    )
    await dialog.getByLabel(a.necropsyWeightKg).fill("42.5")
    await dialog.getByLabel(a.macroscopicNotes).fill("Carcaça íntegra, sem marcas externas.")
    await dialog.getByRole("button", { name: pt.common.save, exact: true }).click()
    await expectToast(page, a.updated)
    await expect(dialog).toBeHidden()

    // Detalhe (sem recarregar e depois de recarregar).
    const field = (label: string) =>
      page.locator("dl > div").filter({ has: page.getByText(label, { exact: true }) })
    for (const reload of [false, true]) {
      if (reload) await page.reload()
      await expect(field(a.municipality)).toContainText("Bombinhas")
      await expect(field(a.strandingBeach)).toContainText("Praia de Bombas")
      await expect(field(a.sex)).toContainText(a.sexFemale)
      await expect(field(a.lifeStage)).toContainText(a.lifeStageJuvenile)
      await expect(field(a.necropsyWeightKg)).toContainText("42.5")
      await expect(field(`${a.strandingLat} / ${a.strandingLon}`)).toContainText("-27.14, -48.6")
      await expect(page.getByText("Carcaça íntegra, sem marcas externas.")).toBeVisible()
    }

    // Histórico: de → para, com quem alterou.
    await page.getByRole("tab", { name: a.auditTab }).click()
    const entry = (label: string) =>
      page
        .getByRole("main")
        .locator("div")
        .filter({ has: page.getByText(label, { exact: true }) })
        .last()
    await expect(entry(a.municipality)).toContainText("Itajaí")
    await expect(entry(a.municipality)).toContainText("Bombinhas")
    await expect(entry(a.sex)).toContainText(a.sexMale)
    await expect(entry(a.sex)).toContainText(a.sexFemale)
    await expect(
      page.getByRole("main").getByText(loadFixtures().users.workAdmin.name).first(),
    ).toBeVisible()
  })

  test("publicar e retirar de novo: o selo e o Histórico acompanham", async ({ page }) => {
    const { second } = loadFixtures().work.edit
    const publish = () => editDialog(page).getByRole("checkbox", { name: a.publishLabel })

    await page.goto(`/app/animals/${second.id}`)
    const heading = page.getByRole("heading", { level: 1 })
    await expect(heading).toHaveText(second.species)
    const badge = heading.locator("xpath=..")
    await expect(badge).toContainText(a.unpublishedWithheld)

    const editButton = page.getByRole("button", { name: pt.common.edit, exact: true }).first()
    await hydrated(editButton)
    await editButton.click()
    await expect(publish()).not.toBeChecked()
    await publish().check()
    await editDialog(page).getByRole("button", { name: pt.common.save, exact: true }).click()
    await expectToast(page, a.updated)
    await expect(badge).toContainText(a.published)

    await page.reload()
    await expect(heading.locator("xpath=..")).toContainText(a.published)

    await hydrated(editButton)
    await editButton.click()
    await expect(publish()).toBeChecked()
    await publish().uncheck()
    await editDialog(page).getByRole("button", { name: pt.common.save, exact: true }).click()
    await expect(heading.locator("xpath=..")).toContainText(a.unpublishedWithheld)

    await page.getByRole("tab", { name: a.auditTab }).click()
    const main = page.getByRole("main")
    await expect(main.getByText(pt.audit.fieldVisibility, { exact: true })).toHaveCount(2)
    await expect(main.getByText(pt.audit.valueYes, { exact: true }).first()).toBeVisible()
    await expect(main.getByText(pt.audit.valueNo, { exact: true }).first()).toBeVisible()
  })
})

test.describe("Edição de animal (pesquisadora)", () => {
  test.skip(!AUTH_ENABLED, AUTH_SKIP_REASON)
  test.use({ storageState: storageStatePath("workResearcher") })

  test("edita o animal da sua pesquisa, mas não tem o controle de visibilidade", async ({
    page,
  }) => {
    const { work } = loadFixtures()
    const animal = work.sharing.reject
    await page.route("**/api/worms?*", (route) => route.fulfill({ json: [] }))

    await openAnimalTab(page, animal.id, a.detailInfo)
    await page.getByRole("button", { name: pt.common.edit, exact: true }).first().click()
    const dialog = editDialog(page)
    await expect(dialog.getByLabel(a.controlId)).toHaveValue(animal.controlId)
    await expect(dialog.getByRole("checkbox", { name: a.publishLabel })).toHaveCount(0)

    await dialog.getByLabel(a.deathCondition).fill("Natural")
    await dialog.getByRole("button", { name: pt.common.save, exact: true }).click()
    await expectToast(page, a.updated)
    await expect(
      page.locator("dl > div").filter({ has: page.getByText(a.deathCondition, { exact: true }) }),
    ).toContainText("Natural")

    // A regra vale no servidor: o campo enviado à força é recusado ou ignorado.
    const forced = await page.request.patch(`/api/animals/${animal.id}`, {
      data: { isPublic: true },
    })
    const after = await (await page.request.get(`/api/animals/${animal.id}`)).json()
    expect(after.isPublic, `resposta ${forced.status()}`).toBe(false)
  })
})
