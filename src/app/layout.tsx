import type { Metadata } from "next"
import { headers } from "next/headers"
import { Newsreader, Source_Sans_3 } from "next/font/google"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getMessages, getTranslations } from "next-intl/server"
import "./globals.css"
import "flag-icons/css/flag-icons.min.css"
import { Providers } from "@/components/providers"
import { Toaster } from "@/components/ui/sonner"

// Source Sans 3 no texto e na interface; Newsreader nos títulos e nos nomes científicos.
const sans = Source_Sans_3({ subsets: ["latin"], variable: "--font-sans", display: "swap" })
const serif = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-serif",
  display: "swap",
})

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata")
  return { title: t("title"), description: t("description") }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await getLocale()
  const messages = await getMessages()
  // Nonce da CSP (definido no middleware) — repassado ao next-themes para que seu
  // script inline anti-flash não seja bloqueado pela política.
  const nonce = (await headers()).get("x-nonce") ?? undefined

  return (
    <html lang={locale} className={`${sans.variable} ${serif.variable}`} suppressHydrationWarning>
      <body className="antialiased">
        <NextIntlClientProvider messages={messages}>
          <Providers nonce={nonce}>
            {children}
            <Toaster position="top-right" />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
