// MARES — Slugify compartilhado. Usado para chaves de catálogo (separador "_") e para
// nomes de arquivo de exportação (separador "-"). Fonte única para evitar duplicação.
export function slugify(s: string, sep = "_"): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, sep)
    .replace(/^[-_]+|[-_]+$/g, "")
}
