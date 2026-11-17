import { type Page } from "@playwright/test"

import { expect, test } from "./helpers/test"

import { confirmAlert, expectToast, openAnimalTab, pt } from "./helpers/app"
import { AUTH_ENABLED, AUTH_SKIP_REASON, loadFixtures, storageStatePath } from "./helpers/fixtures"

// Biometria do animal: cadastro manual das medidas (com as validações da tela) e importação
// do SIMBA. O SIMBA nunca é consultado: a suíte responde no lugar da rota que o procura.

const b = pt.biometry

test.describe("Biometria", () => {
  test.skip(!AUTH_ENABLED, AUTH_SKIP_REASON)
  test.use({ storageState: storageStatePath("workAdmin") })

  const save = (page: Page) => page.getByRole("button", { name: pt.common.save, exact: true })
  const edit = (page: Page) => page.getByRole("button", { name: pt.common.edit, exact: true })
  // Linha de medida no modo de leitura (rótulo + valor).
  const measure = (page: Page, label: string) =>
    page.locator("dl > div").filter({ has: page.getByText(label, { exact: true }) })

  test("medidas manuais: valida rótulo repetido e valor inválido, salva, edita e persiste", async ({
    page,
  }) => {
    const { work } = loadFixtures()
    const animal = work.clinical.biometry

    await openAnimalTab(page, animal.id, pt.animals.biometryTab)
    await expect(page.getByText(b.emptyTitle)).toBeVisible()
    // Sem número do SIMBA não há o que importar.
    await expect(page.getByRole("button", { name: b.import })).toBeDisabled()

    await edit(page).last().click()
    await page.getByPlaceholder(b.groupPlaceholder).fill("Odontoceti")
    const add = page.getByRole("button", { name: b.addMeasure })
    await add.click()
    await page.locator("#bm-label-0").fill("Comprimento total")
    await page.locator("#bm-value-0").fill("182,5")
    await add.click()
    await page.locator("#bm-label-1").fill("Circunferência axilar")
    await page.locator("#bm-value-1").fill("96")
    await add.click()
    await page.locator("#bm-label-2").fill("comprimento total")
    await page.locator("#bm-value-2").fill("10")

    // Rótulo repetido (sem diferenciar maiúsculas): nada é gravado.
    await save(page).click()
    await expectToast(page, 'A medida "comprimento total" está repetida')
    await expect(page.locator("#bm-label-0")).toBeVisible()

    // Valor que não é número também é recusado.
    await page.locator("#bm-label-2").fill("Nadadeira peitoral")
    await page.locator("#bm-value-2").fill("abc")
    await save(page).click()
    await expectToast(page, 'Valor inválido em "Nadadeira peitoral"')

    // Remove a linha problemática e salva.
    await page.getByRole("button", { name: b.removeMeasure }).nth(2).click()
    await expect(page.locator("#bm-label-2")).toHaveCount(0)
    await save(page).click()
    await expectToast(page, b.saved)

    await expect(measure(page, "Comprimento total")).toContainText("182.5 cm")
    await expect(measure(page, "Circunferência axilar")).toContainText("96 cm")
    await expect(page.getByText("2 de 2 medidas")).toBeVisible()
    await expect(page.getByText("Odontoceti", { exact: true })).toBeVisible()

    // Edição: o formulário abre com o que foi salvo; uma medida fica sem valor.
    await edit(page).last().click()
    await expect(page.locator("#bm-label-0")).toHaveValue("Comprimento total")
    await expect(page.locator("#bm-value-0")).toHaveValue("182.5")
    await page.locator("#bm-value-0").fill("183")
    await page.locator("#bm-value-1").fill("")
    await save(page).click()
    await expectToast(page, b.saved)

    // Persistência.
    await openAnimalTab(page, animal.id, pt.animals.biometryTab)
    await expect(measure(page, "Comprimento total")).toContainText("183 cm")
    await expect(measure(page, "Circunferência axilar")).toContainText(b.notInformed)
    await expect(page.getByText("1 de 2 medidas")).toBeVisible()

    // O resumo da aba Informações e o Histórico acompanham.
    await page.getByRole("tab", { name: pt.animals.detailInfo }).click()
    await expect(page.getByText(/^1 de 2 medidas · Odontoceti/)).toContainText(
      "Comprimento total: 183 cm",
    )
    await expect(page.getByRole("button", { name: b.summaryOpen })).toBeVisible()
    await page.getByRole("tab", { name: pt.animals.auditTab }).click()
    await expect(page.getByRole("main").getByText(pt.audit.entityBiometry).first()).toBeVisible()
  })

  test("importação do SIMBA: conferência antes de gravar, e os casos em que nada é importado", async ({
    page,
  }) => {
    const { work } = loadFixtures()
    const animal = work.clinical.biometrySimba
    let simba: { status: number; body: unknown } = { status: 200, body: {} }
    await page.route("**/api/animals/*/biometry/simba", (route) =>
      route.fulfill({ status: simba.status, json: simba.body }),
    )

    await openAnimalTab(page, animal.id, pt.animals.biometryTab)
    await expect(page.getByText(b.emptyHintSimba)).toBeVisible()
    const importButton = page.getByRole("button", { name: b.import })
    await expect(importButton).toBeEnabled()

    // SIMBA fora do ar.
    simba = { status: 502, body: { error: "SIMBA indisponível" } }
    await importButton.click()
    await expectToast(page, b.importError)

    // Registro sem biometria.
    simba = { status: 200, body: { biometry: null, weightKg: null, mismatch: null } }
    await importButton.click()
    await expectToast(page, b.importEmpty)

    // Rótulos e valores em quantidades diferentes: importar gravaria números trocados.
    simba = {
      status: 200,
      body: { biometry: null, weightKg: null, mismatch: { labels: 5, values: 3 } },
    }
    await importButton.click()
    await expectToast(page, b.importMismatch)
    await expect(
      page.getByText("O SIMBA enviou 5 rótulos e 3 valores.", { exact: false }),
    ).toBeVisible()
    await expect(page.getByText(b.emptyTitle)).toBeVisible()

    // Importação válida: primeiro a conferência, e só a confirmação grava.
    simba = {
      status: 200,
      body: {
        biometry: {
          group: "Odontoceti",
          unit: "cm",
          measures: [
            { label: "Comprimento total", value: 201 },
            { label: "Nadadeira dorsal", value: null },
          ],
        },
        weightKg: null,
        mismatch: null,
      },
    }
    await importButton.click()
    const confirm = page.getByRole("alertdialog", { name: b.importConfirmTitle })
    await expect(confirm).toContainText("2 medidas vieram do SIMBA")
    // Cancelar não grava nada.
    await confirm.getByRole("button", { name: pt.common.cancel }).click()
    await expect(page.getByText(b.emptyTitle)).toBeVisible()

    await importButton.click()
    await confirmAlert(page, b.importConfirmTitle, b.importConfirmAction)
    await expectToast(page, b.saved)
    await expect(measure(page, "Comprimento total")).toContainText("201 cm")
    await expect(measure(page, "Nadadeira dorsal")).toContainText(b.notInformed)

    // O que foi confirmado ficou gravado no servidor.
    await openAnimalTab(page, animal.id, pt.animals.biometryTab)
    await expect(measure(page, "Comprimento total")).toContainText("201 cm")
    await expect(page.getByText("Odontoceti", { exact: true })).toBeVisible()

    // Reimportar o mesmo conteúdo avisa que nada muda.
    await importButton.click()
    await expect(page.getByRole("alertdialog", { name: b.importConfirmTitle })).toContainText(
      "iguais às que já estão salvas",
    )
  })
})
