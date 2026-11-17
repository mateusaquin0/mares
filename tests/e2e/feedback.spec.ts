import { type Page } from "@playwright/test"

import { as, expect, test } from "./helpers/test"

import { PNG_1X1, expectToast, hydrated, pt, rowMenu } from "./helpers/app"
import { AUTH_ENABLED, AUTH_SKIP_REASON, loadFixtures } from "./helpers/fixtures"
import { FEEDBACK_BUCKET, storedObjects } from "./helpers/storage"

// Feedback (sugestão/bug): a pesquisadora abre um ticket com imagem, a administração da
// aplicação responde e muda o status, a autora vê a resposta (e o indicador de não lida),
// conversa, e pede a reabertura depois de resolvido. A imagem vai para o Storage de testes; o
// teardown remove a pasta do ticket.

const f = pt.feedback
const mine = pt.myFeedback
const adm = pt.adminFeedback

test.describe("Feedback", () => {
  test.skip(!AUTH_ENABLED, AUTH_SKIP_REASON)
  test.describe.configure({ mode: "serial" })

  const title = () => `${loadFixtures().prefix} Erro ao exportar a planilha`

  async function openMine(page: Page) {
    await page.goto("/app/feedback")
    await expect(page.getByRole("heading", { name: mine.title, level: 1 })).toBeVisible()
    const row = page.getByRole("row").filter({ hasText: title() })
    await hydrated(row)
    return row
  }

  // A lista da administração é global: o filtro por autor isola o ticket da execução.
  async function openAdmin(page: Page) {
    await page.goto("/app/admin/feedback")
    await expect(page.getByRole("heading", { name: adm.title, level: 1 })).toBeVisible()
    const all = page.getByRole("tab", { name: adm.filterAll })
    await hydrated(all)
    await all.click()
    await page
      .getByPlaceholder(adm.authorPlaceholder)
      .fill(loadFixtures().users.workResearcher.email)
    return page.getByRole("row").filter({ hasText: title() })
  }

  test("abre um bug com imagem anexada, encontra em Meus envios e edita enquanto é novo", async ({
    browser,
  }) => {
    const page = await as(browser, "workResearcher")

    await page.goto("/app/animals")
    const trigger = page.getByRole("button", { name: f.trigger })
    await hydrated(trigger)
    await trigger.click()
    const dialog = page.getByRole("dialog", { name: f.dialogTitle })
    const send = dialog.getByRole("button", { name: f.send, exact: true })
    // Título e mensagem são obrigatórios.
    await expect(send).toBeDisabled()

    await dialog.getByRole("button", { name: f.typeBug, exact: true }).click()
    await dialog.getByLabel(f.titleLabel).fill(title())
    await dialog.getByLabel(f.messageLabel).fill("A exportação baixa um arquivo vazio.")

    // Anexo: só imagem é aceita.
    const files = dialog.locator('input[type="file"]')
    await files.setInputFiles({
      name: "log.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("erro"),
    })
    await expectToast(page, f.attachInvalid)
    await expect(dialog.getByRole("img")).toHaveCount(0)
    await files.setInputFiles({ name: "captura.png", mimeType: "image/png", buffer: PNG_1X1 })
    await expect(dialog.getByRole("img", { name: "captura.png" })).toBeVisible()
    await send.click()
    await expectToast(page, f.sent)
    await expect(dialog).toBeHidden()

    // Meus envios: o ticket novo, do tipo certo, com um anexo.
    const row = await openMine(page)
    await expect(row.getByTitle(mine.typeBug)).toBeVisible()
    await expect(row.getByTitle(mine.status_NEW)).toBeVisible()
    await expect(row.getByTitle(mine.sectionAttachments)).toHaveText("1")
    await row.click()
    const ticket = page.getByRole("dialog", { name: title() })
    await expect(ticket).toContainText("A exportação baixa um arquivo vazio.")
    await expect(ticket).toContainText("/app/animals")
    await expect(ticket).toContainText("1 imagem")
    await expect(ticket.getByRole("link", { name: "captura.png" }).first()).toBeVisible()
    await expect(ticket.getByText(mine.threadEmpty)).toBeVisible()

    // A imagem chegou ao Storage, na pasta do ticket.
    const list = await (await page.request.get("/api/feedback/mine")).json()
    const created = (list as { id: string; title: string }[]).find((t) => t.title === title())!
    const stored = await storedObjects(FEEDBACK_BUCKET, created.id)
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatch(/_captura\.png$/)

    // Enquanto o ticket é novo, a autora ainda pode editar a descrição.
    await ticket.getByRole("button", { name: mine.edit, exact: true }).click()
    await ticket
      .getByRole("textbox", { name: mine.messageLabel })
      .fill("A exportação em Excel baixa um arquivo vazio.")
    await ticket.getByRole("button", { name: mine.save, exact: true }).click()
    await expectToast(page, mine.saved)
    await expect(ticket).toContainText("A exportação em Excel baixa um arquivo vazio.")

    await page.context().close()
  })

  test("a administração responde e põe em análise; a autora vê a resposta não lida e conversa", async ({
    browser,
  }) => {
    const { users } = loadFixtures()
    const admin = await as(browser, "systemAdmin")
    const author = await as(browser, "workResearcher")

    const adminRow = await openAdmin(admin)
    await expect(adminRow).toContainText(users.workResearcher.email)
    await adminRow.click()
    const adminTicket = admin.getByRole("dialog", { name: title() })
    await expect(adminTicket).toContainText("A exportação em Excel baixa um arquivo vazio.")
    await expect(adminTicket).toContainText(users.workResearcher.email)
    await expect(adminTicket.getByRole("link", { name: "captura.png" }).first()).toBeVisible()

    // Resposta na conversa.
    const reply = adminTicket.getByRole("textbox", { name: adm.threadTitle })
    await reply.fill("Obrigado pelo relato. Qual navegador você usa?")
    await adminTicket.getByRole("button", { name: adm.send, exact: true }).click()
    await expect(
      adminTicket.getByText("Obrigado pelo relato. Qual navegador você usa?"),
    ).toBeVisible()
    await expect(reply).toHaveValue("")

    // Status: em análise.
    await adminTicket.getByRole("button", { name: adm.moveTo }).click()
    await admin.getByRole("menuitem", { name: adm.status_IN_REVIEW }).click()
    await expectToast(admin, adm.updated)
    await admin.keyboard.press("Escape")
    await expect(adminRow.getByTitle(adm.status_IN_REVIEW)).toBeVisible()

    // Autora: o indicador de resposta não lida, na linha e no menu lateral.
    const row = await openMine(author)
    await expect(row.getByRole("status", { name: mine.unreadReply })).toBeVisible()
    await expect(row.getByTitle(mine.status_IN_REVIEW)).toBeVisible()
    await expect(
      author.getByRole("link", { name: pt.sidebar.myFeedback }).getByRole("status"),
    ).toBeVisible()

    await row.click()
    const ticket = author.getByRole("dialog", { name: title() })
    await expect(ticket.getByText("Obrigado pelo relato. Qual navegador você usa?")).toBeVisible()
    await expect(ticket).toContainText(mine.partyAdmin)
    // Já em triagem: a descrição não pode mais ser editada.
    await expect(ticket.getByText(mine.editLocked)).toBeVisible()
    await expect(ticket.getByRole("button", { name: mine.edit, exact: true })).toHaveCount(0)

    await ticket.getByRole("textbox", { name: mine.threadTitle }).fill("Uso o Firefox.")
    await ticket.getByRole("button", { name: mine.send, exact: true }).click()
    await expect(ticket.getByText("Uso o Firefox.")).toBeVisible()
    await ticket.getByRole("button", { name: pt.common.close }).click()

    // Abrir o ticket marcou a resposta como lida.
    await author.reload()
    const reread = author.getByRole("row").filter({ hasText: title() })
    await expect(reread).toBeVisible()
    await expect(reread.getByRole("status", { name: mine.unreadReply })).toHaveCount(0)
    await expect(reread.getByTitle(mine.threadTitle)).toHaveText("2")

    // E a administração passa a ver a mensagem da autora como não lida.
    const adminAgain = await openAdmin(admin)
    await expect(adminAgain.getByRole("status", { name: adm.unreadReply })).toBeVisible()
    await adminAgain.click()
    await expect(
      admin.getByRole("dialog", { name: title() }).getByText("Uso o Firefox."),
    ).toBeVisible()

    await admin.context().close()
    await author.context().close()
  })

  test("resolver encerra a conversa; a autora pede a reabertura", async ({ browser }) => {
    const admin = await as(browser, "systemAdmin")
    const author = await as(browser, "workResearcher")

    const adminRow = await openAdmin(admin)
    await rowMenu(admin, adminRow, `Marcar como ${adm.status_RESOLVED}`, adm.colActions)
    await expectToast(admin, adm.updated)
    await expect(adminRow.getByTitle(adm.status_RESOLVED)).toBeVisible()

    const row = await openMine(author)
    await expect(row.getByTitle(mine.status_RESOLVED)).toBeVisible()
    await row.click()
    const ticket = author.getByRole("dialog", { name: title() })
    await expect(ticket.getByText(mine.lockedResolved)).toBeVisible()
    await expect(ticket.getByRole("textbox", { name: mine.threadTitle })).toHaveCount(0)

    await ticket.getByRole("button", { name: mine.reopen }).click()
    const reopen = author.getByRole("dialog", { name: mine.reopenTitle })
    const confirm = reopen.getByRole("button", { name: mine.reopenConfirm })
    // O motivo tem tamanho mínimo.
    await reopen.getByLabel(mine.messageLabel).fill("ainda")
    await expect(confirm).toBeDisabled()
    await reopen
      .getByLabel(mine.messageLabel)
      .fill("O arquivo continua vindo vazio depois da correção, no mesmo navegador.")
    await confirm.click()
    await expectToast(author, mine.reopened)

    await author.reload()
    const reopened = author.getByRole("row").filter({ hasText: title() })
    await expect(reopened.getByTitle(mine.status_REOPENED)).toBeVisible()

    // Para a administração o ticket volta à fila, na aba "Reaberto", com o motivo na conversa.
    await admin.reload()
    const tab = admin.getByRole("tab", { name: adm.status_REOPENED })
    await hydrated(tab)
    await tab.click()
    await admin
      .getByPlaceholder(adm.authorPlaceholder)
      .fill(loadFixtures().users.workResearcher.email)
    const back = admin.getByRole("row").filter({ hasText: title() })
    await expect(back.getByTitle(adm.status_REOPENED)).toBeVisible()
    await back.click()
    await expect(
      admin
        .getByRole("dialog", { name: title() })
        .getByText("O arquivo continua vindo vazio depois da correção, no mesmo navegador."),
    ).toBeVisible()

    await admin.context().close()
    await author.context().close()
  })
})
