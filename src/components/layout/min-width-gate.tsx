"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { MonitorSmartphone } from "lucide-react"

// A área logada não suporta telas pequenas (tabelas largas, mapa e formulários em duas
// colunas): abaixo de 1024x600 a interface é substituída por um aviso.
const QUERY = "(min-width: 1024px) and (min-height: 600px)"

// Mesma regra do `QUERY`, em classe utilitária — usada só até a primeira medição.
const CSS_OK = "lg:[@media(min-height:600px)]:contents"
const CSS_SMALL = "lg:[@media(min-height:600px)]:hidden"

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
 * bater (`<div>` virava `<Sidebar>`) e ele DESMONTAVA e remontava a aplicação inteira a
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
      className={`flex min-h-screen w-full flex-col items-center justify-center gap-3 bg-background p-8 text-center ${measuring ? CSS_SMALL : ""}`}
    >
      <MonitorSmartphone className="size-10 text-muted-foreground" />
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{t("description")}</p>
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
