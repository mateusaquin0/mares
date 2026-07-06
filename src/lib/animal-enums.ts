// MARES — Fonte única dos valores de domínio do animal (sexo e estágio de vida) com suas
// chaves i18n (namespace "animals"). Evita duplicar as listas em formulários, tabelas,
// exportações e validação. Os `value` são exatamente os gravados no banco.

// Valores canônicos (usados no z.enum de validação e como tipos em todo o app).
export const SEX_VALUES = ["M", "F", "U"] as const
export const LIFE_STAGE_VALUES = ["FETUS", "PUP", "JUVENILE", "ADULT", "UNDETERMINED"] as const

export type SexValue = (typeof SEX_VALUES)[number]
export type LifeStageValue = (typeof LIFE_STAGE_VALUES)[number]

// Valor + chave i18n para montar Selects e rótulos. `as const satisfies` mantém as chaves
// como literais (para o next-intl `t`) e garante que os `value` são valores canônicos.
export const SEX_OPTIONS = [
  { value: "M", key: "sexMale" },
  { value: "F", key: "sexFemale" },
  { value: "U", key: "sexUndetermined" },
] as const satisfies readonly { value: SexValue; key: string }[]

export const LIFE_STAGE_OPTIONS = [
  { value: "FETUS", key: "lifeStageFetus" },
  { value: "PUP", key: "lifeStagePup" },
  { value: "JUVENILE", key: "lifeStageJuvenile" },
  { value: "ADULT", key: "lifeStageAdult" },
  { value: "UNDETERMINED", key: "lifeStageUndetermined" },
] as const satisfies readonly { value: LifeStageValue; key: string }[]
