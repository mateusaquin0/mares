"use client"

import { useEffect, useState } from "react"
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
  Library,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react"

import { cn } from "@/lib/utils"
import type { AuthMembership } from "@/lib/auth"
import { useSetActiveOrg } from "@/hooks/use-members"
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
  const setActiveM = useSetActiveOrg()
  const t = useTranslations("sidebar")

  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    setCollapsed(localStorage.getItem("mares:sidebar-collapsed") === "1")
  }, [])
  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c
      localStorage.setItem("mares:sidebar-collapsed", next ? "1" : "0")
      return next
    })
  }

  const navItems: NavItem[] = [
    { href: "/app/dashboard", label: t("dashboard"), icon: LayoutDashboard },
    { href: "/app/research", label: t("research"), icon: FlaskConical },
    { href: "/app/map", label: t("map"), icon: Map },
    { href: "/app/animals", label: t("animals"), icon: Fish },
  ]
  if (activeOrg?.role === "ORG_ADMIN") {
    navItems.push({ href: "/app/members", label: t("members"), icon: Users })
    navItems.push({ href: "/app/catalogs", label: t("catalogs"), icon: Library })
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
    try {
      await setActiveM.mutateAsync(orgId)
    } catch {
      // silencioso: a UI recarrega e reflete o estado atual
    }
    router.refresh()
  }

  const initials = (userName || "?")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()

  const linkClass = (active: boolean) =>
    cn(
      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
      collapsed && "justify-center px-0",
      active
        ? "bg-accent font-semibold text-accent-foreground"
        : "text-foreground/70 hover:bg-muted hover:text-foreground"
    )

  return (
    <aside
      className={cn(
        "flex h-screen shrink-0 flex-col border-r border-border transition-[width,background-color] duration-300 ease-in-out",
        collapsed ? "w-16 bg-secondary" : "w-64 bg-card"
      )}
    >
      <div className={cn("flex flex-col gap-3 py-5", collapsed ? "items-center px-2" : "px-5")}>
        <div className={cn("flex w-full items-center", collapsed && "justify-center")}>
          <Link
            href="/"
            className={cn(
              "flex items-center gap-3 transition-opacity hover:opacity-80",
              !collapsed && "min-w-0 flex-1"
            )}
            title="MARES"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
              <Logo className="size-6 shrink-0" />
            </span>
            {!collapsed && (
              <span className="flex min-w-0 flex-1 flex-col overflow-hidden leading-tight">
                <span className="truncate text-lg font-bold tracking-tight text-primary">MARES</span>
              </span>
            )}
          </Link>
          {!collapsed && (
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={t("collapse")}
              title={t("collapse")}
              className="ml-auto flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <PanelLeftClose className="size-4" />
            </button>
          )}
        </div>

        {collapsed && (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={t("expand")}
            title={t("expand")}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <PanelLeft className="size-4" />
          </button>
        )}

        {!collapsed &&
          (memberships.length > 1 ? (
            <Select value={activeOrg?.orgId ?? ""} onValueChange={onSwitchOrg}>
              <SelectTrigger className="h-8 px-2 text-xs">
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
            <span className="truncate text-xs text-muted-foreground" title={activeOrg?.orgName}>
              {activeOrg?.orgName ?? (isSystemAdmin ? t("globalAdminOrg") : "")}
            </span>
          ))}
      </div>

      <nav className={cn("flex-1 space-y-1 overflow-y-auto py-2", collapsed ? "px-2" : "px-3")}>
        {activeOrg &&
          navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/")
            const Icon = item.icon

            if (item.disabled) {
              return (
                <span
                  key={item.href}
                  className={cn(
                    "flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground/50",
                    collapsed && "justify-center px-0"
                  )}
                  title={collapsed ? `${item.label} — ${t("comingSoon")}` : t("comingSoon")}
                >
                  <Icon className="size-4 shrink-0" />
                  {!collapsed && item.label}
                </span>
              )
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={linkClass(active)}
                title={collapsed ? item.label : undefined}
              >
                <Icon className="size-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            )
          })}

        {isSystemAdmin && (
          <>
            {collapsed ? (
              <div className="my-2 border-t border-border" />
            ) : (
              <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("adminSection")}
              </p>
            )}
            {[
              { href: "/app/admin/access-requests", label: t("adminRequests") },
              { href: "/app/admin/organizations", label: t("adminOrgs") },
              { href: "/app/admin/users", label: t("adminUsers") },
              { href: "/app/catalogs", label: t("catalogs") },
            ].map((item) => {
              const active = pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={linkClass(active)}
                  title={collapsed ? item.label : undefined}
                >
                  <ShieldCheck className="size-4 shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              )
            })}
          </>
        )}
      </nav>

      <div className={cn("border-t border-border py-3", collapsed ? "px-2" : "px-3")}>
        <Link
          href="/app/profile"
          className={cn(
            "flex items-center gap-3 rounded-lg py-2 transition-colors hover:bg-muted",
            collapsed ? "justify-center" : "px-2",
            pathname.startsWith("/app/profile") && "bg-accent"
          )}
          title={collapsed ? `${userName} — ${t("profile")}` : t("profile")}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initials}
          </span>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{userName}</p>
              <p className="truncate text-xs text-muted-foreground">{roleLabel}</p>
            </div>
          )}
        </Link>
        {!collapsed && (
          <div className="mb-1 px-2">
            <LocaleSwitcher className="text-muted-foreground" />
          </div>
        )}
        <SignOutButton collapsed={collapsed} />
      </div>
    </aside>
  )
}
