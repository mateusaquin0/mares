import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"

// Fronteira única de variáveis de ambiente: valida no boot/build (falha cedo, com
// mensagem clara) em vez de estourar `undefined` em runtime na frente do usuário.
// Separa server (nunca vai pro bundle do cliente) de client (NEXT_PUBLIC_*, inlinadas
// pelo Next). Importe `env` daqui em vez de acessar `process.env` diretamente.
export const env = createEnv({
  shared: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  },
  server: {
    // Obrigatória: sem ela as rotas admin/service não funcionam.
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    // Integrações externas — opcionais (o código degrada com fallback/condicional).
    SIMBA_API_URL: z.string().url().optional(),
    SIMBA_API_TOKEN: z.string().min(1).optional(),
    NCBI_API_KEY: z.string().min(1).optional(),
    CSC_API_KEY: z.string().min(1).optional(),
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  },
  // NEXT_PUBLIC_* precisam ser referenciadas literalmente para o Next inliná-las.
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SIMBA_API_URL: process.env.SIMBA_API_URL,
    SIMBA_API_TOKEN: process.env.SIMBA_API_TOKEN,
    NCBI_API_KEY: process.env.NCBI_API_KEY,
    CSC_API_KEY: process.env.CSC_API_KEY,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
  // "" conta como ausente (evita passar string vazia por obrigatória).
  emptyStringAsUndefined: true,
  // Testes (vitest) e checagens de CI que não têm as vars não devem quebrar.
  skipValidation: !!process.env.SKIP_ENV_VALIDATION || process.env.NODE_ENV === "test",
})
