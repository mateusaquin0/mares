// MARES — Dispara o download da exportação de animais (Fase 6). Faz POST em
// /api/animals/export com os ids e o formato, e salva o arquivo retornado (blob).

export type ExportFormat = "darwin-core" | "xlsx"

export async function downloadAnimalsExport(ids: string[], format: ExportFormat): Promise<void> {
  const res = await fetch("/api/animals/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, format }),
  })
  if (!res.ok) throw new Error(`export failed: ${res.status}`)

  const blob = await res.blob()
  const disposition = res.headers.get("Content-Disposition") ?? ""
  const match = /filename="([^"]+)"/.exec(disposition)
  const filename = match?.[1] ?? (format === "xlsx" ? "MARES-animais.xlsx" : "MARES-animais.xml")

  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
