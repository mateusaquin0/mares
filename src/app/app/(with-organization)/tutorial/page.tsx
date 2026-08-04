import { redirect } from "next/navigation"

import { getAuthUser } from "@/lib/auth"
import { TutorialContent } from "./tutorial-content"

// Página estática de ajuda ("Como usar"): disponível a qualquer usuário autenticado.
export default async function TutorialPage() {
  const user = await getAuthUser()
  if (!user) redirect("/login")
  return <TutorialContent />
}
