// MARES — Anexos de imagem de um ticket de feedback (print do bug, mockup da sugestão).
// Upload em multipart pelo servidor, como a mídia de animal: o arquivo vai para um bucket
// PRIVADO e o banco guarda o caminho do objeto. `messageId` vazio = imagem do relato
// original; preenchido = imagem de uma mensagem da conversa. Ver docs/FEEDBACK.md.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAuthUser } from "@/lib/auth"
import { apiError, assertSameOrigin, tooManyRequests, unauthorized } from "@/lib/api"
import { rateLimit } from "@/lib/rate-limit"
import { ValidationError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"
import { ensureBucket } from "@/lib/media"
import {
  FEEDBACK_ATTACHMENT_MAX_BYTES,
  FEEDBACK_BUCKET,
  assertValidAttachment,
  assertValidAttachmentContent,
  attachmentPath,
} from "@/lib/feedback-media"
import { addAttachment, loadThreadAccess } from "@/lib/feedback"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Upload multipart não passa por preflight CORS → checagem anti-CSRF por origem.
    assertSameOrigin(req)

    const user = await getAuthUser()
    if (!user) return unauthorized()

    const limit = rateLimit(`feedback-upload:${user.id}`, { limit: 30, windowMs: 60 * 60 * 1000 })
    if (!limit.ok) return tooManyRequests(limit.retryAfter)

    const { id } = await params
    const access = await loadThreadAccess(id, user)

    const formData = await req.formData()
    const file = formData.get("file")
    if (!(file instanceof File)) {
      throw new ValidationError("Arquivo ausente", ERROR_CODES.mediaInvalidType)
    }
    assertValidAttachment({ size: file.size, type: file.type })

    // Mensagem informada tem de ser deste MESMO ticket — senão a imagem apareceria na
    // conversa de outro feedback.
    const rawMessageId = (formData.get("messageId") as string | null)?.trim() || null
    if (rawMessageId) {
      const owns = await prisma.feedbackMessage.findFirst({
        where: { id: rawMessageId, feedbackId: id },
        select: { id: true },
      })
      if (!owns) throw new ValidationError("Mensagem inválida", ERROR_CODES.feedbackNotFound)
    }

    await ensureBucket(FEEDBACK_BUCKET, FEEDBACK_ATTACHMENT_MAX_BYTES)
    const path = attachmentPath(id, file.name)
    const buffer = Buffer.from(await file.arrayBuffer())

    // Valida o conteúdo real pelos magic bytes e usa o tipo DETECTADO (não o do cliente).
    const contentType = assertValidAttachmentContent(buffer)

    const admin = createAdminClient()
    const { error } = await admin.storage
      .from(FEEDBACK_BUCKET)
      .upload(path, buffer, { contentType, upsert: false })
    if (error) throw new ValidationError("Falha no upload", ERROR_CODES.mediaUploadFailed)

    const created = await addAttachment({
      feedbackId: id,
      messageId: rawMessageId,
      actor: user,
      party: access.party,
      path,
      mimeType: contentType,
      filename: file.name,
      size: file.size,
    }).catch(async (err) => {
      // Ticket encerrado ou teto de imagens atingido entre o upload e o registro: o objeto
      // ficaria órfão no bucket, sem nenhuma linha apontando para ele.
      await admin.storage.from(FEEDBACK_BUCKET).remove([path])
      throw err
    })

    return NextResponse.json(created, { status: 201 })
  } catch (err) {
    return apiError(err)
  }
}
