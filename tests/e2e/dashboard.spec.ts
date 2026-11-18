import { type Page } from "@playwright/test"

import { expect, test } from "./helpers/test"

import { hydrated, pickFromSelect, pt } from "./helpers/app"
import { AUTH_ENABLED, AUTH_SKIP_REASON, loadFixtures, storageStatePath } from "./helpers/fixtures"

// Dashboard do grupo com dados: indicadores, gráficos e mapa de calor carregam sem erro. Os
// números são conferidos com o filtro da pesquisa "compartilhada", cujo conteúdo o global-setup
// define por inteiro (1 animal, 1 amostra, 1 análise positiva) — assim o teste não depende do
// que os outros arquivos cadastram no mesmo grupo.

// Cartão de indicador: o menor bloco cujo texto é o rótulo seguido do valor (número,
// percentual ou "—" quando vazio).
function stat(page: Page, labelThenValue: RegExp) {
  return page.locator("div").filter({ hasText: labelThenValue }).last()
}

test.describe("Dashboard", () => {
  test.skip(!AUTH_ENABLED, AUTH_SKIP_REASON)
  test.use({ storageState: storageStatePath("orgAdmin") })

  test("carrega indicadores, gráficos e mapa de calor do grupo sem erro", async ({ page }) => {
    const { orgs, research, animals, catalog } = loadFixtures()
    const pageErrors: string[] = []
    const failedApi: string[] = []
    page.on("pageerror", (err) => pageErrors.push(err.message))
    page.on("response", (res) => {
      if (res.url().includes("/api/") && res.status() >= 400) {
        failedApi.push(`${res.status()} ${res.url()}`)
      }
    })

    const firstLoad = page.waitForResponse((res) => res.url().includes("/api/dashboard"))
    await page.goto("/app/dashboard")
    expect((await firstLoad).status()).toBe(200)

    await expect(page.getByRole("heading", { name: pt.dashboard.title, level: 1 })).toBeVisible()
    await expect(page.getByText(`Grupo de pesquisa ativo: ${orgs.a.name}.`)).toBeVisible()

    // Com dados, nenhum bloco cai no estado vazio…
    for (const empty of [
      pt.dashboard.chartSpeciesEmpty,
      pt.dashboard.chartPositivityEmpty,
      pt.dashboard.chartTimelineEmpty,
      pt.dashboard.heatmapEmpty,
    ]) {
      await expect(page.getByText(empty)).toHaveCount(0)
    }
    // …os gráficos de espécies e da linha do tempo são desenhados, e a positividade por exame
    // lista o exame que tem resultado lançado…
    await expect(page.locator("[data-chart=species] li").first()).toBeVisible()
    await expect(page.locator("[data-chart=timeline] > div").first()).toBeVisible()
    await expect(page.getByText(animals.shared.species).first()).toBeVisible()
    await expect(page.getByText(catalog.examType.label).first()).toBeVisible()
    // …e o mapa de calor monta.
    await expect(page.locator(".leaflet-container")).toBeVisible()

    // Indicadores recalculados para uma pesquisa de conteúdo conhecido.
    const researchFilter = page.getByRole("combobox").filter({ hasText: pt.dashboard.allResearch })
    await hydrated(researchFilter)
    const filtered = page.waitForResponse(
      (res) => res.url().includes("/api/dashboard") && res.url().includes(research.shared.id),
    )
    await pickFromSelect(page, researchFilter, research.shared.name)
    expect((await filtered).status()).toBe(200)

    await expect(stat(page, /^Animais\s*[\d—]/)).toHaveText(/^Animais\s*1$/)
    await expect(stat(page, /^Amostras coletadas\s*[\d—]/)).toHaveText(/coletadas\s*1$/)
    await expect(stat(page, /^Animais testados\s*[\d—]/)).toHaveText(/testados\s*1$/)
    await expect(stat(page, /^Taxa de positividade\s*[\d—]/)).toContainText("100")
    await expect(stat(page, /^Resultados positivos\s*[\d—]/)).toContainText(/positivos\s*1\D/)

    expect(pageErrors).toEqual([])
    expect(failedApi).toEqual([])
  })
})
