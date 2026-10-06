import { redirect } from "next/navigation"

import { getAuthUser } from "@/lib/auth"
import { MyFeedback } from "./my-feedback"

// Sugestões e bugs enviados pelo próprio usuário (acompanhar status / resposta da
// administração). Fora de (with-organization): feedback não é escopado por grupo.
export default async function MyFeedbackPage() {
  const user = await getAuthUser()
  if (!user) redirect("/login")
  return <MyFeedback />
}
