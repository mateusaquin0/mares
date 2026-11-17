import { createClient } from "@supabase/supabase-js"

import { resolveE2eEnv } from "./env"

// Leitura direta do Storage do projeto de TESTES (Admin API), para os testes conferirem que um
// arquivo enviado pela interface chegou ao bucket — e saiu dele ao ser excluído. O endereço
// assinado que a tela usa não serve para isso: a CDN continua respondendo por um tempo depois
// de o objeto ser removido.
export const MEDIA_BUCKET = "animal-media"
export const FEEDBACK_BUCKET = "feedback-media"

// Nomes dos objetos na pasta do registro (id do animal ou do ticket).
export async function storedObjects(bucket: string, folder: string): Promise<string[]> {
  const { vars } = resolveE2eEnv()
  const admin = createClient(vars.NEXT_PUBLIC_SUPABASE_URL!, vars.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 100 })
  if (error) throw new Error(`Falha ao listar ${bucket}/${folder}: ${error.message}`)
  return data.map((o) => o.name)
}
