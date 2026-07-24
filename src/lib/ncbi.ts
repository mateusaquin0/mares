// MARES — Parsing do XML do NCBI Taxonomy (E-utilities efetch).
// Extraído da rota /api/ncbi para permitir teste unitário do parser (ver ROADMAP_TESTES.md).
// Namespace-agnóstico e sem dependência de XML — casa pelas tags do formato TaxaSet.

export type NcbiTaxon = {
  key: number
  scientificName: string
  rank: string | null
  family: string | null
  order: string | null
}

/** Primeiro valor de uma tag simples. */
export function firstTag(xml: string, tag: string): string | null {
  // `tag` é sempre uma constante interna (nome de tag XML), nunca entrada do usuário.
  // eslint-disable-next-line security/detect-non-literal-regexp
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"))
  return m ? m[1].trim() : null
}

/** Nome científico de um Rank dentro do LineageEx (ex.: family, order). */
export function lineageName(xml: string, rank: string): string | null {
  // `rank` é constante interna (ex.: "family", "order"), nunca entrada do usuário.
  const m = xml.match(
    // eslint-disable-next-line security/detect-non-literal-regexp
    new RegExp(`<ScientificName>([^<]+)</ScientificName>\\s*<Rank>${rank}</Rank>`, "i"),
  )
  return m ? m[1].trim() : null
}

/** Divide o TaxaSet nos blocos <Taxon> de nível superior (ignora os aninhados no LineageEx). */
export function topLevelTaxa(xml: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = -1
  const re = /<\/?Taxon>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    if (m[0] === "<Taxon>") {
      if (depth === 0) start = m.index + m[0].length
      depth++
    } else {
      depth--
      if (depth === 0 && start >= 0) {
        out.push(xml.slice(start, m.index))
        start = -1
      }
    }
  }
  return out
}

/** Faz o parse do efetch (TaxaSet) em taxa com nome/rank/família/ordem. */
export function parseNcbiTaxa(xml: string): NcbiTaxon[] {
  return topLevelTaxa(xml)
    .map((block) => ({
      key: Number(firstTag(block, "TaxId")),
      scientificName: firstTag(block, "ScientificName") ?? "",
      rank: firstTag(block, "Rank"),
      family: lineageName(block, "family"),
      order: lineageName(block, "order"),
    }))
    .filter((r) => r.scientificName && Number.isFinite(r.key) && r.key > 0)
}
