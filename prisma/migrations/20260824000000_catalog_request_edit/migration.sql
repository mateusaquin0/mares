-- MARES — Solicitação de glossário passa a comportar EDIÇÃO, não só inclusão.
--
-- Motivo: a regra do glossário deixa o autor editar o próprio item apenas enquanto ele não
-- está em uso (docs/PERMISSOES.md §Catálogos). Para sistema anatômico isso trancava justo o
-- que mais muda — a lista de órgãos —, no instante em que o primeiro laudo usasse o sistema,
-- e não havia saída: as solicitações só sabiam CRIAR. Agora o pesquisador propõe a edição e a
-- curadoria aplica, pelo mesmo caminho de código da edição direta.
--
-- `targetId` NULL = inclusão (comportamento de sempre). Preenchido = editar aquele item.
-- Sem FK de propósito: o item pode ser excluído entre o pedido e a revisão, e a aprovação
-- devolve "não encontrado" em vez de a migration exigir integridade que o fluxo não garante.

ALTER TABLE "CatalogRequest" ADD COLUMN "targetId" TEXT;

-- Fila de edições pendentes de um item (evita duas pessoas propondo a mesma coisa).
CREATE INDEX "CatalogRequest_targetId_status_idx" ON "CatalogRequest"("targetId", "status");
