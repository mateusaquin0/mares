import { expect, test } from "./helpers/test"

import { expectToast, hydrated, pt } from "./helpers/app"
import { AUTH_ENABLED, AUTH_SKIP_REASON } from "./helpers/fixtures"

// "Esqueci minha senha". O pedido de recuperação é feito pelo navegador direto ao Supabase
// Auth (`/auth/v1/recover`), que enviaria um e-mail: a suíte responde no lugar dele, e nenhuma
// requisição de recuperação sai deste teste.

const fp = pt.forgotPassword

test.describe("Recuperação de senha", () => {
  test.skip(!AUTH_ENABLED, AUTH_SKIP_REASON)

  test("valida o e-mail, mostra a confirmação e trata a recusa do serviço", async ({ page }) => {
    const recover: { email?: string; redirectTo: string | null }[] = []
    let answer: { status: number; body: unknown } = { status: 200, body: {} }
    await page.route("**/auth/v1/recover**", (route) => {
      const url = new URL(route.request().url())
      recover.push({
        email: (route.request().postDataJSON() as { email?: string }).email,
        redirectTo: url.searchParams.get("redirect_to"),
      })
      return route.fulfill({ status: answer.status, json: answer.body })
    })

    await page.goto("/login")
    await page.getByRole("link", { name: pt.login.forgot }).click()
    await expect(page).toHaveURL(/\/auth\/forgot-password$/)
    await expect(page.getByRole("heading", { name: fp.title })).toBeVisible()
    const submit = page.getByRole("button", { name: fp.submit })
    await hydrated(submit)
    const email = page.getByLabel(pt.common.email)

    // E-mail vazio ou malformado: nada é pedido ao serviço.
    await submit.click()
    await expect(page.getByText(pt.validation.email)).toBeVisible()
    await email.fill("sem-arroba")
    await email.press("Enter")
    await expect(page.getByText(pt.validation.email)).toBeVisible()
    expect(recover).toHaveLength(0)

    // Recusa do serviço (limite de envios): o erro aparece e o formulário continua.
    answer = {
      status: 429,
      body: { code: 429, error_code: "over_email_send_rate_limit", msg: "Limite de envios" },
    }
    await email.fill("alguem.e2e@test.local")
    await submit.click()
    await expectToast(page, fp.errorTitle)
    await expect(page.getByRole("heading", { name: fp.title })).toBeVisible()

    // Sucesso: a tela confirma sem dizer se a conta existe.
    answer = { status: 200, body: {} }
    await submit.click()
    await expect(page.getByRole("heading", { name: fp.sentTitle })).toBeVisible()
    await expect(page.getByText(fp.sentDescription)).toBeVisible()

    expect(recover).toHaveLength(2)
    expect(recover[1]!.email).toBe("alguem.e2e@test.local")
    // O link do e-mail voltaria para a tela de definir a senha, neste mesmo endereço.
    expect(recover[1]!.redirectTo).toContain("/auth/confirm?next=/auth/set-password")

    await page.getByRole("link", { name: pt.common.backToLogin }).click()
    await expect(page).toHaveURL(/\/login$/)
  })
})
