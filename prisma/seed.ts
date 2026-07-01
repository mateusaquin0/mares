// MARES — Seed dos catálogos globais (Organ, Pathogen, ExamType) + bootstrap do admin global.
// Conforme docs/SEED.md. Idempotente via upsert.

import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'

const prisma = new PrismaClient()

// Catálogos internacionalizados: cada item tem um `key` estável (slug) + rótulos por idioma.
const organs = [
  { key: 'encefalo', namePt: 'Encéfalo', nameEn: 'Brain' },
  { key: 'cerebelo', namePt: 'Cerebelo', nameEn: 'Cerebellum' },
  { key: 'tronco_encefalico', namePt: 'Tronco Encefálico', nameEn: 'Brainstem' },
  { key: 'pulmao', namePt: 'Pulmão', nameEn: 'Lung' },
  { key: 'coracao', namePt: 'Coração', nameEn: 'Heart' },
  { key: 'figado', namePt: 'Fígado', nameEn: 'Liver' },
  { key: 'baco', namePt: 'Baço', nameEn: 'Spleen' },
  { key: 'rim', namePt: 'Rim', nameEn: 'Kidney' },
  { key: 'estomago', namePt: 'Estômago', nameEn: 'Stomach' },
  { key: 'intestino_delgado', namePt: 'Intestino Delgado', nameEn: 'Small Intestine' },
  { key: 'intestino_grosso', namePt: 'Intestino Grosso', nameEn: 'Large Intestine' },
  { key: 'linfonodo', namePt: 'Linfonodo', nameEn: 'Lymph Node' },
  { key: 'musculo_esqueletico', namePt: 'Músculo Esquelético', nameEn: 'Skeletal Muscle' },
  { key: 'pele', namePt: 'Pele', nameEn: 'Skin' },
  { key: 'olho', namePt: 'Olho', nameEn: 'Eye' },
  { key: 'sangue', namePt: 'Sangue', nameEn: 'Blood' },
  { key: 'soro', namePt: 'Soro', nameEn: 'Serum' },
  { key: 'urina', namePt: 'Urina', nameEn: 'Urine' },
  { key: 'conteudo_gastrico', namePt: 'Conteúdo Gástrico', nameEn: 'Gastric Content' },
  { key: 'glandula_adrenal', namePt: 'Glândula Adrenal', nameEn: 'Adrenal Gland' },
  { key: 'tireoide', namePt: 'Tireoide', nameEn: 'Thyroid' },
  { key: 'glandula_mamaria', namePt: 'Glândula Mamária', nameEn: 'Mammary Gland' },
  { key: 'testiculo', namePt: 'Testículo', nameEn: 'Testis' },
  { key: 'ovario', namePt: 'Ovário', nameEn: 'Ovary' },
  { key: 'utero', namePt: 'Útero', nameEn: 'Uterus' },
  { key: 'bexiga', namePt: 'Bexiga', nameEn: 'Bladder' },
  { key: 'medula_ossea', namePt: 'Medula Óssea', nameEn: 'Bone Marrow' },
  { key: 'placenta', namePt: 'Placenta', nameEn: 'Placenta' },
]

const GROUP = {
  sarcocystid: { pt: 'Protozoário Sarcocistídeo', en: 'Sarcocystid Protozoan' },
  bacteria: { pt: 'Bactéria', en: 'Bacterium' },
  virus: { pt: 'Vírus', en: 'Virus' },
  fungus: { pt: 'Fungo', en: 'Fungus' },
  helminth: { pt: 'Helminto', en: 'Helminth' },
  anthropogenic: { pt: 'Antropogênico', en: 'Anthropogenic' },
} as const

const pathogens = [
  { key: 'toxoplasma_gondii', namePt: 'Toxoplasma gondii', nameEn: 'Toxoplasma gondii', group: GROUP.sarcocystid },
  { key: 'sarcocystis_sp', namePt: 'Sarcocystis sp.', nameEn: 'Sarcocystis sp.', group: GROUP.sarcocystid },
  { key: 'neospora_caninum', namePt: 'Neospora caninum', nameEn: 'Neospora caninum', group: GROUP.sarcocystid },
  { key: 'besnoitia_sp', namePt: 'Besnoitia sp.', nameEn: 'Besnoitia sp.', group: GROUP.sarcocystid },
  { key: 'brucella_sp', namePt: 'Brucella sp.', nameEn: 'Brucella sp.', group: GROUP.bacteria },
  { key: 'brucella_ceti', namePt: 'Brucella ceti', nameEn: 'Brucella ceti', group: GROUP.bacteria },
  { key: 'erysipelothrix_rhusiopathiae', namePt: 'Erysipelothrix rhusiopathiae', nameEn: 'Erysipelothrix rhusiopathiae', group: GROUP.bacteria },
  { key: 'leptospira_sp', namePt: 'Leptospira sp.', nameEn: 'Leptospira sp.', group: GROUP.bacteria },
  { key: 'mycobacterium_sp', namePt: 'Mycobacterium sp.', nameEn: 'Mycobacterium sp.', group: GROUP.bacteria },
  { key: 'clostridium_sp', namePt: 'Clostridium sp.', nameEn: 'Clostridium sp.', group: GROUP.bacteria },
  { key: 'cetacean_morbillivirus', namePt: 'Cetacean Morbillivirus (CeMV)', nameEn: 'Cetacean Morbillivirus (CeMV)', group: GROUP.virus },
  { key: 'herpesvirus_alhv1', namePt: 'Herpesvirus (AlHV-1)', nameEn: 'Herpesvirus (AlHV-1)', group: GROUP.virus },
  { key: 'influenza_a', namePt: 'Influenza A', nameEn: 'Influenza A', group: GROUP.virus },
  { key: 'coronavirus', namePt: 'Coronavirus', nameEn: 'Coronavirus', group: GROUP.virus },
  { key: 'candida_sp', namePt: 'Candida sp.', nameEn: 'Candida sp.', group: GROUP.fungus },
  { key: 'aspergillus_sp', namePt: 'Aspergillus sp.', nameEn: 'Aspergillus sp.', group: GROUP.fungus },
  { key: 'cryptococcus_sp', namePt: 'Cryptococcus sp.', nameEn: 'Cryptococcus sp.', group: GROUP.fungus },
  { key: 'anisakis_sp', namePt: 'Anisakis sp.', nameEn: 'Anisakis sp.', group: GROUP.helminth },
  { key: 'crassicauda_sp', namePt: 'Crassicauda sp.', nameEn: 'Crassicauda sp.', group: GROUP.helminth },
  { key: 'contaminacao_plastico', namePt: 'Contaminação ambiental (plástico)', nameEn: 'Environmental contamination (plastic)', group: GROUP.anthropogenic },
  { key: 'rede_pesca', namePt: 'Rede de pesca (captura acidental)', nameEn: 'Fishing net (bycatch)', group: GROUP.anthropogenic },
]

const examTypes = [
  { key: 'npcr', namePt: 'nPCR', nameEn: 'nested PCR (nPCR)' },
  { key: 'pcr_convencional', namePt: 'PCR convencional', nameEn: 'Conventional PCR' },
  { key: 'qpcr', namePt: 'qPCR (PCR em tempo real)', nameEn: 'qPCR (real-time PCR)' },
  { key: 'histologia', namePt: 'Histologia', nameEn: 'Histology' },
  { key: 'ihq', namePt: 'Imunohistoquímica (IHQ)', nameEn: 'Immunohistochemistry (IHC)' },
  { key: 'cultura_bacteriana', namePt: 'Cultura bacteriana', nameEn: 'Bacterial culture' },
  { key: 'cultura_fungica', namePt: 'Cultura fúngica', nameEn: 'Fungal culture' },
  { key: 'elisa', namePt: 'ELISA', nameEn: 'ELISA' },
  { key: 'soroneutralizacao', namePt: 'Soroneutralização', nameEn: 'Serum neutralization' },
  { key: 'ifi', namePt: 'Imunofluorescência Indireta (IFI)', nameEn: 'Indirect Immunofluorescence (IFA)' },
  { key: 'hai', namePt: 'Hemaglutinação Indireta (HAI)', nameEn: 'Indirect Hemagglutination (IHA)' },
  { key: 'sanger', namePt: 'Sequenciamento Sanger', nameEn: 'Sanger sequencing' },
  { key: 'ngs', namePt: 'Sequenciamento NGS', nameEn: 'NGS sequencing' },
  { key: 'microscopia_eletronica', namePt: 'Microscopia eletrônica', nameEn: 'Electron microscopy' },
  { key: 'necropsia_macroscopica', namePt: 'Necropsia macroscópica', nameEn: 'Gross necropsy' },
  { key: 'citologia', namePt: 'Citologia', nameEn: 'Cytology' },
  { key: 'toxicologia', namePt: 'Toxicologia', nameEn: 'Toxicology' },
  { key: 'pesquisa_plastico', namePt: 'Pesquisa de plástico', nameEn: 'Plastic screening' },
]

// Provisiona o admin global a partir de ADMIN_EMAIL (ver docs/CADASTRO_E_ACESSO.md §5).
async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL?.toLowerCase().trim()
  if (!email) {
    console.log('ADMIN_EMAIL não definido — bootstrap do admin global ignorado.')
    return
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.warn('Supabase service role ausente — não foi possível provisionar o admin global.')
    return
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Se já existe registro local, apenas promove (email é único).
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    await prisma.user.update({ where: { email }, data: { isSystemAdmin: true } })
    console.log(`Admin global garantido: ${email}`)
    return
  }

  // Procura no Auth; se não existir, convida por e-mail. Depois cria o registro local.
  const { data: list } = await admin.auth.admin.listUsers()
  let authUser = list?.users.find((u) => u.email?.toLowerCase() === email)
  if (!authUser) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email)
    if (error || !data.user) {
      console.warn(`Falha ao convidar o admin global (${email}): ${error?.message}`)
      return
    }
    authUser = data.user
  }

  await prisma.user.create({
    data: { id: authUser.id, email, isSystemAdmin: true, status: 'ACTIVE' },
  })
  console.log(`Admin global garantido: ${email}`)
}

async function main() {
  for (const organ of organs) {
    const data = { key: organ.key, namePt: organ.namePt, nameEn: organ.nameEn }
    await prisma.organ.upsert({ where: { key: organ.key }, update: data, create: data })
  }
  for (const p of pathogens) {
    const data = {
      key: p.key,
      namePt: p.namePt,
      nameEn: p.nameEn,
      groupPt: p.group.pt,
      groupEn: p.group.en,
    }
    await prisma.pathogen.upsert({ where: { key: p.key }, update: data, create: data })
  }
  for (const e of examTypes) {
    const data = { key: e.key, namePt: e.namePt, nameEn: e.nameEn }
    await prisma.examType.upsert({ where: { key: e.key }, update: data, create: data })
  }
  console.log(`Seed concluído: ${organs.length} órgãos, ${pathogens.length} patógenos, ${examTypes.length} tipos de exame.`)

  await seedAdmin()
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
