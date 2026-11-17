import { expect, test } from "./helpers/test"

import { PNG_1X1, confirmAlert, expectToast, openAnimalTab, pt } from "./helpers/app"
import { AUTH_ENABLED, AUTH_SKIP_REASON, loadFixtures, storageStatePath } from "./helpers/fixtures"
import { MEDIA_BUCKET, storedObjects } from "./helpers/storage"

// Mídia do animal. O envio vai para o Storage do projeto de testes: o próprio teste exclui o
// arquivo pela interface, e o teardown remove qualquer objeto que sobre na pasta do animal.

const m = pt.media

test.describe("Mídia", () => {
  test.skip(!AUTH_ENABLED, AUTH_SKIP_REASON)
  test.use({ storageState: storageStatePath("workAdmin") })

  test("recusa o que não é imagem/PDF; envia, mostra, edita a legenda, abre e exclui", async ({
    page,
  }) => {
    const { work } = loadFixtures()
    const animal = work.clinical.media
    const fileInput = page.locator('input[type="file"]')
    const upload = page.getByRole("button", { name: m.upload, exact: true })

    await openAnimalTab(page, animal.id, `${pt.animals.mediaTab} (0)`)
    await expect(page.getByText(m.empty)).toBeVisible()
    await expect(upload).toBeDisabled()

    // Tipo não aceito.
    await fileInput.setInputFiles({
      name: "anotacoes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("texto"),
    })
    await upload.click()
    await expectToast(page, m.uploadError)
    await expect(page.getByText(m.empty)).toBeVisible()

    // Extensão e tipo de imagem, mas conteúdo que não é imagem: o servidor confere os bytes.
    await fileInput.setInputFiles({
      name: "falsa.png",
      mimeType: "image/png",
      buffer: Buffer.from("isto não é um PNG"),
    })
    await upload.click()
    await expect(
      page.locator("[data-sonner-toast]").filter({ hasText: m.uploadError }),
    ).toHaveCount(2)
    await expect(page.getByText(m.empty)).toBeVisible()

    // Imagem válida, com legenda.
    await fileInput.setInputFiles({ name: "foto-e2e.png", mimeType: "image/png", buffer: PNG_1X1 })
    await page.getByPlaceholder(m.labelPlaceholder).fill("Vista lateral")
    await upload.click()
    await expectToast(page, m.uploaded)

    const image = page.getByRole("img", { name: "Vista lateral" })
    await expect(image).toBeVisible()
    await expect(page.getByText(m.empty)).toHaveCount(0)
    // A miniatura carrega de verdade (URL assinada do Storage).
    await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1)

    // "Abrir": o link leva ao arquivo enviado, com o mesmo conteúdo.
    const link = page.getByRole("link").filter({ has: image })
    await expect(link).toHaveAttribute("target", "_blank")
    const href = (await link.getAttribute("href"))!
    const opened = await page.request.get(href)
    expect(opened.status()).toBe(200)
    expect(opened.headers()["content-type"]).toContain("image/png")
    expect((await opened.body()).equals(PNG_1X1)).toBe(true)
    // Só o arquivo válido chegou ao Storage — os dois recusados não deixaram objeto.
    const stored = await storedObjects(MEDIA_BUCKET, animal.id)
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatch(/_foto-e2e\.png$/)

    // Edita a legenda.
    await page.getByRole("button", { name: m.editLabel }).click()
    const dialog = page.getByRole("dialog", { name: m.editLabel })
    await expect(dialog.getByLabel(m.label)).toHaveValue("Vista lateral")
    await dialog.getByLabel(m.label).fill("Vista dorsal")
    await dialog.getByRole("button", { name: pt.common.save, exact: true }).click()
    await expectToast(page, m.labelSaved)
    await expect(page.getByRole("img", { name: "Vista dorsal" })).toBeVisible()

    // Persistência: o arquivo e a legenda voltam do servidor, e a aba conta 1.
    await openAnimalTab(page, animal.id, `${pt.animals.mediaTab} (1)`)
    await expect(page.getByRole("img", { name: "Vista dorsal" })).toBeVisible()

    // Exclui, com confirmação.
    await page.getByRole("button", { name: pt.common.delete, exact: true }).click()
    await confirmAlert(page, m.deleteTitle, pt.common.delete)
    await expectToast(page, m.deleted)
    await expect(page.getByText(m.empty)).toBeVisible()
    await expect(page.getByRole("img", { name: "Vista dorsal" })).toHaveCount(0)

    // O objeto saiu do Storage, e não só da lista.
    await expect.poll(() => storedObjects(MEDIA_BUCKET, animal.id)).toEqual([])

    await openAnimalTab(page, animal.id, `${pt.animals.mediaTab} (0)`)
    await expect(page.getByText(m.empty)).toBeVisible()
  })
})
