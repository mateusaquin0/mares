// MARES — Hook da lista pessoal de tipos de amostra (react-query).

import { useCallback } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { userSampleTypesService } from "@/services/user-sample-types"
import { sampleTypeKey } from "@/schemas/user-sample-type.schema"
import type { UserSampleType } from "@/types/user-sample-type"

export const userSampleTypeKeys = {
  all: ["user-sample-types"] as const,
}

export function useUserSampleTypes() {
  return useQuery({
    queryKey: userSampleTypeKeys.all,
    queryFn: () => userSampleTypesService.list(),
    // Lista pequena e só o próprio usuário a altera — não vale revalidar a cada montagem.
    staleTime: 5 * 60 * 1000,
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: userSampleTypeKeys.all })
}

export function useAddUserSampleType() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (value: string) => userSampleTypesService.add(value),
    onSuccess: invalidate,
  })
}

export function useRenameUserSampleType() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (vars: { id: string; value: string }) =>
      userSampleTypesService.rename(vars.id, vars.value),
    onSuccess: invalidate,
  })
}

export function useRemoveUserSampleType() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => userSampleTypesService.remove(id),
    onSuccess: invalidate,
  })
}

// Guarda o tipo digitado na lista do usuário depois de salvar a amostra. É um efeito
// colateral de conveniência: se falhar (lista cheia, rede), a amostra já foi salva e o
// usuário não deve ver erro por causa disso.
export function useRememberSampleType(saved: UserSampleType[]) {
  const add = useAddUserSampleType()
  const { mutateAsync } = add
  return useCallback(
    (value: string) => {
      const trimmed = value.trim()
      if (!trimmed) return
      const key = sampleTypeKey(trimmed)
      if (saved.some((t) => sampleTypeKey(t.value) === key)) return
      void mutateAsync(trimmed).catch(() => {})
    },
    [saved, mutateAsync],
  )
}
