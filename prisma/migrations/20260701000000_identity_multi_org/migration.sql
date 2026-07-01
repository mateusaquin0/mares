-- MARES — Identidade multi-organização
-- Substitui o modelo de organização única (User.orgId + User.role) pelo modelo N:N
-- (Membership) + admin global (User.isSystemAdmin) + solicitações de acesso (JoinRequest),
-- e reescreve todo o RLS. Ver docs/CADASTRO_E_ACESSO.md e docs/POLITICAS_RLS.md.

-- ─────────────────────────────────────────────────────────────
-- 0. Teardown do RLS antigo (as policies dependem de User.orgId/role e das funções antigas)
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.user_org_id();
DROP FUNCTION IF EXISTS public.user_role();

-- ─────────────────────────────────────────────────────────────
-- 1. Enums novos
-- ─────────────────────────────────────────────────────────────
CREATE TYPE "MembershipRole" AS ENUM ('ORG_ADMIN', 'RESEARCHER');
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'DELETION_REQUESTED');
CREATE TYPE "JoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- ─────────────────────────────────────────────────────────────
-- 2. Alterações em User (novas colunas antes de dropar as antigas)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public."User"
  ADD COLUMN "isSystemAdmin" boolean NOT NULL DEFAULT false,
  ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'INVITED';

-- Usuários já existentes são considerados ativos; ADMIN antigo vira admin global
UPDATE public."User" SET "status" = 'ACTIVE';
UPDATE public."User" SET "isSystemAdmin" = true WHERE "role" = 'ADMIN';

-- ─────────────────────────────────────────────────────────────
-- 3. Membership (vínculo N:N usuário ↔ organização)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public."Membership" (
  "id"        text NOT NULL,
  "userId"    text NOT NULL,
  "orgId"     text NOT NULL,
  "role"      "MembershipRole" NOT NULL DEFAULT 'RESEARCHER',
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Membership_userId_orgId_key" ON public."Membership"("userId", "orgId");
CREATE INDEX "Membership_orgId_idx" ON public."Membership"("orgId");

ALTER TABLE public."Membership"
  ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "Membership_orgId_fkey" FOREIGN KEY ("orgId")
    REFERENCES public."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migra os vínculos existentes (User.orgId → Membership)
INSERT INTO public."Membership" ("id", "userId", "orgId", "role", "createdAt")
SELECT gen_random_uuid()::text, u."id", u."orgId",
  (CASE
     WHEN u."role"::text = 'VIEWER' THEN 'RESEARCHER'
     WHEN u."role"::text = 'ADMIN'  THEN 'ORG_ADMIN'
     ELSE u."role"::text
   END)::"MembershipRole",
  now()
FROM public."User" u
WHERE u."orgId" IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 4. JoinRequest (solicitações de acesso)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public."JoinRequest" (
  "id"               text NOT NULL,
  "email"            text NOT NULL,
  "requesterName"    text NOT NULL,
  "organizationName" text NOT NULL,
  "status"           "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedById"     text,
  "reviewedAt"       timestamp(3),
  "createdAt"        timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JoinRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "JoinRequest_status_idx" ON public."JoinRequest"("status");

-- ─────────────────────────────────────────────────────────────
-- 5. Remove colunas antigas de User e o enum Role
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public."User" DROP COLUMN "orgId";
ALTER TABLE public."User" DROP COLUMN "role";
DROP TYPE "Role";

-- ─────────────────────────────────────────────────────────────
-- 6. Grants para a Data API nas tabelas novas
-- ─────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public."Membership"  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."JoinRequest" TO authenticated;

ALTER TABLE public."Membership"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."JoinRequest" ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- 7. Funções auxiliares de RLS (modelo multi-org)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_system_admin()
RETURNS boolean AS $$
  SELECT COALESCE(
    (SELECT "isSystemAdmin" FROM public."User" WHERE id = (SELECT auth.uid()::text)),
    false
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_org_member(org text)
RETURNS boolean AS $$
  SELECT public.is_system_admin() OR EXISTS (
    SELECT 1 FROM public."Membership" m
    WHERE m."userId" = (SELECT auth.uid()::text) AND m."orgId" = org
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.has_org_role(org text, roles text[])
RETURNS boolean AS $$
  SELECT public.is_system_admin() OR EXISTS (
    SELECT 1 FROM public."Membership" m
    WHERE m."userId" = (SELECT auth.uid()::text)
      AND m."orgId" = org
      AND m.role::text = ANY(roles)
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_any_org_admin()
RETURNS boolean AS $$
  SELECT public.is_system_admin() OR EXISTS (
    SELECT 1 FROM public."Membership" m
    WHERE m."userId" = (SELECT auth.uid()::text) AND m.role = 'ORG_ADMIN'
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ─────────────────────────────────────────────────────────────
-- 8. Policies — identidade
-- ─────────────────────────────────────────────────────────────
CREATE POLICY "org_select" ON public."Organization"
  FOR SELECT TO authenticated USING (public.is_org_member(id));
CREATE POLICY "org_update" ON public."Organization"
  FOR UPDATE TO authenticated
  USING (public.has_org_role(id, ARRAY['ORG_ADMIN']))
  WITH CHECK (public.has_org_role(id, ARRAY['ORG_ADMIN']));

CREATE POLICY "user_select_self" ON public."User"
  FOR SELECT TO authenticated USING (id = (SELECT auth.uid()::text));
CREATE POLICY "user_select_org" ON public."User"
  FOR SELECT TO authenticated
  USING (
    public.is_system_admin()
    OR EXISTS (
      SELECT 1 FROM public."Membership" me
      JOIN public."Membership" other ON other."orgId" = me."orgId"
      WHERE me."userId" = (SELECT auth.uid()::text) AND other."userId" = "User".id
    )
  );
CREATE POLICY "user_update" ON public."User"
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()::text) OR public.is_system_admin())
  WITH CHECK (id = (SELECT auth.uid()::text) OR public.is_system_admin());
CREATE POLICY "user_delete" ON public."User"
  FOR DELETE TO authenticated USING (public.is_system_admin());

CREATE POLICY "membership_select" ON public."Membership"
  FOR SELECT TO authenticated
  USING ("userId" = (SELECT auth.uid()::text) OR public.has_org_role("orgId", ARRAY['ORG_ADMIN']));
CREATE POLICY "membership_insert" ON public."Membership"
  FOR INSERT TO authenticated WITH CHECK (public.has_org_role("orgId", ARRAY['ORG_ADMIN']));
CREATE POLICY "membership_update" ON public."Membership"
  FOR UPDATE TO authenticated
  USING (public.has_org_role("orgId", ARRAY['ORG_ADMIN']))
  WITH CHECK (public.has_org_role("orgId", ARRAY['ORG_ADMIN']));
CREATE POLICY "membership_delete" ON public."Membership"
  FOR DELETE TO authenticated USING (public.has_org_role("orgId", ARRAY['ORG_ADMIN']));

CREATE POLICY "joinreq_select" ON public."JoinRequest"
  FOR SELECT TO authenticated USING (public.is_system_admin());
CREATE POLICY "joinreq_update" ON public."JoinRequest"
  FOR UPDATE TO authenticated USING (public.is_system_admin()) WITH CHECK (public.is_system_admin());

-- ─────────────────────────────────────────────────────────────
-- 9. Policies — dados científicos
-- ─────────────────────────────────────────────────────────────
CREATE POLICY "research_select" ON public."Research"
  FOR SELECT USING (public.is_org_member("orgId") OR "isPublic" = true);
CREATE POLICY "research_insert" ON public."Research"
  FOR INSERT TO authenticated WITH CHECK (public.is_org_member("orgId"));
CREATE POLICY "research_update" ON public."Research"
  FOR UPDATE TO authenticated USING (public.is_org_member("orgId")) WITH CHECK (public.is_org_member("orgId"));
CREATE POLICY "research_delete" ON public."Research"
  FOR DELETE TO authenticated USING (public.has_org_role("orgId", ARRAY['ORG_ADMIN']));

CREATE POLICY "protocol_select" ON public."ResearchProtocol"
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public."Research" r
    WHERE r.id = "researchId" AND (public.is_org_member(r."orgId") OR r."isPublic" = true)
  ));
CREATE POLICY "protocol_insert" ON public."ResearchProtocol"
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public."Research" r WHERE r.id = "researchId" AND public.has_org_role(r."orgId", ARRAY['ORG_ADMIN'])
  ));
CREATE POLICY "protocol_delete" ON public."ResearchProtocol"
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM public."Research" r WHERE r.id = "researchId" AND public.has_org_role(r."orgId", ARRAY['ORG_ADMIN'])
  ));

CREATE POLICY "animal_select" ON public."Animal"
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public."Research" r WHERE r.id = "researchId" AND public.is_org_member(r."orgId"))
    OR ("isPublic" = true AND EXISTS (SELECT 1 FROM public."Research" r WHERE r.id = "researchId" AND r."isPublic" = true))
  );
CREATE POLICY "animal_insert" ON public."Animal"
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public."Research" r WHERE r.id = "researchId" AND public.is_org_member(r."orgId"))
  );
CREATE POLICY "animal_update" ON public."Animal"
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public."Research" r WHERE r.id = "researchId" AND public.is_org_member(r."orgId")))
  WITH CHECK (EXISTS (SELECT 1 FROM public."Research" r WHERE r.id = "researchId" AND public.is_org_member(r."orgId")));
CREATE POLICY "animal_delete" ON public."Animal"
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public."Research" r WHERE r.id = "researchId" AND public.has_org_role(r."orgId", ARRAY['ORG_ADMIN']))
  );

CREATE POLICY "sample_select" ON public."Sample"
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public."Animal" a JOIN public."Research" r ON r.id = a."researchId"
    WHERE a.id = "animalId" AND (public.is_org_member(r."orgId") OR (a."isPublic" = true AND r."isPublic" = true))
  ));
CREATE POLICY "sample_insert" ON public."Sample"
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public."Animal" a JOIN public."Research" r ON r.id = a."researchId"
    WHERE a.id = "animalId" AND public.is_org_member(r."orgId")
  ));
CREATE POLICY "sample_update" ON public."Sample"
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public."Animal" a JOIN public."Research" r ON r.id = a."researchId"
    WHERE a.id = "animalId" AND public.is_org_member(r."orgId")
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public."Animal" a JOIN public."Research" r ON r.id = a."researchId"
    WHERE a.id = "animalId" AND public.is_org_member(r."orgId")
  ));
CREATE POLICY "sample_delete" ON public."Sample"
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM public."Animal" a JOIN public."Research" r ON r.id = a."researchId"
    WHERE a.id = "animalId" AND public.has_org_role(r."orgId", ARRAY['ORG_ADMIN'])
  ));

CREATE POLICY "analysis_select" ON public."Analysis"
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public."Sample" s JOIN public."Animal" a ON a.id = s."animalId" JOIN public."Research" r ON r.id = a."researchId"
    WHERE s.id = "sampleId" AND (public.is_org_member(r."orgId") OR (a."isPublic" = true AND r."isPublic" = true))
  ));
CREATE POLICY "analysis_insert" ON public."Analysis"
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public."Sample" s JOIN public."Animal" a ON a.id = s."animalId" JOIN public."Research" r ON r.id = a."researchId"
    WHERE s.id = "sampleId" AND public.is_org_member(r."orgId")
  ));
CREATE POLICY "analysis_update" ON public."Analysis"
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public."Sample" s JOIN public."Animal" a ON a.id = s."animalId" JOIN public."Research" r ON r.id = a."researchId"
    WHERE s.id = "sampleId" AND public.is_org_member(r."orgId")
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public."Sample" s JOIN public."Animal" a ON a.id = s."animalId" JOIN public."Research" r ON r.id = a."researchId"
    WHERE s.id = "sampleId" AND public.is_org_member(r."orgId")
  ));

CREATE POLICY "media_select" ON public."AnimalMedia"
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public."Animal" a JOIN public."Research" r ON r.id = a."researchId"
    WHERE a.id = "animalId" AND (public.is_org_member(r."orgId") OR (a."isPublic" = true AND r."isPublic" = true))
  ));
CREATE POLICY "media_insert" ON public."AnimalMedia"
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public."Animal" a JOIN public."Research" r ON r.id = a."researchId"
    WHERE a.id = "animalId" AND public.is_org_member(r."orgId")
  ));
CREATE POLICY "media_delete" ON public."AnimalMedia"
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM public."Animal" a JOIN public."Research" r ON r.id = a."researchId"
    WHERE a.id = "animalId" AND public.has_org_role(r."orgId", ARRAY['ORG_ADMIN'])
  ));

CREATE POLICY "audit_select" ON public."AuditLog"
  FOR SELECT TO authenticated USING (
    public.is_system_admin() OR EXISTS (
      SELECT 1 FROM public."Membership" me
      JOIN public."Membership" other ON other."orgId" = me."orgId"
      WHERE me."userId" = (SELECT auth.uid()::text) AND other."userId" = "AuditLog"."userId"
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 10. Policies — catálogos globais
-- ─────────────────────────────────────────────────────────────
CREATE POLICY "organ_select_auth"    ON public."Organ"    FOR SELECT TO authenticated USING (true);
CREATE POLICY "organ_select_anon"    ON public."Organ"    FOR SELECT TO anon          USING (true);
CREATE POLICY "pathogen_select_auth" ON public."Pathogen" FOR SELECT TO authenticated USING (true);
CREATE POLICY "pathogen_select_anon" ON public."Pathogen" FOR SELECT TO anon          USING (true);
CREATE POLICY "examtype_select_auth" ON public."ExamType" FOR SELECT TO authenticated USING (true);
CREATE POLICY "examtype_select_anon" ON public."ExamType" FOR SELECT TO anon          USING (true);

CREATE POLICY "organ_insert"    ON public."Organ"    FOR INSERT TO authenticated WITH CHECK (public.is_any_org_admin());
CREATE POLICY "pathogen_insert" ON public."Pathogen" FOR INSERT TO authenticated WITH CHECK (public.is_any_org_admin());
CREATE POLICY "examtype_insert" ON public."ExamType" FOR INSERT TO authenticated WITH CHECK (public.is_any_org_admin());

CREATE POLICY "organ_update"    ON public."Organ"    FOR UPDATE TO authenticated USING (public.is_any_org_admin()) WITH CHECK (public.is_any_org_admin());
CREATE POLICY "pathogen_update" ON public."Pathogen" FOR UPDATE TO authenticated USING (public.is_any_org_admin()) WITH CHECK (public.is_any_org_admin());
CREATE POLICY "examtype_update" ON public."ExamType" FOR UPDATE TO authenticated USING (public.is_any_org_admin()) WITH CHECK (public.is_any_org_admin());

CREATE POLICY "organ_delete"    ON public."Organ"    FOR DELETE TO authenticated USING (public.is_system_admin());
CREATE POLICY "pathogen_delete" ON public."Pathogen" FOR DELETE TO authenticated USING (public.is_system_admin());
CREATE POLICY "examtype_delete" ON public."ExamType" FOR DELETE TO authenticated USING (public.is_system_admin());
