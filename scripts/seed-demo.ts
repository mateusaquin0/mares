// MARES — Dados de demonstração para o banco de TESTES (conferência visual e uso manual).
//
// Uso: npm run db:teste:demo
//
// Só roda com MARES_DEMO_SEED=1 e DEMO_PASSWORD definidos (ficam no .env.teste, fora do git):
// o script apaga e recria os próprios dados, e nunca pode apontar para produção.
//
// Tudo o que ele cria é identificável e é a única coisa que ele apaga: usuários
// `demo-…@test.local` (Auth + banco) e os grupos de DEMO_ORGS, com tudo o que pendura neles.
// Os catálogos globais (órgãos, patógenos, exames) vêm do seed oficial; os sistemas da
// necrópsia são criados aqui se faltarem.

import { PrismaClient, type Prisma } from "@prisma/client"
import { createClient } from "@supabase/supabase-js"
import sharp from "sharp"

import { TERMS_VERSION } from "../src/lib/terms"

if (process.env.MARES_DEMO_SEED !== "1") {
  console.error("Recusado: MARES_DEMO_SEED=1 não definido (só existe no .env.teste).")
  process.exit(1)
}
const PASSWORD = process.env.DEMO_PASSWORD
if (!PASSWORD) {
  console.error("Recusado: defina DEMO_PASSWORD no .env.teste.")
  process.exit(1)
}

const prisma = new PrismaClient()
const auth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const EMAIL = (slug: string) => `demo-${slug}@test.local`
const isDemoEmail = (e?: string) => !!e && e.startsWith("demo-") && e.endsWith("@test.local")

const DEMO_ORGS = {
  lamaq: {
    name: "Laboratório de Mamíferos Aquáticos — UFSC",
    city: "Florianópolis",
    state: "SC",
  },
  gefam: {
    name: "Grupo de Estudos de Fauna Marinha — UNIVALI",
    city: "Itajaí",
    state: "SC",
  },
} as const

// Gerador determinístico: a mesma execução gera sempre o mesmo conjunto.
let state = 20261117
const rand = () => {
  state = (state * 1664525 + 1013904223) % 4294967296
  return state / 4294967296
}
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!
const chance = (p: number) => rand() < p
const between = (a: number, b: number) => a + rand() * (b - a)
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d

const FEEDBACK_BUCKET = "feedback-media"

// Mesma configuração com que o app cria o bucket no primeiro envio (src/lib/media.ts).
async function ensureBucket(name: string) {
  const { data } = await auth.storage.getBucket(name)
  if (!data) {
    await auth.storage.createBucket(name, { public: false, fileSizeLimit: 5 * 1024 * 1024 })
  }
}

// Imagem de "captura de tela" fictícia para os anexos dos tickets.
async function screenshot(label: string): Promise<Buffer> {
  const esc = label.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  const lines = [0, 1, 2, 3, 4, 5]
    .map(
      (i) =>
        `<rect x="40" y="${130 + i * 44}" width="${520 + ((i * 97) % 300)}" height="12" fill="#D8D4C6"/>`,
    )
    .join("")
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540">
    <rect width="960" height="540" fill="#F5F3EC"/>
    <rect width="960" height="48" fill="#ECE9DF"/>
    <rect x="24" y="16" width="120" height="16" fill="#1A1D1B"/>
    <rect x="40" y="96" width="880" height="2" fill="#1A1D1B"/>
    ${lines}
    <text x="40" y="500" font-family="sans-serif" font-size="22" fill="#565B56">${esc}</text>
  </svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

async function cleanup() {
  const orgs = await prisma.organization.findMany({
    where: { name: { in: Object.values(DEMO_ORGS).map((o) => o.name) } },
    select: { id: true },
  })
  const orgIds = orgs.map((o) => o.id)
  const users = await prisma.user.findMany({
    where: { email: { startsWith: "demo-", endsWith: "@test.local" } },
    select: { id: true },
  })
  const userIds = users.map((u) => u.id)
  const animalIds = (
    await prisma.animal.findMany({ where: { orgId: { in: orgIds } }, select: { id: true } })
  ).map((a) => a.id)

  await prisma.auditLog.deleteMany({
    where: { OR: [{ userId: { in: userIds } }, { entityId: { in: animalIds } }] },
  })
  const feedbacks = await prisma.feedback.findMany({
    where: { createdByEmail: { startsWith: "demo-", endsWith: "@test.local" } },
    select: { id: true },
  })
  // Arquivos antes das linhas: depois, nada mais diria de quem eram os objetos.
  const { data: buckets } = await auth.storage.listBuckets()
  if (buckets?.some((b) => b.name === FEEDBACK_BUCKET)) {
    for (const { id } of feedbacks) {
      const listed = await auth.storage.from(FEEDBACK_BUCKET).list(id, { limit: 100 })
      if (listed.data?.length) {
        await auth.storage.from(FEEDBACK_BUCKET).remove(listed.data.map((o) => `${id}/${o.name}`))
      }
    }
  }
  await prisma.feedback.deleteMany({ where: { id: { in: feedbacks.map((f) => f.id) } } })
  await prisma.catalogRequest.deleteMany({
    where: { requestedByEmail: { startsWith: "demo-", endsWith: "@test.local" } },
  })
  await prisma.joinRequest.deleteMany({
    where: { email: { startsWith: "demo-", endsWith: "@test.local" } },
  })
  await prisma.animal.deleteMany({ where: { orgId: { in: orgIds } } })
  await prisma.research.deleteMany({ where: { orgId: { in: orgIds } } })
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } })
  await prisma.user.deleteMany({ where: { id: { in: userIds } } })

  for (let page = 1; ; page++) {
    const { data, error } = await auth.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(`Falha ao listar usuários do Auth: ${error.message}`)
    for (const u of data.users) {
      if (isDemoEmail(u.email)) await auth.auth.admin.deleteUser(u.id)
    }
    if (data.users.length < 200) break
  }
}

async function createUser(slug: string, name: string, isSystemAdmin = false) {
  const email = EMAIL(slug)
  const { data, error } = await auth.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`Falha ao criar ${email}: ${error?.message}`)
  await prisma.user.create({
    data: {
      id: data.user.id,
      email,
      name,
      isSystemAdmin,
      status: "ACTIVE",
      termsVersion: TERMS_VERSION,
      termsAcceptedAt: new Date(),
    },
  })
  return { id: data.user.id, email, name }
}

const SYSTEMS = [
  ["respiratorio", "Sistema respiratório", "Respiratory system"],
  ["digestorio", "Sistema digestório", "Digestive system"],
  ["cardiovascular", "Sistema cardiovascular", "Cardiovascular system"],
  ["tegumentar", "Sistema tegumentar", "Integumentary system"],
  ["musculoesqueletico", "Sistema musculoesquelético", "Musculoskeletal system"],
  ["nervoso", "Sistema nervoso", "Nervous system"],
  ["urogenital", "Sistema urogenital", "Urogenital system"],
  ["linfatico", "Sistema linfático", "Lymphatic system"],
] as const

const SUL = ["RS", "SC", "PR"]
const SUDESTE = ["SP", "RJ", "ES"]
const NORDESTE = ["BA", "SE", "AL", "PE", "PB", "RN", "CE", "PI", "MA"]
const NORTE = ["PA"]

// Ocorrência por UF: cada encalhe sorteia só espécies que ocorrem naquela costa.
const SPECIES = [
  {
    name: "Pontoporia blainvillei",
    family: "Pontoporiidae",
    order: "Cetacea",
    group: "Odontoceti",
    len: [90, 160],
    w: 6,
    ufs: [...SUL, ...SUDESTE],
  },
  {
    name: "Sotalia guianensis",
    family: "Delphinidae",
    order: "Cetacea",
    group: "Odontoceti",
    len: [120, 210],
    w: 5,
    ufs: ["SC", "PR", ...SUDESTE, ...NORDESTE, ...NORTE],
  },
  {
    name: "Tursiops truncatus",
    family: "Delphinidae",
    order: "Cetacea",
    group: "Odontoceti",
    len: [190, 330],
    w: 2,
    ufs: [...SUL, ...SUDESTE, ...NORDESTE, ...NORTE],
  },
  {
    name: "Stenella frontalis",
    family: "Delphinidae",
    order: "Cetacea",
    group: "Odontoceti",
    len: [150, 220],
    w: 1,
    ufs: [...SUL, ...SUDESTE, "BA"],
  },
  {
    name: "Steno bredanensis",
    family: "Delphinidae",
    order: "Cetacea",
    group: "Odontoceti",
    len: [180, 260],
    w: 1,
    ufs: [...SUL, ...SUDESTE, ...NORDESTE, ...NORTE],
  },
  {
    name: "Megaptera novaeangliae",
    family: "Balaenopteridae",
    order: "Cetacea",
    group: "Mysticeti",
    len: [800, 1500],
    w: 1,
    ufs: ["SP", "RJ", "ES", "BA"],
  },
  {
    name: "Arctocephalus australis",
    family: "Otariidae",
    order: "Carnivora",
    group: "Pinípede",
    len: [100, 180],
    w: 2,
    ufs: ["RS", "SC"],
  },
  {
    name: "Trichechus manatus",
    family: "Trichechidae",
    order: "Sirenia",
    group: "Sirênio",
    len: [150, 350],
    w: 2,
    ufs: ["AL", "PE", "PB", "RN", "CE", "PI", "MA", "PA"],
  },
  {
    name: "Chelonia mydas",
    family: "Cheloniidae",
    order: "Testudines",
    group: "Quelônio",
    len: [35, 90],
    w: 3,
    ufs: [...SUL, ...SUDESTE, ...NORDESTE, ...NORTE],
  },
] as const
type Species = (typeof SPECIES)[number]
const weightedSpecies = SPECIES.flatMap((s) => Array(s.w).fill(s) as Species[])
const species = (name: Species["name"]) => SPECIES.find((s) => s.name === name)!

// Trechos da linha de costa (OpenStreetMap, natural=coastline) de cada praia: os encalhes
// caem sobre a faixa de areia, nunca dentro da cidade nem no mar.
type Beach = { city: string; uf: string; beach: string; coast: [number, number][] }
const BEACHES: Beach[] = [
  {
    city: "Laguna",
    uf: "SC",
    beach: "Praia do Mar Grosso",
    coast: [
      [-28.49172, -48.76276],
      [-28.4899, -48.76368],
      [-28.4885, -48.76414],
      [-28.48617, -48.76477],
      [-28.48365, -48.76533],
      [-28.48116, -48.76552],
      [-28.47931, -48.7656],
      [-28.47816, -48.7657],
      [-28.47593, -48.76593],
      [-28.47226, -48.76612],
      [-28.47101, -48.76598],
      [-28.46994, -48.76595],
    ],
  },
  {
    city: "Imbituba",
    uf: "SC",
    beach: "Praia do Rosa",
    coast: [
      [-28.13685, -48.64174],
      [-28.13543, -48.64237],
      [-28.13346, -48.64262],
      [-28.1324, -48.64244],
      [-28.13126, -48.6422],
      [-28.13007, -48.64159],
      [-28.128, -48.64112],
      [-28.12587, -48.64013],
      [-28.12347, -48.63908],
      [-28.12223, -48.63796],
      [-28.1218, -48.63731],
      [-28.12175, -48.63708],
    ],
  },
  {
    city: "Garopaba",
    uf: "SC",
    beach: "Praia Central",
    coast: [
      [-28.02269, -48.61355],
      [-28.02282, -48.61377],
      [-28.02306, -48.61434],
      [-28.02318, -48.61484],
      [-28.02318, -48.61557],
      [-28.02306, -48.61621],
      [-28.02289, -48.61696],
      [-28.02286, -48.61708],
    ],
  },
  {
    city: "Florianópolis",
    uf: "SC",
    beach: "Praia do Campeche",
    coast: [
      [-27.68509, -48.47992],
      [-27.68421, -48.47976],
      [-27.68273, -48.47954],
      [-27.68036, -48.47922],
      [-27.67887, -48.47907],
      [-27.67735, -48.47885],
      [-27.67647, -48.47859],
      [-27.67423, -48.47817],
      [-27.67261, -48.47767],
      [-27.67172, -48.47733],
      [-27.67097, -48.47706],
    ],
  },
  {
    city: "Florianópolis",
    uf: "SC",
    beach: "Praia dos Ingleses",
    coast: [
      [-27.43548, -48.39102],
      [-27.43441, -48.392],
      [-27.43314, -48.39309],
      [-27.4323, -48.39391],
      [-27.43129, -48.39484],
      [-27.43035, -48.39557],
      [-27.42962, -48.39623],
      [-27.42895, -48.39675],
      [-27.42818, -48.39732],
      [-27.42732, -48.39797],
      [-27.42647, -48.39845],
      [-27.42593, -48.39879],
      [-27.42585, -48.39885],
    ],
  },
  {
    city: "Bombinhas",
    uf: "SC",
    beach: "Praia de Mariscal",
    coast: [
      [-27.18757, -48.49915],
      [-27.18391, -48.49958],
      [-27.18025, -48.49977],
      [-27.17802, -48.4996],
      [-27.17571, -48.49936],
      [-27.17272, -48.49894],
      [-27.17146, -48.49866],
    ],
  },
  {
    city: "Itajaí",
    uf: "SC",
    beach: "Praia Brava",
    coast: [
      [-26.95286, -48.62914],
      [-26.94991, -48.62895],
      [-26.94558, -48.62852],
      [-26.9417, -48.62791],
      [-26.94092, -48.62787],
      [-26.94041, -48.62776],
      [-26.93978, -48.62766],
    ],
  },
  {
    city: "Balneário Camboriú",
    uf: "SC",
    beach: "Praia Central",
    coast: [
      [-27.00149, -48.61844],
      [-26.99934, -48.62109],
      [-26.99477, -48.62616],
      [-26.99179, -48.62809],
      [-26.98948, -48.62868],
      [-26.98786, -48.63001],
      [-26.98632, -48.63195],
      [-26.98379, -48.6329],
      [-26.98169, -48.63312],
      [-26.97976, -48.63345],
    ],
  },
  {
    city: "Penha",
    uf: "SC",
    beach: "Praia de Armação",
    coast: [
      [-26.77467, -48.60068],
      [-26.77446, -48.60059],
      [-26.77582, -48.60172],
      [-26.77737, -48.60238],
      [-26.77861, -48.60333],
      [-26.77924, -48.604],
      [-26.78033, -48.60434],
      [-26.78059, -48.60411],
      [-26.78063, -48.60382],
    ],
  },
  {
    city: "Barra Velha",
    uf: "SC",
    beach: "Praia do Tabuleiro",
    coast: [
      [-26.67343, -48.68817],
      [-26.67138, -48.68792],
      [-26.66846, -48.68735],
      [-26.66523, -48.68675],
      [-26.66144, -48.68637],
      [-26.65934, -48.68601],
      [-26.65438, -48.68489],
      [-26.6519, -48.68426],
      [-26.64817, -48.68365],
    ],
  },
  {
    city: "São Francisco do Sul",
    uf: "SC",
    beach: "Praia da Enseada",
    coast: [
      [-26.22501, -48.50274],
      [-26.22538, -48.50322],
      [-26.2259, -48.50458],
      [-26.2261, -48.50693],
      [-26.22593, -48.50865],
      [-26.22538, -48.51112],
      [-26.22435, -48.51339],
      [-26.22281, -48.5157],
      [-26.22247, -48.51637],
      [-26.22124, -48.51835],
    ],
  },
  {
    city: "Guaratuba",
    uf: "PR",
    beach: "Praia Central",
    coast: [
      [-25.88952, -48.56408],
      [-25.88915, -48.56502],
      [-25.88811, -48.56695],
      [-25.88605, -48.56795],
      [-25.88253, -48.56812],
      [-25.8801, -48.56767],
      [-25.87689, -48.56621],
      [-25.87404, -48.56465],
      [-25.87223, -48.56364],
    ],
  },
  {
    city: "Matinhos",
    uf: "PR",
    beach: "Praia Brava",
    coast: [
      [-25.80724, -48.52934],
      [-25.80488, -48.52836],
      [-25.80257, -48.52729],
      [-25.79914, -48.52576],
      [-25.78931, -48.52058],
      [-25.7884, -48.5201],
    ],
  },
  {
    city: "Pontal do Paraná",
    uf: "PR",
    beach: "Praia de Shangri-lá",
    coast: [
      [-25.6327, -48.42307],
      [-25.62911, -48.42016],
      [-25.62905, -48.42011],
      [-25.62725, -48.41856],
      [-25.62611, -48.41747],
      [-25.6236, -48.41507],
      [-25.62262, -48.41404],
      [-25.61783, -48.40896],
      [-25.61571, -48.40646],
      [-25.61478, -48.40536],
      [-25.61317, -48.40347],
    ],
  },
  {
    city: "Rio Grande",
    uf: "RS",
    beach: "Praia do Cassino",
    coast: [
      [-32.2014, -52.16808],
      [-32.19949, -52.16595],
      [-32.19832, -52.16459],
      [-32.19634, -52.16211],
      [-32.1952, -52.16082],
      [-32.19386, -52.15924],
      [-32.19241, -52.1575],
      [-32.19111, -52.15597],
      [-32.18934, -52.15396],
      [-32.18769, -52.15189],
      [-32.18619, -52.15015],
      [-32.18363, -52.14735],
      [-32.18261, -52.146],
    ],
  },
  {
    city: "Tramandaí",
    uf: "RS",
    beach: "Praia de Tramandaí",
    coast: [
      [-29.98744, -50.12294],
      [-29.97865, -50.11911],
      [-29.9779, -50.11902],
      [-29.97743, -50.11915],
      [-29.97699, -50.11937],
      [-29.97681, -50.11962],
    ],
  },
  {
    city: "Torres",
    uf: "RS",
    beach: "Praia Grande",
    coast: [
      [-29.34745, -49.72844],
      [-29.34614, -49.72736],
      [-29.34443, -49.72674],
      [-29.34375, -49.72611],
      [-29.34309, -49.72551],
      [-29.34257, -49.72482],
      [-29.34139, -49.72331],
      [-29.33995, -49.72242],
      [-29.33822, -49.72139],
      [-29.33262, -49.71629],
      [-29.32835, -49.71325],
    ],
  },
  {
    city: "Ilha Comprida",
    uf: "SP",
    beach: "Praia de Ilha Comprida",
    coast: [
      [-24.80586, -47.6332],
      [-24.80537, -47.63248],
      [-24.80499, -47.63193],
      [-24.80498, -47.63191],
      [-24.80366, -47.63014],
      [-24.80026, -47.62594],
      [-24.79888, -47.62402],
      [-24.79738, -47.62191],
      [-24.7936, -47.61649],
    ],
  },
  {
    city: "Peruíbe",
    uf: "SP",
    beach: "Praia de Peruíbe",
    coast: [
      [-24.32958, -46.9986],
      [-24.32695, -46.99636],
      [-24.32262, -46.99206],
      [-24.32033, -46.98984],
      [-24.31778, -46.98708],
      [-24.31565, -46.98487],
      [-24.31339, -46.98244],
      [-24.31216, -46.98107],
      [-24.31143, -46.98033],
      [-24.3108, -46.97965],
    ],
  },
  {
    city: "Guarujá",
    uf: "SP",
    beach: "Praia de Pitangueiras",
    coast: [
      [-24.01019, -46.26716],
      [-24.00888, -46.26822],
      [-24.00661, -46.26801],
      [-24.00413, -46.26628],
      [-24.00318, -46.26548],
      [-24.00083, -46.26238],
      [-23.99905, -46.25742],
      [-23.9972, -46.25443],
      [-23.99559, -46.25156],
      [-23.99587, -46.25122],
      [-23.99666, -46.25072],
      [-23.99621, -46.24946],
      [-23.99591, -46.24879],
    ],
  },
  {
    city: "Ubatuba",
    uf: "SP",
    beach: "Praia Grande",
    coast: [
      [-23.45763, -45.05371],
      [-23.45805, -45.05466],
      [-23.4588, -45.05505],
      [-23.45915, -45.05507],
      [-23.45873, -45.0568],
      [-23.45697, -45.059],
      [-23.45427, -45.0617],
      [-23.45021, -45.06495],
      [-23.44646, -45.06686],
      [-23.44609, -45.06716],
      [-23.44079, -45.06882],
      [-23.43966, -45.06903],
    ],
  },
  {
    city: "Rio de Janeiro",
    uf: "RJ",
    beach: "Praia de Copacabana",
    coast: [
      [-22.97994, -43.1888],
      [-22.9789, -43.18849],
      [-22.97771, -43.18771],
      [-22.97686, -43.18695],
      [-22.97612, -43.18622],
      [-22.9752, -43.18556],
      [-22.97404, -43.18468],
      [-22.97316, -43.18382],
      [-22.97268, -43.18334],
      [-22.9722, -43.18283],
      [-22.96991, -43.17973],
      [-22.96633, -43.17246],
    ],
  },
  {
    city: "Saquarema",
    uf: "RJ",
    beach: "Praia de Itaúna",
    coast: [
      [-22.93779, -42.47475],
      [-22.93769, -42.47333],
      [-22.93734, -42.47111],
      [-22.93715, -42.46845],
      [-22.93599, -42.46473],
      [-22.93552, -42.46159],
      [-22.93538, -42.45897],
    ],
  },
  {
    city: "Cabo Frio",
    uf: "RJ",
    beach: "Praia do Forte",
    coast: [
      [-22.89655, -42.02701],
      [-22.89325, -42.02436],
      [-22.89114, -42.02257],
      [-22.88929, -42.02077],
      [-22.88829, -42.01975],
      [-22.88639, -42.0177],
      [-22.88492, -42.01571],
      [-22.88314, -42.01302],
      [-22.88256, -42.01049],
      [-22.88288, -42.00889],
      [-22.88381, -42.00753],
      [-22.88503, -42.00715],
      [-22.8853, -42.00739],
    ],
  },
  {
    city: "Guarapari",
    uf: "ES",
    beach: "Praia do Morro",
    coast: [
      [-20.65644, -40.49057],
      [-20.65501, -40.48822],
      [-20.65319, -40.48422],
      [-20.65249, -40.48068],
      [-20.65254, -40.47912],
      [-20.65293, -40.47905],
      [-20.65305, -40.47907],
      [-20.65303, -40.47862],
      [-20.65266, -40.47853],
      [-20.65294, -40.47695],
      [-20.6537, -40.4751],
      [-20.65482, -40.47378],
      [-20.65525, -40.47363],
    ],
  },
  {
    city: "Vitória",
    uf: "ES",
    beach: "Praia de Camburi",
    coast: [
      [-20.28138, -40.28754],
      [-20.28085, -40.28719],
      [-20.28043, -40.2868],
      [-20.27886, -40.28517],
      [-20.27809, -40.28433],
      [-20.27624, -40.28174],
      [-20.27561, -40.28077],
    ],
  },
  {
    city: "Conceição da Barra",
    uf: "ES",
    beach: "Praia de Itaúnas",
    coast: [
      [-18.44052, -39.70668],
      [-18.43654, -39.7053],
      [-18.43536, -39.70488],
      [-18.43332, -39.70419],
      [-18.43062, -39.70326],
      [-18.42869, -39.70258],
      [-18.42708, -39.70204],
    ],
  },
  {
    city: "Porto Seguro",
    uf: "BA",
    beach: "Praia de Taperapuã",
    coast: [
      [-16.41765, -39.05177],
      [-16.41623, -39.05129],
      [-16.41484, -39.05065],
      [-16.41317, -39.04958],
      [-16.4123, -39.049],
      [-16.40918, -39.04742],
      [-16.40618, -39.04584],
      [-16.4044, -39.04436],
      [-16.40326, -39.04307],
      [-16.40261, -39.04251],
    ],
  },
  {
    city: "Ilhéus",
    uf: "BA",
    beach: "Praia dos Milionários",
    coast: [
      [-14.86869, -39.02361],
      [-14.86261, -39.024],
      [-14.8591, -39.02408],
      [-14.85108, -39.02435],
      [-14.84644, -39.02453],
    ],
  },
  {
    city: "Mata de São João",
    uf: "BA",
    beach: "Praia do Forte",
    coast: [
      [-12.58211, -38.01269],
      [-12.58185, -38.00981],
      [-12.58105, -38.00669],
      [-12.57914, -38.00459],
      [-12.57854, -38.004],
      [-12.5781, -38.00335],
      [-12.57799, -38.00263],
      [-12.57802, -38.00183],
      [-12.57531, -38.00018],
      [-12.57178, -37.99846],
      [-12.56827, -37.99559],
      [-12.56728, -37.99497],
    ],
  },
  {
    city: "Salvador",
    uf: "BA",
    beach: "Praia de Itapuã",
    coast: [
      [-12.95089, -38.36979],
      [-12.95105, -38.36741],
      [-12.95065, -38.3646],
      [-12.95106, -38.36379],
      [-12.95151, -38.3632],
      [-12.95224, -38.36247],
      [-12.953, -38.36247],
      [-12.9538, -38.36137],
      [-12.95625, -38.35889],
      [-12.95647, -38.35806],
      [-12.95668, -38.35661],
      [-12.95668, -38.3553],
    ],
  },
  {
    city: "Aracaju",
    uf: "SE",
    beach: "Praia de Atalaia",
    coast: [
      [-10.99579, -37.05007],
      [-10.99332, -37.0479],
      [-10.9911, -37.04586],
      [-10.98927, -37.04401],
      [-10.98701, -37.04203],
      [-10.98345, -37.03902],
      [-10.98185, -37.03667],
      [-10.98049, -37.03565],
      [-10.97942, -37.03487],
      [-10.9784, -37.03451],
    ],
  },
  {
    city: "Maceió",
    uf: "AL",
    beach: "Praia de Pajuçara",
    coast: [
      [-9.67443, -35.71669],
      [-9.6722, -35.71529],
      [-9.6703, -35.71399],
      [-9.66915, -35.71309],
      [-9.66698, -35.71106],
      [-9.66549, -35.70936],
      [-9.6649, -35.70835],
      [-9.66481, -35.70814],
    ],
  },
  {
    city: "Ipojuca",
    uf: "PE",
    beach: "Porto de Galinhas",
    coast: [
      [-8.51629, -35.00551],
      [-8.51461, -35.00501],
      [-8.51254, -35.00375],
      [-8.51202, -35.00337],
      [-8.51143, -35.0026],
      [-8.51043, -35.00084],
      [-8.50625, -35.00017],
      [-8.50405, -35.00059],
      [-8.5024, -35.00218],
      [-8.49943, -35.00315],
      [-8.49371, -35.00258],
      [-8.49248, -35.00229],
    ],
  },
  {
    city: "Recife",
    uf: "PE",
    beach: "Praia de Boa Viagem",
    coast: [
      [-8.14298, -34.9035],
      [-8.13949, -34.90228],
      [-8.13668, -34.90123],
      [-8.13454, -34.9006],
      [-8.13301, -34.89995],
      [-8.1318, -34.8995],
      [-8.13096, -34.89914],
      [-8.12918, -34.89829],
      [-8.12703, -34.89733],
      [-8.12391, -34.89627],
      [-8.12198, -34.89533],
      [-8.11998, -34.89414],
      [-8.11873, -34.89341],
    ],
  },
  {
    city: "João Pessoa",
    uf: "PB",
    beach: "Praia de Tambaú",
    coast: [
      [-7.11961, -34.82278],
      [-7.11936, -34.82275],
      [-7.1174, -34.82241],
      [-7.11565, -34.822],
      [-7.11507, -34.82176],
      [-7.11414, -34.8214],
      [-7.11368, -34.82122],
      [-7.11256, -34.82103],
      [-7.11212, -34.82101],
      [-7.1116, -34.82115],
      [-7.11137, -34.82121],
    ],
  },
  {
    city: "Tibau do Sul",
    uf: "RN",
    beach: "Praia da Pipa",
    coast: [
      [-6.2273, -35.0425],
      [-6.22694, -35.0437],
      [-6.2268, -35.04482],
      [-6.22753, -35.04582],
      [-6.22783, -35.04732],
      [-6.22781, -35.04868],
      [-6.2278, -35.05054],
      [-6.22745, -35.05243],
      [-6.22712, -35.05381],
      [-6.22655, -35.05572],
      [-6.22713, -35.05672],
      [-6.22773, -35.05941],
    ],
  },
  {
    city: "Natal",
    uf: "RN",
    beach: "Praia de Ponta Negra",
    coast: [
      [-5.88211, -35.16999],
      [-5.88126, -35.17108],
      [-5.87972, -35.1726],
      [-5.87815, -35.17384],
      [-5.87701, -35.17466],
      [-5.87531, -35.17557],
      [-5.87279, -35.17689],
      [-5.8714, -35.17758],
    ],
  },
  {
    city: "Aracati",
    uf: "CE",
    beach: "Praia de Canoa Quebrada",
    coast: [
      [-4.53765, -37.68361],
      [-4.53692, -37.68392],
      [-4.53567, -37.68525],
      [-4.53385, -37.68711],
      [-4.53302, -37.68803],
      [-4.53241, -37.69017],
      [-4.53185, -37.69196],
      [-4.52949, -37.69473],
      [-4.52662, -37.69774],
      [-4.5256, -37.69875],
      [-4.52468, -37.70049],
      [-4.52396, -37.70166],
      [-4.52268, -37.70313],
    ],
  },
  {
    city: "Fortaleza",
    uf: "CE",
    beach: "Praia do Futuro",
    coast: [
      [-3.75733, -38.44264],
      [-3.75461, -38.44378],
      [-3.75216, -38.44497],
      [-3.75141, -38.44552],
      [-3.74809, -38.44699],
      [-3.74337, -38.44984],
      [-3.73769, -38.45279],
    ],
  },
  {
    city: "Luís Correia",
    uf: "PI",
    beach: "Praia de Atalaia",
    coast: [
      [-2.88714, -41.63131],
      [-2.88571, -41.63324],
      [-2.88411, -41.63508],
      [-2.88086, -41.63904],
      [-2.87787, -41.64175],
      [-2.87224, -41.64721],
      [-2.86946, -41.64964],
    ],
  },
  {
    city: "São Luís",
    uf: "MA",
    beach: "Praia do Calhau",
    coast: [
      [-2.4796, -44.23755],
      [-2.47995, -44.24012],
      [-2.48034, -44.24199],
      [-2.48104, -44.24341],
      [-2.48164, -44.24613],
      [-2.48205, -44.2492],
      [-2.48202, -44.252],
      [-2.48159, -44.25539],
      [-2.48163, -44.25806],
      [-2.48178, -44.26053],
      [-2.48197, -44.26193],
      [-2.48216, -44.26307],
    ],
  },
  {
    city: "Salinópolis",
    uf: "PA",
    beach: "Praia do Atalaia",
    coast: [
      [-0.60487, -47.28831],
      [-0.60424, -47.28826],
      [-0.60357, -47.28831],
      [-0.60294, -47.28841],
      [-0.60224, -47.28879],
      [-0.60169, -47.2893],
      [-0.60057, -47.28989],
      [-0.5993, -47.2911],
      [-0.59816, -47.29269],
      [-0.59748, -47.29449],
      [-0.59732, -47.29558],
      [-0.59695, -47.29719],
    ],
  },
]

function alongCoast(coast: [number, number][]): [number, number] {
  const i = Math.floor(rand() * (coast.length - 1))
  const [a, b] = [coast[i]!, coast[i + 1] ?? coast[i]!]
  const t = rand()
  return [
    round(a[0] + (b[0] - a[0]) * t + between(-0.00015, 0.00015), 5),
    round(a[1] + (b[1] - a[1]) * t + between(-0.00015, 0.00015), 5),
  ]
}

const SAMPLE_TYPES = [
  "tecido fresco",
  "tecido em RNAlater",
  "tecido em formol 10%",
  "soro",
  "swab",
] as const
const STORAGE = [
  ["Freezer -80 A, caixa 3", -80],
  ["Freezer -80 B, caixa 1", -80],
  ["Freezer -20, gaveta 2", -20],
  ["Geladeira, prateleira 1", 4],
  ["Armário de formol", 25],
] as const

const LESIONS = [
  ["pulmao", "Edema pulmonar", "Difusa", "Moderada"],
  ["pulmao", "Broncopneumonia", "Multifocal", "Acentuada"],
  ["figado", "Congestão hepática", "Difusa", "Leve"],
  ["estomago", "Úlcera gástrica", "Focal", "Moderada"],
  ["linfonodo", "Linfadenomegalia", "Multifocal", "Leve"],
  ["pele", "Marcas de rede", "Multifocal", "Moderada"],
] as const
const HISTO = [
  ["pulmao", "Broncopneumonia supurativa com sincícios"],
  ["figado", "Hepatite necrosante multifocal"],
  ["encefalo", "Meningoencefalite não supurativa"],
  ["linfonodo", "Depleção linfoide"],
] as const

async function main() {
  console.log("Limpando dados de demonstração anteriores…")
  await cleanup()

  console.log("Usuários…")
  const marina = await createUser("marina", "Marina Nunes")
  const rafael = await createUser("rafael", "Rafael Costa")
  const julia = await createUser("julia", "Júlia Martins")
  const pedro = await createUser("pedro", "Pedro Henrique Alves")
  const carla = await createUser("carla", "Carla Souza")
  const thiago = await createUser("thiago", "Thiago Lima")
  const ana = await createUser("ana", "Ana Beatriz Rocha")
  const admin = await createUser("admin", "Administração MARES", true)
  const everyone = [marina, rafael, julia, pedro, carla, thiago, ana, admin]

  const lamaq = await prisma.organization.create({
    data: { ...DEMO_ORGS.lamaq, country: "BR" },
  })
  const gefam = await prisma.organization.create({
    data: { ...DEMO_ORGS.gefam, country: "BR" },
  })
  await prisma.membership.createMany({
    data: [
      { userId: marina.id, orgId: lamaq.id, role: "ORG_ADMIN" },
      { userId: rafael.id, orgId: lamaq.id, role: "RESEARCHER" },
      { userId: julia.id, orgId: lamaq.id, role: "RESEARCHER" },
      { userId: pedro.id, orgId: lamaq.id, role: "RESEARCHER" },
      // Segundo admin do grupo: "Tornar pesquisador" só é bloqueado para o único admin.
      { userId: ana.id, orgId: lamaq.id, role: "ORG_ADMIN" },
      { userId: carla.id, orgId: gefam.id, role: "ORG_ADMIN" },
      { userId: thiago.id, orgId: gefam.id, role: "RESEARCHER" },
      // Pessoa em dois grupos (troca de grupo).
      { userId: rafael.id, orgId: gefam.id, role: "RESEARCHER" },
    ],
  })
  await prisma.userSampleType.createMany({
    data: ["tecido fresco", "tecido em RNAlater", "tecido em formol 10%", "soro"].map((value) => ({
      userId: marina.id,
      value,
    })),
  })

  console.log("Catálogos…")
  for (const [key, pt, en] of SYSTEMS) {
    await prisma.necropsySystem.upsert({
      where: { key },
      update: {},
      create: { key, name: { pt, en } },
    })
  }
  const systems = await prisma.necropsySystem.findMany({
    where: { key: { in: SYSTEMS.map((s) => s[0]) } },
  })
  const organIds = new Map(
    (await prisma.organ.findMany({ select: { key: true, id: true } })).map((o) => [o.key, o.id]),
  )
  const organ = async (key: string) => {
    const id = organIds.get(key)
    if (!id) throw new Error(`Órgão ausente no catálogo: ${key}`)
    return id
  }
  const pathogen = async (key: string) =>
    (await prisma.pathogen.findUniqueOrThrow({ where: { key } })).id
  const exam = async (key: string) =>
    (await prisma.examType.findUniqueOrThrow({ where: { key } })).id
  const O = {
    figado: await organ("figado"),
    pulmao: await organ("pulmao"),
    linfonodo: await organ("linfonodo"),
    encefalo: await organ("encefalo"),
    baco: await organ("baco"),
    soro: await organ("soro"),
    gastrico: await organ("conteudo_gastrico"),
  }
  const P = {
    cemv: await pathogen("cetacean_morbillivirus"),
    toxo: await pathogen("toxoplasma_gondii"),
    brucella: await pathogen("brucella_ceti"),
    herpes: await pathogen("herpesvirus_alhv1"),
    lepto: await pathogen("leptospira_sp"),
    plastico: await pathogen("contaminacao_plastico"),
  }
  const E = {
    qpcr: await exam("qpcr"),
    pcr: await exam("pcr_convencional"),
    npcr: await exam("npcr"),
    elisa: await exam("elisa"),
    plastico: await exam("pesquisa_plastico"),
  }
  const quantitative = new Set([E.qpcr, E.elisa])

  console.log("Pesquisas…")
  const research = (
    name: string,
    orgId: string,
    createdById: string,
    isPublic: boolean,
    description: string,
    members: string[],
  ) =>
    prisma.research.create({
      data: {
        name,
        orgId,
        createdById,
        isPublic,
        description,
        members: { create: members.map((userId) => ({ userId })) },
      },
    })
  const sanidade = await research(
    "Sanidade da fauna marinha da costa brasileira",
    lamaq.id,
    marina.id,
    true,
    "Vigilância de patógenos em mamíferos e quelônios marinhos encalhados, do RS ao PA.",
    [marina.id, rafael.id, julia.id],
  )
  const toninha = await research(
    "Monitoramento de Pontoporia blainvillei",
    lamaq.id,
    rafael.id,
    true,
    "Série histórica de encalhes de toninha, do RS ao ES, e causas de morte.",
    [rafael.id, julia.id],
  )
  const morbili = await research(
    "Morbilivírus em Sotalia guianensis",
    lamaq.id,
    julia.id,
    false,
    "Estudo de surtos de CeMV em boto-cinza ao longo da costa.",
    [julia.id],
  )
  const tartarugas = await research(
    "Quelônios marinhos e resíduos sólidos",
    lamaq.id,
    marina.id,
    false,
    "Ingestão de resíduos sólidos por tartarugas-verdes.",
    [marina.id, pedro.id],
  )
  const litoralNorte = await research(
    "Encalhes no litoral norte de SC",
    gefam.id,
    carla.id,
    true,
    "Monitoramento de praias entre Itajaí e São Francisco do Sul.",
    [carla.id, thiago.id, rafael.id],
  )
  await prisma.researchAccessRequest.create({
    data: {
      researchId: morbili.id,
      userId: pedro.id,
      message: "Gostaria de acompanhar os resultados de CeMV para a minha dissertação.",
    },
  })

  const protocols: Record<string, { organId: string; pathogenId: string; examTypeId: string }[]> = {
    [sanidade.id]: [
      { organId: O.pulmao, pathogenId: P.cemv, examTypeId: E.qpcr },
      { organId: O.linfonodo, pathogenId: P.cemv, examTypeId: E.qpcr },
      { organId: O.figado, pathogenId: P.toxo, examTypeId: E.pcr },
      { organId: O.encefalo, pathogenId: P.toxo, examTypeId: E.pcr },
      { organId: O.figado, pathogenId: P.brucella, examTypeId: E.qpcr },
      { organId: O.pulmao, pathogenId: P.herpes, examTypeId: E.npcr },
    ],
    [toninha.id]: [
      { organId: O.pulmao, pathogenId: P.cemv, examTypeId: E.qpcr },
      { organId: O.figado, pathogenId: P.toxo, examTypeId: E.pcr },
      { organId: O.soro, pathogenId: P.lepto, examTypeId: E.elisa },
    ],
    [morbili.id]: [
      { organId: O.pulmao, pathogenId: P.cemv, examTypeId: E.qpcr },
      { organId: O.linfonodo, pathogenId: P.cemv, examTypeId: E.qpcr },
      { organId: O.baco, pathogenId: P.cemv, examTypeId: E.qpcr },
    ],
    [tartarugas.id]: [{ organId: O.gastrico, pathogenId: P.plastico, examTypeId: E.plastico }],
    [litoralNorte.id]: [
      { organId: O.pulmao, pathogenId: P.cemv, examTypeId: E.qpcr },
      { organId: O.figado, pathogenId: P.brucella, examTypeId: E.qpcr },
    ],
  }
  for (const [researchId, list] of Object.entries(protocols)) {
    for (const p of list) await prisma.researchProtocol.create({ data: { researchId, ...p } })
  }
  // Combinação aposentada: aparece com "Mostrar inativos".
  await prisma.researchProtocol.create({
    data: {
      researchId: sanidade.id,
      organId: O.baco,
      pathogenId: P.herpes,
      examTypeId: E.pcr,
      status: "INACTIVE",
      deactivatedAt: new Date("2026-05-02"),
    },
  })

  console.log("Animais, amostras, análises e laudos…")
  type Plan = {
    research: { id: string }
    orgId: string
    prefix: string
    count: number
    authors: string[]
    species?: Species
    // Restringe as praias (ex.: um grupo que só monitora o próprio litoral).
    beaches?: (b: Beach) => boolean
  }
  const plans: Plan[] = [
    {
      research: sanidade,
      orgId: lamaq.id,
      prefix: "MM",
      count: 230,
      authors: [marina.id, rafael.id, julia.id],
    },
    {
      research: toninha,
      orgId: lamaq.id,
      prefix: "TN",
      count: 90,
      authors: [rafael.id, julia.id],
      species: species("Pontoporia blainvillei"),
    },
    {
      research: morbili,
      orgId: lamaq.id,
      prefix: "MB",
      count: 50,
      authors: [julia.id],
      species: species("Sotalia guianensis"),
    },
    {
      research: tartarugas,
      orgId: lamaq.id,
      prefix: "QT",
      count: 40,
      authors: [marina.id, pedro.id],
      species: species("Chelonia mydas"),
    },
    {
      research: litoralNorte,
      orgId: gefam.id,
      prefix: "LN",
      count: 80,
      authors: [carla.id, thiago.id],
      beaches: (b) =>
        [
          "Itajaí",
          "Balneário Camboriú",
          "Penha",
          "Barra Velha",
          "São Francisco do Sul",
          "Bombinhas",
        ].includes(b.city),
    },
  ]

  const created: { id: string; researchId: string; orgId: string; species: string | null }[] = []
  let sampleSeq = 0
  // Sequencial: o identificador SIMBA é único por grupo.
  let simbaSeq = 0
  for (const plan of plans) {
    for (let i = 1; i <= plan.count; i++) {
      const beach = pick(
        BEACHES.filter(
          (b) =>
            (plan.beaches?.(b) ?? true) &&
            (!plan.species || plan.species.ufs.includes(b.uf as never)),
        ),
      )
      const sp =
        plan.species ?? pick(weightedSpecies.filter((x) => x.ufs.includes(beach.uf as never)))
      const undetermined = !plan.species && chance(0.04)
      const noPlace = chance(0.06)
      const [lat, lon] = alongCoast(beach.coast)
      const date = new Date(Date.UTC(2025, 0, 1) + Math.floor(rand() * 670) * 86_400_000)
      const necropsied = chance(0.55)
      const len = round(between(sp.len[0], sp.len[1]), 0)
      const authorId = pick(plan.authors)
      const animal = await prisma.animal.create({
        data: {
          controlId: `${plan.prefix}-${date.getUTCFullYear()}-${String(i).padStart(4, "0")}`,
          // Faixa fictícia, fora dos números reais do SIMBA: "Buscar no SIMBA" não pode trazer
          // um encalhe real para um registro inventado.
          simbaRecordNumber: chance(0.7) ? `DEMO-${90_000 + ++simbaSeq}` : null,
          species: undetermined ? null : sp.name,
          taxonFamily: undetermined ? null : sp.family,
          taxonOrder: undetermined ? null : sp.order,
          sex: pick(["M", "F", "F", "M", "U"]),
          lifeStage: pick(["ADULT", "ADULT", "JUVENILE", "JUVENILE", "PUP", "UNDETERMINED"]),
          bodyCondition: chance(0.7) ? `Código ${pick([2, 2, 3, 3, 4, 5])}` : null,
          decompositionStage: chance(0.6) ? pick(["Bom", "Regular", "Caquético"]) : null,
          deathCondition: chance(0.5)
            ? pick(["Natural", "Interação com pesca", "Indeterminada"])
            : null,
          eventDate: date,
          municipality: noPlace ? null : beach.city,
          state: noPlace ? null : beach.uf,
          strandingBeach: noPlace || chance(0.2) ? null : beach.beach,
          strandingLat: noPlace ? null : lat,
          strandingLon: noPlace ? null : lon,
          executingInstitution: chance(0.6) ? "Projeto de Monitoramento de Praias (PMP-BS)" : null,
          macroscopicNotes: chance(0.3)
            ? pick([
                "Carcaça com marcas de rede na nadadeira peitoral.",
                "Animal encontrado vivo, morreu durante o atendimento.",
                "Lesões de pele compatíveis com interação com embarcação.",
              ])
            : null,
          // A maioria é publicada; alguns ficam retidos pelo grupo.
          isPublic: chance(0.85),
          necropsyDate: necropsied ? new Date(date.getTime() + 86_400_000) : null,
          necropsyWeightKg: necropsied ? round(between(12, 160), 1) : null,
          anthropicInteraction: necropsied ? chance(0.35) : null,
          giContentCollected: necropsied ? chance(0.6) : null,
          giSolidWaste: necropsied ? chance(sp.group === "Quelônio" ? 0.7 : 0.15) : null,
          giDetailedScreening: necropsied ? chance(0.4) : null,
          measurements: chance(0.7)
            ? ({
                group: sp.group,
                unit: "cm",
                measures:
                  sp.group === "Quelônio"
                    ? [
                        { label: "Comprimento curvilíneo da carapaça", value: len },
                        { label: "Largura curvilínea da carapaça", value: round(len * 0.9, 0) },
                        { label: "Peso", value: null },
                      ]
                    : [
                        { label: "Comprimento total", value: len },
                        { label: "Comprimento rostro–olho", value: round(len * 0.16, 1) },
                        { label: "Circunferência axilar", value: round(len * 0.55, 0) },
                        {
                          label: "Envergadura da nadadeira caudal",
                          value: chance(0.8) ? round(len * 0.25, 0) : null,
                        },
                      ],
              } as Prisma.InputJsonValue)
            : undefined,
          researchId: plan.research.id,
          orgId: plan.orgId,
        },
      })
      created.push({
        id: animal.id,
        researchId: plan.research.id,
        orgId: plan.orgId,
        species: animal.species,
      })

      await prisma.auditLog.create({
        data: {
          userId: authorId,
          entity: "Animal",
          entityId: animal.id,
          field: "created",
          newValue: animal.controlId,
          changedAt: new Date(date.getTime() + 2 * 86_400_000),
        },
      })

      if (necropsied) {
        if (animal.anthropicInteraction) {
          await prisma.anthropicInteraction.create({
            data: {
              animalId: animal.id,
              type: pick(["FISHERY", "FISHERY", "WASTE", "VESSEL"]),
              degree: 1 + Math.floor(rand() * 3),
            },
          })
        }
        const chosen = systems.filter(() => chance(0.5)).slice(0, 4)
        for (const [pos, sys] of chosen.entries()) {
          const status = pick(["NO_CHANGE", "ALTERED", "ALTERED", "NOT_EXAMINED"] as const)
          const examRow = await prisma.necropsySystemExam.create({
            data: {
              animalId: animal.id,
              systemId: sys.id,
              position: pos + 1,
              status,
              notExaminedReason: status === "NOT_EXAMINED" ? "Autólise avançada" : null,
            },
          })
          if (status === "ALTERED") {
            const n = 1 + Math.floor(rand() * 2)
            for (let f = 0; f < n; f++) {
              const [organKey, lesion, distribution, severity] = pick(LESIONS)
              const parasites = chance(0.3)
              await prisma.grossFinding.create({
                data: {
                  examId: examRow.id,
                  organId: await organ(organKey),
                  lesion,
                  distribution,
                  severity,
                  site: chance(0.4)
                    ? pick(["Lobo cranial", "Terço médio", "Região ventral"])
                    : null,
                  parasitesPresent: parasites,
                  parasitesCollected: parasites ? chance(0.6) : null,
                  parasiteCount: parasites && chance(0.5) ? 1 + Math.floor(rand() * 40) : null,
                  position: f + 1,
                },
              })
            }
          }
        }
        if (chance(0.5)) {
          const items = HISTO.filter(() => chance(0.4))
          for (const [pos, [organKey, finding]] of items.entries()) {
            await prisma.histopathologyFinding.create({
              data: {
                animalId: animal.id,
                organId: await organ(organKey),
                finding,
                position: pos + 1,
              },
            })
          }
        }
      }

      const combos = protocols[plan.research.id] ?? []
      if (combos.length === 0 || !necropsied) continue
      const organs = [...new Set(combos.map((c) => c.organId))].filter(() => chance(0.75))
      for (const organId of organs) {
        sampleSeq++
        const [location, temp] = pick(STORAGE)
        const sample = await prisma.sample.create({
          data: {
            animalId: animal.id,
            researchId: plan.research.id,
            organId,
            orgId: plan.orgId,
            identification: `AM-${String(sampleSeq).padStart(4, "0")}`,
            sampleType: pick(SAMPLE_TYPES),
            collectionDate: animal.necropsyDate,
            storageLocation: location,
            storageTemp: temp,
            status: pick(["STORED", "STORED", "STORED", "IN_USE", "DEPLETED", "DEGRADED"]),
            notes: chance(0.15) ? "Repetido em duplicata." : null,
            createdById: authorId,
          },
        })
        for (const c of combos.filter((c) => c.organId === organId)) {
          const roll = rand()
          const result =
            roll < 0.15
              ? "POSITIVO"
              : roll < 0.22
                ? "INCONCLUSIVO"
                : roll < 0.85
                  ? "NEGATIVO"
                  : null
          await prisma.analysis.create({
            data: {
              sampleId: sample.id,
              pathogenId: c.pathogenId,
              examTypeId: c.examTypeId,
              result,
              measureValue:
                result && quantitative.has(c.examTypeId)
                  ? c.examTypeId === E.elisa
                    ? round(between(0.1, 2.4), 2)
                    : round(result === "POSITIVO" ? between(22, 33) : between(36, 40), 1)
                  : null,
              notes: result === "INCONCLUSIVO" ? "Amplificação tardia; repetir." : null,
            },
          })
        }
      }
    }
  }

  console.log("Compartilhamentos entre pesquisas…")
  const fromSanidade = created.filter(
    (a) => a.researchId === sanidade.id && a.species === "Pontoporia blainvillei",
  )
  for (const [i, a] of fromSanidade.slice(0, 5).entries()) {
    await prisma.animalResearch.create({
      data: {
        animalId: a.id,
        researchId: toninha.id,
        status: i === 4 ? "PENDING" : "ACCEPTED",
        origin: "INVITE",
        invitedById: marina.id,
        message: i === 4 ? "Indivíduo de interesse para a série histórica da toninha." : null,
        respondedAt: i === 4 ? null : new Date("2026-06-10"),
        // Um deles foi arquivado pela pesquisa participante.
        hiddenAt: i === 2 ? new Date("2026-08-01") : null,
      },
    })
  }
  const sotalias = created.filter(
    (a) => a.researchId === sanidade.id && a.species === "Sotalia guianensis",
  )
  if (sotalias[0]) {
    await prisma.animalResearch.create({
      data: {
        animalId: sotalias[0].id,
        researchId: morbili.id,
        status: "ACCEPTED",
        invitedById: julia.id,
        respondedAt: new Date("2026-04-20"),
      },
    })
    // Arquivado pela própria pesquisa de origem, enquanto a outra continua a estudá-lo.
    await prisma.animal.update({
      where: { id: sotalias[0].id },
      data: { primaryHiddenAt: new Date("2026-09-15") },
    })
  }

  console.log("Glossário, acesso e feedback…")
  const bacteria = await prisma.pathogenGroup.findUniqueOrThrow({ where: { key: "bacteria" } })
  const lamaqName = DEMO_ORGS.lamaq.name
  await prisma.catalogRequest.createMany({
    data: [
      {
        type: "ORGAN",
        payload: { namePt: "Linfonodo pulmonar", nameEn: "Pulmonary lymph node" },
        requestedById: rafael.id,
        requestedByEmail: rafael.email,
        orgId: lamaq.id,
        orgName: lamaqName,
      },
      {
        type: "PATHOGEN",
        payload: {
          groupId: bacteria.id,
          scientificName: "Vibrio parahaemolyticus",
          taxonRank: "species",
          taxonFamily: "Vibrionaceae",
          taxonOrder: "Vibrionales",
        },
        requestedById: julia.id,
        requestedByEmail: julia.email,
        orgId: lamaq.id,
        orgName: lamaqName,
      },
      {
        type: "SYSTEM",
        payload: { namePt: "Sistema endócrino", nameEn: "Endocrine system" },
        status: "REJECTED",
        reviewNote: "Os achados endócrinos ficam no sistema urogenital neste protocolo.",
        reviewedById: marina.id,
        reviewedAt: new Date("2026-10-02"),
        requestedById: pedro.id,
        requestedByEmail: pedro.email,
        orgId: lamaq.id,
        orgName: lamaqName,
      },
    ],
  })
  await prisma.joinRequest.create({
    data: {
      email: EMAIL("solicitante"),
      requesterName: "Luísa Fernandes",
      organizationName: "Instituto de Pesquisa Cananéia",
    },
  })

  console.log("Tickets de feedback…")
  await ensureBucket(FEEDBACK_BUCKET)
  type Party = "AUTHOR" | "ADMIN"
  type Ticket = {
    author: { id: string; email: string }
    orgId: string
    type: "SUGGESTION" | "BUG"
    status: "NEW" | "IN_REVIEW" | "RESOLVED" | "WONT_FIX" | "REOPENED"
    title: string
    message: string
    pageUrl: string
    // Imagens anexadas ao relato original.
    reportImages?: string[]
    thread?: { party: Party; body: string; images?: string[] }[]
    resolutionNote?: string
    adminNote?: string
    // Quem já leu a última mensagem; o outro lado vê o aviso de mensagem nova.
    readBy?: Party[]
    daysAgo: number
  }
  const tickets: Ticket[] = [
    {
      author: rafael,
      orgId: lamaq.id,
      type: "BUG",
      status: "NEW",
      title: "Mapa não carrega no Firefox",
      message:
        "Ao abrir o Mapa no Firefox 132 a área fica cinza e os marcadores não aparecem. No Chrome funciona.",
      pageUrl: "/app/map",
      reportImages: ["Mapa em branco no Firefox", "Console do navegador"],
      daysAgo: 1,
    },
    {
      author: julia,
      orgId: lamaq.id,
      type: "SUGGESTION",
      status: "NEW",
      title: "Exportar amostras por freezer",
      message:
        "Seria útil exportar a lista de amostras filtrada pelo local de estoque, para conferir o inventário de cada freezer.",
      pageUrl: "/app/animals",
      daysAgo: 2,
    },
    {
      author: thiago,
      orgId: gefam.id,
      type: "BUG",
      status: "NEW",
      title: "Botão Salvar some na biometria",
      message:
        "Com muitas medidas na biometria, o botão Salvar fica fora da tela e não dá para rolar.",
      pageUrl: "/app/animals",
      daysAgo: 3,
    },
    {
      author: julia,
      orgId: lamaq.id,
      type: "BUG",
      status: "IN_REVIEW",
      title: "Data da necrópsia some ao editar",
      message:
        "Ao editar o animal MB-2025-0003, a data da necrópsia volta em branco depois de salvar.",
      pageUrl: "/app/animals",
      adminNote: "Reproduzido em teste; provável fuso horário na conversão da data.",
      thread: [
        {
          party: "ADMIN",
          body: "Obrigado pelo relato! Conseguimos reproduzir e estamos investigando.",
        },
        {
          party: "AUTHOR",
          body: "Acontece também no MB-2025-0005. Segue a tela.",
          images: ["Formulário com a data em branco"],
        },
      ],
      readBy: ["AUTHOR"],
      daysAgo: 6,
    },
    {
      author: carla,
      orgId: gefam.id,
      type: "SUGGESTION",
      status: "IN_REVIEW",
      title: "Filtro por praia na lista de animais",
      message:
        "Muitos encalhes se repetem nas mesmas praias; um filtro por praia ajudaria nos relatórios.",
      pageUrl: "/app/animals",
      thread: [
        {
          party: "ADMIN",
          body: "Boa ideia. A praia hoje é texto livre; você usaria uma lista fixa?",
        },
      ],
      readBy: ["ADMIN"],
      daysAgo: 8,
    },
    {
      author: marina,
      orgId: lamaq.id,
      type: "SUGGESTION",
      status: "RESOLVED",
      title: "Mostrar unidade da medida em Análises",
      message: "Na grade de análises a medida quantitativa aparece sem a unidade.",
      pageUrl: "/app/animals",
      thread: [
        { party: "ADMIN", body: "Incluímos a unidade ao lado do valor. Pode conferir?" },
        { party: "AUTHOR", body: "Conferido, ficou ótimo. Obrigada!" },
      ],
      resolutionNote: "Disponível desde a versão de outubro.",
      readBy: ["AUTHOR", "ADMIN"],
      daysAgo: 30,
    },
    {
      author: thiago,
      orgId: gefam.id,
      type: "BUG",
      status: "RESOLVED",
      title: "Contagem de amostras errada na aba",
      message: "A aba Amostras mostrava (3), mas a lista tinha só 2 itens.",
      pageUrl: "/app/animals",
      thread: [
        {
          party: "ADMIN",
          body: "Corrigido: a contagem agora segue as amostras da sua pesquisa.",
        },
      ],
      resolutionNote: "A contagem considerava amostras de outra pesquisa do indivíduo.",
      readBy: ["ADMIN"],
      daysAgo: 21,
    },
    {
      author: pedro,
      orgId: lamaq.id,
      type: "SUGGESTION",
      status: "WONT_FIX",
      title: "Tema com fundo azul",
      message: "Poderia ter uma opção de tema azul-escuro, como o site antigo.",
      pageUrl: "/app/profile",
      resolutionNote:
        "Mantemos apenas os temas claro e escuro, que já passam nos critérios de contraste de acessibilidade.",
      readBy: ["AUTHOR", "ADMIN"],
      daysAgo: 15,
    },
    {
      author: rafael,
      orgId: lamaq.id,
      type: "BUG",
      status: "WONT_FIX",
      title: "Não consigo excluir indivíduo compartilhado",
      message: "O botão Excluir dá erro para o MM-2025-0012.",
      pageUrl: "/app/animals",
      resolutionNote:
        "Comportamento esperado: indivíduo compartilhado não pode ser excluído. Use Arquivar nesta pesquisa.",
      thread: [{ party: "AUTHOR", body: "Entendi, vou arquivar então." }],
      readBy: ["AUTHOR", "ADMIN"],
      daysAgo: 12,
    },
    {
      author: pedro,
      orgId: lamaq.id,
      type: "BUG",
      status: "REOPENED",
      title: "Filtro de UF não limpa",
      message: "Depois de clicar em Limpar filtros, a UF continua selecionada.",
      pageUrl: "/app/animals",
      thread: [
        { party: "ADMIN", body: "Corrigido na última versão." },
        {
          party: "AUTHOR",
          body: "Ainda acontece quando o filtro vem pelo link compartilhado.",
          images: ["Filtro de UF depois de limpar"],
        },
      ],
      readBy: ["AUTHOR"],
      daysAgo: 10,
    },
    {
      author: marina,
      orgId: lamaq.id,
      type: "SUGGESTION",
      status: "REOPENED",
      title: "Avisar quando um compartilhamento for aceito",
      message: "Hoje só dá para saber abrindo o animal; um aviso no painel ajudaria.",
      pageUrl: "/app/dashboard",
      thread: [
        { party: "ADMIN", body: "Incluímos o contador de compartilhamentos pendentes." },
        {
          party: "AUTHOR",
          body: "O contador mostra os pendentes, mas não avisa quando o outro lado aceita.",
        },
        { party: "ADMIN", body: "Faz sentido. Reabrimos para avaliar um aviso de aceite." },
      ],
      readBy: ["ADMIN"],
      daysAgo: 18,
    },
    {
      author: ana,
      orgId: lamaq.id,
      type: "SUGGESTION",
      status: "IN_REVIEW",
      title: "Conversa longa para testar a rolagem",
      message: "Ticket com muitas mensagens, para conferir a rolagem da conversa e o contador.",
      pageUrl: "/app/feedback",
      thread: Array.from({ length: 12 }, (_, i) => ({
        party: (i % 2 === 0 ? "ADMIN" : "AUTHOR") as Party,
        body:
          i % 2 === 0
            ? `Resposta da administração nº ${i / 2 + 1}: seguimos analisando o pedido.`
            : `Complemento nº ${(i + 1) / 2}: mais um detalhe sobre o comportamento observado.`,
      })),
      readBy: [],
      daysAgo: 25,
    },
  ]

  let attachmentCount = 0
  const attach = async (
    feedbackId: string,
    label: string,
    party: Party,
    uploader: string,
    messageId?: string,
  ) => {
    const slug = label
      .normalize("NFD")
      .replace(/[^\w]+/g, "-")
      .toLowerCase()
    const filename = `${slug}.png`
    const path = `${feedbackId}/${crypto.randomUUID()}_${filename}`
    const png = await screenshot(label)
    const up = await auth.storage
      .from(FEEDBACK_BUCKET)
      .upload(path, png, { contentType: "image/png" })
    if (up.error) throw new Error(`Falha ao enviar anexo: ${up.error.message}`)
    await prisma.feedbackAttachment.create({
      data: {
        feedbackId,
        messageId: messageId ?? null,
        url: path,
        mimeType: "image/png",
        filename,
        size: png.length,
        uploadedById: uploader,
        uploadedByParty: party,
      },
    })
    attachmentCount++
  }

  for (const t of tickets) {
    const opened = new Date(Date.now() - t.daysAgo * 86_400_000)
    const fb = await prisma.feedback.create({
      data: {
        type: t.type,
        status: t.status,
        title: t.title,
        message: t.message,
        pageUrl: t.pageUrl,
        createdById: t.author.id,
        createdByEmail: t.author.email,
        orgId: t.orgId,
        adminNote: t.adminNote ?? null,
        resolutionNote: t.resolutionNote ?? null,
        reviewedById: t.status === "NEW" ? null : admin.id,
        reviewedAt: t.status === "NEW" ? null : new Date(opened.getTime() + 3_600_000),
        createdAt: opened,
      },
    })
    for (const label of t.reportImages ?? []) await attach(fb.id, label, "AUTHOR", t.author.id)

    let last = opened
    for (const [i, m] of (t.thread ?? []).entries()) {
      last = new Date(opened.getTime() + (i + 1) * 5 * 3_600_000)
      const who = m.party === "AUTHOR" ? t.author : admin
      const msg = await prisma.feedbackMessage.create({
        data: {
          feedbackId: fb.id,
          party: m.party,
          body: m.body,
          createdById: who.id,
          createdByEmail: who.email,
          createdAt: last,
        },
      })
      for (const label of m.images ?? []) await attach(fb.id, label, m.party, who.id, msg.id)
    }
    const readAt = new Date(last.getTime() + 60_000)
    await prisma.feedback.update({
      where: { id: fb.id },
      data: {
        authorReadAt: t.readBy?.includes("AUTHOR") ? readAt : null,
        adminReadAt: t.readBy?.includes("ADMIN") ? readAt : null,
      },
    })
  }
  console.log(`  ${tickets.length} tickets, ${attachmentCount} anexos`)

  console.log(
    `\nPronto: ${created.length} animais, ${sampleSeq} amostras, ${everyone.length} usuários.`,
  )
  console.log("Logins (senha = DEMO_PASSWORD do .env.teste):")
  for (const [who, role] of [
    [marina, "admin do LAMAQ"],
    [rafael, "pesquisador em dois grupos"],
    [julia, "pesquisadora"],
    [pedro, "pesquisador com pedido de acesso"],
    [carla, "admin do GEFAM"],
    [ana, "segunda admin do LAMAQ"],
    [admin, "admin da aplicação (não participa de grupos)"],
  ] as const) {
    console.log(`  ${who.email.padEnd(26)} ${role}`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
