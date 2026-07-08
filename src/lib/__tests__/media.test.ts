import { describe, it, expect } from "vitest"
import { sniffMime, assertValidContent, assertValidFile, mediaPath } from "@/lib/media"
import { ValidationError } from "@/lib/errors"

// Amostras mínimas com os magic bytes de cada formato permitido.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0])
const GIF = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
const WEBP = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50])
const PDF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d])

describe("sniffMime", () => {
  it("detecta os formatos permitidos pelos magic bytes", () => {
    expect(sniffMime(PNG)).toBe("image/png")
    expect(sniffMime(JPEG)).toBe("image/jpeg")
    expect(sniffMime(GIF)).toBe("image/gif")
    expect(sniffMime(WEBP)).toBe("image/webp")
    expect(sniffMime(PDF)).toBe("application/pdf")
  })

  it("retorna null para conteúdo não reconhecido", () => {
    expect(sniffMime(Buffer.from("<html><script>alert(1)</script>", "utf8"))).toBeNull()
    expect(sniffMime(Buffer.from([0x00, 0x01, 0x02, 0x03]))).toBeNull()
  })

  it("não confunde RIFF que não seja WEBP", () => {
    const riffWav = Buffer.from([
      0x52,
      0x49,
      0x46,
      0x46,
      0x00,
      0x00,
      0x00,
      0x00,
      0x57,
      0x41,
      0x56,
      0x45, // "WAVE"
    ])
    expect(sniffMime(riffWav)).toBeNull()
  })
})

describe("assertValidContent", () => {
  it("devolve o tipo detectado para conteúdo válido", () => {
    expect(assertValidContent(PNG)).toBe("image/png")
  })

  it("rejeita HTML disfarçado (defesa contra upload malicioso)", () => {
    const html = Buffer.from("<html><script>alert(1)</script>", "utf8")
    expect(() => assertValidContent(html)).toThrow(ValidationError)
  })
})

describe("assertValidFile", () => {
  it("aceita tipo permitido dentro do limite de tamanho", () => {
    expect(() => assertValidFile({ size: 1024, type: "image/png" })).not.toThrow()
  })

  it("rejeita tipo não suportado", () => {
    expect(() => assertValidFile({ size: 10, type: "application/zip" })).toThrow(ValidationError)
  })

  it("rejeita arquivo acima de 10 MB", () => {
    expect(() => assertValidFile({ size: 11 * 1024 * 1024, type: "image/png" })).toThrow(
      ValidationError,
    )
  })
})

describe("mediaPath", () => {
  it("prefixa com o id do animal e sanitiza o nome original", () => {
    const path = mediaPath("animal-1", "foto do bicho!.png")
    expect(path.startsWith("animal-1/")).toBe(true)
    expect(path).toMatch(/foto_do_bicho_\.png$/)
  })

  it("neutraliza path traversal removendo as barras do nome do arquivo", () => {
    const path = mediaPath("animal-1", "../../etc/passwd")
    expect(path.startsWith("animal-1/")).toBe(true)
    // Só pode existir UMA barra (o separador animal-1/): sem barras vindas do nome,
    // não há como escapar do diretório do animal, mesmo que os ".." sejam preservados.
    expect(path.split("/")).toHaveLength(2)
    expect(path).not.toContain("/etc/")
  })
})
