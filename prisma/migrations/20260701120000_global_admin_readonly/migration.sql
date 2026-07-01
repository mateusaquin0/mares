-- MARES — Admin global passa a ser somente-leitura de organizações/usuários e PERDE acesso
-- aos dados científicos. Ver docs/CADASTRO_E_ACESSO.md e docs/POLITICAS_RLS.md.

-- ─────────────────────────────────────────────────────────────
-- 1. Helpers de escopo SEM o bypass do admin global (escopo puro por Membership).
--    As policies das tabelas científicas usam estes helpers, então o admin global
--    deixa automaticamente de enxergar Research/Animal/Sample/Analysis/Media/Protocol.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_org_member(org text)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."Membership" m
    WHERE m."userId" = (SELECT auth.uid()::text) AND m."orgId" = org
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.has_org_role(org text, roles text[])
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."Membership" m
    WHERE m."userId" = (SELECT auth.uid()::text)
      AND m."orgId" = org
      AND m.role::text = ANY(roles)
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ─────────────────────────────────────────────────────────────
-- 2. Organização: membros veem a sua; admin global vê TODAS (oversight).
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "org_select" ON public."Organization";
CREATE POLICY "org_select" ON public."Organization"
  FOR SELECT TO authenticated
  USING (public.is_org_member(id) OR public.is_system_admin());

-- ─────────────────────────────────────────────────────────────
-- 3. Membership: próprio vínculo; admins da org; e admin global (para listar usuários).
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "membership_select" ON public."Membership";
CREATE POLICY "membership_select" ON public."Membership"
  FOR SELECT TO authenticated
  USING (
    "userId" = (SELECT auth.uid()::text)
    OR public.has_org_role("orgId", ARRAY['ORG_ADMIN'])
    OR public.is_system_admin()
  );

-- ─────────────────────────────────────────────────────────────
-- 4. AuditLog: remove o acesso do admin global (auditoria revela dados científicos).
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "audit_select" ON public."AuditLog";
CREATE POLICY "audit_select" ON public."AuditLog"
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public."Membership" me
    JOIN public."Membership" other ON other."orgId" = me."orgId"
    WHERE me."userId" = (SELECT auth.uid()::text) AND other."userId" = "AuditLog"."userId"
  ));
