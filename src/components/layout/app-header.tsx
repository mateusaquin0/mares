"use client"

import { Fragment, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import type { AuthMembership } from "@/lib/auth"
import { usePendingCounts } from "@/hooks/use-pending-counts"
import { Logo } from "@/components/logo"
import { FeedbackDialog } from "@/components/feedback-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { OrgSwitcher } from "./org-switcher"
import { UserMenu } from "./user-menu"

type NavItem = { href: string; label: string; count: number }

// Quantos itens cabem na faixa compacta (1024–1279px); o resto vai para "Mais".
const COMPACT_VISIBLE = 5

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/")
}

function PendingCount({ count }: { count: number }) {
  const t = useTranslations("sidebar")
  if (count <= 0) return null
  const label = t("pending", { count })
  return (
    <b
      role="status"
      aria-label={label}
      title={label}
      className="text-xs font-bold tabular-nums text-warning"
    >
      {count}
    </b>
  )
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex shrink-0 items-center gap-1.5 outline-none transition-colors focus-visible:bg-accent",
        active
          ? "font-semibold text-foreground shadow-[inset_0_-3px_0_hsl(var(--primary))]"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {item.label}
      <PendingCount count={item.count} />
    </Link>
  )
}

function Divider({ className }: { className?: string }) {
  return <span aria-hidden className={cn("w-px shrink-0 self-center bg-border", className)} />
}

function Brand({ compact }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      title="MARES"
      className="flex shrink-0 items-center gap-2 transition-opacity hover:opacity-80"
    >
      <Logo className={compact ? "size-[22px]" : "size-6"} />
      <span
        className={cn(
          "font-serif font-semibold tracking-[.04em]",
          compact ? "text-xl" : "text-[22px] leading-7",
        )}
      >
        MARES
      </span>
    </Link>
  )
}

// Navegação no topo. Em 1280px ou mais: faixa da marca (48px) + faixa de itens (40px). Entre
// 1024 e 1279: uma faixa só (44px), com os primeiros itens e o resto em "Mais". As duas
// versões ficam no HTML e o corte é por CSS, para não haver diferença de hidratação.
export function AppHeader({
  userName,
  email,
  isSystemAdmin,
  activeOrg,
  memberships,
}: {
  userName: string
  email: string
  isSystemAdmin: boolean
  activeOrg: AuthMembership | null
  memberships: AuthMembership[]
}) {
  const pathname = usePathname()
  const t = useTranslations("sidebar")
  const tf = useTranslations("feedback")
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  // O endpoint já zera o que o usuário não pode tratar: pesquisador nunca vê contagem no
  // Glossário.
  const { data: pending } = usePendingCounts()

  // Admin da aplicação não participa de grupos: ou há grupo ativo, ou é a administração.
  const main: NavItem[] = activeOrg
    ? [
        { href: "/app/dashboard", label: t("dashboard"), count: 0 },
        { href: "/app/research", label: t("research"), count: pending?.researchAccess ?? 0 },
        { href: "/app/results", label: t("results"), count: 0 },
        { href: "/app/map", label: t("map"), count: 0 },
        { href: "/app/animals", label: t("animals"), count: pending?.animalShares ?? 0 },
        { href: "/app/members", label: t("members"), count: 0 },
        { href: "/app/catalogs", label: t("catalogs"), count: pending?.glossaryRequests ?? 0 },
        { href: "/app/organizations", label: t("myOrgs"), count: 0 },
      ]
    : isSystemAdmin
      ? [
          {
            href: "/app/admin/access-requests",
            label: t("adminRequests"),
            count: pending?.accessRequests ?? 0,
          },
          { href: "/app/admin/organizations", label: t("adminOrgs"), count: 0 },
          { href: "/app/admin/users", label: t("adminUsers"), count: 0 },
          { href: "/app/admin/feedback", label: t("adminFeedback"), count: pending?.feedback ?? 0 },
          { href: "/app/catalogs", label: t("catalogs"), count: pending?.glossaryRequests ?? 0 },
        ]
      : []

  const tutorial: NavItem = { href: "/app/tutorial", label: t("tutorial"), count: 0 }
  const myFeedback: NavItem = {
    href: "/app/feedback",
    label: t("myFeedback"),
    count: pending?.feedbackReplies ?? 0,
  }

  const roleLabel = isSystemAdmin
    ? t("roleAdmin")
    : activeOrg?.role === "ORG_ADMIN"
      ? t("roleOwner")
      : activeOrg?.role === "RESEARCHER"
        ? t("roleResearcher")
        : ""

  const orgSwitcher = (maxWidth: string) => (
    <OrgSwitcher
      activeOrg={activeOrg}
      memberships={memberships}
      fallbackLabel={isSystemAdmin ? t("globalAdminOrg") : ""}
      className={maxWidth}
    />
  )

  const userMenu = (short: boolean) => (
    <UserMenu userName={userName} email={email} roleLabel={roleLabel} short={short} />
  )

  // Faixa compacta: o que não cabe vai para "Mais", que mostra o item ativo no rótulo.
  const visible = main.slice(0, COMPACT_VISIBLE)
  const overflow = [...main.slice(COMPACT_VISIBLE), tutorial, myFeedback]
  const activeInMore = overflow.find((i) => isActive(pathname, i.href))
  const moreCount = activeInMore ? 0 : overflow.reduce((sum, i) => sum + i.count, 0)

  return (
    <header className="relative z-30 flex-none whitespace-nowrap border-b border-foreground bg-background text-sm">
      {/* 1280px ou mais */}
      <div className="hidden xl:block">
        <div className="flex h-12 items-center gap-4 border-b border-border px-8">
          <Brand />
          <Divider className="h-5" />
          {orgSwitcher("max-w-[420px]")}
          <span className="flex-1" />
          <div className="flex items-center gap-5">
            <NavLink item={tutorial} active={isActive(pathname, tutorial.href)} />
            <button
              type="button"
              onClick={() => setFeedbackOpen(true)}
              className="text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:bg-accent"
            >
              {tf("trigger")}
            </button>
            <NavLink item={myFeedback} active={isActive(pathname, myFeedback.href)} />
          </div>
          <Divider className="h-5" />
          {userMenu(false)}
        </div>
        <nav aria-label={t("navLabel")} className="flex h-10 items-stretch gap-7 px-8 text-[15px]">
          {main.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
          ))}
        </nav>
      </div>

      {/* 1024–1279px */}
      <div className="flex h-11 items-stretch gap-4 px-6 text-[15px] xl:hidden">
        <span className="flex items-center">
          <Brand compact />
        </span>
        <nav aria-label={t("navLabel")} className="ml-2 flex shrink-0 items-stretch gap-[18px]">
          {visible.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger
              title={overflow.map((i) => i.label).join(", ")}
              className={cn(
                "flex shrink-0 items-center gap-1 outline-none transition-colors focus-visible:bg-accent",
                activeInMore
                  ? "font-semibold text-foreground shadow-[inset_0_-3px_0_hsl(var(--primary))]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="min-w-0 truncate">
                {activeInMore ? `${t("more")}: ${activeInMore.label}` : t("more")}
              </span>
              <PendingCount count={moreCount} />
              <ChevronDown className="size-4 shrink-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={0} className="w-[260px] text-[15px]">
              {overflow.map((item) => (
                <Fragment key={item.href}>
                  {item === myFeedback && (
                    <DropdownMenuItem onSelect={() => setFeedbackOpen(true)}>
                      {tf("trigger")}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    asChild
                    className={cn(isActive(pathname, item.href) && "bg-accent font-semibold")}
                  >
                    <Link href={item.href}>
                      <span className="flex-1">{item.label}</span>
                      <PendingCount count={item.count} />
                    </Link>
                  </DropdownMenuItem>
                </Fragment>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
        <span className="flex-1" />
        {/* Sem grupo ativo (admin da aplicação) o rótulo é fixo e não cabe na faixa compacta. */}
        {activeOrg && (
          <>
            {orgSwitcher("max-w-[200px]")}
            <Divider className="my-3 self-stretch" />
          </>
        )}
        {userMenu(true)}
      </div>

      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </header>
  )
}
