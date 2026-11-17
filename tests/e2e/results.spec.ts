import { type Page } from "@playwright/test"

import { expect, test } from "./helpers/test"

import { hydrated, pickFromSelect, pt } from "./helpers/app"
import { AUTH_ENABLED, AUTH_SKIP_REASON, loadFixtures, storageStatePath } from "./helpers/fixtures"

// Grade de resultados da pesquisa (/app/results). A pesquisa "dos resultados" vem pronta do
// global-setup: três animais com amostra do mesmo material — um POSITIVO, um NEGATIVO e um sem
// análise no teste ativo — e uma entrada INATIVA do protocolo com um resultado antigo
// (INCONCLUSIVO), que só aparece com "mostrar inativos".

const r = pt.results
const an = pt.analyses

test.describe("Resultados da pesquisa", () => {
  test.skip(!AUTH_ENABLED, AUTH_SKIP_REASON)
  test.use({ storageState: storageStatePath("workAdmin") })

  async function openResults(page: Page, research: string) {
    await page.goto("/app/results")
    const select = page.getByRole("combobox").first()
    await hydrated(select)
    await pickFromSelect(page, select, research)
  }
  const animalRow = (page: Page, controlId: string) =>
    page.getByRole("row").filter({ hasText: controlId })

  test("os valores batem com o que foi lançado; busca e filtro por resultado", async ({ page }) => {
    const { work, catalog } = loadFixtures()
    const { research, positive, negative, untested } = work.results
    const organ = catalog.organ.label

    await openResults(page, research.name)
    // Um teste ativo só: aparece como texto, sem seletor.
    await expect(
      page.getByText(`${catalog.examType.label} — ${catalog.pathogen.label}`, { exact: true }),
    ).toBeVisible()
    await expect(page.getByText("3 animais", { exact: true })).toBeVisible()

    await expect(
      animalRow(page, positive.controlId).getByTitle(`${organ}: ${an.resultPositive}`),
    ).toBeVisible()
    await expect(
      animalRow(page, negative.controlId).getByTitle(`${organ}: ${an.resultNegative}`),
    ).toBeVisible()
    await expect(
      animalRow(page, untested.controlId).getByTitle(`${organ}: ${an.resultUntested}`),
    ).toBeVisible()
    await expect(animalRow(page, positive.controlId)).toContainText(positive.species)
    await expect(animalRow(page, positive.controlId)).toContainText("Florianópolis / SC")
    await expect(animalRow(page, positive.controlId)).toContainText("10/03/2026")

    // Busca por ID.
    await page.getByPlaceholder(r.searchPlaceholder).fill(negative.controlId)
    await expect(page.getByText("1 animal", { exact: true })).toBeVisible()
    await expect(animalRow(page, negative.controlId)).toBeVisible()
    await expect(animalRow(page, positive.controlId)).toHaveCount(0)
    await page.getByPlaceholder(r.searchPlaceholder).fill("nenhum animal assim")
    await expect(page.getByText(r.noMatch)).toBeVisible()
    await page.getByRole("button", { name: pt.animals.clearFilters }).click()
    await expect(page.getByText("3 animais", { exact: true })).toBeVisible()

    // Filtro por resultado: positivos, e depois os ainda não testados. (O seletor é modal:
    // fecha-se antes de olhar a tabela.)
    const resultFilter = () =>
      page
        .getByRole("combobox")
        .filter({ hasText: /^Resultado/ })
        .first()
    await resultFilter().click()
    await page.getByRole("option", { name: an.resultPositive }).click()
    await page.keyboard.press("Escape")
    await expect(page.getByText("1 animal", { exact: true })).toBeVisible()
    await expect(animalRow(page, positive.controlId)).toBeVisible()
    await page.getByRole("combobox").filter({ hasText: "Resultado · 1 selecionado" }).click()
    await page.getByRole("option", { name: an.resultPositive }).click()
    await page.getByRole("option", { name: an.resultUntested }).click()
    await page.keyboard.press("Escape")
    await expect(animalRow(page, untested.controlId)).toBeVisible()
    await expect(animalRow(page, positive.controlId)).toHaveCount(0)

    // Colunas opcionais: esconder "Local" tira a coluna da tabela.
    await page
      .getByRole("combobox")
      .filter({ hasText: /^Colunas/ })
      .click()
    await page.getByRole("option", { name: r.colLocation }).click()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("columnheader", { name: r.colLocation })).toHaveCount(0)
    await expect(page.getByRole("columnheader", { name: r.colDate, exact: true })).toBeVisible()
  })

  test("mostrar inativos traz o teste desativado e o resultado antigo dele", async ({ page }) => {
    const { work, catalog } = loadFixtures()
    const { research, positive, negative } = work.results
    const organ = catalog.organ.label
    const active = `${catalog.examType.label} — ${catalog.pathogen.label}`
    const inactive = `${catalog.examType.label} — ${catalog.pathogenBroad.label}`

    await openResults(page, research.name)
    await expect(page.getByText(active, { exact: true })).toBeVisible()
    await expect(page.getByText(inactive)).toHaveCount(0)

    await page.getByRole("checkbox", { name: r.showInactive }).check()
    // Com dois testes, o rótulo vira um seletor.
    // (qual dos dois vem selecionado depende da ordem em que o protocolo chega do servidor)
    const testSelect = page
      .getByRole("combobox")
      .filter({ hasText: `${catalog.examType.label} — ` })
    await pickFromSelect(page, testSelect, inactive)

    await expect(
      animalRow(page, positive.controlId).getByTitle(`${organ}: ${an.resultInconclusive}`),
    ).toBeVisible()
    await expect(
      animalRow(page, negative.controlId).getByTitle(`${organ}: ${an.resultUntested}`),
    ).toBeVisible()

    // Desmarcar volta ao teste ativo.
    await page.getByRole("checkbox", { name: r.showInactive }).uncheck()
    await expect(page.getByText(active, { exact: true })).toBeVisible()
    await expect(
      animalRow(page, positive.controlId).getByTitle(`${organ}: ${an.resultPositive}`),
    ).toBeVisible()
  })

  test("troca de pesquisa: cada uma mostra a sua grade ou o estado vazio correspondente", async ({
    page,
  }) => {
    const { work } = loadFixtures()
    const { research, noAnimals, positive } = work.results
    const select = () => page.getByRole("combobox").first()

    await openResults(page, research.name)
    await expect(animalRow(page, positive.controlId)).toBeVisible()
    await expect(page.getByRole("button", { name: r.export })).toBeVisible()

    // Pesquisa com protocolo e sem animais.
    await pickFromSelect(page, select(), noAnimals.name)
    await expect(page.getByText(r.noAnimals)).toBeVisible()
    await expect(animalRow(page, positive.controlId)).toHaveCount(0)
    await expect(page.getByRole("button", { name: r.export })).toHaveCount(0)

    // Pesquisa sem protocolo.
    await pickFromSelect(page, select(), work.sharing.target.name)
    await expect(page.getByText(r.noProtocol)).toBeVisible()

    // De volta: a grade da primeira reaparece.
    await pickFromSelect(page, select(), research.name)
    await expect(animalRow(page, positive.controlId)).toBeVisible()

    // O ID leva ao detalhe do animal, que sabe voltar para os resultados.
    await animalRow(page, positive.controlId)
      .getByRole("link", { name: positive.controlId })
      .click()
    await expect(page).toHaveURL((url) => url.pathname === `/app/animals/${positive.id}`)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(positive.species)
    await page.getByRole("link", { name: pt.animals.backToResults }).click()
    await expect(page).toHaveURL(/\/app\/results$/)
  })
})
