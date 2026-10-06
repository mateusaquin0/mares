"use client"

import { useTranslations } from "next-intl"
import { LogOut } from "lucide-react"

import { cn } from "@/lib/utils"
import { useSignOut } from "@/hooks/use-sign-out"
import { Button } from "@/components/ui/button"

export function SignOutButton({ collapsed = false }: { collapsed?: boolean }) {
  const t = useTranslations("sidebar")
  const { signOut, loading } = useSignOut()

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={signOut}
      loading={loading}
      aria-label={t("signOut")}
      title={collapsed ? t("signOut") : undefined}
      className={cn(
        "w-full text-muted-foreground hover:bg-muted hover:text-foreground",
        collapsed ? "justify-center px-0" : "justify-start",
      )}
    >
      {!loading && <LogOut className="size-4" />}
      {!collapsed && t("signOut")}
    </Button>
  )
}
