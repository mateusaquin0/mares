"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { LogOut } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"

export function SignOutButton() {
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
      className="w-full justify-start text-slate-300 hover:bg-slate-800 hover:text-white"
    >
      {!loading && <LogOut className="size-4" />}
      {t("signOut")}
    </Button>
  )
}
