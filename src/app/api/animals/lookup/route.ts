// MARES — Consulta prévia de identificador (ID de controle / Nº SIMBA) na organização ativa.
//
// Por que existe: os identificadores são únicos por ORGANIZAÇÃO, mas a listagem é filtrada
// por pesquisa. Sem esta consulta, a pessoa só descobre que o indivíduo já existe DEPOIS de
// preencher o formulário inteiro e receber o 409 — e, se o registro estiver fora do escopo
// dela, sem conseguir encontrá-lo. Aqui ela confere antes de digitar o resto.
//
// A resposta responde à MESMA pergunta do conflito do POST e usa o MESMO helper
// (`findAnimalByIdentifier`), para que as duas portas nunca divirjam:
//   • livre                → { found: false }
//   • existe e é visível   → nomeia a pesquisa e devolve o id (a pessoa abre o registro)
//   • existe fora do escopo → nomeia a pesquisa + identidade mínima, para ela decidir entre
//     pedir o compartilhamento e corrigir o identificador (ver ShareConflictDialog).
//
// Autorização: membro da org (RESEARCHER+). Ver docs/PERMISSOES.md §Animais.

import { NextRequest, NextResponse } from "next/server"
import { getAuthUser, getActiveOrgId, requireOrgRole } from "@/lib/auth"
import { getResearchScope } from "@/lib/research-access"
import { findAnimalByIdentifier } from "@/lib/animals"
import { rateLimit } from "@/lib/rate-limit"
import { apiError, tooManyRequests, unauthorized } from "@/lib/api"
import { ValidationError } from "@/lib/errors"
import { ERROR_CODES } from "@/lib/error-codes"

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const orgId = await getActiveOrgId(user)
    if (!orgId) return unauthorized()
    requireOrgRole(user, orgId, "RESEARCHER")

    // A rota responde "existe / não existe" para um identificador arbitrário: limitamos a
    // cadência para que não sirva de varredura do acervo do grupo.
    const limit = rateLimit(`animal-lookup:${user.id}`, { limit: 60, windowMs: 60 * 1000 })
    if (!limit.ok) return tooManyRequests(limit.retryAfter)

    const controlId = req.nextUrl.searchParams.get("controlId")?.trim()
    const simbaRecordNumber = req.nextUrl.searchParams.get("simbaRecordNumber")?.trim()
    if (!controlId && !simbaRecordNumber) {
      throw new ValidationError("Informe um identificador", ERROR_CODES.validation)
    }

    const scope = await getResearchScope(user, orgId)
    const found = await findAnimalByIdentifier(orgId, scope, { controlId, simbaRecordNumber })
    if (!found) return NextResponse.json({ found: false })

    // Fora do escopo, a identidade mínima é o que permite decidir entre pedir o indivíduo e
    // corrigir o identificador. Visível, ela é dispensável: a pessoa abre o registro.
    return NextResponse.json(
      found.visible
        ? {
            found: true,
            visible: true,
            animalId: found.animalId,
            research: found.research,
          }
        : {
            found: true,
            visible: false,
            animalId: found.animalId,
            research: found.research,
            species: found.species,
            eventDate: found.eventDate,
            location: found.location,
          },
    )
  } catch (err) {
    return apiError(err)
  }
}
