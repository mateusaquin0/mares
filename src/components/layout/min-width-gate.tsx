"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { ArrowLeft, MonitorSmartphone } from "lucide-react"

import { Logo } from "@/components/logo"

// A área logada não suporta telas pequenas (tabelas largas, mapa e formulários em duas
// colunas): abaixo de 1024x600 a interface é substituída por um aviso.
const QUERY = "(min-width: 1024px) and (min-height: 600px)"

// Mesma regra do `QUERY`, em classe utilitária — usada só até a primeira medição.
const CSS_OK = "lg:[@media(min-height:600px)]:contents"
const CSS_SMALL = "lg:[@media(min-height:600px)]:hidden"

// Tamanho da janela, ao vivo. Antes da primeira medição mostra o travessão.
function WindowSize() {
  const [size, setSize] = useState<string | null>(null)
  useEffect(() => {
    const read = () => setSize(`${window.innerWidth} × ${window.innerHeight}`)
    read()
    window.addEventListener("resize", read)
    return () => window.removeEventListener("resize", read)
  }, [])
  return <>{size ?? "—"}</>
}

/**
 * Troca a aplicação por um aviso quando a janela fica menor que o mínimo.
 *
 * O aviso precisa **desmontar** a árvore, e não só escondê-la: os diálogos do Radix são
 * portalados para o `body`, fora desta `div`, então esconder por CSS deixaria um modal aberto
 * flutuando por cima do aviso. Desmontar leva junto o estado que os mantinha abertos.
 *
 * Até a primeira medição (SSR e primeira pintura) o corte é feito por CSS, para o HTML do
 * servidor bater com o do cliente e não haver piscada.
 *
 * A FORMA da árvore devolvida é sempre a mesma — `<div>` + aviso, nas duas posições, em
 * todos os estados. Isto não é estilo: quando a medição terminava e o componente passava a
 * devolver `children` direto, o React casava a `<div>` embrulho com a `<div>` raiz de
 * `children` (mesmo tipo, sem key) e reaproveitava a fiber; os filhos então deixavam de
 * bater (`<div>` virava `<AppHeader>`) e ele DESMONTAVA e remontava a aplicação inteira a
 * cada carregamento — estado perdido, queries refeitas e o Leaflet inicializando duas vezes.
 * Mantendo as posições fixas, só mudam classe e conteúdo, e a árvore sobrevive à medição.
 */
export function MinWidthGate({ children }: { children: React.ReactNode }) {
  const t = useTranslations("minWidth")
  // `null` = ainda não medido; aí os dois ramos saem, cortados por CSS.
  const [tooSmall, setTooSmall] = useState<boolean | null>(null)

  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const apply = () => setTooSmall(!mq.matches)
    apply()
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [])

  const measuring = tooSmall === null

  const warning = (
    <div
      className={`flex min-h-screen w-full flex-col bg-background p-6 text-base text-foreground ${measuring ? CSS_SMALL : ""}`}
    >
      <div className="border-b border-foreground pb-3">
        <Link href="/" className="inline-flex items-center gap-2">
          <Logo className="size-[22px]" />
          <span className="font-serif text-xl font-semibold tracking-[.04em]">MARES</span>
        </Link>
      </div>
      <div className="flex max-w-[460px] flex-1 flex-col justify-center py-6">
        <MonitorSmartphone className="size-7 text-muted-foreground" />
        <h1 className="mt-2 font-serif text-[34px] font-medium leading-[38px]">{t("title")}</h1>
        <p className="mt-3 text-pretty">{t("description")}</p>
        <dl className="mt-5 border-b border-t-2 border-foreground text-[15px] tabular-nums">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-border py-1.5">
            <dt className="text-muted-foreground">{t("current")}</dt>
            <dd className="font-semibold text-warning">
              <WindowSize />
            </dd>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-1.5">
            <dt className="text-muted-foreground">{t("required")}</dt>
            <dd className="font-semibold">1024 × 600</dd>
          </div>
        </dl>
        {/* As páginas públicas (início, mapa) funcionam no celular. */}
        <Link
          href="/"
          className="mt-6 inline-flex h-11 items-center gap-2 self-start rounded-sm border border-foreground px-4 font-semibold transition-colors hover:bg-accent"
        >
          <ArrowLeft className="size-4" />
          {t("backHome")}
        </Link>
      </div>
    </div>
  )

  // `contents` faz o embrulho sumir do layout: os filhos se posicionam como se ele não
  // existisse. Medindo, quem decide é o CSS; medido, é o próprio estado.
  const wrapper = measuring ? `hidden ${CSS_OK}` : tooSmall ? "hidden" : "contents"

  return (
    <>
      <div className={wrapper}>{tooSmall ? null : children}</div>
      {(measuring || tooSmall) && warning}
    </>
  )
}
