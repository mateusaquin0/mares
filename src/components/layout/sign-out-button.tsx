"use client"

import { useTranslations } from "next-intl"
import { LogOut } from "lucide-react"

import { useSignOut } from "@/hooks/use-sign-out"
import { Button } from "@/components/ui/button"

export function SignOutButton() {
  const t = useTranslations("sidebar")
  const { signOut, loading } = useSignOut()

  return (
    <Button variant="outline" onClick={signOut} loading={loading}>
      {!loading && <LogOut className="size-4" />}
      {t("signOut")}
    </Button>
  )
}
