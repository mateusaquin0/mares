import { type Page } from "@playwright/test"

import { expect, test } from "./helpers/test"

import { hydrated, pt } from "./helpers/app"
import {
  AUTH_ENABLED,
  AUTH_SKIP_REASON,
  loadFixtures,
  storageStatePath,
  type E2eFixtures,
} from "./helpers/fixtures"

// Estados de erro: o que cada tela mostra quando a API que a alimenta responde 500. A suíte
// devolve o 500 no lugar do servidor (só para o GET da listagem) e espera a tela desistir de
// tentar de novo.
//
// ESPERADO em todas: um aviso de falha — e NUNCA o estado vazio, que afirma algo falso ("nenhum
// animal registrado", "esta pesquisa não tem protocolo"). O laudo de necrópsia já faz isso.
// As demais telas caem no estado vazio sem aviso nenhum: são defeitos conhecidos do app,
// registrados aqui como `test.fail` (o teste passa a "falhar" — pedindo para tirar a marca —
// no dia em que a tela ganhar o aviso).

type Case = {
  screen: string
  // Rota da listagem (GET) que falha.
  api: string
  path: (f: E2eFixtures) => string
  // Aba do detalhe do animal, quando a listagem mora numa aba.
  tab?: string
  // O que a tela afirma hoje, indevidamente, quando a carga falha.
  emptyState?: string
}

const animal = (f: E2eFixtures) => `/app/animals/${f.work.samples.animal.id}`

const KNOWN_DEFECTS: Case[] = [
  {
    screen: "lista de animais",
    api: "**/api/animals?*",
    path: () => "/app/animals",
    emptyState: pt.animals.empty,
  },
  {
    screen: "lista de pesquisas",
    api: "**/api/research/catalog*",
    path: () => "/app/research",
    emptyState: pt.research.empty,
  },
  {
    screen: "membros do grupo",
    api: "**/api/organizations/*/members",
    path: () => "/app/members",
    emptyState: pt.members.empty,
  },
  {
    screen: "glossário",
    api: "**/api/catalog/organs*",
    path: () => "/app/catalogs",
    emptyState: pt.catalogs.empty,
  },
  {
    screen: "resultados da pesquisa",
    api: "**/api/research/*/results*",
    path: () => "/app/results",
    emptyState: pt.results.noProtocol,
  },
  {
    screen: "dashboard",
    api: "**/api/dashboard*",
    path: () => "/app/dashboard",
    emptyState: pt.dashboard.chartSpeciesEmpty,
  },
  {
    screen: "meus envios (feedback)",
    api: "**/api/feedback/mine*",
    path: () => "/app/feedback",
    emptyState: pt.myFeedback.empty,
  },
  {
    screen: "amostras do animal",
    api: "**/api/animals/*/samples*",
    path: animal,
    tab: pt.animals.samplesTab,
    emptyState: pt.samples.empty,
  },
  {
    // A aba fica em branco: nem grade, nem aviso.
    screen: "análises do animal",
    api: "**/api/animals/*/grid*",
    path: animal,
    tab: pt.animals.analysesTab,
  },
  {
    screen: "mídia do animal",
    api: "**/api/animals/*/media*",
    path: animal,
    tab: pt.animals.mediaTab,
    emptyState: pt.media.empty,
  },
  {
    screen: "histórico do animal",
    api: "**/api/animals/*/audit*",
    path: animal,
    tab: pt.animals.auditTab,
    emptyState: pt.audit.empty,
  },
  {
    screen: "biometria do animal",
    api: "**/api/animals/*/biometry",
    path: animal,
    tab: pt.animals.biometryTab,
    emptyState: pt.biometry.emptyTitle,
  },
]

// Abre a tela com a listagem falhando e espera a última tentativa de carga (a consulta é
// refeita três vezes antes de desistir). Devolve quantas vezes a rota foi chamada.
async function openWithFailingApi(page: Page, c: Case): Promise<() => number> {
  let hits = 0
  await page.route(c.api, (route) => {
    if (route.request().method() !== "GET") return route.fallback()
    hits++
    return route.fulfill({ status: 500, json: { error: "Erro interno" } })
  })
  await page.goto(c.path(loadFixtures()))
  if (c.tab) {
    const tab = page.getByRole("tab", { name: c.tab })
    await hydrated(tab)
    await tab.click()
  }
  await expect.poll(() => hits, { timeout: 30_000 }).toBeGreaterThanOrEqual(4)
  return () => hits
}

// Aviso de falha de carga, em qualquer forma: texto na tela ou aviso flutuante.
const FAILURE = /não foi possível|erro ao carregar|falha ao carregar/i

test.describe("Estados de erro (API de listagem respondendo 500)", () => {
  test.skip(!AUTH_ENABLED, AUTH_SKIP_REASON)
  test.use({ storageState: storageStatePath("workAdmin") })

  test("laudo de necrópsia: mostra a falha, não o laudo vazio, e recarrega pelo botão", async ({
    page,
  }) => {
    const { work } = loadFixtures()
    let failing = true
    await page.route("**/api/animals/*/necropsy", (route) =>
      failing && route.request().method() === "GET"
        ? route.fulfill({ status: 500, json: { error: "Erro interno" } })
        : route.fallback(),
    )

    await page.goto(`/app/animals/${work.samples.animal.id}`)
    const tab = page.getByRole("tab", { name: pt.animals.necropsyTab })
    await hydrated(tab)
    await tab.click()

    const main = page.getByRole("main")
    await expect(main.getByText(pt.necropsy.loadError)).toBeVisible({ timeout: 30_000 })
    await expect(main.getByText(pt.necropsy.noSystemsTitle)).toHaveCount(0)
    await expect(main.getByText(pt.necropsy.screeningTitle)).toHaveCount(0)

    // Com a API de volta, "Atualizar" traz o laudo.
    failing = false
    await main.getByRole("button", { name: pt.common.reload }).click()
    await expect(main.getByText(pt.necropsy.screeningTitle)).toBeVisible()
    await expect(main.getByText(pt.necropsy.loadError)).toHaveCount(0)
  })

  for (const c of KNOWN_DEFECTS) {
    test(`${c.screen}: deveria avisar da falha em vez de parecer vazia`, async ({ page }) => {
      // Defeito do app: a tela trata a falha de carga como "sem dados".
      test.fail()

      await openWithFailingApi(page, c)
      const failure = page
        .getByRole("main")
        .getByText(FAILURE)
        .or(page.locator("[data-sonner-toast]").filter({ hasText: FAILURE }))
      await expect(failure.first()).toBeVisible({ timeout: 3_000 })
      if (c.emptyState) await expect(page.getByText(c.emptyState)).toHaveCount(0)
    })
  }
})
