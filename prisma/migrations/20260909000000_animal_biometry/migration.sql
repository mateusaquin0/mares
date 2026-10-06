-- MARES — Biometria do indivíduo (PMP > Biometria do SIMBA).
--
-- Uma coluna JSON, e não tabelas de catálogo + valores, porque o vocabulário de medidas é
-- definido pelo FORMULÁRIO DO SIMBA (Odontoceti, Quelônio, Aves voadoras, Mysticeti,
-- Pinípedes…), não pelo pesquisador. Guardar o rótulo literal mantém o sistema compatível
-- com qualquer espécie sem mapeamento prévio: formulário novo entra sem migração.
--
-- Formato: { "group": "Odontoceti", "unit": "Cm", "measures": [ { "label": …, "value": … } ] }
--   `measures` preserva a ORDEM do formulário (sequência anatômica; ordenar por rótulo
--   embaralharia) e inclui os campos não medidos como `value: null` — o "Não informado" da
--   tela do SIMBA. Guardar os vazios é o que alimenta o autocompletar do cadastro manual.
--
-- O "Peso total" NÃO fica aqui: continua em `Animal.necropsyWeightKg`, que já está no
-- formulário, nos dois exports e na auditoria. O rótulo permanece na lista com valor nulo
-- para preservar a posição no formulário. Ver docs/PLANO_BIOMETRIA.md.
--
-- Opcional e sem backfill: registros anteriores ficam NULL até alguém preencher ou importar.

ALTER TABLE "Animal" ADD COLUMN "measurements" JSONB;
