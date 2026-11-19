import { AuthShell } from "@/components/auth-shell"

export default function AuthFlowLayout({ children }: { children: React.ReactNode }) {
  return <AuthShell>{children}</AuthShell>
}
