import Link from "next/link"
import { getTranslations } from "next-intl/server"

import { Logo } from "@/components/logo"
import { LocaleSwitcher } from "@/components/locale-switcher"

// Moldura das telas de acesso (login, solicitar acesso, senhas): painel da marca na cor de
// ação à esquerda e o formulário à direita. Abaixo de 760px o painel sai e fica só o
// logotipo no topo, para o formulário aparecer sem rolagem.
export async function AuthShell({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("authPanel")

  return (
    <div className="flex min-h-screen bg-background text-base text-foreground">
      <aside className="hidden max-w-[520px] flex-[1_1_380px] flex-col bg-primary px-10 py-8 text-primary-foreground min-[760px]:flex">
        <Link href="/" className="flex items-center gap-2">
          <Logo className="size-[26px]" />
          <span className="font-serif text-2xl font-semibold tracking-[0.04em]">MARES</span>
        </Link>
        <span className="flex-1" />
        <h1 className="text-balance font-serif text-[32px] font-medium leading-[38px]">
          {t("brandTitle")}
        </h1>
        <p className="mt-3 text-pretty">{t("brandDesc")}</p>
        <span className="flex-1" />
        <p className="text-sm">{t("brandFooter")}</p>
      </aside>

      <main className="flex min-w-0 flex-[1_1_340px] flex-col">
        <div className="flex min-h-11 items-center gap-2 px-4 py-2">
          <Link href="/" className="flex items-center gap-2 min-[760px]:hidden">
            <Logo className="size-6" />
            <span className="font-serif text-[22px] font-semibold tracking-[0.04em]">MARES</span>
          </Link>
          <span className="flex-1" />
          <LocaleSwitcher />
        </div>
        {/* Os campos e botões das telas de acesso têm 44 a 48px: alvo de toque no celular. */}
        <div className="flex flex-1 flex-col justify-center px-[max(20px,calc(50%-200px))] pb-10 pt-4 [&_input:not([type=checkbox])]:h-11 [&_input:not([type=checkbox])]:pl-3 [&_input:not([type=checkbox])]:text-base [&_label]:text-sm">
          {children}
        </div>
      </main>
    </div>
  )
}
