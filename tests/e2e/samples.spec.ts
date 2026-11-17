import { expect, test } from "./helpers/test"

import {
  confirmAlert,
  expectToast,
  openAnimalTab,
  pickFromSelect,
  pt,
  rowMenu,
} from "./helpers/app"
import { AUTH_ENABLED, AUTH_SKIP_REASON, loadFixtures, storageStatePath } from "./helpers/fixtures"

// Amostras de um animal: edição (situação e local de estoque), filtros da aba e exclusão — que
// é bloqueada quando a amostra já tem análise lançada. O animal vem do global-setup com duas
// amostras: uma livre e uma com resultado.

const s = pt.samples

test.describe("Amostras", () => {
  test.skip(!AUTH_ENABLED, AUTH_SKIP_REASON)
  test.describe.configure({ mode: "serial" })
  test.use({ storageState: storageStatePath("workAdmin") })

  test("edita identificação, situação e estoque; a lista, os filtros e o Histórico acompanham", async ({
    page,
  }) => {
    const { work, catalog } = loadFixtures()
    const { animal, editable, locked } = work.samples
    const renamed = `${editable}-R`

    await openAnimalTab(page, animal.id, `${pt.animals.samplesTab} (2)`)
    const row = page.getByRole("row").filter({ hasText: editable })
    await expect(row.getByTitle(s.statusStored)).toBeVisible()

    await rowMenu(page, row, pt.common.edit)
    const dialog = page.getByRole("dialog", { name: s.editTitle })
    await expect(dialog.getByLabel(s.identification)).toHaveValue(editable)
    await expect(dialog.getByLabel(s.sampleType)).toHaveValue("tecido fresco")
    await expect(
      dialog.getByRole("combobox").filter({ hasText: catalog.organ.label }),
    ).toBeVisible()

    // Identificação é obrigatória.
    await dialog.getByLabel(s.identification).fill("")
    await dialog.getByRole("button", { name: pt.common.save, exact: true }).click()
    await expect(dialog.getByText(pt.validation.required)).toBeVisible()

    await dialog.getByLabel(s.identification).fill(renamed)
    await pickFromSelect(page, dialog.getByLabel(s.status, { exact: true }), s.statusInUse)
    await dialog.getByLabel(s.collectionDate).fill("2026-03-11")
    await dialog.getByLabel(s.storageTemp).fill("-80")
    await dialog.getByLabel(s.storageLocation).fill("Freezer A, caixa 3")
    await dialog.getByLabel(s.notes).fill("Fragmento de 1 cm.")
    await dialog.getByRole("button", { name: pt.common.save, exact: true }).click()
    await expectToast(page, s.updated)
    await expect(dialog).toBeHidden()

    const updated = page.getByRole("row").filter({ hasText: renamed })
    await expect(updated).toContainText("Freezer A, caixa 3")
    await expect(updated).toContainText("-80")
    await expect(updated).toContainText("11/03/2026")
    await expect(updated.getByTitle(s.statusInUse)).toBeVisible()

    // Persistência.
    await openAnimalTab(page, animal.id, `${pt.animals.samplesTab} (2)`)
    const persisted = page.getByRole("row").filter({ hasText: renamed })
    await expect(persisted).toContainText("Freezer A, caixa 3")
    await expect(persisted.getByTitle(s.statusInUse)).toBeVisible()

    // Filtros da aba: por situação e por texto (o local de estoque entra na busca).
    await pickFromSelect(
      page,
      page.getByRole("combobox").filter({ hasText: s.allStatuses }),
      s.statusStored,
    )
    await expect(page.getByRole("row").filter({ hasText: locked })).toBeVisible()
    await expect(page.getByRole("row").filter({ hasText: renamed })).toHaveCount(0)
    await page.getByRole("button", { name: s.clearFilters }).click()
    await page.getByPlaceholder(s.searchPlaceholder).fill("freezer a")
    await expect(page.getByRole("row").filter({ hasText: renamed })).toBeVisible()
    await expect(page.getByRole("row").filter({ hasText: locked })).toHaveCount(0)
    await page.getByPlaceholder(s.searchPlaceholder).fill("não existe")
    await expect(page.getByText(pt.common.noResults)).toBeVisible()

    // Histórico: situação e local, de → para.
    await page.getByRole("tab", { name: pt.animals.auditTab }).click()
    const main = page.getByRole("main")
    await expect(main.getByText(s.statusInUse, { exact: true }).first()).toBeVisible()
    await expect(main.getByText("Freezer A, caixa 3", { exact: true }).first()).toBeVisible()
    await expect(main.getByText(renamed).first()).toBeVisible()
  })

  test("exclusão: bloqueada quando há análise lançada; a amostra livre é excluída", async ({
    page,
  }) => {
    const { work } = loadFixtures()
    const { animal, editable, locked } = work.samples
    const free = `${editable}-R`

    await openAnimalTab(page, animal.id, `${pt.animals.samplesTab} (2)`)

    // Com análise: o servidor recusa e a linha continua lá.
    const lockedRow = page.getByRole("row").filter({ hasText: locked })
    await expect(lockedRow.getByRole("cell").nth(7)).toHaveText("1")
    await rowMenu(page, lockedRow, pt.common.delete)
    await confirmAlert(page, s.deleteTitle, pt.common.delete)
    await expectToast(page, s.deleteError)
    await expect(lockedRow).toBeVisible()

    // Sem análise: sai da lista.
    const freeRow = page.getByRole("row").filter({ hasText: free })
    await rowMenu(page, freeRow, pt.common.delete)
    await confirmAlert(page, s.deleteTitle, pt.common.delete)
    await expectToast(page, s.deleted)
    await expect(freeRow).toHaveCount(0)

    await openAnimalTab(page, animal.id, `${pt.animals.samplesTab} (1)`)
    await expect(page.getByRole("row").filter({ hasText: locked })).toBeVisible()
    await expect(page.getByText(free)).toHaveCount(0)
  })
})
