import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { ctx, json, login, req } from "./helpers/route"
import { fakeSupabase } from "./helpers/supabase-fake"
import {
  DENIED,
  deniedStatuses,
  destroyWorld,
  makeAnimal,
  makeMedia,
  makeSample,
  makeShare,
  newWorld,
  seedWorld,
} from "./helpers/animals-world"

// Compartilhamento de um indivíduo entre pesquisas do mesmo grupo, pelos handlers reais:
//   POST         /api/animals/[id]/researches                      (convite ou pedido)
//   PATCH/DELETE /api/animals/[id]/researches/[researchId]         (aceitar / recusar, cancelar, desvincular)
//   PUT/DELETE   /api/animals/[id]/researches/[researchId]/hidden  (ocultar / reexibir)
//   GET          /api/animal-shares                                (caixa de pendências)
//
// O que protegem: o vínculo exige consentimento dos DOIS lados — nasce pendente e só o lado
// que ainda não consentiu aceita; a direção (convite × pedido) sai do escopo de quem chama,
// não do corpo; pendente não dá visibilidade; não se desvincula pesquisa que tem amostras ou
// arquivos no indivíduo; e ocultar nunca faz o indivíduo sumir de todas as pesquisas.

import { POST as shareAnimal } from "@/app/api/animals/[id]/researches/route"
import {
  PATCH as acceptShare,
  DELETE as removeShare,
} from "@/app/api/animals/[id]/researches/[researchId]/route"
import {
  PUT as hideAnimal,
  DELETE as unhideAnimal,
} from "@/app/api/animals/[id]/researches/[researchId]/hidden/route"
import { GET as listShares } from "@/app/api/animal-shares/route"
import { GET as listAnimals } from "@/app/api/animals/route"
import { GET as getAnimal } from "@/app/api/animals/[id]/route"

vi.setConfig({ testTimeout: 30_000 })

const w = newWorld("RSH")

type ErrorBody = { code: string }
type PendingShare = {
  origin: "INVITE" | "REQUEST"
  message: string | null
  animal: { id: string; controlId: string | null }
  research: { id: string }
  fromResearch: { id: string }
  invitedBy: { name: string | null; email: string } | null
}

const share = (animalId: string, body: unknown) =>
  shareAnimal(req(`/api/animals/${animalId}/researches`, { body }), ctx({ id: animalId }))
const pair = (id: string, researchId: string) => ctx({ id, researchId })
const accept = (id: string, researchId: string) =>
  acceptShare(
    req(`/api/animals/${id}/researches/${researchId}`, { method: "PATCH" }),
    pair(id, researchId),
  )
const unshare = (id: string, researchId: string) =>
  removeShare(
    req(`/api/animals/${id}/researches/${researchId}`, { method: "DELETE" }),
    pair(id, researchId),
  )
const hide = (id: string, researchId: string) =>
  hideAnimal(
    req(`/api/animals/${id}/researches/${researchId}/hidden`, { method: "PUT" }),
    pair(id, researchId),
  )
const unhide = (id: string, researchId: string) =>
  unhideAnimal(
    req(`/api/animals/${id}/researches/${researchId}/hidden`, { method: "DELETE" }),
    pair(id, researchId),
  )

const link = (animalId: string, researchId: string) =>
  prisma.animalResearch.findUnique({ where: { animalId_researchId: { animalId, researchId } } })
const ofP = async () => (await makeAnimal(w, w.researchP)).id
const sees = async (animalId: string) =>
  (await getAnimal(req(`/api/animals/${animalId}`), ctx({ id: animalId }))).status === 200
const listedIds = async (query = "") => {
  const res = await listAnimals(req(`/api/animals?idsOnly=1${query}`))
  return (await json<{ ids: string[] }>(res)).ids
}

beforeAll(async () => {
  await seedWorld(w)
})

afterAll(async () => {
  fakeSupabase.reset()
  await destroyWorld(w)
})

describe("POST /api/animals/[id]/researches — convite ou pedido", () => {
  it("quem enxerga o indivíduo CONVIDA: nasce pendente e a outra pesquisa ainda não o vê", async () => {
    const animal = await ofP()
    login(w.as.resP)
    const res = await share(animal, { researchId: w.researchQ, message: "ignorada no convite" })
    expect(res.status).toBe(201)
    expect(await json(res)).toEqual({ status: "PENDING" })
    expect(await link(animal, w.researchQ)).toMatchObject({
      status: "PENDING",
      origin: "INVITE",
      invitedById: w.users.resP,
      message: null,
      respondedAt: null,
    })
    login(w.as.resQ)
    expect(await sees(animal)).toBe(false)
  })

  it("quem não enxerga mas integra a pesquisa de destino PEDE, com justificativa", async () => {
    const animal = await ofP()
    login(w.as.resQ)
    const res = await share(animal, { researchId: w.researchQ, message: "  mesmo indivíduo  " })
    expect(res.status).toBe(201)
    expect(await json(res)).toEqual({ status: "PENDING" })
    expect(await link(animal, w.researchQ)).toMatchObject({
      status: "PENDING",
      origin: "REQUEST",
      invitedById: w.users.resQ,
      message: "mesmo indivíduo",
    })
    expect(await sees(animal)).toBe(false)
  })

  it("quem enxerga os dois lados (admin, ou membro das duas pesquisas) já vincula aceito", async () => {
    for (const user of [w.as.adminA, w.as.resPQ]) {
      const animal = await ofP()
      login(user)
      const res = await share(animal, { researchId: w.researchQ })
      expect(res.status).toBe(201)
      expect(await json(res)).toEqual({ status: "ACCEPTED" })
      const row = await link(animal, w.researchQ)
      expect(row).toMatchObject({ status: "ACCEPTED", origin: "INVITE", invitedById: user.id })
      expect(row?.respondedAt).toBeInstanceOf(Date)
    }
  })

  it("sem enxergar nem o indivíduo nem a pesquisa de destino, é 403", async () => {
    const ofQ = (await makeAnimal(w, w.researchQ)).id
    // Terceira pesquisa do grupo, da qual o pesquisador de P também não participa.
    const researchR = randomUUID()
    await prisma.research.create({
      data: { id: researchR, name: w.name("Pesquisa R"), orgId: w.orgA },
    })
    login(w.as.resP)
    expect((await share(ofQ, { researchId: researchR })).status).toBe(403)
    expect(await link(ofQ, researchR)).toBeNull()
  })

  it("recusa a própria pesquisa primária (409) e pesquisa de outra organização (404)", async () => {
    const animal = await ofP()
    login(w.as.adminA)
    const primary = await share(animal, { researchId: w.researchP })
    expect(primary.status).toBe(409)
    expect((await json<ErrorBody>(primary)).code).toBe("animalResearchPrimary")

    const foreign = await share(animal, { researchId: w.researchB })
    expect(foreign.status).toBe(404)
    expect((await json<ErrorBody>(foreign)).code).toBe("researchNotFound")
    expect(await prisma.animalResearch.count({ where: { animalId: animal } })).toBe(0)
  })

  it("não duplica: pedido em aberto e vínculo já aceito respondem 409 com códigos distintos", async () => {
    const animal = await ofP()
    login(w.as.resP)
    expect((await share(animal, { researchId: w.researchQ })).status).toBe(201)
    const open = await share(animal, { researchId: w.researchQ })
    expect(open.status).toBe(409)
    expect((await json<ErrorBody>(open)).code).toBe("animalSharePending")

    await prisma.animalResearch.update({
      where: { animalId_researchId: { animalId: animal, researchId: w.researchQ } },
      data: { status: "ACCEPTED" },
    })
    const done = await share(animal, { researchId: w.researchQ })
    expect(done.status).toBe(409)
    expect((await json<ErrorBody>(done)).code).toBe("animalResearchExists")
    expect(await prisma.animalResearch.count({ where: { animalId: animal } })).toBe(1)
  })

  it("valida o corpo (422), o indivíduo (404) e barra sem sessão e outra organização", async () => {
    const animal = await ofP()
    login(w.as.resP)
    expect((await share(animal, {})).status).toBe(422)
    expect(
      (await share(animal, { researchId: w.researchQ, message: "x".repeat(501) })).status,
    ).toBe(422)
    expect((await share(randomUUID(), { researchId: w.researchQ })).status).toBe(404)

    expect(await deniedStatuses(w, () => share(animal, { researchId: w.researchQ }))).toEqual(
      DENIED,
    )
    expect(await prisma.animalResearch.count({ where: { animalId: animal } })).toBe(0)
  })
})

describe("PATCH /api/animals/[id]/researches/[researchId] — aceitar", () => {
  it("convite: só a pesquisa CONVIDADA aceita — e passa a enxergar o indivíduo", async () => {
    const animal = await ofP()
    await makeShare(animal, w.researchQ, { status: "PENDING", origin: "INVITE" })

    login(w.as.resP) // quem convidou não responde pelo outro lado
    const own = await accept(animal, w.researchQ)
    expect(own.status).toBe(403)
    expect((await json<ErrorBody>(own)).code).toBe("animalShareCannotDecide")
    expect((await link(animal, w.researchQ))?.status).toBe("PENDING")

    login(w.as.resQ)
    expect(await sees(animal)).toBe(false)
    expect((await accept(animal, w.researchQ)).status).toBe(204)
    const row = await link(animal, w.researchQ)
    expect(row?.status).toBe("ACCEPTED")
    expect(row?.respondedAt).toBeInstanceOf(Date)
    expect(await sees(animal)).toBe(true)

    // Aceitar de novo (dois membros clicando juntos) não é erro.
    expect((await accept(animal, w.researchQ)).status).toBe(204)
  })

  it("pedido: só a pesquisa PRIMÁRIA do indivíduo aceita", async () => {
    const animal = await ofP()
    await makeShare(animal, w.researchQ, { status: "PENDING", origin: "REQUEST" })

    login(w.as.resQ) // quem pediu não se autoriza
    expect((await accept(animal, w.researchQ)).status).toBe(403)
    expect((await link(animal, w.researchQ))?.status).toBe("PENDING")

    login(w.as.resP)
    expect((await accept(animal, w.researchQ)).status).toBe(204)
    expect((await link(animal, w.researchQ))?.status).toBe("ACCEPTED")
  })

  it("o admin da organização responde por qualquer pesquisa", async () => {
    const animal = await ofP()
    await makeShare(animal, w.researchQ, { status: "PENDING", origin: "INVITE" })
    login(w.as.adminA)
    expect((await accept(animal, w.researchQ)).status).toBe(204)
    expect((await link(animal, w.researchQ))?.status).toBe("ACCEPTED")
  })

  it("sem vínculo a responder é 404; sem sessão, outra organização e sem pesquisa são barrados", async () => {
    const animal = await ofP()
    login(w.as.adminA)
    const missing = await accept(animal, w.researchQ)
    expect(missing.status).toBe(404)
    expect((await json<ErrorBody>(missing)).code).toBe("animalShareNotFound")

    await makeShare(animal, w.researchQ, { status: "PENDING", origin: "INVITE" })
    expect(await deniedStatuses(w, () => accept(animal, w.researchQ))).toEqual(DENIED)
    expect((await link(animal, w.researchQ))?.status).toBe("PENDING")
  })
})

describe("DELETE /api/animals/[id]/researches/[researchId] — recusar, cancelar, desvincular", () => {
  it("os dois lados desfazem um pendente: quem decide recusa, quem iniciou cancela", async () => {
    for (const user of [w.as.resQ, w.as.resP]) {
      const animal = await ofP()
      await makeShare(animal, w.researchQ, { status: "PENDING", origin: "INVITE" })
      login(user)
      expect((await unshare(animal, w.researchQ)).status).toBe(204)
      expect(await link(animal, w.researchQ)).toBeNull()
    }
  })

  it("desvincula uma participação aceita: a pesquisa deixa de enxergar o indivíduo", async () => {
    const animal = await ofP()
    await makeShare(animal, w.researchQ)
    login(w.as.resQ)
    expect(await sees(animal)).toBe(true)
    expect((await unshare(animal, w.researchQ)).status).toBe(204)
    expect(await link(animal, w.researchQ)).toBeNull()
    expect(await sees(animal)).toBe(false)
    // A pesquisa primária não é afetada.
    expect((await prisma.animal.findUniqueOrThrow({ where: { id: animal } })).researchId).toBe(
      w.researchP,
    )
  })

  it("não desvincula pesquisa com amostras ou arquivos no indivíduo (409)", async () => {
    const withSample = await ofP()
    await makeShare(withSample, w.researchQ)
    await makeSample(w, withSample, w.researchQ)
    const withMedia = await ofP()
    await makeShare(withMedia, w.researchQ)
    await makeMedia(withMedia, w.researchQ, w.users.resQ)

    login(w.as.adminA)
    for (const animal of [withSample, withMedia]) {
      const res = await unshare(animal, w.researchQ)
      expect(res.status).toBe(409)
      expect((await json<ErrorBody>(res)).code).toBe("animalResearchHasData")
      expect((await link(animal, w.researchQ))?.status).toBe("ACCEPTED")
    }
  })

  it("quem não integra nenhum dos dois lados não desfaz; inexistente é 404", async () => {
    const animal = await ofP()
    await makeShare(animal, w.researchQ, { status: "PENDING", origin: "INVITE" })
    expect(await deniedStatuses(w, () => unshare(animal, w.researchQ))).toEqual(DENIED)
    expect(await link(animal, w.researchQ)).not.toBeNull()

    login(w.as.adminA)
    const missing = await unshare(await ofP(), w.researchQ)
    expect(missing.status).toBe(404)
    expect((await json<ErrorBody>(missing)).code).toBe("animalShareNotFound")
  })
})

describe("PUT/DELETE /api/animals/[id]/researches/[researchId]/hidden — ocultar e reexibir", () => {
  it("a participante oculta: sai da listagem dela, segue acessível e listado na primária", async () => {
    const animal = await ofP()
    await makeShare(animal, w.researchQ)

    login(w.as.resQ)
    expect(await listedIds()).toContain(animal)
    expect((await hide(animal, w.researchQ)).status).toBe(204)
    expect((await link(animal, w.researchQ))?.hiddenAt).toBeInstanceOf(Date)
    expect(await listedIds()).not.toContain(animal)
    expect(await listedIds("&hidden=only")).toContain(animal)
    expect(await sees(animal)).toBe(true) // o acesso direto é o que permite reexibir

    login(w.as.resP)
    expect(await listedIds()).toContain(animal)

    login(w.as.resQ)
    expect((await unhide(animal, w.researchQ)).status).toBe(204)
    expect((await link(animal, w.researchQ))?.hiddenAt).toBeNull()
    expect(await listedIds()).toContain(animal)
    expect(await listedIds("&hidden=only")).not.toContain(animal)
  })

  it("a primária oculta um indivíduo compartilhado (marca fica no Animal) e reexibe", async () => {
    const animal = await ofP()
    await makeShare(animal, w.researchQ)
    login(w.as.resP)
    expect((await hide(animal, w.researchP)).status).toBe(204)
    const hidden = await prisma.animal.findUniqueOrThrow({ where: { id: animal } })
    expect(hidden.primaryHiddenAt).toBeInstanceOf(Date)
    expect(await listedIds()).not.toContain(animal)

    expect((await unhide(animal, w.researchP)).status).toBe(204)
    const shown = await prisma.animal.findUniqueOrThrow({ where: { id: animal } })
    expect(shown.primaryHiddenAt).toBeNull()
    expect(await listedIds()).toContain(animal)
  })

  it("o indivíduo precisa continuar visível em ao menos uma pesquisa (409)", async () => {
    const solo = await ofP()
    const pendingOnly = await ofP()
    await makeShare(pendingOnly, w.researchQ, { status: "PENDING" })
    const both = await ofP()
    await makeShare(both, w.researchQ, { hiddenAt: new Date() })

    login(w.as.adminA)
    for (const animal of [solo, pendingOnly, both]) {
      const res = await hide(animal, w.researchP)
      expect(res.status).toBe(409)
      expect((await json<ErrorBody>(res)).code).toBe("animalHideLastResearch")
      const row = await prisma.animal.findUniqueOrThrow({ where: { id: animal } })
      expect(row.primaryHiddenAt).toBeNull()
    }
  })

  it("pesquisa que não estuda o indivíduo (ou só tem convite pendente) é 404", async () => {
    const solo = await ofP()
    const pendingOnly = await ofP()
    await makeShare(pendingOnly, w.researchQ, { status: "PENDING" })
    login(w.as.adminA)
    for (const animal of [solo, pendingOnly]) {
      const res = await hide(animal, w.researchQ)
      expect(res.status).toBe(404)
      expect((await json<ErrorBody>(res)).code).toBe("animalResearchNotLinked")
    }
    expect((await link(pendingOnly, w.researchQ))?.hiddenAt).toBeNull()
  })

  it("só quem integra a pesquisa decide por ela; sem sessão e outra organização são barrados", async () => {
    const animal = await ofP()
    await makeShare(animal, w.researchQ)

    login(w.as.resP) // enxerga o indivíduo, mas não a pesquisa Q
    expect((await hide(animal, w.researchQ)).status).toBe(403)
    expect(await deniedStatuses(w, () => hide(animal, w.researchQ))).toEqual(DENIED)
    expect((await link(animal, w.researchQ))?.hiddenAt).toBeNull()

    await prisma.animalResearch.update({
      where: { animalId_researchId: { animalId: animal, researchId: w.researchQ } },
      data: { hiddenAt: new Date() },
    })
    login(w.as.resP)
    expect((await unhide(animal, w.researchQ)).status).toBe(403)
    expect(await deniedStatuses(w, () => unhide(animal, w.researchQ))).toEqual(DENIED)
    expect((await link(animal, w.researchQ))?.hiddenAt).toBeInstanceOf(Date)

    login(w.as.adminA)
    expect((await hide(randomUUID(), w.researchQ)).status).toBe(404)
    expect((await unhide(randomUUID(), w.researchQ)).status).toBe(404)
  })
})

describe("GET /api/animal-shares — caixa de pendências", () => {
  let invited: { id: string; controlId: string } // P convidou Q
  let requested: { id: string; controlId: string } // Q pediu um indivíduo de P
  let accepted: string

  const inbox = async () => {
    const res = await listShares()
    expect(res.status).toBe(200)
    return (await json<PendingShare[]>(res)).filter((s) =>
      [invited.id, requested.id, accepted].includes(s.animal.id),
    )
  }

  beforeAll(async () => {
    invited = await makeAnimal(w, w.researchP)
    await makeShare(invited.id, w.researchQ, {
      status: "PENDING",
      origin: "INVITE",
      invitedById: w.users.resP,
    })
    requested = await makeAnimal(w, w.researchP)
    await makeShare(requested.id, w.researchQ, {
      status: "PENDING",
      origin: "REQUEST",
      invitedById: w.users.resQ,
      message: "é o mesmo indivíduo",
    })
    accepted = (await makeAnimal(w, w.researchP)).id
    await makeShare(accepted, w.researchQ)
  })

  it("mostra a cada pesquisador só o que ELE pode responder", async () => {
    login(w.as.resQ) // convidada: responde ao convite, não ao próprio pedido
    const q = await inbox()
    expect(q.map((s) => s.animal.id)).toEqual([invited.id])
    expect(q[0]).toMatchObject({
      origin: "INVITE",
      animal: { controlId: invited.controlId },
      research: { id: w.researchQ },
      fromResearch: { id: w.researchP },
      invitedBy: { email: `${w.key("resP")}@test.local` },
    })

    login(w.as.resP) // primária: responde ao pedido, não ao próprio convite
    const p = await inbox()
    expect(p.map((s) => s.animal.id)).toEqual([requested.id])
    expect(p[0]).toMatchObject({ origin: "REQUEST", message: "é o mesmo indivíduo" })
  })

  it("o admin vê todas as pendências do grupo; vínculo já aceito não aparece", async () => {
    login(w.as.adminA)
    const all = await inbox()
    expect(all.map((s) => s.animal.id).sort()).toEqual([invited.id, requested.id].sort())
  })

  it("não vaza para outra organização, para quem não tem pesquisa nem para o admin global", async () => {
    for (const user of [w.as.adminB, w.as.outsider, w.as.sysAdmin]) {
      login(user)
      const res = await listShares()
      expect(res.status).toBe(200)
      expect(await inbox()).toEqual([])
    }
  })

  it("sem sessão responde 401; quem perdeu o vínculo com a organização ativa, 403", async () => {
    login(null)
    expect((await listShares()).status).toBe(401)
    login(w.as.adminB, w.orgA)
    expect((await listShares()).status).toBe(403)
  })
})
