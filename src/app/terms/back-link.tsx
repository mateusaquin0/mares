"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"

// Os termos abrem em aba nova a partir do aceite no cadastro: sem histórico, volta para o início.
export function BackLink({ label }: { label: string }) {
  const router = useRouter()
  return (
    <Link
      href="/"
      onClick={(e) => {
        if (window.history.length > 1) {
          e.preventDefault()
          router.back()
        }
      }}
      className="inline-flex min-h-11 items-center gap-1 text-sm underline underline-offset-2 hover:text-primary"
    >
      <ArrowLeft className="size-4" />
      {label}
    </Link>
  )
}
