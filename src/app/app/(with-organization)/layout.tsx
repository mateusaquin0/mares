import { redirect } from "next/navigation"

import { getAuthUser } from "@/lib/auth"
import { organizationAreaRedirect } from "@/lib/access-guards"

// Telas que exigem vínculo com um grupo de pesquisa (Membership).
//
// A regra vale para exatamente o que está DENTRO desta pasta — é o próprio local do
// arquivo que a aplica. As exceções (perfil e a tela de aviso) ficam fora daqui e por
// isso nunca passam por esta checagem; não existe lista de exceções para manter.
//
// O grupo de rotas `(with-organization)` não aparece na URL: /app/dashboard continua
// sendo /app/dashboard.
//
// A decisão em si vive em src/lib/access-guards.ts, compartilhada com o guard do dashboard.
//
// Custo: nenhuma consulta extra. getAuthUser é memoizado por requisição (React.cache) e
// o layout pai (src/app/app/layout.tsx) já a executou — aqui a resposta vem do cache.
export default async function WithOrganizationLayout({ children }: { children: React.ReactNode }) {
  const to = organizationAreaRedirect(await getAuthUser())
  if (to) redirect(to)

  return <>{children}</>
}
