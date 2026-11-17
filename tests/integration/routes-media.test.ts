import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { MEDIA_BUCKET, MEDIA_MAX_BYTES } from "@/lib/media"
import { ctx, json, login, req } from "./helpers/route"
import { fakeSupabase } from "./helpers/supabase-fake"
import {
  DENIED,
  PDF_BYTES,
  PNG_BYTES,
  deniedStatuses,
  destroyWorld,
  makeAnimal,
  makeMedia,
  makeShare,
  newWorld,
  seedWorld,
} from "./helpers/animals-world"

// Rotas de MÍDIA do indivíduo, chamadas pelos handlers reais (Storage substituído em memória):
//   GET/POST     /api/animals/[id]/media
//   PATCH/DELETE /api/media/[id]
//
// O que protegem: o arquivo pertence a UMA pesquisa do indivíduo e só aparece para quem a
// enxerga; o tipo aceito é o do CONTEÚDO (magic bytes), não o declarado pelo cliente; upload
// multipart exige mesma origem; só exclui quem enviou (ou o admin, ou qualquer membro da
// pesquisa dona se o arquivo está sem autor) — e a exclusão remove o objeto do Storage.

import { GET as listMedia, POST as uploadMedia } from "@/app/api/animals/[id]/media/route"
import { PATCH as patchMedia, DELETE as deleteMedia } from "@/app/api/media/[id]/route"

vi.setConfig({ testTimeout: 30_000 })

const w = newWorld("RME")

let solo: string // indivíduo só da pesquisa P
let shared: string // primária P, compartilhado (aceito) com Q

type MediaRow = {
  id: string
  url: string | null
  mimeType: string
  label: string | null
  uploadedById: string | null
  research: { id: string }
}
type ErrorBody = { code: string }

const list = (animalId: string) =>
  listMedia(req(`/api/animals/${animalId}/media`), ctx({ id: animalId }))

type Upload = {
  bytes?: Buffer
  name?: string
  type?: string
  label?: string
  researchId?: string
  file?: false
}
function upload(animalId: string, u: Upload = {}, headers?: Record<string, string>) {
  const form = new FormData()
  if (u.file !== false) {
    const bytes = new Uint8Array(u.bytes ?? PNG_BYTES)
    form.set(
      "file",
      new File([bytes], u.name ?? "foto de campo.png", { type: u.type ?? "image/png" }),
    )
  }
  if (u.label !== undefined) form.set("label", u.label)
  if (u.researchId !== undefined) form.set("researchId", u.researchId)
  return uploadMedia(
    req(`/api/animals/${animalId}/media`, { form, headers }),
    ctx({ id: animalId }),
  )
}
const patch = (id: string, body: unknown) =>
  patchMedia(req(`/api/media/${id}`, { method: "PATCH", body }), ctx({ id }))
const remove = (id: string) =>
  deleteMedia(req(`/api/media/${id}`, { method: "DELETE" }), ctx({ id }))

const rowsOf = (animalId: string) => prisma.animalMedia.count({ where: { animalId } })
const stored = () => fakeSupabase.files(MEDIA_BUCKET)

beforeAll(async () => {
  await seedWorld(w)
  solo = (await makeAnimal(w, w.researchP)).id
  shared = (await makeAnimal(w, w.researchP)).id
  await makeShare(shared, w.researchQ)
})

afterAll(async () => {
  fakeSupabase.reset()
  await destroyWorld(w)
})

describe("GET /api/animals/[id]/media", () => {
  let ofP: { id: string; path: string }
  let ofQ: { id: string; path: string }

  beforeAll(async () => {
    ofP = await makeMedia(shared, w.researchP, w.users.resP, "necrópsia P")
    ofQ = await makeMedia(shared, w.researchQ, w.users.resQ)
  })

  it("devolve os arquivos com URL assinada no lugar do caminho do objeto", async () => {
    login(w.as.adminA)
    const res = await list(shared)
    expect(res.status).toBe(200)
    const rows = await json<MediaRow[]>(res)
    expect(rows.map((r) => r.id).sort()).toEqual([ofP.id, ofQ.id].sort())
    const p = rows.find((r) => r.id === ofP.id)!
    expect(p).toMatchObject({
      mimeType: "image/png",
      label: "necrópsia P",
      uploadedById: w.users.resP,
      research: { id: w.researchP },
    })
    expect(p.url).toContain(`/${MEDIA_BUCKET}/${ofP.path}`)
    expect(p.url).toMatch(/^https:\/\/.+\?ttl=\d+$/)
  })

  it("no indivíduo compartilhado, cada pesquisador vê só os arquivos da sua pesquisa", async () => {
    login(w.as.resP)
    expect((await json<MediaRow[]>(await list(shared))).map((r) => r.id)).toEqual([ofP.id])
    login(w.as.resQ)
    expect((await json<MediaRow[]>(await list(shared))).map((r) => r.id)).toEqual([ofQ.id])
  })

  it("barra sem sessão, outra organização e pesquisador sem vínculo; inexistente é 404", async () => {
    expect(await deniedStatuses(w, () => list(shared))).toEqual(DENIED)
    login(w.as.adminA)
    expect((await list(randomUUID())).status).toBe(404)
  })
})

describe("POST /api/animals/[id]/media", () => {
  it("grava o arquivo no Storage e a linha com pesquisa dona, autor e tipo detectado", async () => {
    login(w.as.resP)
    const before = stored().length
    // O cliente declara JPEG, mas o conteúdo é PNG: vale o que os bytes dizem.
    const res = await upload(solo, { type: "image/jpeg", label: "  vista ventral  " })
    expect(res.status).toBe(201)
    const { id } = await json<{ id: string }>(res)

    const row = await prisma.animalMedia.findUniqueOrThrow({ where: { id } })
    expect(row).toMatchObject({
      animalId: solo,
      researchId: w.researchP, // sem escolha explícita, a pesquisa primária
      mimeType: "image/png",
      label: "vista ventral",
      uploadedById: w.users.resP,
    })
    expect(row.url.startsWith(`${solo}/`)).toBe(true)
    expect(row.url.endsWith("_foto_de_campo.png")).toBe(true)
    expect(stored()).toContain(row.url)
    expect(stored()).toHaveLength(before + 1)
    expect(fakeSupabase.buckets.get(MEDIA_BUCKET)?.get(row.url)?.contentType).toBe("image/png")
  })

  it("aceita PDF e a pesquisa participante como dona, no indivíduo compartilhado", async () => {
    login(w.as.resQ)
    const res = await upload(shared, {
      bytes: PDF_BYTES,
      name: "laudo.pdf",
      type: "application/pdf",
      researchId: w.researchQ,
    })
    expect(res.status).toBe(201)
    const { id } = await json<{ id: string }>(res)
    const row = await prisma.animalMedia.findUniqueOrThrow({ where: { id } })
    expect(row).toMatchObject({
      researchId: w.researchQ,
      mimeType: "application/pdf",
      label: null,
      uploadedById: w.users.resQ,
    })
  })

  it("pesquisador não envia arquivo em nome de pesquisa que não integra", async () => {
    login(w.as.resQ)
    const before = await rowsOf(shared)
    const files = stored().length
    // Sem `researchId` o arquivo cairia na primária (P), que ele não enxerga.
    expect((await upload(shared)).status).toBe(403)
    expect((await upload(shared, { researchId: w.researchP })).status).toBe(403)
    expect(await rowsOf(shared)).toBe(before)
    expect(stored()).toHaveLength(files)
  })

  it("a pesquisa dona precisa estudar o indivíduo (422)", async () => {
    login(w.as.adminA)
    const res = await upload(solo, { researchId: w.researchQ })
    expect(res.status).toBe(422)
    expect((await json<ErrorBody>(res)).code).toBe("animalResearchNotLinked")
    expect(
      await prisma.animalMedia.count({ where: { animalId: solo, researchId: w.researchQ } }),
    ).toBe(0)
  })

  it("recusa tipo não suportado, conteúdo que não bate, arquivo grande, ausente e legenda longa", async () => {
    login(w.as.resP)
    const before = await rowsOf(solo)
    const files = stored().length
    const big = Buffer.concat([PNG_BYTES, Buffer.alloc(MEDIA_MAX_BYTES)])
    const cases: [Upload, string][] = [
      [
        { bytes: Buffer.from("MZ executável"), name: "x.exe", type: "application/x-msdownload" },
        "mediaInvalidType",
      ],
      [{ bytes: Buffer.from("<script>alert(1)</script>"), type: "image/png" }, "mediaInvalidType"],
      [{ bytes: big }, "mediaTooLarge"],
      [{ file: false }, "mediaInvalidType"],
      [{ label: "x".repeat(501) }, "validation"],
    ]
    for (const [u, code] of cases) {
      const res = await upload(solo, u)
      expect(res.status).toBe(422)
      expect((await json<ErrorBody>(res)).code).toBe(code)
    }
    expect(await rowsOf(solo)).toBe(before)
    expect(stored()).toHaveLength(files)
  })

  it("falha do Storage vira 422 e não deixa linha apontando para arquivo inexistente", async () => {
    login(w.as.resP)
    const before = await rowsOf(solo)
    fakeSupabase.failNext.upload = "bucket indisponível"
    const res = await upload(solo)
    expect(res.status).toBe(422)
    expect((await json<ErrorBody>(res)).code).toBe("mediaUploadFailed")
    expect(await rowsOf(solo)).toBe(before)
  })

  it("exige mesma origem (anti-CSRF do multipart): outra origem é 403 antes de tudo", async () => {
    login(w.as.resP)
    const before = await rowsOf(solo)
    const res = await upload(solo, {}, { origin: "https://outro-site.test" })
    expect(res.status).toBe(403)
    expect(await rowsOf(solo)).toBe(before)
  })

  it("barra sem sessão, outra organização e pesquisador sem vínculo", async () => {
    const before = await rowsOf(solo)
    const files = stored().length
    expect(await deniedStatuses(w, () => upload(solo))).toEqual(DENIED)
    expect(await rowsOf(solo)).toBe(before)
    expect(stored()).toHaveLength(files)
  })
})

describe("PATCH /api/media/[id]", () => {
  it("qualquer membro da pesquisa dona corrige a legenda; vazio limpa", async () => {
    const media = await makeMedia(solo, w.researchP, w.users.resP, "antiga")
    login(w.as.resP2)
    const res = await patch(media.id, { label: "  lâmina 3, fígado  " })
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ id: media.id, label: "lâmina 3, fígado" })
    expect((await prisma.animalMedia.findUniqueOrThrow({ where: { id: media.id } })).label).toBe(
      "lâmina 3, fígado",
    )

    expect((await patch(media.id, { label: "" })).status).toBe(200)
    expect((await prisma.animalMedia.findUniqueOrThrow({ where: { id: media.id } })).label).toBe(
      null,
    )
  })

  it("valida o tamanho da legenda (422) e o id (404)", async () => {
    const media = await makeMedia(solo, w.researchP, w.users.resP, "curta")
    login(w.as.resP)
    const res = await patch(media.id, { label: "x".repeat(501) })
    expect(res.status).toBe(422)
    expect((await prisma.animalMedia.findUniqueOrThrow({ where: { id: media.id } })).label).toBe(
      "curta",
    )
    const missing = await patch(randomUUID(), { label: "x" })
    expect(missing.status).toBe(404)
    expect((await json<ErrorBody>(missing)).code).toBe("mediaNotFound")
  })

  it("barra sem sessão, outra organização, sem vínculo e a pesquisa vizinha do compartilhado", async () => {
    const media = await makeMedia(shared, w.researchP, w.users.resP, "de P")
    const attempt = () => patch(media.id, { label: "invadida" })
    expect(await deniedStatuses(w, attempt)).toEqual(DENIED)
    login(w.as.resQ)
    expect((await attempt()).status).toBe(403)
    expect((await prisma.animalMedia.findUniqueOrThrow({ where: { id: media.id } })).label).toBe(
      "de P",
    )
  })
})

describe("DELETE /api/media/[id]", () => {
  const exists = async (id: string) => (await prisma.animalMedia.count({ where: { id } })) === 1

  it("quem enviou exclui: some a linha e o objeto do Storage", async () => {
    const media = await makeMedia(solo, w.researchP, w.users.resP)
    expect(stored()).toContain(media.path)
    login(w.as.resP)
    expect((await remove(media.id)).status).toBe(204)
    expect(await exists(media.id)).toBe(false)
    expect(stored()).not.toContain(media.path)
  })

  it("colega da mesma pesquisa não exclui arquivo de outro autor; o admin exclui", async () => {
    const media = await makeMedia(solo, w.researchP, w.users.resP)
    login(w.as.resP2)
    const denied = await remove(media.id)
    expect(denied.status).toBe(403)
    expect((await json<ErrorBody>(denied)).code).toBe("mediaDeleteNotUploader")
    expect(await exists(media.id)).toBe(true)
    expect(stored()).toContain(media.path)

    login(w.as.adminA)
    expect((await remove(media.id)).status).toBe(204)
    expect(await exists(media.id)).toBe(false)
    expect(stored()).not.toContain(media.path)
  })

  it("arquivo sem autor: qualquer membro da pesquisa dona exclui — e só dela", async () => {
    const media = await makeMedia(shared, w.researchP, null)
    login(w.as.resQ)
    expect((await remove(media.id)).status).toBe(403)
    expect(await exists(media.id)).toBe(true)
    expect(stored()).toContain(media.path)

    login(w.as.resP2)
    expect((await remove(media.id)).status).toBe(204)
    expect(await exists(media.id)).toBe(false)
    expect(stored()).not.toContain(media.path)
  })

  it("barra sem sessão, outra organização e pesquisador sem vínculo; inexistente é 404", async () => {
    const media = await makeMedia(solo, w.researchP, null)
    expect(await deniedStatuses(w, () => remove(media.id))).toEqual(DENIED)
    expect(await exists(media.id)).toBe(true)
    expect(stored()).toContain(media.path)

    login(w.as.adminA)
    expect((await remove(randomUUID())).status).toBe(404)
  })
})
