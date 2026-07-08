import { test, expect } from "@playwright/test"

// Esqueleto dos fluxos CRÍTICOS autenticados (Fase 3, ROADMAP_TESTES.md §3).
// Estão SKIPADOS de propósito: dependem de um projeto Supabase de teste com Auth e
// usuários semeados (decisão em aberto — Docker/Supabase local vs projeto remoto de teste).
// Quando a infra existir: remover o skip, definir E2E_* e implementar os passos indicados.
//
// Pré-requisitos previstos:
//   - E2E_BASE_URL apontando para o app conectado ao Supabase de teste
//   - usuários semeados: um ORG_ADMIN e um RESEARCHER com senha conhecida
//   - helper de login (preencher /login e submeter)

test.describe("Fluxos autenticados (pendente: Supabase de teste)", () => {
  test.skip(true, "Requer projeto Supabase de teste com Auth — ver ROADMAP_TESTES.md §3")

  test("login → dashboard → logout", async ({ page }) => {
    // 1. goto /login; preencher e-mail/senha do usuário de teste; submeter.
    // 2. esperar URL /app/dashboard e algum elemento do painel.
    // 3. abrir o menu do usuário; clicar em sair; esperar retorno ao /login.
    expect(true).toBe(true)
  })

  test("criar pesquisa com protocolo → cadastrar animal → preencher resultado → auditoria", async ({
    page,
  }) => {
    // 1. login como RESEARCHER/ORG_ADMIN.
    // 2. criar pesquisa com uma entrada de protocolo (órgão × patógeno × exame).
    // 3. cadastrar um animal na pesquisa; verificar a grade de análises gerada.
    // 4. preencher o resultado de uma célula (POSITIVO); salvar.
    // 5. abrir a aba Histórico e verificar o registro de AuditLog.
    expect(true).toBe(true)
  })

  test("isolamento multi-org: trocar org ativa muda os dados visíveis", async ({ page }) => {
    // 1. login como usuário com Membership em duas organizações.
    // 2. listar animais; trocar a organização ativa.
    // 3. verificar que a lista passa a mostrar apenas dados da org selecionada.
    expect(true).toBe(true)
  })
})
