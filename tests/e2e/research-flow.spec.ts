import { readFile } from "node:fs/promises"
import { type Page } from "@playwright/test"

import { expect, test } from "./helpers/test"
import ExcelJS from "exceljs"

import { combobox, hydrated, pickFromCombobox, pickFromSelect, pt, toast } from "./helpers/app"
import { AUTH_ENABLED, AUTH_SKIP_REASON, loadFixtures, storageStatePath } from "./helpers/fixtures"

// Fluxo principal de trabalho, como admin do grupo: pesquisa → protocolo → animal → amostra →
// resultado na grade → histórico → exportação. Os passos dependem um do outro (cada um parte
// do que o anterior cadastrou), por isso rodam em série e param no primeiro que falhar.

// O WoRMS é consultado pelo navegador via /api/worms; a suíte responde no lugar dele para não
// depender (nem abusar) do serviço externo.
const WORMS_MATCH = {
  aphiaId: 137102,
  scientificName: "Sotalia guianensis",
  rank: "Species",
  status: "accepted",
  family: "Delphinidae",
  order: "Cetartiodactyla",
}

test.describe("Pesquisa, animal e resultados", () => {
  test.skip(!AUTH_ENABLED, AUTH_SKIP_REASON)
  test.describe.configure({ mode: "serial" })
  test.use({ storageState: storageStatePath("orgAdmin") })

  let researchId = ""
  let animalId = ""
  const names = () => {
    const { prefix } = loadFixtures()
    return {
      research: `${prefix} Pesquisa criada pela interface`,
      controlId: `${prefix}-UI1`,
      sample: `${prefix}-UI1 FIG`,
    }
  }

  async function openAnimalTab(page: Page, tab: string) {
    await page.goto(`/app/animals/${animalId}`)
    const trigger = page.getByRole("tab", { name: tab })
    await hydrated(trigger)
    await trigger.click()
  }

  test("cria uma pesquisa e monta o protocolo (exame × patógeno × material)", async ({ page }) => {
    const { catalog } = loadFixtures()
    const { research } = names()

    await page.goto("/app/research")
    const create = page.getByRole("button", { name: pt.research.new })
    await hydrated(create)
    await create.click()

    const dialog = page.getByRole("dialog", { name: pt.research.createTitle })
    await dialog.getByLabel(pt.research.nameLabel).fill(research)
    await dialog.getByLabel(pt.research.descriptionLabel).fill("Criada pela suíte E2E.")
    await dialog.getByRole("button", { name: pt.research.create, exact: true }).click()

    // A criação leva direto ao detalhe da pesquisa, onde o protocolo é montado.
    await expect(toast(page, pt.research.created)).toBeVisible()
    await expect(page).toHaveURL(/\/app\/research\/[0-9a-f-]{36}$/)
    researchId = page.url().split("/").pop()!
    await expect(page.getByRole("heading", { name: research, level: 1 })).toBeVisible()
    await expect(page.getByText(pt.protocol.empty)).toBeVisible()

    const add = page.getByRole("button", { name: pt.common.add, exact: true })
    await expect(add).toBeDisabled()

    await pickFromCombobox(page, combobox(page, pt.protocol.examType), catalog.examType.label)
    // O seletor de patógeno aceita vários e continua aberto depois da escolha.
    await pickFromCombobox(page, combobox(page, pt.protocol.pathogen), catalog.pathogen.label)
    await page.keyboard.press("Escape")
    await pickFromCombobox(page, combobox(page, pt.protocol.organ), catalog.organ.label)
    await add.click()

    await expect(toast(page, "1 entrada adicionada")).toBeVisible()
    const entry = page.getByRole("row").filter({ hasText: catalog.pathogen.label })
    await expect(entry).toContainText(catalog.examType.label)
    await expect(entry).toContainText(catalog.organ.label)

    // Persistiu: a entrada continua lá depois de recarregar.
    await page.reload()
    await expect(page.getByRole("row").filter({ hasText: catalog.pathogen.label })).toBeVisible()
  })

  test("cadastra um animal na pesquisa e uma amostra do material do protocolo", async ({
    page,
  }) => {
    const { catalog } = loadFixtures()
    const { research, controlId, sample } = names()
    await page.route("**/api/worms?*", (route) => route.fulfill({ json: [WORMS_MATCH] }))

    await page.goto("/app/animals")
    const create = page.getByRole("button", { name: pt.animals.new })
    await hydrated(create)
    await create.click()

    const dialog = page.getByRole("dialog", { name: pt.animals.createTitle })
    await pickFromSelect(
      page,
      dialog.getByRole("combobox", { name: pt.animals.research }),
      research,
    )

    // Espécie escolhida na sugestão do WoRMS: o registro fica vinculado ao AphiaID.
    await dialog.getByLabel(pt.animals.species).fill("Sotalia")
    // (a lista de sugestões é renderizada fora do diálogo, direto no corpo da página)
    await page.getByRole("button", { name: /^Sotalia guianensis/ }).click()
    await expect(dialog.getByLabel(pt.animals.species)).toHaveValue(WORMS_MATCH.scientificName)
    await expect(dialog.getByText(`AphiaID ${WORMS_MATCH.aphiaId}`)).toBeVisible()

    await dialog.getByLabel(pt.animals.controlId).fill(controlId)
    await dialog.getByLabel(pt.animals.eventDate).fill("2026-05-20")
    await dialog.getByLabel(pt.animals.municipality).fill("Laguna")
    await dialog.getByLabel(pt.animals.state).fill("SC")
    await dialog.getByLabel(pt.animals.strandingLat).fill("-28.48")
    await dialog.getByLabel(pt.animals.strandingLon).fill("-48.78")
    await pickFromSelect(
      page,
      dialog.getByRole("combobox", { name: pt.animals.sex }),
      pt.animals.sexFemale,
    )
    await pickFromSelect(
      page,
      dialog.getByRole("combobox", { name: pt.animals.lifeStage }),
      pt.animals.lifeStageAdult,
    )
    await dialog.getByRole("button", { name: pt.animals.create, exact: true }).click()

    await expect(toast(page, pt.animals.created)).toBeVisible()
    await expect(dialog).toBeHidden()

    // O animal aparece na listagem; a linha abre o detalhe.
    await page.getByPlaceholder(pt.common.search, { exact: true }).fill(controlId)
    const row = page.getByRole("row").filter({ hasText: controlId })
    await expect(row).toContainText(WORMS_MATCH.scientificName)
    await row.getByText(controlId).click()
    await expect(page).toHaveURL(/\/app\/animals\/[0-9a-f-]{36}$/)
    animalId = page.url().split("/").pop()!
    await expect(page.getByRole("heading", { level: 1 })).toContainText(WORMS_MATCH.scientificName)

    await page.getByRole("tab", { name: pt.animals.samplesTab }).click()
    await expect(page.getByText(pt.samples.empty)).toBeVisible()
    await page.getByRole("button", { name: pt.samples.new }).click()

    const sampleDialog = page.getByRole("dialog", { name: pt.samples.addTitle })
    await sampleDialog.getByLabel(pt.samples.identification).fill(sample)
    // Por padrão o seletor só oferece materiais que constam no protocolo da pesquisa.
    await pickFromCombobox(
      page,
      combobox(sampleDialog, pt.samples.organPlaceholder),
      catalog.organ.label,
    )
    await sampleDialog.getByLabel(pt.samples.sampleType).fill("tecido fresco")
    await sampleDialog.getByRole("button", { name: pt.common.save, exact: true }).click()

    await expect(toast(page, pt.samples.created)).toBeVisible()
    const sampleRow = page.getByRole("row").filter({ hasText: sample })
    await expect(sampleRow).toContainText(catalog.organ.label)
    await expect(sampleRow).toContainText("tecido fresco")
    await expect(
      page.getByRole("tab", { name: `${pt.animals.samplesTab} (1)`, exact: true }),
    ).toBeVisible()
  })

  test("lança POSITIVO na célula do protocolo; o valor persiste e entra no histórico", async ({
    page,
  }) => {
    const { catalog, users } = loadFixtures()
    const { controlId, research } = names()

    await openAnimalTab(page, pt.animals.analysesTab)

    // A grade nasce do protocolo: uma linha (patógeno × exame) para a amostra do material.
    const cell = page.getByRole("row").filter({ hasText: catalog.pathogen.label })
    await expect(cell).toContainText(catalog.examType.label)
    const result = cell.getByRole("combobox")
    await expect(result).toHaveText(pt.analyses.resultUntested)

    await pickFromSelect(page, result, pt.analyses.resultPositive)
    await expect(toast(page, pt.analyses.saved)).toBeVisible()
    await expect(result).toHaveText(pt.analyses.resultPositive)

    // Persistência: depois de recarregar, a célula vem do servidor com o valor lançado.
    await openAnimalTab(page, pt.animals.analysesTab)
    await expect(
      page.getByRole("row").filter({ hasText: catalog.pathogen.label }).getByRole("combobox"),
    ).toHaveText(pt.analyses.resultPositive)

    // Histórico: a alteração do resultado, com quem fez.
    await page.getByRole("tab", { name: pt.animals.auditTab }).click()
    const change = page
      .getByRole("main")
      .locator("div")
      .filter({ hasText: pt.analyses.resultPositive })
      .filter({ hasText: users.orgAdmin.name })
      .last()
    await expect(change).toContainText(pt.audit.entityAnalysis)
    await expect(change).toContainText(pt.audit.fieldResult)
    await expect(change).toContainText(catalog.pathogen.label)

    // A grade de resultados da pesquisa mostra o mesmo positivo, na coluna do material.
    await page.goto("/app/results")
    const researchSelect = page.getByRole("combobox").first()
    await hydrated(researchSelect)
    await pickFromSelect(page, researchSelect, research)
    const animalRow = page.getByRole("row").filter({ hasText: controlId })
    await expect(
      animalRow.getByTitle(`${catalog.organ.label}: ${pt.analyses.resultPositive}`),
    ).toBeVisible()
  })

  test("exporta a pesquisa em Darwin Core (XML) e em XLSX", async ({ page }) => {
    const { research, controlId } = names()

    await page.goto("/app/results")
    const researchSelect = page.getByRole("combobox").first()
    await hydrated(researchSelect)
    await pickFromSelect(page, researchSelect, research)
    await expect(page.getByRole("row").filter({ hasText: controlId })).toBeVisible()

    const exportMenu = page.getByRole("button", { name: pt.results.export })

    await exportMenu.click()
    const xmlDownload = page.waitForEvent("download")
    await page.getByRole("menuitem", { name: pt.results.exportDarwinCore }).click()
    const xml = await xmlDownload
    expect(xml.suggestedFilename()).toMatch(/^MARES-.*-darwincore\.xml$/)
    const xmlText = await readFile(await xml.path(), "utf8")
    expect(xmlText).toContain(`<dwc:occurrenceID>${controlId}</dwc:occurrenceID>`)
    expect(xmlText).toContain(WORMS_MATCH.scientificName)

    await exportMenu.click()
    const xlsxDownload = page.waitForEvent("download")
    await page.getByRole("menuitem", { name: pt.results.exportXlsx }).click()
    const xlsx = await xlsxDownload
    expect(xlsx.suggestedFilename()).toMatch(/\.xlsx$/)

    // É uma planilha de verdade e traz o animal cadastrado.
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(await xlsx.path())
    const cells: string[] = []
    workbook.eachSheet((sheet) =>
      sheet.eachRow((row) => row.eachCell((c) => cells.push(String(c.value)))),
    )
    expect(cells).toContain(controlId)
    expect(cells).toContain(WORMS_MATCH.scientificName)
  })

  test("o detalhe da pesquisa passa a contar o animal cadastrado", async ({ page }) => {
    await page.goto(`/app/research/${researchId}`)
    await expect(page.getByText("1 animal(is) registrado(s)")).toBeVisible()
  })
})
