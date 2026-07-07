// MARES — Dados da grade de análises de um animal (Fase 3 / compartilhamento Etapa 2).
// O indivíduo pode ser estudado por várias pesquisas; cada amostra pertence a UMA pesquisa.
// A grade é retornada em SEÇÕES: uma por pesquisa que tem amostras no indivíduo, com o
// PROTOCOLO daquela pesquisa aplicado às SUAS amostras. As análises já preenchidas vêm numa
// lista plana (cada análise pertence a uma amostra → a uma pesquisa).

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireOrgRole } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import { loadAnimalOrg } from "@/lib/animals"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    const { id } = await params
    const animal = await loadAnimalOrg(id)
    requireOrgRole(user, animal.orgId, "RESEARCHER")

    const [samples, analyses] = await Promise.all([
      prisma.sample.findMany({
        where: { animalId: id },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          sampleType: true,
          status: true,
          researchId: true,
          research: { select: { id: true, name: true } },
          organ: { select: { id: true, name: true } },
        },
      }),
      prisma.analysis.findMany({
        where: { sample: { animalId: id } },
        select: {
          sampleId: true,
          pathogenId: true,
          examTypeId: true,
          result: true,
          measureValue: true,
          notes: true,
        },
      }),
    ])

    // Agrupa amostras por pesquisa dona, preservando a ordem de primeira aparição.
    // Tipos vêm do Prisma (name como Json); o cliente reinterpreta como AnalysisGrid.
    type SampleRow = (typeof samples)[number]
    const order: string[] = []
    const byResearch = new Map<
      string,
      { research: SampleRow["research"]; samples: SampleRow[] }
    >()
    for (const s of samples) {
      let bucket = byResearch.get(s.researchId)
      if (!bucket) {
        bucket = { research: s.research, samples: [] }
        byResearch.set(s.researchId, bucket)
        order.push(s.researchId)
      }
      bucket.samples.push(s)
    }

    // Protocolos das pesquisas com amostras no indivíduo.
    const protocols = order.length
      ? await prisma.researchProtocol.findMany({
          where: { researchId: { in: order } },
          select: {
            researchId: true,
            organId: true,
            pathogenId: true,
            examTypeId: true,
            pathogen: { select: { id: true, scientificName: true, name: true } },
            examType: { select: { id: true, name: true, measureLabel: true, measureUnit: true } },
          },
        })
      : []
    const protoByResearch = new Map<string, typeof protocols>()
    for (const p of protocols) {
      const list = protoByResearch.get(p.researchId) ?? []
      list.push(p)
      protoByResearch.set(p.researchId, list)
    }

    const sections = order.map((rid) => {
      const bucket = byResearch.get(rid)!
      // Remove os campos internos (researchId/research) das amostras enviadas.
      const samplesOut = bucket.samples.map((s) => ({
        id: s.id,
        sampleType: s.sampleType,
        status: s.status,
        organ: s.organ,
      }))
      return {
        research: bucket.research,
        protocol: protoByResearch.get(rid) ?? [],
        samples: samplesOut,
      }
    })

    return NextResponse.json({ sections, analyses })
  } catch (err) {
    return apiError(err)
  }
}
