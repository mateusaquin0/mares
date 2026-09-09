// MARES — DTOs da biometria do indivíduo.
//
// O rótulo é o texto LITERAL do SIMBA e também o que aparece na tela (sem tradução), então
// não há id de catálogo aqui. Ver docs/PLANO_BIOMETRIA.md.

/** Uma medida. `value: null` = o formulário tem o campo e ninguém mediu ("Não informado"). */
export type BiometryMeasure = {
  label: string
  value: number | null
}

/** Bloco de biometria de um indivíduo (o conteúdo de `Animal.measurements`). */
export type AnimalBiometry = {
  // Formulário do SIMBA ("Odontoceti", "Quelônio"…), literal. Null no cadastro manual de um
  // grupo ainda não nomeado.
  group: string | null
  // Unidade base das medidas de comprimento (`measurementUnit`). Null → "cm" na exibição.
  unit: string | null
  measures: BiometryMeasure[]
}

/** Resposta do GET: o bloco do indivíduo + o vocabulário para o cadastro manual. */
export type BiometryResponse = {
  biometry: AnimalBiometry | null
  // Peso da carcaça: vive em `Animal.necropsyWeightKg`, não no JSON (ver lib/biometry.ts).
  weightKg: number | null
  // Grupos já usados na organização — alimenta o seletor.
  knownGroups: string[]
  // Rótulos já vistos no grupo deste indivíduo — alimenta o autocompletar.
  knownLabels: string[]
  // O indivíduo tem número de registro do SIMBA: sem ele não há o que importar, e o botão
  // fica desabilitado com a explicação.
  canImport: boolean
}

/** Prévia da importação do SIMBA, antes de gravar. */
export type BiometryPreview = {
  biometry: AnimalBiometry | null
  weightKg: number | null
  // Preenchido quando o SIMBA mandou biometria que não pôde ser pareada com segurança
  // (quantidades de rótulos e valores divergentes fora do defeito conhecido).
  mismatch: { labels: number; values: number } | null
}
