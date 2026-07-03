"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { LogOut } from "lucide-react"

import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"

export function SignOutButton({ collapsed = false }: { collapsed?: boolean }) {
  const t = useTranslations("sidebar")
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleSignOut() {
    setLoading(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleSignOut}
      loading={loading}
      aria-label={t("signOut")}
      title={collapsed ? t("signOut") : undefined}
      className={cn(
        "w-full text-muted-foreground hover:bg-muted hover:text-foreground",
        collapsed ? "justify-center px-0" : "justify-start"
      )}
    >
      {!loading && <LogOut className="size-4" />}
      {!collapsed && t("signOut")}
    </Button>
  )
}
