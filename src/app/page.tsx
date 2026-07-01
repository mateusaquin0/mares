import { redirect } from "next/navigation"

// A home redireciona para o app; o middleware encaminha para /login ou a tela
// "sem organização" conforme o estado de autenticação e os vínculos do usuário.
export default function Home() {
  redirect("/app/dashboard")
}
