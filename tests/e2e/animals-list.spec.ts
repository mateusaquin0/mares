import { type Page } from "@playwright/test"

import { expect, test } from "./helpers/test"
import ExcelJS from "exceljs"

import {
  combobox,
  confirmAlert,
  expectToast,
  hydrated,
  pickFromSelect,
  pt,
  rowMenu,
} from "./helpers/app"
import { AUTH_ENABLED, AUTH_SKIP_REASON, loadFixtures, storageStatePath } from "./helpers/fixtures"

// Lista de animais: busca, filtros, ordenação, paginação, seleção com exportação e as ações do
// menu da linha. O global-setup cria dois conjuntos no grupo de trabalho, localizados pela busca
// do prefixo do ID de controle — assim nenhuma contagem depende do resto do grupo:
//   • L01…L23: datas 01…23/01/2026, duas espécies (10 + 13), os 3 últimos em outra pesquisa,
//     L01 e L02 com amostra;
//   • D01…D11: para o teste de excluir o único item da última página.

const a = pt.animals

async function openList(page: Page, search: string) {
  await page.goto("/app/animals")
  const input = page.getByPlaceholder(pt.common.search, { exact: true })
  await hydrated(input)
  await input.fill(search)
}

const range = (page: Page, text: string) =>
  expect(page.getByText(text, { exact: true })).toBeVisible()
// Linhas de dados (a primeira linha da tabela é o cabeçalho).
const dataRow = (page: Page, index: number) => page.getByRole("row").nth(index + 1)

// Seletor de vários valores (MultiSelect): abre, marca a opção e fecha.
async function pickMulti(page: Page, placeholder: string, option: string) {
  await combobox(page, placeholder).click()
  await page.getByRole("option", { name: option, exact: true }).click()
  await page.keyboard.press("Escape")
}

test.describe("Lista de animais", () => {
  test.skip(!AUTH_ENABLED, AUTH_SKIP_REASON)
  test.use({ storageState: storageStatePath("workAdmin") })

  test("busca e paginação: 23 registros em duas páginas, e o tamanho da página", async ({
    page,
  }) => {
    const { paged } = loadFixtures().work.list

    await openList(page, paged.prefix)
    await range(page, "1-20 de 23")
    await expect(page.getByText("Página 1 de 2")).toBeVisible()
    // Ordenação padrão: data do evento, do mais recente.
    await expect(dataRow(page, 0)).toContainText(`${paged.prefix}23`)
    await expect(page.getByRole("button", { name: pt.pagination.previous })).toBeDisabled()

    await page.getByRole("button", { name: pt.pagination.next }).click()
    await range(page, "21-23 de 23")
    await expect(page.getByRole("row").filter({ hasText: paged.prefix })).toHaveCount(3)
    await expect(dataRow(page, 2)).toContainText(`${paged.prefix}01`)
    await expect(page.getByRole("button", { name: pt.pagination.next })).toBeDisabled()

    await page.getByRole("button", { name: pt.pagination.previous }).click()
    await range(page, "1-20 de 23")

    // 30 por página: tudo numa página só.
    await pickFromSelect(page, page.getByRole("combobox").filter({ hasText: /^20$/ }), "30")
    await range(page, "1-23 de 23")
    await expect(page.getByRole("row").filter({ hasText: paged.prefix })).toHaveCount(23)

    // Busca mais específica, e a busca sem resultado.
    await page.getByPlaceholder(pt.common.search, { exact: true }).fill(`${paged.prefix}07`)
    await range(page, "1-1 de 1")
    await expect(dataRow(page, 0)).toContainText("07/01/2026")
    await page.getByPlaceholder(pt.common.search, { exact: true }).fill(`${paged.prefix}-nada`)
    await expect(page.getByText(pt.common.noResults)).toBeVisible()
  })

  test("filtros por espécie, pesquisa, amostras e período; limpar filtros", async ({ page }) => {
    const { paged, speciesAlfa, speciesBeta, researchB } = loadFixtures().work.list

    await openList(page, paged.prefix)
    await range(page, "1-20 de 23")

    // Espécie.
    await pickMulti(page, a.allSpecies, speciesAlfa.name)
    await range(page, `1-${speciesAlfa.count} de ${speciesAlfa.count}`)
    await expect(page.getByRole("row").filter({ hasText: speciesBeta.name })).toHaveCount(0)
    await expect(page.getByRole("row").filter({ hasText: speciesAlfa.name })).toHaveCount(
      speciesAlfa.count,
    )

    // Espécie + com amostras: só L01 e L02 têm amostra.
    await pickFromSelect(
      page,
      page.getByRole("combobox", { name: a.filterSamples, exact: true }),
      a.withSamples,
    )
    await range(page, `1-${paged.withSamples} de ${paged.withSamples}`)
    await expect(page.getByRole("row").filter({ hasText: `${paged.prefix}01` })).toBeVisible()
    await expect(page.getByRole("row").filter({ hasText: `${paged.prefix}02` })).toBeVisible()

    await pickFromSelect(
      page,
      page.getByRole("combobox", { name: a.filterSamples, exact: true }),
      a.withoutSamples,
    )
    const without = speciesAlfa.count - paged.withSamples
    await range(page, `1-${without} de ${without}`)
    await expect(page.getByRole("row").filter({ hasText: `${paged.prefix}01` })).toHaveCount(0)

    // Limpar filtros zera também a busca: ela é refeita para voltar ao conjunto do teste.
    await page.getByRole("button", { name: a.clearFilters }).click()
    await expect(page.getByPlaceholder(pt.common.search, { exact: true })).toHaveValue("")
    await expect(combobox(page, a.allSpecies)).toBeVisible()
    await page.getByPlaceholder(pt.common.search, { exact: true }).fill(paged.prefix)
    await range(page, "1-20 de 23")

    // Pesquisa: os três últimos estão na pesquisa B.
    await pickMulti(page, a.allResearch, researchB.name)
    await range(page, `1-${paged.inResearchB} de ${paged.inResearchB}`)
    await expect(dataRow(page, 0)).toContainText(`${paged.prefix}23`)
    await expect(dataRow(page, 2)).toContainText(`${paged.prefix}21`)
    await pickMulti(page, researchB.name, researchB.name)
    await range(page, "1-20 de 23")

    // Período: de 05 a 07/01/2026 → L05, L06 e L07.
    await page.getByLabel(a.filterFrom, { exact: true }).fill("2026-01-05")
    await page.getByLabel(a.filterTo, { exact: true }).fill("2026-01-07")
    await range(page, "1-3 de 3")
    for (const n of ["05", "06", "07"]) {
      await expect(page.getByRole("row").filter({ hasText: `${paged.prefix}${n}` })).toBeVisible()
    }
    await expect(page.getByRole("row").filter({ hasText: `${paged.prefix}08` })).toHaveCount(0)
  })

  test("ordenação por coluna alterna crescente e decrescente", async ({ page }) => {
    const { paged } = loadFixtures().work.list

    await openList(page, paged.prefix)
    await range(page, "1-20 de 23")

    const byId = page.getByRole("button", { name: a.colControl, exact: true })
    const header = page.getByRole("columnheader").filter({ has: byId })
    await byId.click()
    await expect(header).toHaveAttribute("aria-sort", "ascending")
    await expect(dataRow(page, 0)).toContainText(`${paged.prefix}01`)
    await expect(dataRow(page, 19)).toContainText(`${paged.prefix}20`)

    await byId.click()
    await expect(header).toHaveAttribute("aria-sort", "descending")
    await expect(dataRow(page, 0)).toContainText(`${paged.prefix}23`)

    // Por número de amostras, decrescente: os dois que têm amostra vêm primeiro.
    const bySamples = page.getByRole("button", { name: a.colSamples, exact: true })
    await bySamples.click()
    await bySamples.click()
    await expect(page.getByRole("columnheader").filter({ has: bySamples })).toHaveAttribute(
      "aria-sort",
      "descending",
    )
    await expect(dataRow(page, 0)).toContainText(/L0[12]/)
    await expect(dataRow(page, 1)).toContainText(/L0[12]/)
    await expect(dataRow(page, 2)).not.toContainText(/L0[12]\b/)
  })

  test("seleção: todos os filtrados ou linha a linha, e exportação da seleção em planilha", async ({
    page,
  }) => {
    const { paged } = loadFixtures().work.list

    await openList(page, paged.prefix)
    await range(page, "1-20 de 23")
    await expect(page.getByRole("button", { name: a.export })).toHaveCount(0)

    // Uma linha.
    const row = page.getByRole("row").filter({ hasText: `${paged.prefix}22` })
    await row.getByRole("checkbox", { name: a.selectRow }).check()
    await expect(page.getByText("1 selecionado(s)")).toBeVisible()

    // "Selecionar todos" alcança os 23 filtrados, não só os 20 da página.
    await page.getByRole("checkbox", { name: a.selectAll }).click()
    await expect(page.getByText("23 selecionado(s)")).toBeVisible()

    // Desmarca um e exporta os 22 restantes.
    await row.getByRole("checkbox", { name: a.selectRow }).uncheck()
    await expect(page.getByText("22 selecionado(s)")).toBeVisible()

    await page.getByRole("button", { name: a.export }).click()
    const download = page.waitForEvent("download")
    await page.getByRole("menuitem", { name: a.exportExcel }).click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(/\.xlsx$/)

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(await file.path())
    const cells = new Set<string>()
    workbook.eachSheet((sheet) =>
      sheet.eachRow((r) => r.eachCell((c) => cells.add(String(c.value)))),
    )
    const exported = [...cells].filter((c) => c.startsWith(paged.prefix))
    expect(exported).toHaveLength(22)
    expect(exported).toContain(`${paged.prefix}01`)
    expect(exported).toContain(`${paged.prefix}23`)
    expect(exported).not.toContain(`${paged.prefix}22`)

    // Mudar o filtro descarta a seleção.
    await page.getByPlaceholder(pt.common.search, { exact: true }).fill(`${paged.prefix}0`)
    await range(page, "1-9 de 9")
    await expect(page.getByText(/selecionado\(s\)/)).toHaveCount(0)
  })

  test("menu da linha: editar grava e a lista mostra o novo valor", async ({ page }) => {
    const { paged } = loadFixtures().work.list
    await page.route("**/api/worms?*", (route) => route.fulfill({ json: [] }))

    await openList(page, `${paged.prefix}10`)
    const row = page.getByRole("row").filter({ hasText: `${paged.prefix}10` })
    await expect(row).toContainText("Laguna, SC")

    await rowMenu(page, row, pt.common.edit)
    const dialog = page.getByRole("dialog", { name: a.editTitle })
    await expect(dialog.getByLabel(a.controlId)).toHaveValue(`${paged.prefix}10`)
    await expect(dialog.getByLabel(a.municipality)).toHaveValue("Laguna")
    await dialog.getByLabel(a.municipality).fill("Jaguaruna")
    await dialog.getByRole("button", { name: pt.common.save, exact: true }).click()

    await expectToast(page, a.updated)
    await expect(dialog).toBeHidden()
    await expect(row).toContainText("Jaguaruna, SC")
  })

  test("menu da linha: excluir pede confirmação; apagar o único item da última página volta à anterior", async ({
    page,
  }) => {
    const { removable } = loadFixtures().work.list

    await openList(page, removable.prefix)
    await range(page, "1-11 de 11")
    await pickFromSelect(page, page.getByRole("combobox").filter({ hasText: /^20$/ }), "10")
    await range(page, "1-10 de 11")
    await page.getByRole("button", { name: pt.pagination.next }).click()
    await range(page, "11-11 de 11")
    await expect(page.getByText("Página 2 de 2")).toBeVisible()

    const last = page.getByRole("row").filter({ hasText: `${removable.prefix}01` })
    await expect(last).toBeVisible()

    // Cancelar a confirmação não apaga nada.
    await rowMenu(page, last, pt.common.delete)
    const confirm = page.getByRole("alertdialog", { name: a.deleteTitle })
    await confirm.getByRole("button", { name: pt.common.cancel }).click()
    await expect(confirm).toBeHidden()
    await expect(last).toBeVisible()

    await rowMenu(page, last, pt.common.delete)
    await confirmAlert(page, a.deleteTitle, pt.common.delete)
    await expectToast(page, a.deleted)

    // A página 2 deixou de existir: a lista volta para a 1, com os 10 restantes.
    await range(page, "1-10 de 10")
    await expect(page.getByText("Página 1 de 1")).toBeVisible()
    await expect(page.getByRole("row").filter({ hasText: removable.prefix })).toHaveCount(10)
    await expect(page.getByText(`${removable.prefix}01`)).toHaveCount(0)
  })
})
