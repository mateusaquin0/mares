// MARES — Admin global: lista solicitações de acesso.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser, requireSystemAdmin } from "@/lib/auth"
import { apiError, unauthorized } from "@/lib/api"
import type { JoinRequestStatus } from "@prisma/client"

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser()
    if (!user) return unauthorized()
    requireSystemAdmin(user)

    const statusParam = req.nextUrl.searchParams.get("status") ?? "PENDING"
    const valid: JoinRequestStatus[] = ["PENDING", "APPROVED", "REJECTED"]
    const status = valid.includes(statusParam as JoinRequestStatus)
      ? (statusParam as JoinRequestStatus)
      : "PENDING"

    const requests = await prisma.joinRequest.findMany({
      where: { status },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json(requests)
  } catch (err) {
    return apiError(err)
  }
}
