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

## Funcionalidades

### Fundação
- Next.js + TypeScript + Tailwind + Prisma; integração Supabase (DB + Auth) + RLS
- Schema com 16 modelos, migrations versionadas e seed dos catálogos

### Identidade e acesso
- Cadastro fechado e multi-organização: login, solicitação de acesso + aprovação pelo admin
  global, criação de pesquisadores por e-mail (convite Supabase), vínculos `Membership` (papel
  por organização) e organização ativa — ver [`docs/CADASTRO_E_ACESSO.md`](docs/CADASTRO_E_ACESSO.md)
- Middleware de proteção de rotas (`/app/*`, `/app/admin/*`) e tela "sem organização"

### Pesquisas, protocolos e catálogos
- CRUD de pesquisas com protocolo flexível (patógeno × exame por pesquisa)
- Glossários/catálogos por organização (patógenos, grupos, órgãos, tipos de exame) com i18n

### Animais, amostras e análises
- Cadastro de animais (encalhe + necropsia), amostras e grade de análises
- Compartilhamento de indivíduo entre pesquisas; mídia; `AuditLog` por animal
- Autocomplete taxonômico (WoRMS/NCBI) e importação SIMBA (Darwin Core)

### Mapa interativo
- Mapa por organização e **mapa público** (`/map`) com pontos de encalhe, heatmap,
  clustering e filtros; export CSV dos pontos filtrados

### Dashboard e gráficos
- Indicadores e gráficos (Recharts) sobre os registros da organização

### Exportação e visibilidade
- Exportação **Darwin Core** por pesquisa e planilha XLSX de animais
- Controle de visibilidade granular (público = `animal.isPublic AND research.isPublic`)

### Segurança
- Row Level Security (RLS) no PostgreSQL como defesa em profundidade, além da autorização na
  aplicação (papel por organização + escopo por pesquisa)
- Rate limiting nas rotas públicas/proxies externos (ver `src/lib/rate-limit.ts`)
- Headers de segurança (HSTS, X-Frame-Options, nosniff, Referrer/Permissions-Policy) e
  **CSP com nonce por requisição** montada no middleware (`src/lib/csp.ts`) — proteção contra
  clickjacking e XSS. Ver [`docs/MIDDLEWARE.md`](docs/MIDDLEWARE.md) §7.

### Testes automatizados
- **Unitários** — 104 testes com Vitest: schemas Zod, parsers (Darwin Core/SIMBA, NCBI, WoRMS)
  e utilitários (`npm test`).
- **Integração** — Vitest contra Postgres real: isolamento multi-org (anti-IDOR), unicidade por
  org e visibilidade de export (`npm run test:integration`).
- **E2E** — Playwright: smoke da superfície pública (landing + mapa) (`npm run test:e2e`).
  Fluxos autenticados ficam como esqueleto até haver um Supabase de teste.
- Plano completo em [`docs/ROADMAP_TESTES.md`](docs/ROADMAP_TESTES.md).

### CI
- GitHub Actions (`.github/workflows/ci.yml`): typecheck + lint + Prettier + unitários, mais
  jobs de integração (Postgres) e E2E (Postgres + Chromium).

## Estrutura

```
src/
├── app/
│   ├── (auth)/login, request-access ← autenticação e solicitação de acesso
│   ├── auth/                        ← callback OAuth/e-mail, set/forgot-password
│   ├── map/                         ← mapa público (sem login)
│   ├── app/                         ← área protegida (/app/*) com sidebar
│   │   ├── dashboard, research, animals, samples-tab, map
│   │   ├── catalogs, members, organizations, profile
│   │   └── admin/                   ← admin global (usuários, orgs, solicitações)
│   └── api/                         ← Route Handlers (auth nos próprios handlers)
├── components/ui/                   ← primitivos (button, input, card, ...)
├── components/{layout,form,map}/    ← sidebar, campos de formulário, Leaflet
├── hooks/                           ← TanStack Query (use-animals, use-research, ...)
├── services/                        ← regras de domínio consumidas pelas rotas
├── lib/                             ← prisma, supabase, auth, errors, rate-limit, ...
├── schemas/                         ← schemas Zod compartilhados
└── i18n/                            ← next-intl (pt/en)

prisma/
├── schema.prisma                    ← 16 modelos (Organization … AuditLog)
├── seed.ts
└── migrations/                      ← migrations versionadas (init, RLS, ...)
```
