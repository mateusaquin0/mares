"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { RefreshCw } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

// Botão de "atualizar" para o cabeçalho da coluna de ações das tabelas.
// Por padrão invalida TODAS as queries do react-query e refaz os server components
// (router.refresh) — cobre dados que não atualizam sozinhos. Passe `onReload` para um
// refetch direcionado (ex.: só a query daquela tabela).
export function ReloadButton({
  onReload,
  className,
}: {
  onReload?: () => void | Promise<void>
  className?: string
}) {
  const qc = useQueryClient()
  const router = useRouter()
  const t = useTranslations("common")
  const [busy, setBusy] = useState(false)

  async function reload() {
    setBusy(true)
    try {
      if (onReload) await onReload()
      else await qc.invalidateQueries()
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("size-8", className)}
      onClick={reload}
      loading={busy}
      title={t("reload")}
      aria-label={t("reload")}
    >
      {!busy && <RefreshCw className="size-4" />}
    </Button>
  )
}
