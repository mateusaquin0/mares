// MARES — Remoção do registro local de um usuário (LGPD, art. 18, VI).
//
// Excluir a conta elimina os dados pessoais e MANTÉM os registros científicos e operacionais,
// desvinculados da identidade: as FKs de autoria viram nulas (onDelete: SetNull) e o AuditLog
// guarda só o id. Sobram os "snapshots" de e-mail e nome gravados em texto nos tickets, nas
// solicitações de glossário e na solicitação de acesso — é o que esta função anonimiza, na
// mesma transação da exclusão.

import { prisma } from "@/lib/prisma"

// Domínio .invalid (RFC 2606): tem forma de e-mail, mas nunca pertence a alguém.
export const ANONYMIZED_EMAIL = "anonimizado@conta-excluida.invalid"
export const ANONYMIZED_NAME = "Conta excluída"

/**
 * Anonimiza os rastros textuais do usuário e remove o registro (os vínculos caem em cascata).
 * Casa também pelo e-mail: cobre linhas cuja autoria já ficou nula e a solicitação de acesso,
 * que não referencia o usuário por id.
 */
export async function deleteUserRecord(user: { id: string; email: string }): Promise<void> {
  const sameEmail = { equals: user.email, mode: "insensitive" as const }
  await prisma.$transaction([
    prisma.feedback.updateMany({
      where: { OR: [{ createdById: user.id }, { createdByEmail: sameEmail }] },
      data: { createdByEmail: ANONYMIZED_EMAIL },
    }),
    prisma.feedbackMessage.updateMany({
      where: { OR: [{ createdById: user.id }, { createdByEmail: sameEmail }] },
      data: { createdByEmail: ANONYMIZED_EMAIL },
    }),
    prisma.catalogRequest.updateMany({
      where: { OR: [{ requestedById: user.id }, { requestedByEmail: sameEmail }] },
      data: { requestedByEmail: ANONYMIZED_EMAIL },
    }),
    prisma.joinRequest.updateMany({
      where: { email: sameEmail },
      data: { email: ANONYMIZED_EMAIL, requesterName: ANONYMIZED_NAME },
    }),
    prisma.user.deleteMany({ where: { id: user.id } }),
  ])
}
