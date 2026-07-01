// MARES — Helpers de mídia de animais (Fase 3), sobre o Supabase Storage.
// Bucket privado; guardamos o caminho do objeto em AnimalMedia.url e geramos URLs
// assinadas na leitura (arquivos não ficam públicos). Ver docs/PERMISSOES.md §Mídia.

import { createAdminClient } from "@/lib/supabase/admin"
import { prisma } from "@/lib/prisma"
import { NotFoundError, ValidationError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

export const MEDIA_BUCKET = "animal-media"
export const MEDIA_MAX_BYTES = 10 * 1024 * 1024 // 10 MB
export const MEDIA_ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]
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

/** Valida tipo/tamanho do arquivo enviado. */
export function assertValidFile(file: { size: number; type: string }) {
  if (!MEDIA_ALLOWED.includes(file.type)) {
    throw new ValidationError("Tipo de arquivo não suportado", ERROR_CODES.mediaInvalidType)
  }
  if (file.size > MEDIA_MAX_BYTES) {
    throw new ValidationError("Arquivo muito grande", ERROR_CODES.mediaTooLarge)
  }
}

/** Gera uma URL assinada para o caminho do objeto (ou null em caso de falha). */
export async function signMediaUrl(path: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin.storage.from(MEDIA_BUCKET).createSignedUrl(path, SIGNED_TTL)
  return data?.signedUrl ?? null
}

/** Carrega a mídia com o orgId (via animal -> pesquisa) para checagem de papel. */
export async function loadMediaOrg(id: string) {
  const media = await prisma.animalMedia.findUnique({
    where: { id },
    select: {
      id: true,
      url: true,
      animal: { select: { research: { select: { orgId: true } } } },
    },
  })
  if (!media) throw new NotFoundError("Arquivo não encontrado", ERROR_CODES.mediaNotFound)
  return { id: media.id, path: media.url, orgId: media.animal.research.orgId }
}
