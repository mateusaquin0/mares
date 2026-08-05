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
  rateLimited: "rateLimited",
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
  notInvited: "notInvited",
  // Fase 2 — pesquisas, protocolos e catálogos
  researchNotFound: "researchNotFound",
  researchHasAnimals: "researchHasAnimals",
  researchMemberExists: "researchMemberExists",
  researchMemberNotFound: "researchMemberNotFound",
  researchMemberIsCreator: "researchMemberIsCreator",
  researchMemberNotResearcher: "researchMemberNotResearcher",
  // Solicitação de acesso a uma pesquisa do grupo (a listagem é aberta; os dados, não).
  researchAccessRequestNotFound: "researchAccessRequestNotFound",
  researchAccessRequestPending: "researchAccessRequestPending",
  researchAccessRequestProcessed: "researchAccessRequestProcessed",
  researchAccessAlreadyMember: "researchAccessAlreadyMember",
  protocolNotFound: "protocolNotFound",
  protocolDuplicate: "protocolDuplicate",
  protocolInUse: "protocolInUse",
  catalogNotFound: "catalogNotFound",
  catalogDuplicate: "catalogDuplicate",
  catalogInUse: "catalogInUse",
  catalogNameRequired: "catalogNameRequired",
  // Patógeno científico só pode ser criado a partir de uma seleção do NCBI (taxonId vinculado).
  pathogenNcbiRequired: "pathogenNcbiRequired",
  // Fase 3 — animais, amostras e análises
  animalNotFound: "animalNotFound",
  animalDuplicate: "animalDuplicate",
  animalControlDuplicate: "animalControlDuplicate",
  animalSimbaDuplicate: "animalSimbaDuplicate",
  // Variantes para quando o registro em conflito está numa pesquisa FORA do escopo do
  // usuário: sem nomear a pesquisa, o erro é inacionável (o usuário não acha o duplicado
  // na listagem, que é filtrada por pesquisa). Recebem o param `research`.
  animalControlDuplicateOutOfScope: "animalControlDuplicateOutOfScope",
  animalSimbaDuplicateOutOfScope: "animalSimbaDuplicateOutOfScope",
  // Duplicado numa pesquisa que o usuário ENXERGA: nomear a pesquisa é suficiente (ele abre
  // o registro e confere), sem oferecer pedido de compartilhamento. Recebem o param `research`.
  animalControlDuplicateInResearch: "animalControlDuplicateInResearch",
  animalSimbaDuplicateInResearch: "animalSimbaDuplicateInResearch",
  animalHasSamples: "animalHasSamples",
  animalResearchExists: "animalResearchExists",
  animalResearchPrimary: "animalResearchPrimary",
  animalResearchHasData: "animalResearchHasData",
  animalResearchNotLinked: "animalResearchNotLinked",
  // Compartilhamento de indivíduo com consentimento dos dois lados (convite × pedido).
  animalSharePending: "animalSharePending",
  animalShareNotFound: "animalShareNotFound",
  animalShareCannotDecide: "animalShareCannotDecide",
  sampleNotFound: "sampleNotFound",
  sampleHasAnalyses: "sampleHasAnalyses",
  sampleIdentificationDuplicate: "sampleIdentificationDuplicate",
  organNotFound: "organNotFound",
  analysisInvalidCombo: "analysisInvalidCombo",
  // Confirmação de espécie por sequenciamento
  analysisNotFound: "analysisNotFound",
  confirmationParentNotPositive: "confirmationParentNotPositive",
  confirmationDuplicate: "confirmationDuplicate",
  mediaNotFound: "mediaNotFound",
  mediaInvalidType: "mediaInvalidType",
  mediaTooLarge: "mediaTooLarge",
  mediaUploadFailed: "mediaUploadFailed",
  // Fase 3 — integração SIMBA
  simbaNotFound: "simbaNotFound",
  simbaUnavailable: "simbaUnavailable",
  // Feedback (sugestões / bugs)
  feedbackNotFound: "feedbackNotFound",
  // Solicitações de glossário
  catalogRequestNotFound: "catalogRequestNotFound",
  catalogRequestProcessed: "catalogRequestProcessed",
  catalogRequestSelfReview: "catalogRequestSelfReview",
  catalogRequestDuplicatePending: "catalogRequestDuplicatePending",
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

export const KNOWN_ERROR_CODES: ReadonlySet<string> = new Set(Object.values(ERROR_CODES))
