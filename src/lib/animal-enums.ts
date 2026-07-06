// MARES — Fonte única dos valores de domínio do animal (sexo e estágio de vida) com suas
// chaves i18n (namespace "animals"). Evita duplicar as listas em formulários, tabelas e
// exportações. Os `value` são exatamente os gravados no banco (ver docs/BANCO_DE_DADOS.md).

export const SEX_OPTIONS = [
  { value: "M", key: "sexMale" },
  { value: "F", key: "sexFemale" },
  { value: "U", key: "sexUndetermined" },
] as const

export const LIFE_STAGE_OPTIONS = [
  { value: "FETUS", key: "lifeStageFetus" },
  { value: "PUP", key: "lifeStagePup" },
  { value: "JUVENILE", key: "lifeStageJuvenile" },
  { value: "ADULT", key: "lifeStageAdult" },
  { value: "UNDETERMINED", key: "lifeStageUndetermined" },
] as const

export type SexValue = (typeof SEX_OPTIONS)[number]["value"]
export type LifeStageValue = (typeof LIFE_STAGE_OPTIONS)[number]["value"]
