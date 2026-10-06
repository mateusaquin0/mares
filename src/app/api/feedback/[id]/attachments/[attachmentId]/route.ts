// MARES — Excluir uma imagem de um ticket de feedback.
// Quem enviou remove a própria imagem enquanto o ticket está aberto; o admin global remove
// qualquer uma a qualquer momento (moderação — o upload é aberto a qualquer autenticado).
// A regra mora em `deleteAttachment`; aqui só resta apagar o objeto no Storage.

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAuthUser } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { FEEDBACK_BUCKET } from "@/lib/feedback-media"
import { deleteAttachment, loadThreadAccess } from "@/lib/feedback"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()

    const { id, attachmentId } = await params
    // Quem não participa do ticket recebe "não encontrado" antes de qualquer outra coisa.
    await loadThreadAccess(id, user)

    const { path } = await deleteAttachment(id, attachmentId, user)
    // O registro já saiu do banco; falha ao remover o objeto deixa lixo no bucket, não uma
    // imagem visível — por isso não derruba a resposta.
    await createAdminClient().storage.from(FEEDBACK_BUCKET).remove([path])

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return apiError(err)
  }
}
