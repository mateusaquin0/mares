// MARES — Formatação de datas "somente data" (encalhe, necrópsia, coleta).
//
// Esses campos representam um DIA de calendário, não um instante. São gravados à
// meia-noite UTC (ver animalData/sampleData). Formatá-los no fuso local desloca o dia
// — no Brasil (UTC-3), a meia-noite UTC vira 21h do dia anterior, exibindo 1 dia a menos
// (e ficando 1 dia atrás do SIMBA). Por isso formatamos SEMPRE em UTC, preservando o dia
// informado. Timestamps reais (createdAt, uploadedAt…) NÃO usam este helper — esses devem
// aparecer no fuso local.
export function formatDateOnly(
  value: string | Date | null | undefined,
  locale: string,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!value) return ""
  const d = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return ""
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...options }).format(d)
}
