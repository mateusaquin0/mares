// Publicação no mapa público (docs/PERMISSOES.md): o animal só é publicado quando ele está
// marcado para publicação E a pesquisa primária é pública. Este é o único status de
// visibilidade externa mostrado ao usuário — lista, detalhe e mapa interno usam o mesmo.
// Não confundir com "arquivado", que é curadoria interna de uma pesquisa (hiddenAt).
export type PublicationStatus = "published" | "researchPrivate" | "withheld"

export function publicationStatus(
  animalIsPublic: boolean,
  researchIsPublic: boolean,
): PublicationStatus {
  if (!researchIsPublic) return "researchPrivate"
  return animalIsPublic ? "published" : "withheld"
}
