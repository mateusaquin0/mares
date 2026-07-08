import { test, expect } from "@playwright/test"

// Smoke da superfície PÚBLICA (sem login). Verifica que a landing e o mapa público
// carregam e que a navegação entre eles funciona. Assertivas estruturais (marca, links,
// container do mapa) — robustas independentemente de haver dados públicos ou não.

test("landing pública carrega e apresenta a marca e o CTA do mapa", async ({ page }) => {
  await page.goto("/")

  // Marca visível.
  await expect(page.getByRole("link", { name: /MARES/ }).first()).toBeVisible()

  // Há um caminho para o mapa público.
  await expect(page.locator('a[href="/map"]').first()).toBeVisible()
})

test("da landing dá para navegar ao mapa público", async ({ page }) => {
  await page.goto("/")
  await page.locator('a[href="/map"]').first().click()

  await expect(page).toHaveURL(/\/map$/)
  // O explorador do mapa é renderizado (data-testid estável em MapExplorer).
  await expect(page.getByTestId("map-explorer")).toBeVisible()
})

test("mapa público abre direto e mostra botão de login (sem sessão)", async ({ page }) => {
  await page.goto("/map")

  await expect(page.getByTestId("map-explorer")).toBeVisible()
  // Usuário não autenticado vê o acesso ao login (o mapa não exige sessão).
  await expect(page.locator('a[href="/login"]').first()).toBeVisible()
})
