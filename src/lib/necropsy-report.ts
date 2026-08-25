// MARES — Formatação do laudo histopatológico (pura, client-safe).
//
// Vive fora de lib/necropsy.ts porque o botão "copiar diagnóstico descritivo" roda no
// navegador: aquele módulo importa o Prisma e não pode entrar no bundle do cliente.

import { txt, type I18nText } from "@/lib/catalog-i18n"

export type DescriptiveFinding = {
  organ: { name: unknown }
  finding: string
}

/**
 * Monta o "diagnóstico descritivo" corrido a partir dos achados micro — o parágrafo único
 * que o SIMBA exibe ("Pulmões, edema acentuado, …. Baço, esplenite …").
 *
 * É a ponte para quem ainda precisa colar o texto lá: os dados ficam estruturados aqui e o
 * formato do SIMBA é derivado, não digitado uma segunda vez. Função pura — o export e o
 * botão "copiar" usam a mesma.
 */
export function buildDescriptiveDiagnosis(
  locale: string,
  findings: readonly DescriptiveFinding[],
): string {
  return findings
    .map((f) => {
      const organ = txt(locale, f.organ.name as I18nText | string | null)
      // O achado é digitado como frase solta ("edema acentuado, …"), com ou sem ponto
      // final: normaliza para o órgão e o achado formarem uma sentença só.
      const body = f.finding.trim().replace(/[.\s]+$/, "")
      if (!organ) return body ? `${body}.` : ""
      if (!body) return ""
      return `${organ}, ${body}.`
    })
    .filter(Boolean)
    .join(" ")
}
