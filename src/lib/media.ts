// MARES — Helpers de mídia de animais (Fase 3), sobre o Supabase Storage.
// Bucket privado; guardamos o caminho do objeto em AnimalMedia.url e geramos URLs
// assinadas na leitura (arquivos não ficam públicos). Ver docs/PERMISSOES.md §Mídia.

import { createAdminClient } from "@/lib/supabase/admin"
import { prisma } from "@/lib/prisma"
import { NotFoundError, ValidationError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

export const MEDIA_BUCKET = "animal-media"
export const MEDIA_MAX_BYTES = 10 * 1024 * 1024 // 10 MB
export const MEDIA_ALLOWED = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]
const SIGNED_TTL = 60 * 60 // 1h

/** Cria o bucket se ainda não existir (idempotente). */
export async function ensureBucket() {
  const admin = createAdminClient()
  const { data } = await admin.storage.getBucket(MEDIA_BUCKET)
  if (!data) {
    await admin.storage.createBucket(MEDIA_BUCKET, {
      public: false,
      fileSizeLimit: MEDIA_MAX_BYTES,
    })
  }
}

/** Caminho do objeto no bucket a partir do animal + nome original. */
export function mediaPath(animalId: string, originalName: string) {
  const safe = originalName.replace(/[^\w.\-]+/g, "_").slice(-80)
  return `${animalId}/${crypto.randomUUID()}_${safe}`
}

/** Valida tipo (declarado) e tamanho do arquivo enviado. */
export function assertValidFile(file: { size: number; type: string }) {
  if (!MEDIA_ALLOWED.includes(file.type)) {
    throw new ValidationError("Tipo de arquivo não suportado", ERROR_CODES.mediaInvalidType)
  }
  if (file.size > MEDIA_MAX_BYTES) {
    throw new ValidationError("Arquivo muito grande", ERROR_CODES.mediaTooLarge)
  }
}

/**
 * Detecta o tipo real do arquivo pelos primeiros bytes (magic numbers), ignorando
 * o `Content-Type` informado pelo cliente (que é forjável). Retorna o MIME detectado
 * ou `null` se não bater com nenhum formato permitido.
 */
export function sniffMime(buf: Buffer): string | null {
  const b = (i: number) => buf[i]
  // JPEG: FF D8 FF
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg"
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return "image/png"
  // GIF: "GIF8"
  if (b(0) === 0x47 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x38) return "image/gif"
  // WEBP: "RIFF"...."WEBP"
  if (
    b(0) === 0x52 &&
    b(1) === 0x49 &&
    b(2) === 0x46 &&
    b(3) === 0x46 &&
    b(8) === 0x57 &&
    b(9) === 0x45 &&
    b(10) === 0x42 &&
    b(11) === 0x50
  )
    return "image/webp"
  // PDF: "%PDF-"
  if (b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46 && b(4) === 0x2d)
    return "application/pdf"
  return null
}

/**
 * Confere o conteúdo real do arquivo contra a allowlist e devolve o MIME detectado
 * (a ser usado como `contentType` do upload, em vez do tipo enviado pelo cliente).
 * @throws ValidationError se o conteúdo não corresponder a um formato permitido.
 */
export function assertValidContent(buf: Buffer): string {
  const detected = sniffMime(buf)
  if (!detected || !MEDIA_ALLOWED.includes(detected)) {
    throw new ValidationError(
      "Conteúdo do arquivo não corresponde a um tipo suportado",
      ERROR_CODES.mediaInvalidType,
    )
  }
  return detected
}

/** Gera uma URL assinada para o caminho do objeto (ou null em caso de falha). */
export async function signMediaUrl(path: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin.storage.from(MEDIA_BUCKET).createSignedUrl(path, SIGNED_TTL)
  return data?.signedUrl ?? null
}

/**
 * Carrega a mídia com o orgId (via animal -> pesquisa) para checagem de papel. O `animalId`
 * sai junto porque o arquivo não tem pesquisa própria: a visibilidade é a do indivíduo
 * (assertAnimalVisible).
 */
export async function loadMediaOrg(id: string) {
  const media = await prisma.animalMedia.findUnique({
    where: { id },
    select: {
      id: true,
      url: true,
      uploadedById: true,
      animalId: true,
      animal: { select: { research: { select: { orgId: true } } } },
    },
  })
  if (!media) throw new NotFoundError("Arquivo não encontrado", ERROR_CODES.mediaNotFound)
  return {
    id: media.id,
    path: media.url,
    uploadedById: media.uploadedById,
    animalId: media.animalId,
    orgId: media.animal.research.orgId,
  }
}
