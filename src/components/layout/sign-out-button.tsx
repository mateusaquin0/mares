"use client"

import { useTranslations } from "next-intl"
import { LogOut } from "lucide-react"

import { useSignOut } from "@/hooks/use-sign-out"
import { Button } from "@/components/ui/button"

export function SignOutButton() {
  const t = useTranslations("sidebar")
  const { signOut, loading } = useSignOut()

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={signOut}
      loading={loading}
      className="w-full justify-start text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {!loading && <LogOut className="size-4" />}
      {t("signOut")}
    </Button>
  )
}
