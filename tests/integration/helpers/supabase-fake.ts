import { randomUUID } from "node:crypto"

// Substituto em memória do cliente Supabase com service role (src/lib/supabase/admin.ts),
// registrado para TODA a suíte de integração em tests/integration/setup.ts.
//
// Os testes de integração exercitam o banco de verdade, mas nunca o Auth nem o Storage do
// projeto: um convite real dispararia e-mail (o SMTP de testes tem limite e endereços
// `@test.local` voltam como erro para a caixa do remetente) e um upload real deixaria arquivo
// no bucket. Aqui cada chamada é registrada para o teste conferir o efeito.

type StoredFile = { body: Buffer; contentType: string | undefined }

export const fakeSupabase = {
  // E-mails convidados (inviteUser / resendInvite / auth.admin.inviteUserByEmail), em ordem.
  invites: [] as string[],
  // Ids removidos do Auth (auth.admin.deleteUser).
  deletedUsers: [] as string[],
  // bucket → caminho → arquivo.
  buckets: new Map<string, Map<string, StoredFile>>(),
  // Quando preenchido, a próxima operação do tipo falha com esta mensagem (e o campo é limpo).
  failNext: {
    invite: null as string | null,
    upload: null as string | null,
    deleteUser: null as string | null,
  },

  reset() {
    this.invites.length = 0
    this.deletedUsers.length = 0
    this.buckets.clear()
    this.failNext = { invite: null, upload: null, deleteUser: null }
  },

  files(bucket: string): string[] {
    return [...(this.buckets.get(bucket)?.keys() ?? [])]
  },
}

function takeFailure(kind: keyof typeof fakeSupabase.failNext): string | null {
  const message = fakeSupabase.failNext[kind]
  fakeSupabase.failNext[kind] = null
  return message
}

async function toBuffer(body: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return body
  if (body instanceof ArrayBuffer) return Buffer.from(body)
  if (ArrayBuffer.isView(body)) return Buffer.from(body.buffer, body.byteOffset, body.byteLength)
  if (body instanceof Blob) return Buffer.from(await body.arrayBuffer())
  return Buffer.from(String(body))
}

function invite(email: string) {
  const failure = takeFailure("invite")
  if (failure) return { data: { user: null }, error: { message: failure } }
  fakeSupabase.invites.push(email)
  return { data: { user: { id: randomUUID(), email } }, error: null }
}

export function createAdminClient() {
  return {
    auth: {
      admin: {
        async inviteUserByEmail(email: string) {
          return invite(email)
        },
        async deleteUser(id: string) {
          const failure = takeFailure("deleteUser")
          if (failure) return { data: null, error: { message: failure } }
          fakeSupabase.deletedUsers.push(id)
          return { data: {}, error: null }
        },
        async listUsers() {
          return { data: { users: [] }, error: null }
        },
      },
    },
    storage: {
      async getBucket(name: string) {
        return fakeSupabase.buckets.has(name)
          ? { data: { name }, error: null }
          : { data: null, error: { message: "Bucket not found" } }
      },
      async createBucket(name: string) {
        if (!fakeSupabase.buckets.has(name)) fakeSupabase.buckets.set(name, new Map())
        return { data: { name }, error: null }
      },
      from(bucket: string) {
        const store = () => {
          if (!fakeSupabase.buckets.has(bucket)) fakeSupabase.buckets.set(bucket, new Map())
          return fakeSupabase.buckets.get(bucket)!
        }
        return {
          async upload(path: string, body: unknown, options?: { contentType?: string }) {
            const failure = takeFailure("upload")
            if (failure) return { data: null, error: { message: failure } }
            store().set(path, { body: await toBuffer(body), contentType: options?.contentType })
            return { data: { path }, error: null }
          },
          async remove(paths: string[]) {
            for (const p of paths) store().delete(p)
            return { data: paths.map((name) => ({ name })), error: null }
          },
          async createSignedUrl(path: string, expiresIn: number) {
            return {
              data: { signedUrl: `https://storage.test.local/${bucket}/${path}?ttl=${expiresIn}` },
              error: null,
            }
          },
        }
      },
    },
  }
}

export async function inviteUser(email: string): Promise<string> {
  const { data, error } = invite(email)
  if (error || !data.user) throw new Error(error?.message ?? "Falha ao convidar usuário")
  return data.user.id
}

export async function resendInvite(email: string): Promise<void> {
  const { error } = invite(email)
  if (error) throw new Error(error.message)
}
