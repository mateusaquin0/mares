"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import {
  LayoutDashboard,
  Map,
  FlaskConical,
  Fish,
  Users,
  Building2,
  ShieldCheck,
} from "lucide-react"

import { cn } from "@/lib/utils"
import type { AuthMembership } from "@/lib/auth"
import { Logo } from "@/components/logo"
import { LocaleSwitcher } from "@/components/locale-switcher"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SignOutButton } from "./sign-out-button"

type NavItem = {
  href: string
  label: string
  icon: typeof LayoutDashboard
  disabled?: boolean
}

export function Sidebar({
  userName,
  isSystemAdmin,
  activeOrg,
  memberships,
}: {
  userName: string
  isSystemAdmin: boolean
  activeOrg: AuthMembership | null
  memberships: AuthMembership[]
}) {
  const pathname = usePathname()
  const router = useRouter()
  const t = useTranslations("sidebar")

  const navItems: NavItem[] = [
    { href: "/app/dashboard", label: t("dashboard"), icon: LayoutDashboard },
    { href: "/app/map", label: t("map"), icon: Map, disabled: true },
    { href: "/app/research", label: t("research"), icon: FlaskConical, disabled: true },
    { href: "/app/animals", label: t("animals"), icon: Fish, disabled: true },
  ]
  if (activeOrg?.role === "ORG_ADMIN") {
    navItems.push({ href: "/app/members", label: t("members"), icon: Users })
  }
  if (activeOrg) {
    navItems.push({ href: "/app/organizations", label: t("myOrgs"), icon: Building2 })
  }

  const roleLabel = isSystemAdmin
    ? t("roleAdmin")
    : activeOrg?.role === "ORG_ADMIN"
      ? t("roleOwner")
      : activeOrg?.role === "RESEARCHER"
        ? t("roleResearcher")
        : ""

  async function onSwitchOrg(orgId: string) {
    if (orgId === activeOrg?.orgId) return
    await fetch("/api/active-org", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId }),
    })
    router.refresh()
  }

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col bg-slate-900 text-slate-300">
      <div className="flex flex-col gap-1 px-6 py-5">
        <Link
          href="/"
          className="flex items-center gap-2 text-xl font-bold tracking-tight text-white transition-opacity hover:opacity-80"
        >
          <Logo className="size-6 text-sky-400" />
          MARES
        </Link>
        {memberships.length > 1 ? (
          <Select value={activeOrg?.orgId ?? ""} onValueChange={onSwitchOrg}>
            <SelectTrigger className="mt-1 h-7 border-slate-700 bg-slate-800 px-2 text-xs text-slate-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {memberships.map((m) => (
                <SelectItem key={m.orgId} value={m.orgId}>
                  {m.orgName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="truncate text-xs text-slate-400" title={activeOrg?.orgName}>
            {activeOrg?.orgName ?? (isSystemAdmin ? t("globalAdminOrg") : "")}
          </span>
        )}
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {activeOrg &&
          navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/")
            const Icon = item.icon

            if (item.disabled) {
              return (
                <span
                  key={item.href}
                  className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-600"
                  title={t("comingSoon")}
                >
                  <Icon className="size-4" />
                  {item.label}
                </span>
              )
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active ? "bg-sky-600 text-white" : "hover:bg-slate-800 hover:text-white"
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            )
          })}

        {isSystemAdmin && (
          <>
            <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("adminSection")}
            </p>
            {[
              { href: "/app/admin/access-requests", label: t("adminRequests") },
              { href: "/app/admin/organizations", label: t("adminOrgs") },
              { href: "/app/admin/users", label: t("adminUsers") },
            ].map((item) => {
              const active = pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    active ? "bg-sky-600 text-white" : "hover:bg-slate-800 hover:text-white"
                  )}
                >
                  <ShieldCheck className="size-4" />
                  {item.label}
                </Link>
              )
            })}
          </>
        )}
      </nav>

      <div className="border-t border-slate-800 px-3 py-3">
        <div className="px-3 py-2">
          <p className="truncate text-sm font-medium text-white">{userName}</p>
          <p className="text-xs text-slate-400">{roleLabel}</p>
        </div>
        <div className="mb-1 px-2">
          <LocaleSwitcher className="text-slate-400" />
        </div>
        <SignOutButton />
      </div>
    </aside>
  )
}
