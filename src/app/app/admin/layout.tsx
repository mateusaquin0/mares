import { redirect } from "next/navigation"

import { getAuthUser } from "@/lib/auth"

// Guarda da área de administração global (/app/admin/*).
//
// Por que existe: até então o único bloqueio destas telas estava no middleware, ou seja,
// a autorização morava na borda — o padrão que a CVE-2025-29927 do Next.js explorou, em
// que um header forjado pulava o middleware inteiro. Aqui a checagem acontece no render,
// junto dos dados. As rotas /api/admin/* já validavam por conta própria (requireSystemAdmin),
// então o que estava exposto era a casca das páginas, não os dados.
//
// Custo: nenhuma consulta extra. getAuthUser é memoizado por requisição (React.cache), e o
// layout pai (src/app/app/layout.tsx) já a executou — aqui a resposta vem do cache.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser()
  if (!user) redirect("/login")
  if (!user.isSystemAdmin) redirect("/app/dashboard")

  return <>{children}</>
}
