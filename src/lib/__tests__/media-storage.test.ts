// Mídia sobre o Supabase Storage: anexos de feedback (só imagem), criação do bucket privado,
// URL assinada e os clientes de service role. O Storage/Auth é simulado — nenhuma chamada sai.

import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
    NEXT_PUBLIC_APP_URL: "https://mares.app",
  },
}))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

const getBucket = vi.fn()
const createBucket = vi.fn()
const createSignedUrl = vi.fn()
const from = vi.fn<(bucket: string) => unknown>(() => ({ createSignedUrl }))
const inviteUserByEmail = vi.fn()
const createSupabaseClient = vi.fn<(url: string, key: string, opts: unknown) => unknown>(() => ({
  storage: { getBucket, createBucket, from },
  auth: { admin: { inviteUserByEmail } },
}))
vi.mock("@supabase/supabase-js", () => ({
  createClient: (url: string, key: string, opts: unknown) => createSupabaseClient(url, key, opts),
}))

type SsrCookies = {
  getAll: () => unknown[]
  setAll: (c: { name: string; value: string; options?: unknown }[]) => void
}
const createServerClient = vi.fn((_url: string, _key: string, opts: { cookies: SsrCookies }) => ({
  cookies: opts.cookies,
}))
const createBrowserClient = vi.fn<(url: string, key: string) => unknown>(() => ({
  browser: true,
}))
vi.mock("@supabase/ssr", () => ({
  createServerClient: (url: string, key: string, opts: { cookies: SsrCookies }) =>
    createServerClient(url, key, opts),
  createBrowserClient: (url: string, key: string) => createBrowserClient(url, key),
}))

const cookieStore = { getAll: vi.fn(() => [{ name: "sb", value: "1" }]), set: vi.fn() }
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }))

const { ensureBucket, signMediaUrl, MEDIA_BUCKET, MEDIA_MAX_BYTES } = await import("@/lib/media")
const {
  FEEDBACK_ATTACHMENT_ALLOWED,
  FEEDBACK_ATTACHMENT_MAX_BYTES,
  FEEDBACK_BUCKET,
  assertValidAttachment,
  assertValidAttachmentContent,
  attachmentPath,
} = await import("@/lib/feedback-media")
const { createAdminClient, inviteUser, resendInvite } = await import("@/lib/supabase/admin")
const server = await import("@/lib/supabase/server")
const browser = await import("@/lib/supabase/client")

const bytes = (...b: number[]) => Buffer.from([...b, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
const PNG = bytes(0x89, 0x50, 0x4e, 0x47)
const JPEG = bytes(0xff, 0xd8, 0xff)
const GIF = bytes(0x47, 0x49, 0x46, 0x38)
const WEBP = Buffer.from("RIFF\0\0\0\0WEBPVP8 ", "latin1")
const PDF = Buffer.from("%PDF-1.7\n", "latin1")
const HTML = Buffer.from("<html><script>alert(1)</script></html>")

beforeEach(() => {
  vi.clearAllMocks()
})

describe("anexo de feedback — só imagem", () => {
  it.each(FEEDBACK_ATTACHMENT_ALLOWED)("aceita o tipo declarado %s", (type) => {
    expect(() => assertValidAttachment({ type, size: 1024 })).not.toThrow()
  })

  // PDF é aceito na mídia do animal, mas não aqui: o anexo existe para MOSTRAR a tela.
  it.each(["application/pdf", "text/html", "image/svg+xml", ""])(
    "recusa o tipo declarado %s",
    (type) => {
      expect(() => assertValidAttachment({ type, size: 1024 })).toThrow(
        expect.objectContaining({ code: "mediaInvalidType" }),
      )
    },
  )

  it("aceita exatamente 5 MB e recusa um byte a mais", () => {
    expect(FEEDBACK_ATTACHMENT_MAX_BYTES).toBe(5 * 1024 * 1024)
    expect(() =>
      assertValidAttachment({ type: "image/png", size: FEEDBACK_ATTACHMENT_MAX_BYTES }),
    ).not.toThrow()
    expect(() =>
      assertValidAttachment({ type: "image/png", size: FEEDBACK_ATTACHMENT_MAX_BYTES + 1 }),
    ).toThrow(expect.objectContaining({ code: "mediaTooLarge" }))
  })

  it.each([
    ["PNG", PNG, "image/png"],
    ["JPEG", JPEG, "image/jpeg"],
    ["GIF", GIF, "image/gif"],
    ["WEBP", WEBP, "image/webp"],
  ])("conteúdo %s é reconhecido pelos primeiros bytes", (_label, buf, mime) => {
    expect(assertValidAttachmentContent(buf)).toBe(mime)
  })

  // O tipo declarado é forjável: um HTML enviado como "image/png" seria servido pelo domínio
  // do Storage — vetor de XSS. Vale o conteúdo real.
  it.each([
    ["HTML disfarçado", HTML],
    ["PDF (válido na mídia do animal, não aqui)", PDF],
    ["arquivo vazio", Buffer.alloc(0)],
  ])("recusa %s", (_label, buf) => {
    expect(() => assertValidAttachmentContent(buf)).toThrow(
      expect.objectContaining({ code: "mediaInvalidType" }),
    )
  })

  it("o caminho fica dentro da pasta do ticket e não aceita separadores do nome original", () => {
    const path = attachmentPath("fb-1", "../../etc/pass wd?.png")
    expect(path.startsWith("fb-1/")).toBe(true)
    expect(path.split("/")).toHaveLength(2)
    expect(path).toMatch(/^fb-1\/[0-9a-f-]{36}_[\w.-]+$/)
    expect(path.endsWith(".png")).toBe(true)
  })

  it("dois envios do mesmo arquivo não colidem, e o nome é truncado preservando a extensão", () => {
    expect(attachmentPath("fb-1", "tela.png")).not.toBe(attachmentPath("fb-1", "tela.png"))
    const long = attachmentPath("fb-1", `${"a".repeat(300)}.jpeg`)
    const name = long.split("/")[1]!.slice(37)
    expect(name).toHaveLength(80)
    expect(name.endsWith(".jpeg")).toBe(true)
  })

  it("o bucket de feedback é separado do de mídia dos animais", () => {
    expect(FEEDBACK_BUCKET).not.toBe(MEDIA_BUCKET)
  })
})

describe("ensureBucket", () => {
  it("cria o bucket PRIVADO com o limite de tamanho quando ele não existe", async () => {
    getBucket.mockResolvedValue({ data: null })
    await ensureBucket()
    expect(createBucket).toHaveBeenCalledWith(MEDIA_BUCKET, {
      public: false,
      fileSizeLimit: MEDIA_MAX_BYTES,
    })
  })

  it("não recria um bucket existente", async () => {
    getBucket.mockResolvedValue({ data: { id: MEDIA_BUCKET } })
    await ensureBucket()
    expect(createBucket).not.toHaveBeenCalled()
  })

  it("aceita outro bucket e outro limite (anexos de feedback)", async () => {
    getBucket.mockResolvedValue({ data: null })
    await ensureBucket(FEEDBACK_BUCKET, FEEDBACK_ATTACHMENT_MAX_BYTES)
    expect(getBucket).toHaveBeenCalledWith(FEEDBACK_BUCKET)
    expect(createBucket).toHaveBeenCalledWith(FEEDBACK_BUCKET, {
      public: false,
      fileSizeLimit: FEEDBACK_ATTACHMENT_MAX_BYTES,
    })
  })
})

describe("signMediaUrl", () => {
  it("assina o caminho por 1 hora no bucket de mídia", async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed/x" } })
    await expect(signMediaUrl("a1/foto.png")).resolves.toBe("https://signed/x")
    expect(from).toHaveBeenCalledWith(MEDIA_BUCKET)
    expect(createSignedUrl).toHaveBeenCalledWith("a1/foto.png", 3600)
  })

  it("falha do Storage vira null (a tela mostra o nome do arquivo)", async () => {
    createSignedUrl.mockResolvedValue({ data: null, error: { message: "not found" } })
    await expect(signMediaUrl("a1/sumiu.png", FEEDBACK_BUCKET)).resolves.toBeNull()
    expect(from).toHaveBeenCalledWith(FEEDBACK_BUCKET)
  })
})

describe("cliente de service role e convites", () => {
  it("usa a service role sem persistir nem renovar sessão", () => {
    createAdminClient()
    expect(createSupabaseClient).toHaveBeenCalledWith("https://proj.supabase.co", "service-key", {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  })

  it("convida pelo e-mail e devolve o id criado no Auth", async () => {
    inviteUserByEmail.mockResolvedValue({ data: { user: { id: "auth-1" } }, error: null })
    await expect(inviteUser("ana@mares.org")).resolves.toBe("auth-1")
    // O link do convite valida o token e leva à tela de definir senha.
    expect(inviteUserByEmail).toHaveBeenCalledWith("ana@mares.org", {
      redirectTo: "https://mares.app/auth/confirm?next=/auth/set-password",
    })
  })

  it("erro do Auth no convite é propagado com a mensagem dele", async () => {
    inviteUserByEmail.mockResolvedValue({
      data: { user: null },
      error: { message: "User already registered" },
    })
    await expect(inviteUser("ana@mares.org")).rejects.toThrow("User already registered")
  })

  it("resposta sem usuário e sem erro também falha (não devolve id indefinido)", async () => {
    inviteUserByEmail.mockResolvedValue({ data: { user: null }, error: null })
    await expect(inviteUser("ana@mares.org")).rejects.toThrow("Falha ao convidar usuário")
  })

  it("reenvio do convite usa o mesmo destino e propaga o erro", async () => {
    inviteUserByEmail.mockResolvedValue({ data: {}, error: null })
    await expect(resendInvite("ana@mares.org")).resolves.toBeUndefined()
    expect(inviteUserByEmail).toHaveBeenCalledWith("ana@mares.org", {
      redirectTo: "https://mares.app/auth/confirm?next=/auth/set-password",
    })

    inviteUserByEmail.mockResolvedValue({ data: {}, error: { message: "rate limit" } })
    await expect(resendInvite("ana@mares.org")).rejects.toThrow("rate limit")
  })
})

describe("clientes Supabase de servidor e de navegador", () => {
  it("o cliente de servidor usa a chave pública e os cookies da requisição", async () => {
    const client = (await server.createClient()) as unknown as { cookies: SsrCookies }
    expect(createServerClient).toHaveBeenCalledWith(
      "https://proj.supabase.co",
      "anon-key",
      expect.anything(),
    )
    expect(client.cookies.getAll()).toEqual([{ name: "sb", value: "1" }])
    client.cookies.setAll([{ name: "sb", value: "2", options: { path: "/" } }])
    expect(cookieStore.set).toHaveBeenCalledWith("sb", "2", { path: "/" })
  })

  // Em Server Component o Next proíbe gravar cookie; o middleware renova a sessão por fora.
  it("gravar cookie a partir de um Server Component não derruba o render", async () => {
    cookieStore.set.mockImplementationOnce(() => {
      throw new Error("Cookies can only be modified in a Server Action or Route Handler")
    })
    const client = (await server.createClient()) as unknown as { cookies: SsrCookies }
    expect(() => client.cookies.setAll([{ name: "sb", value: "2" }])).not.toThrow()
  })

  it("o cliente administrativo de servidor usa a service role e ignora cookies", () => {
    const client = server.createAdminClient() as unknown as { cookies: SsrCookies }
    expect(createServerClient).toHaveBeenCalledWith(
      "https://proj.supabase.co",
      "service-key",
      expect.anything(),
    )
    expect(client.cookies.getAll()).toEqual([])
    expect(() => client.cookies.setAll([{ name: "x", value: "y" }])).not.toThrow()
    expect(cookieStore.set).not.toHaveBeenCalled()
  })

  it("o cliente de navegador só conhece a chave pública", () => {
    browser.createClient()
    expect(createBrowserClient).toHaveBeenCalledWith("https://proj.supabase.co", "anon-key")
  })
})
