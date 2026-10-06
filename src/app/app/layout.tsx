import { redirect } from "next/navigation"

import { getAuthUser, getActiveOrgId } from "@/lib/auth"
import { Sidebar } from "@/components/layout/sidebar"
import { MinWidthGate } from "@/components/layout/min-width-gate"

// Casca da área logada: exige sessão e monta a barra lateral.
//
// A exigência de VÍNCULO com um grupo não mora aqui, e sim em (with-organization)/layout.tsx,
// que cobre só as telas que de fato precisam dele. O perfil e a tela de "sem organização"
// ficam fora daquele grupo justamente para continuarem alcançáveis por quem perdeu o vínculo
// (para editar os dados ou excluir a conta).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser()
  if (!user) redirect("/login")

  const activeOrgId = await getActiveOrgId(user)
  const activeOrg = user.memberships.find((m) => m.orgId === activeOrgId) ?? null

  // Sem organização e sem privilégio global: as únicas telas alcançáveis são as de fora do
  // grupo, e elas renderizam sem a barra lateral (que não teria o que mostrar).
  if (!activeOrg && !user.isSystemAdmin) {
    return (
      <MinWidthGate>
        <main className="min-h-screen bg-background">{children}</main>
      </MinWidthGate>
    )
  }

  return (
    <MinWidthGate>
      <div className="flex h-screen overflow-hidden">
        <Sidebar
          userName={user.name ?? user.email}
          email={user.email}
          isSystemAdmin={user.isSystemAdmin}
          activeOrg={activeOrg}
          memberships={user.memberships}
        />
        {/* `min-w-0`: item flex em eixo horizontal tem `min-width: auto` e se recusa a
            encolher abaixo da largura MÍNIMA do conteúdo. Sem isto, qualquer tela com
            conteúdo largo (uma tabela com min-width, por exemplo) empurra a casca inteira e
            gera rolagem na página, em vez de rolar dentro da própria tabela. */}
        {/* `overscroll-contain`: a casca é fixa (h-screen + overflow-hidden), então nenhuma
            rolagem interna deve ser repassada ao documento. Sem isto, ao chegar ao fim de
            qualquer lista o movimento vaza para a página e arrasta a barra lateral junto. */}
        <main className="min-w-0 flex-1 overflow-y-auto overscroll-contain bg-background">
          {children}
        </main>
      </div>
    </MinWidthGate>
  )
}
