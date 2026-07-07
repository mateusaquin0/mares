// MARES — Códigos de erro de domínio (i18n).
// O servidor devolve um `code` estável junto da mensagem; o cliente traduz o código
// (namespace `errors` nos catálogos). Assim as mensagens de erro ficam localizadas sem
// depender do idioma no servidor. Ver docs/I18N.md.
export const ERROR_CODES = {
  // genéricos (defaults por classe de erro)
  notFound: "notFound",
  conflict: "conflict",
  forbidden: "forbidden",
  validation: "validation",
  unauthenticated: "unauthenticated",
  internal: "internal",
  // específicos
  notMember: "notMember",
  orgNotFound: "orgNotFound",
  memberNotFound: "memberNotFound",
  changeOtherAdmin: "changeOtherAdmin",
  removeOtherAdmin: "removeOtherAdmin",
  lastAdminDemote: "lastAdminDemote",
  lastAdminHasData: "lastAdminHasData",
  deleteSelf: "deleteSelf",
  userNotFound: "userNotFound",
  requestNotFound: "requestNotFound",
  requestProcessed: "requestProcessed",
  systemAdminNoOrg: "systemAdminNoOrg",
  alreadyMember: "alreadyMember",
  nameRequired: "nameRequired",
  // Fase 2 — pesquisas, protocolos e catálogos
  researchNotFound: "researchNotFound",
  researchHasAnimals: "researchHasAnimals",
  protocolNotFound: "protocolNotFound",
  protocolDuplicate: "protocolDuplicate",
  protocolInUse: "protocolInUse",
  catalogNotFound: "catalogNotFound",
  catalogDuplicate: "catalogDuplicate",
  catalogInUse: "catalogInUse",
  catalogNameRequired: "catalogNameRequired",
  // Fase 3 — animais, amostras e análises
  animalNotFound: "animalNotFound",
  animalDuplicate: "animalDuplicate",
  animalControlDuplicate: "animalControlDuplicate",
  animalSimbaDuplicate: "animalSimbaDuplicate",
  animalHasSamples: "animalHasSamples",
  animalResearchExists: "animalResearchExists",
  animalResearchPrimary: "animalResearchPrimary",
  animalResearchHasData: "animalResearchHasData",
  animalResearchNotLinked: "animalResearchNotLinked",
  sampleNotFound: "sampleNotFound",
  sampleHasAnalyses: "sampleHasAnalyses",
  sampleIdentificationDuplicate: "sampleIdentificationDuplicate",
  organNotFound: "organNotFound",
  analysisInvalidCombo: "analysisInvalidCombo",
  mediaNotFound: "mediaNotFound",
  mediaInvalidType: "mediaInvalidType",
  mediaTooLarge: "mediaTooLarge",
  mediaUploadFailed: "mediaUploadFailed",
  // Fase 3 — integração SIMBA
  simbaNotFound: "simbaNotFound",
  simbaUnavailable: "simbaUnavailable",
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

export const KNOWN_ERROR_CODES: ReadonlySet<string> = new Set(Object.values(ERROR_CODES))
