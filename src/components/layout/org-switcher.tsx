"use client"

import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import type { AuthMembership } from "@/lib/auth"
import { useSetActiveOrg } from "@/hooks/use-members"

// Nome do grupo ativo no topo. Com mais de um vínculo vira o seletor de troca; com um só
// (ou sem grupo, no caso do admin da aplicação) é só texto.
export function OrgSwitcher({
  activeOrg,
  memberships,
  fallbackLabel,
  className,
}: {
  activeOrg: AuthMembership | null
  memberships: AuthMembership[]
  fallbackLabel: string
  className?: string
}) {
  const t = useTranslations("sidebar")
  const router = useRouter()
  const setActiveM = useSetActiveOrg()

  const label = activeOrg?.orgName ?? fallbackLabel

  if (!activeOrg || memberships.length < 2) {
    return (
      <span title={label} className={cn("min-w-0 self-center truncate font-semibold", className)}>
        {label}
      </span>
    )
  }

  async function onSwitch(orgId: string) {
    if (orgId === activeOrg?.orgId) return
    try {
      await setActiveM.mutateAsync(orgId)
    } catch {
      // silencioso: a UI recarrega e reflete o estado atual
    }
    router.refresh()
  }

  const roleOf = (m: AuthMembership) =>
    m.role === "ORG_ADMIN" ? t("roleOwner") : t("roleResearcher")

  return (
    <SelectPrimitive.Root value={activeOrg.orgId} onValueChange={onSwitch}>
      <SelectPrimitive.Trigger
        title={label}
        aria-label={t("switchOrg")}
        className={cn(
          "flex min-w-0 items-center gap-1.5 self-stretch font-semibold outline-none focus-visible:bg-accent",
          className,
        )}
      >
        <span className="min-w-0 truncate">
          <SelectPrimitive.Value />
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={0}
          className="z-50 w-[340px] border border-foreground bg-popover py-1 text-sm text-popover-foreground shadow-menu"
        >
          <p className="px-3.5 pb-0.5 pt-1.5 text-xs font-bold uppercase tracking-[.05em] text-muted-foreground">
            {t("switchOrg")}
          </p>
          <SelectPrimitive.Viewport>
            {memberships.map((m) => (
              <SelectPrimitive.Item
                key={m.orgId}
                value={m.orgId}
                className="flex cursor-pointer select-none items-start gap-2 px-3.5 py-1.5 outline-none data-[highlighted]:bg-accent data-[state=checked]:bg-accent"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">
                    <SelectPrimitive.ItemText>{m.orgName}</SelectPrimitive.ItemText>
                  </span>
                  <span className="block text-[13px] text-muted-foreground">{roleOf(m)}</span>
                </span>
                <SelectPrimitive.ItemIndicator className="mt-0.5">
                  <Check className="size-4" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
