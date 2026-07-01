// MARES — Seed dos catálogos globais (Organ, Pathogen, ExamType) + bootstrap do admin global.
// Conforme docs/SEED.md. Idempotente via upsert.

import { Prisma, PrismaClient } from '@prisma/client'
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

// Grupos de patógeno (vocabulário controlado). usesScientificName = usa nome científico.
const pathogenGroups = [
  { key: 'bacteria', namePt: 'Bactérias', nameEn: 'Bacteria', usesScientificName: true },
  { key: 'fungi', namePt: 'Fungos', nameEn: 'Fungi', usesScientificName: true },
  { key: 'protozoa', namePt: 'Protozoários', nameEn: 'Protozoa', usesScientificName: true },
  { key: 'viruses', namePt: 'Vírus', nameEn: 'Viruses', usesScientificName: true },
  { key: 'helminths', namePt: 'Helmintos', nameEn: 'Helminths', usesScientificName: true },
  { key: 'anthropogenic', namePt: 'Ações antrópicas', nameEn: 'Anthropogenic actions', usesScientificName: false },
]

// Grupos científicos: `sci` (nome científico). Ações antrópicas: `namePt`/`nameEn`.
const pathogens: Array<{
  key: string
  groupKey: string
  sci?: string
  namePt?: string
  nameEn?: string
}> = [
  { key: 'toxoplasma_gondii', groupKey: 'protozoa', sci: 'Toxoplasma gondii' },
  { key: 'sarcocystis_sp', groupKey: 'protozoa', sci: 'Sarcocystis sp.' },
  { key: 'neospora_caninum', groupKey: 'protozoa', sci: 'Neospora caninum' },
  { key: 'besnoitia_sp', groupKey: 'protozoa', sci: 'Besnoitia sp.' },
  { key: 'brucella_sp', groupKey: 'bacteria', sci: 'Brucella sp.' },
  { key: 'brucella_ceti', groupKey: 'bacteria', sci: 'Brucella ceti' },
  { key: 'erysipelothrix_rhusiopathiae', groupKey: 'bacteria', sci: 'Erysipelothrix rhusiopathiae' },
  { key: 'leptospira_sp', groupKey: 'bacteria', sci: 'Leptospira sp.' },
  { key: 'mycobacterium_sp', groupKey: 'bacteria', sci: 'Mycobacterium sp.' },
  { key: 'clostridium_sp', groupKey: 'bacteria', sci: 'Clostridium sp.' },
  { key: 'cetacean_morbillivirus', groupKey: 'viruses', sci: 'Cetacean Morbillivirus (CeMV)' },
  { key: 'herpesvirus_alhv1', groupKey: 'viruses', sci: 'Herpesvirus (AlHV-1)' },
  { key: 'influenza_a', groupKey: 'viruses', sci: 'Influenza A' },
  { key: 'coronavirus', groupKey: 'viruses', sci: 'Coronavirus' },
  { key: 'candida_sp', groupKey: 'fungi', sci: 'Candida sp.' },
  { key: 'aspergillus_sp', groupKey: 'fungi', sci: 'Aspergillus sp.' },
  { key: 'cryptococcus_sp', groupKey: 'fungi', sci: 'Cryptococcus sp.' },
  { key: 'anisakis_sp', groupKey: 'helminths', sci: 'Anisakis sp.' },
  { key: 'crassicauda_sp', groupKey: 'helminths', sci: 'Crassicauda sp.' },
  { key: 'contaminacao_plastico', groupKey: 'anthropogenic', namePt: 'Contaminação ambiental (plástico)', nameEn: 'Environmental contamination (plastic)' },
  { key: 'rede_pesca', groupKey: 'anthropogenic', namePt: 'Rede de pesca (captura acidental)', nameEn: 'Fishing net (bycatch)' },
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
    const data = { key: organ.key, name: { pt: organ.namePt, en: organ.nameEn } }
    await prisma.organ.upsert({ where: { key: organ.key }, update: data, create: data })
  }
  const groupIdByKey: Record<string, string> = {}
  for (const g of pathogenGroups) {
    const data = {
      key: g.key,
      name: { pt: g.namePt, en: g.nameEn },
      usesScientificName: g.usesScientificName,
    }
    const row = await prisma.pathogenGroup.upsert({
      where: { key: g.key },
      update: data,
      create: data,
    })
    groupIdByKey[g.key] = row.id
  }
  for (const p of pathogens) {
    // Grupos científicos: scientificName (name nulo). Ações antrópicas: name { pt, en }.
    const data = {
      key: p.key,
      groupId: groupIdByKey[p.groupKey],
      scientificName: p.sci ?? null,
      name: p.sci ? Prisma.DbNull : { pt: p.namePt!, en: p.nameEn! },
    }
    await prisma.pathogen.upsert({ where: { key: p.key }, update: data, create: data })
  }
  for (const e of examTypes) {
    const data = { key: e.key, name: { pt: e.namePt, en: e.nameEn } }
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
