-- MARES — Políticas de Row Level Security (RLS)
-- Baseado em docs/POLITICAS_RLS.md, adaptado às boas práticas da skill Supabase:
--  • funções auxiliares no schema public (SECURITY DEFINER, só expõem dados do próprio caller)
--  • cláusula TO authenticated/anon explícita (auth.role() está depreciado)
--  • WITH CHECK nos UPDATE para impedir reatribuição de orgId
--
-- Observação de arquitetura: a aplicação acessa o banco via Prisma (pooler, role postgres),
-- que IGNORA o RLS. O RLS aqui é defesa em profundidade para acessos via Data API (PostgREST),
-- usado pelo middleware (leitura do próprio User) e futuramente pelo mapa público.

-- ─────────────────────────────────────────────────────────────
-- 1. Funções auxiliares
-- ─────────────────────────────────────────────────────────────

-- Colunas de ID são text (Prisma). auth.uid() retorna uuid → comparar com auth.uid()::text.

CREATE OR REPLACE FUNCTION public.user_org_id()
RETURNS text AS $$
  SELECT "orgId"
  FROM public."User"
  WHERE id = (SELECT auth.uid()::text)
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.user_role()
RETURNS text AS $$
  SELECT role::text
  FROM public."User"
  WHERE id = (SELECT auth.uid()::text)
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ─────────────────────────────────────────────────────────────
-- 2. Grants para a Data API (anon/authenticated)
--    Tabelas criadas pelo Prisma precisam de GRANT explícito.
-- ─────────────────────────────────────────────────────────────

GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3. Ativar RLS em todas as tabelas
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public."Organization"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."User"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Research"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ResearchProtocol" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Animal"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Sample"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Analysis"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AnimalMedia"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AuditLog"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Organ"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Pathogen"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ExamType"         ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- 4. Organization
-- ─────────────────────────────────────────────────────────────

CREATE POLICY "org_select" ON public."Organization"
  FOR SELECT TO authenticated
  USING (id = public.user_org_id());

CREATE POLICY "org_update" ON public."Organization"
  FOR UPDATE TO authenticated
  USING (id = public.user_org_id() AND public.user_role() IN ('ORG_ADMIN', 'ADMIN'))
  WITH CHECK (id = public.user_org_id() AND public.user_role() IN ('ORG_ADMIN', 'ADMIN'));

-- ─────────────────────────────────────────────────────────────
-- 5. User
-- ─────────────────────────────────────────────────────────────

-- Usuário vê a si mesmo (necessário para o middleware e as funções auxiliares)
CREATE POLICY "user_select_self" ON public."User"
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()::text));

-- Usuário vê os membros da própria organização
CREATE POLICY "user_select_org" ON public."User"
  FOR SELECT TO authenticated
  USING ("orgId" = public.user_org_id());

-- Usuário edita a si mesmo; ORG_ADMIN/ADMIN editam membros da própria org
CREATE POLICY "user_update" ON public."User"
  FOR UPDATE TO authenticated
  USING (
    id = (SELECT auth.uid()::text)
    OR ("orgId" = public.user_org_id() AND public.user_role() IN ('ORG_ADMIN', 'ADMIN'))
  )
  WITH CHECK (
    id = (SELECT auth.uid()::text)
    OR ("orgId" = public.user_org_id() AND public.user_role() IN ('ORG_ADMIN', 'ADMIN'))
  );

CREATE POLICY "user_delete" ON public."User"
  FOR DELETE TO authenticated
  USING ("orgId" = public.user_org_id() AND public.user_role() IN ('ORG_ADMIN', 'ADMIN'));

-- ─────────────────────────────────────────────────────────────
-- 6. Research
-- ─────────────────────────────────────────────────────────────

CREATE POLICY "research_select" ON public."Research"
  FOR SELECT
  USING ("orgId" = public.user_org_id() OR "isPublic" = true);

CREATE POLICY "research_insert" ON public."Research"
  FOR INSERT TO authenticated
  WITH CHECK ("orgId" = public.user_org_id());

CREATE POLICY "research_update" ON public."Research"
  FOR UPDATE TO authenticated
  USING ("orgId" = public.user_org_id())
  WITH CHECK ("orgId" = public.user_org_id());

CREATE POLICY "research_delete" ON public."Research"
  FOR DELETE TO authenticated
  USING ("orgId" = public.user_org_id() AND public.user_role() IN ('ORG_ADMIN', 'ADMIN'));

-- ─────────────────────────────────────────────────────────────
-- 7. ResearchProtocol
-- ─────────────────────────────────────────────────────────────

CREATE POLICY "protocol_select" ON public."ResearchProtocol"
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public."Research" r
    WHERE r.id = "researchId" AND (r."orgId" = public.user_org_id() OR r."isPublic" = true)
  ));

CREATE POLICY "protocol_insert" ON public."ResearchProtocol"
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_role() IN ('ORG_ADMIN', 'ADMIN')
    AND EXISTS (SELECT 1 FROM public."Research" r WHERE r.id = "researchId" AND r."orgId" = public.user_org_id())
  );

CREATE POLICY "protocol_delete" ON public."ResearchProtocol"
  FOR DELETE TO authenticated
  USING (
    public.user_role() IN ('ORG_ADMIN', 'ADMIN')
    AND EXISTS (SELECT 1 FROM public."Research" r WHERE r.id = "researchId" AND r."orgId" = public.user_org_id())
  );

-- ─────────────────────────────────────────────────────────────
-- 8. Animal
-- ─────────────────────────────────────────────────────────────

CREATE POLICY "animal_select" ON public."Animal"
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public."Research" r WHERE r.id = "researchId" AND r."orgId" = public.user_org_id())
    OR ("isPublic" = true AND EXISTS (SELECT 1 FROM public."Research" r WHERE r.id = "researchId" AND r."isPublic" = true))
  );

CREATE POLICY "animal_insert" ON public."Animal"
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public."Research" r WHERE r.id = "researchId" AND r."orgId" = public.user_org_id()));

CREATE POLICY "animal_update" ON public."Animal"
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public."Research" r WHERE r.id = "researchId" AND r."orgId" = public.user_org_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public."Research" r WHERE r.id = "researchId" AND r."orgId" = public.user_org_id()));

CREATE POLICY "animal_delete" ON public."Animal"
  FOR DELETE TO authenticated
  USING (
    public.user_role() IN ('ORG_ADMIN', 'ADMIN')
    AND EXISTS (SELECT 1 FROM public."Research" r WHERE r.id = "researchId" AND r."orgId" = public.user_org_id())
  );

-- ─────────────────────────────────────────────────────────────
-- 9. Sample
-- ─────────────────────────────────────────────────────────────

CREATE POLICY "sample_select" ON public."Sample"
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public."Animal" a
    JOIN public."Research" r ON r.id = a."researchId"
    WHERE a.id = "animalId"
    AND (r."orgId" = public.user_org_id() OR (a."isPublic" = true AND r."isPublic" = true))
  ));

CREATE POLICY "sample_insert" ON public."Sample"
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public."Animal" a
    JOIN public."Research" r ON r.id = a."researchId"
    WHERE a.id = "animalId" AND r."orgId" = public.user_org_id()
  ));

CREATE POLICY "sample_update" ON public."Sample"
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public."Animal" a
    JOIN public."Research" r ON r.id = a."researchId"
    WHERE a.id = "animalId" AND r."orgId" = public.user_org_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public."Animal" a
    JOIN public."Research" r ON r.id = a."researchId"
    WHERE a.id = "animalId" AND r."orgId" = public.user_org_id()
  ));

CREATE POLICY "sample_delete" ON public."Sample"
  FOR DELETE TO authenticated
  USING (
    public.user_role() IN ('ORG_ADMIN', 'ADMIN')
    AND EXISTS (
      SELECT 1 FROM public."Animal" a
      JOIN public."Research" r ON r.id = a."researchId"
      WHERE a.id = "animalId" AND r."orgId" = public.user_org_id()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 10. Analysis
-- ─────────────────────────────────────────────────────────────

CREATE POLICY "analysis_select" ON public."Analysis"
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public."Sample" s
    JOIN public."Animal" a ON a.id = s."animalId"
    JOIN public."Research" r ON r.id = a."researchId"
    WHERE s.id = "sampleId"
    AND (r."orgId" = public.user_org_id() OR (a."isPublic" = true AND r."isPublic" = true))
  ));

CREATE POLICY "analysis_insert" ON public."Analysis"
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public."Sample" s
    JOIN public."Animal" a ON a.id = s."animalId"
    JOIN public."Research" r ON r.id = a."researchId"
    WHERE s.id = "sampleId" AND r."orgId" = public.user_org_id()
  ));

CREATE POLICY "analysis_update" ON public."Analysis"
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public."Sample" s
    JOIN public."Animal" a ON a.id = s."animalId"
    JOIN public."Research" r ON r.id = a."researchId"
    WHERE s.id = "sampleId" AND r."orgId" = public.user_org_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public."Sample" s
    JOIN public."Animal" a ON a.id = s."animalId"
    JOIN public."Research" r ON r.id = a."researchId"
    WHERE s.id = "sampleId" AND r."orgId" = public.user_org_id()
  ));

-- ─────────────────────────────────────────────────────────────
-- 11. AnimalMedia
-- ─────────────────────────────────────────────────────────────

CREATE POLICY "media_select" ON public."AnimalMedia"
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public."Animal" a
    JOIN public."Research" r ON r.id = a."researchId"
    WHERE a.id = "animalId"
    AND (r."orgId" = public.user_org_id() OR (a."isPublic" = true AND r."isPublic" = true))
  ));

CREATE POLICY "media_insert" ON public."AnimalMedia"
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public."Animal" a
    JOIN public."Research" r ON r.id = a."researchId"
    WHERE a.id = "animalId" AND r."orgId" = public.user_org_id()
  ));

CREATE POLICY "media_delete" ON public."AnimalMedia"
  FOR DELETE TO authenticated
  USING (
    public.user_role() IN ('ORG_ADMIN', 'ADMIN')
    AND EXISTS (
      SELECT 1 FROM public."Animal" a
      JOIN public."Research" r ON r.id = a."researchId"
      WHERE a.id = "animalId" AND r."orgId" = public.user_org_id()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 12. AuditLog (somente leitura por membros da org; escrita via service role)
-- ─────────────────────────────────────────────────────────────

CREATE POLICY "audit_select" ON public."AuditLog"
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public."User" u WHERE u.id = "userId" AND u."orgId" = public.user_org_id()
  ));

-- ─────────────────────────────────────────────────────────────
-- 13. Catálogos globais (Organ, Pathogen, ExamType)
-- ─────────────────────────────────────────────────────────────

CREATE POLICY "organ_select_auth"    ON public."Organ"    FOR SELECT TO authenticated USING (true);
CREATE POLICY "organ_select_anon"    ON public."Organ"    FOR SELECT TO anon USING (true);
CREATE POLICY "pathogen_select_auth" ON public."Pathogen" FOR SELECT TO authenticated USING (true);
CREATE POLICY "pathogen_select_anon" ON public."Pathogen" FOR SELECT TO anon USING (true);
CREATE POLICY "examtype_select_auth" ON public."ExamType" FOR SELECT TO authenticated USING (true);
CREATE POLICY "examtype_select_anon" ON public."ExamType" FOR SELECT TO anon USING (true);

CREATE POLICY "organ_insert"    ON public."Organ"    FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('ORG_ADMIN', 'ADMIN'));
CREATE POLICY "pathogen_insert" ON public."Pathogen" FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('ORG_ADMIN', 'ADMIN'));
CREATE POLICY "examtype_insert" ON public."ExamType" FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('ORG_ADMIN', 'ADMIN'));

CREATE POLICY "organ_update"    ON public."Organ"    FOR UPDATE TO authenticated USING (public.user_role() IN ('ORG_ADMIN', 'ADMIN')) WITH CHECK (public.user_role() IN ('ORG_ADMIN', 'ADMIN'));
CREATE POLICY "pathogen_update" ON public."Pathogen" FOR UPDATE TO authenticated USING (public.user_role() IN ('ORG_ADMIN', 'ADMIN')) WITH CHECK (public.user_role() IN ('ORG_ADMIN', 'ADMIN'));
CREATE POLICY "examtype_update" ON public."ExamType" FOR UPDATE TO authenticated USING (public.user_role() IN ('ORG_ADMIN', 'ADMIN')) WITH CHECK (public.user_role() IN ('ORG_ADMIN', 'ADMIN'));

CREATE POLICY "organ_delete"    ON public."Organ"    FOR DELETE TO authenticated USING (public.user_role() = 'ADMIN');
CREATE POLICY "pathogen_delete" ON public."Pathogen" FOR DELETE TO authenticated USING (public.user_role() = 'ADMIN');
CREATE POLICY "examtype_delete" ON public."ExamType" FOR DELETE TO authenticated USING (public.user_role() = 'ADMIN');
