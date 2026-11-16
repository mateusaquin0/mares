import { test, expect, type Page } from "@playwright/test"

import { combobox, hydrated, pt } from "./helpers/app"
import { AUTH_ENABLED, AUTH_SKIP_REASON, loadFixtures, storageStatePath } from "./helpers/fixtures"

// Visibilidade no mapa (docs/PERMISSOES.md): um ponto é público quando o animal E a pesquisa
// são públicos. O global-setup cadastra, numa pesquisa pública, um animal público e um oculto,
// ambos com coordenadas e com espécies fictícias únicas — é pelo filtro de espécie que o teste
// os localiza, sem depender dos demais pontos que o banco de testes tiver.

// Abre o filtro de espécie e busca pelo nome; devolve a opção correspondente (se existir).
async function searchSpecies(page: Page, species: string) {
  const filter = combobox(page, pt.map.allSpecies)
  await hydrated(filter)
  await filter.click()
  await page.getByPlaceholder(pt.map.filterSpecies, { exact: true }).fill(species)
  return page.getByRole("option", { name: species, exact: true })
}

test.describe("Mapa público", () => {
  test.skip(!AUTH_ENABLED, AUTH_SKIP_REASON)

  test("mostra, sem login, o animal público de pesquisa pública — e não o oculto", async ({
    page,
  }) => {
    const { animals, research } = loadFixtures()

    await page.goto("/map")
    await expect(page.getByRole("heading", { name: pt.map.publicTitle })).toBeVisible()

    const option = await searchSpecies(page, animals.mapPublic.species)
    await option.click()
    await page.keyboard.press("Escape")

    await expect(page.getByText("1 ocorrência", { exact: true })).toBeVisible()
    const marker = page.locator(".leaflet-marker-icon")
    await expect(marker).toHaveCount(1)
    await marker.click()
    const popup = page.locator(".leaflet-popup-content")
    await expect(popup).toContainText(animals.mapPublic.controlId)
    await expect(popup).toContainText(animals.mapPublic.species)
    await expect(popup).toContainText(research.publicMap.name)
    // O mapa público não leva ao detalhe (que exige sessão).
    await expect(popup.getByRole("link")).toHaveCount(0)
  })

  test("o animal oculto e os de pesquisa privada não chegam ao navegador", async ({ page }) => {
    const { animals } = loadFixtures()

    const response = await page.goto("/map")
    const html = (await response?.text()) ?? ""
    expect(html).toContain(animals.mapPublic.controlId)
    // Oculto numa pesquisa pública, e animal com coordenadas numa pesquisa privada.
    expect(html).not.toContain(animals.mapHidden.controlId)
    expect(html).not.toContain(animals.mapHidden.species)
    expect(html).not.toContain(animals.shared.controlId)

    const option = await searchSpecies(page, animals.mapHidden.species)
    await expect(page.getByText(pt.map.noOptions)).toBeVisible()
    await expect(option).toHaveCount(0)
  })
})

test.describe("Mapa do grupo", () => {
  test.skip(!AUTH_ENABLED, AUTH_SKIP_REASON)
  test.use({ storageState: storageStatePath("orgAdmin") })

  test("dentro do grupo, o animal oculto aparece no mapa, marcado como oculto", async ({
    page,
  }) => {
    const { animals } = loadFixtures()

    await page.goto("/app/map")
    await expect(page.getByRole("heading", { name: pt.map.title, level: 1 })).toBeVisible()

    const option = await searchSpecies(page, animals.mapHidden.species)
    await option.click()
    await page.keyboard.press("Escape")

    await expect(page.getByText("1 ocorrência", { exact: true })).toBeVisible()
    const marker = page.locator(".leaflet-marker-icon")
    await expect(marker).toHaveCount(1)
    await marker.click()
    const popup = page.locator(".leaflet-popup-content")
    await expect(popup).toContainText(animals.mapHidden.controlId)
    await expect(popup).toContainText(pt.map.legendHidden)
  })
})
