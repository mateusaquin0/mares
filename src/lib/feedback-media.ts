// MARES — Anexos de imagem dos tickets de feedback (prints de bug, mockups de sugestão).
// Bucket PRÓPRIO e privado (`feedback-media`): o controle de acesso aqui é o do ticket
// — autor + admin global —, e não o da organização que governa `animal-media`.
// Só imagem: o anexo existe para MOSTRAR a tela, e aceitar PDF/arquivos arbitrários
// transformaria o canal de feedback em um depósito de arquivos.

import { ValidationError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"
import { sniffMime } from "@/lib/media"

export const FEEDBACK_BUCKET = "feedback-media"
export const FEEDBACK_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024 // 5 MB
// Teto por ticket, contando relato + conversa: evita usar o feedback como armazenamento.
export const FEEDBACK_ATTACHMENT_MAX_PER_TICKET = 10
export const FEEDBACK_ATTACHMENT_ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"]

/** Caminho do objeto no bucket a partir do ticket + nome original do arquivo. */
export function attachmentPath(feedbackId: string, originalName: string) {
  const safe = originalName.replace(/[^\w.\-]+/g, "_").slice(-80)
  return `${feedbackId}/${crypto.randomUUID()}_${safe}`
}

/** Valida tipo (declarado) e tamanho do arquivo enviado. */
export function assertValidAttachment(file: { size: number; type: string }) {
  if (!FEEDBACK_ATTACHMENT_ALLOWED.includes(file.type)) {
    throw new ValidationError("Só imagens são aceitas", ERROR_CODES.mediaInvalidType)
  }
  if (file.size > FEEDBACK_ATTACHMENT_MAX_BYTES) {
    throw new ValidationError("Imagem muito grande", ERROR_CODES.mediaTooLarge)
  }
}

/**
 * Confere o conteúdo real (magic bytes) contra a allowlist de imagens e devolve o MIME
 * detectado, a ser usado como `contentType` do upload — o tipo declarado pelo cliente é
 * forjável, e um HTML servido como imagem seria um vetor de XSS no domínio do Storage.
 * @throws ValidationError se o conteúdo não for uma das imagens aceitas.
 */
export function assertValidAttachmentContent(buf: Buffer): string {
  const detected = sniffMime(buf)
  if (!detected || !FEEDBACK_ATTACHMENT_ALLOWED.includes(detected)) {
    throw new ValidationError(
      "O conteúdo do arquivo não é uma imagem suportada",
      ERROR_CODES.mediaInvalidType,
    )
  }
  return detected
}
