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

// Grade de análises do animal, além do resultado em si (coberto no fluxo principal): valor
// quantitativo e observação na célula, limpeza da célula e confirmação de espécie por
// sequenciamento num rastreio positivo. O protocolo da pesquisa tem duas linhas para a amostra:
// uma com medida (Ct) e uma de patógeno em nível de família.

const an = pt.analyses

test.describe("Análises", () => {
  test.skip(!AUTH_ENABLED, AUTH_SKIP_REASON)
  test.describe.configure({ mode: "serial" })
  test.use({ storageState: storageStatePath("workAdmin") })

  const open = (page: Page) =>
    openAnimalTab(page, loadFixtures().work.analyses.animal.id, pt.animals.analysesTab)
  // Linha da grade (patógeno × exame). A linha do painel de confirmação vem logo abaixo e não
  // traz o nome do exame, por isso o filtro usa os dois.
  const line = (page: Page, pathogen: string, exam: string) =>
    page.getByRole("row").filter({ hasText: pathogen }).filter({ hasText: exam })
  const upsert = (page: Page) =>
    page.waitForResponse(
      (res) => res.url().endsWith("/api/analyses") && res.request().method() !== "GET",
    )

  test("valor quantitativo e observação na célula: gravam ao sair do campo e persistem", async ({
    page,
  }) => {
    const { catalog } = loadFixtures()
    await open(page)

    const row = line(page, catalog.pathogen.label, catalog.examMeasured.label)
    const result = row.getByRole("combobox")
    const measure = row.getByPlaceholder(catalog.examMeasured.measure)
    const notes = row.getByPlaceholder(an.notesPlaceholder)
    await expect(result).toHaveText(an.resultUntested)

    await pickFromSelect(page, result, an.resultNegative)
    await expectToast(page, an.saved)

    let saved = upsert(page)
    await measure.fill("31.5")
    await measure.blur()
    expect((await saved).status()).toBe(200)

    saved = upsert(page)
    await notes.fill("Amplificação tardia")
    await notes.blur()
    expect((await saved).status()).toBe(200)

    // A linha de rastreio amplo não tem medida configurada no exame.
    const broad = line(page, catalog.pathogenBroad.label, catalog.examType.label)
    await expect(broad.getByRole("cell").nth(3)).toHaveText("—")

    await open(page)
    await expect(result).toHaveText(an.resultNegative)
    await expect(measure).toHaveValue("31.5")
    await expect(notes).toHaveValue("Amplificação tardia")

    // Histórico: o valor e a observação, com o contexto da análise.
    await page.getByRole("tab", { name: pt.animals.auditTab }).click()
    const main = page.getByRole("main")
    await expect(main.getByText(pt.audit.fieldMeasure, { exact: true })).toBeVisible()
    await expect(main.getByText("31.5", { exact: true })).toBeVisible()
    await expect(main.getByText(pt.audit.fieldNotes, { exact: true })).toBeVisible()
    await expect(main.getByText("Amplificação tardia", { exact: true })).toBeVisible()
    await expect(main.getByText(catalog.examMeasured.label).first()).toBeVisible()
  })

  test("limpar a célula pede confirmação; cancelar devolve o valor, confirmar remove o lançamento", async ({
    page,
  }) => {
    const { catalog } = loadFixtures()
    await open(page)

    const row = line(page, catalog.pathogen.label, catalog.examMeasured.label)
    const result = row.getByRole("combobox")
    const measure = row.getByPlaceholder(catalog.examMeasured.measure)
    const notes = row.getByPlaceholder(an.notesPlaceholder)
    await expect(measure).toHaveValue("31.5")

    // Tirar o resultado e o valor ainda deixa a observação: grava sem perguntar.
    let saved = upsert(page)
    await pickFromSelect(page, result, an.resultUntested)
    expect((await saved).status()).toBe(200)
    saved = upsert(page)
    await measure.fill("")
    await measure.blur()
    expect((await saved).status()).toBe(200)

    // Apagar o último conteúdo esvazia a célula: aí sim vem a confirmação.
    await notes.fill("")
    await notes.blur()
    const confirm = page.getByRole("alertdialog", { name: an.clearTitle })
    await expect(confirm).toContainText(an.clearDesc)
    await confirm.getByRole("button", { name: pt.common.cancel }).click()
    await expect(confirm).toBeHidden()
    await expect(notes).toHaveValue("Amplificação tardia")

    await notes.fill("")
    await notes.blur()
    await confirmAlert(page, an.clearTitle, an.clearConfirm)
    await expectToast(page, an.cleared)
    await expect(notes).toHaveValue("")
    await expect(result).toHaveText(an.resultUntested)

    await open(page)
    await expect(result).toHaveText(an.resultUntested)
    await expect(measure).toHaveValue("")
    await expect(notes).toHaveValue("")
  })

  test("rastreio amplo POSITIVO: confirma a espécie por sequenciamento, edita e exclui", async ({
    page,
  }) => {
    const { catalog } = loadFixtures()
    await open(page)

    const row = line(page, catalog.pathogenBroad.label, catalog.examType.label)
    // Sem resultado positivo não há painel de confirmação.
    await expect(page.getByText(an.confirmTitle)).toHaveCount(0)
    await pickFromSelect(page, row.getByRole("combobox"), an.resultPositive)
    await expectToast(page, an.saved)
    await expect(page.getByText(an.confirmTitle)).toBeVisible()
    await expect(page.getByText(an.confirmEmpty)).toBeVisible()

    await page.getByRole("button", { name: an.confirmAdd }).click()
    const save = page.getByRole("button", { name: pt.common.save, exact: true })
    // Sem espécie escolhida não dá para salvar.
    await expect(save).toBeDisabled()
    await pickFromCombobox(
      page,
      combobox(page, an.confirmSpeciesPlaceholder),
      catalog.pathogenConfirm.label,
    )
    // O exame da confirmação (2º seletor do painel: espécie, exame, resultado).
    const panel = page.getByRole("row").filter({ hasText: an.confirmTitle })
    await pickFromCombobox(page, panel.getByRole("combobox").nth(1), catalog.examMeasured.label)
    await page.getByPlaceholder(an.seqMarker).fill("18S rRNA")
    await page.getByPlaceholder(an.seqAccession).fill("MN123456")
    await page.getByPlaceholder(an.seqIdentity).fill("99.2")
    await save.click()
    await expectToast(page, an.saved)

    const confirmation = page.getByRole("listitem").filter({
      hasText: catalog.pathogenConfirm.label,
    })
    // Sequências em tabela: marcador, nº de acesso e % de identidade, cada um na sua coluna.
    for (const cell of ["18S rRNA", "MN123456", "99.2"]) {
      await expect(confirmation).toContainText(cell)
    }
    await expect(confirmation).toContainText(catalog.examMeasured.label)
    await expect(page.getByText(an.confirmEmpty)).toHaveCount(0)

    // Edita: o formulário volta com o que foi gravado.
    await confirmation.getByRole("button", { name: an.confirmEdit }).click()
    await expect(page.getByPlaceholder(an.seqMarker)).toHaveValue("18S rRNA")
    await expect(page.getByPlaceholder(an.seqAccession)).toHaveValue("MN123456")
    await page.getByPlaceholder(an.seqAccession).fill("OP654321")
    await page.getByPlaceholder(an.seqPlatform).fill("Sanger")
    await save.click()
    // Sequências em tabela: marcador, nº de acesso e % de identidade, cada um na sua coluna.
    for (const cell of ["18S rRNA", "OP654321", "99.2"]) {
      await expect(confirmation).toContainText(cell)
    }

    // Persistência.
    await open(page)
    await expect(row.getByRole("combobox")).toHaveText(an.resultPositive)
    await expect(
      page.getByRole("listitem").filter({ hasText: catalog.pathogenConfirm.label }),
    ).toContainText("OP654321")

    // Com o rastreio deixando de ser positivo, a confirmação fica sinalizada para revisão.
    let saved = upsert(page)
    await pickFromSelect(page, row.getByRole("combobox"), an.resultInconclusive)
    expect((await saved).status()).toBe(200)
    await expect(page.getByText(an.confirmOrphanWarning)).toBeVisible()
    saved = upsert(page)
    await pickFromSelect(page, row.getByRole("combobox"), an.resultPositive)
    expect((await saved).status()).toBe(200)
    await expect(page.getByText(an.confirmOrphanWarning)).toHaveCount(0)

    // Exclui a confirmação.
    await page
      .getByRole("listitem")
      .filter({ hasText: catalog.pathogenConfirm.label })
      .getByRole("button", { name: an.confirmDelete })
      .click()
    await confirmAlert(page, an.confirmDeleteTitle, pt.common.confirm)
    await expect(page.getByText(an.confirmEmpty)).toBeVisible()
    await expect(page.getByText("OP654321")).toHaveCount(0)

    await open(page)
    await expect(page.getByText(an.confirmEmpty)).toBeVisible()
  })
})
