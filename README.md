# MARES — Monitoramento e Análise de Registros de Espécies Marinhas

Plataforma web para registro, consulta e análise de dados patológicos de fauna marinha
encalhada (TCC — Engenharia da Computação). A especificação completa fica em `docs/`
(documentação interna do TCC, não versionada — ver `.gitignore`).

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 15 (App Router) + React 18 |
| Linguagem | TypeScript |
| ORM | Prisma 6 |
| Banco | PostgreSQL (Supabase) |
| Auth | Supabase Auth (`@supabase/ssr`) |
| UI | Tailwind CSS v3 + shadcn/ui |
| Estado | TanStack Query |
| Validação | Zod + React Hook Form |

> **Notas de versão:** o stack foi fixado em versões estáveis maduras. Prisma foi mantido na
> v6 (a v7 removeu `url`/`directUrl` do schema, exigindo `prisma.config.ts` + driver adapter).
> React foi fixado em 18 pela compatibilidade com `react-leaflet` e o ecossistema de UI.

## Setup

1. Pré-requisitos: Node 20+ e um projeto Supabase.
2. Copie `.env.example` para `.env` e preencha as credenciais do Supabase.
3. Instale as dependências:
   ```bash
   npm install
   ```
4. Aplique as migrations e o seed dos catálogos:
   ```bash
   npx prisma migrate deploy
   npx prisma db seed
   ```
5. Rode em desenvolvimento:
   ```bash
   npm run dev
   ```

### Configuração do Supabase Auth

Em **Authentication → Sign In / Providers → Email**:
- Para desenvolvimento, considere **desativar "Confirm email"** — assim o cadastro já cria a
  sessão e leva direto ao onboarding. Com a confirmação ativa, o usuário precisa abrir o link
  enviado por e-mail (a rota `/auth/callback` faz a troca do código pela sessão).

## Scripts

```bash
npm run dev          # servidor de desenvolvimento
npm run build        # build de produção
npm run db:seed      # repovoar catálogos
npm run db:studio    # Prisma Studio
```

## Estado do desenvolvimento

### ✅ Fase 1 — Fundação (concluída)
- Setup Next.js + TypeScript + Tailwind + Prisma
- Integração Supabase (DB + Auth) + políticas de RLS
- Schema inicial, migrations e seed dos catálogos
- **Identidade e acesso** (cadastro fechado, multi-organização): login, solicitação de
  acesso + aprovação pelo admin global, criação de pesquisadores por e-mail (convite Supabase),
  vínculos `Membership` (papel por org) e organização ativa — ver [`docs/CADASTRO_E_ACESSO.md`](docs/CADASTRO_E_ACESSO.md)
- Middleware de proteção de rotas (`/app/*`, `/app/admin/*`) e tela "sem organização"

### ⏳ Próximas fases
- Fase 2 — Pesquisas e protocolos
- Fase 3 — Animais e análises (+ importação SIMBA, migração do protótipo)
- Fase 4 — Mapa interativo
- Fase 5 — Dashboard e gráficos
- Fase 6 — Exportação Darwin Core, visibilidade e testes

## Estrutura

```
src/
├── app/
│   ├── (auth)/login, register      ← autenticação (URLs /login, /register)
│   ├── onboarding/                 ← criação da organização (semi-protegida)
│   ├── app/                        ← área protegida (/app/*) com sidebar
│   │   └── dashboard/
│   ├── auth/callback/              ← troca de código OAuth/e-mail
│   └── api/auth/onboarding/        ← cria Organization + User
├── components/ui/                  ← primitivos (button, input, card, ...)
├── components/layout/              ← sidebar, sign-out
├── lib/                            ← prisma, supabase, auth, errors, utils
└── schemas/                        ← schemas Zod compartilhados

prisma/
├── schema.prisma
├── seed.ts
└── migrations/                     ← init + rls_policies
```
