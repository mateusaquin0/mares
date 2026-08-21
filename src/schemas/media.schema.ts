import { z } from "zod"

import { optionalText } from "@/schemas/common"
import { LIMITS } from "@/schemas/limits"

// Mensagens = chaves do namespace `validation`.

// Legenda do arquivo: texto livre e opcional — enviar vazio limpa (null). O limite acompanha
// o das observações porque a legenda costuma descrever o achado, não só nomear o arquivo
// ("laudo de histopatologia, lâmina 3, fígado — infiltrado inflamatório"), e já há legendas
// gravadas acima do limite de nome.
export const updateMediaSchema = z.object({ label: optionalText(LIMITS.longText) })

export type UpdateMediaData = z.infer<typeof updateMediaSchema>
