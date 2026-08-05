import { getTranslations } from "next-intl/server"
import { MonitorSmartphone } from "lucide-react"

// A área logada não suporta telas pequenas (tabelas largas, mapa e formulários em duas
// colunas): abaixo de 1024x600 a interface é substituída por um aviso.
export async function MinWidthGate({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("minWidth")

  return (
    <>
      <div className="hidden lg:[@media(min-height:600px)]:contents">{children}</div>
      <div className="flex min-h-screen w-full flex-col items-center justify-center gap-3 bg-background p-8 text-center lg:[@media(min-height:600px)]:hidden">
        <MonitorSmartphone className="size-10 text-muted-foreground" />
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{t("description")}</p>
      </div>
    </>
  )
}
