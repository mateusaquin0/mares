-- MARES — Lista pessoal de "tipo de amostra".
--
-- `Sample.sampleType` é texto livre (não é catálogo da organização). Quem cadastra amostras
-- em série acabava redigitando sempre os mesmos termos ("tecido fresco", "DNA extraído"),
-- e a divergência de digitação atrapalhava a busca da própria grade.
--
-- Esta tabela guarda os termos POR USUÁRIO, para sugerir no formulário. Não é catálogo
-- compartilhado: não vale como vocabulário controlado da organização e não altera nenhum
-- dado científico — o valor gravado na amostra continua sendo o texto do formulário.
--
-- RLS aqui é defesa em profundidade: o app acessa via Prisma (role postgres, que ignora RLS)
-- e a autorização efetiva está nas rotas. Como o dado é do próprio usuário, a política é
-- simples: só o dono lê e escreve.

CREATE TABLE "UserSampleType" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "value"     TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSampleType_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserSampleType_userId_idx" ON "UserSampleType"("userId");

-- Unicidade exata. Duplicata que só difere em caixa/acento é recusada na rota (409), onde a
-- comparação usa a mesma normalização exibida ao usuário.
CREATE UNIQUE INDEX "UserSampleType_userId_value_key" ON "UserSampleType"("userId", "value");

-- Excluir o usuário leva junto a lista dele (dado de conveniência, sem valor científico).
ALTER TABLE "UserSampleType"
    ADD CONSTRAINT "UserSampleType_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public."UserSampleType" ENABLE ROW LEVEL SECURITY;

-- Habilita RLS sempre; a política via Data API só é criada onde o RLS foi provisionado
-- (mesmo guard das demais migrações — ver docs/POLITICAS_RLS.md).
DO $$
BEGIN
  IF to_regprocedure('public.is_system_admin()') IS NOT NULL THEN
    EXECUTE $p$
      CREATE POLICY "user_sample_type_own" ON public."UserSampleType"
        FOR ALL TO authenticated
        USING ("userId" = (SELECT auth.uid()::text))
        WITH CHECK ("userId" = (SELECT auth.uid()::text))
    $p$;
  END IF;
END
$$;
