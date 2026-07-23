# Deploy e migrations de produção

Como o código e o schema do banco chegam em produção, e as regras para não quebrar
o ambiente ao fazer isso.

## Visão geral

Há **duas coisas** que precisam ir para produção a cada mudança, por caminhos diferentes:

| O quê          | Caminho                                  | Gatilho                                          |
| -------------- | ---------------------------------------- | ------------------------------------------------ |
| Código (app)   | Vercel (integração com Git)              | Push/merge em `main`                             |
| Schema (banco) | GitHub Actions → `prisma migrate deploy` | Push em `main` que toque `prisma/migrations/**`  |

A Vercel **não** aplica migrations — ela só roda `next build`. Quem aplica o schema
em produção é o workflow [`migrate-prod.yml`](.github/workflows/migrate-prod.yml).

## Configuração única (GitHub)

Em **Settings → Environments**, no environment `Production` (já existe se a Vercel
estiver integrada), adicionar:

- `PRODUCTION_DATABASE_URL` — connection string _pooled_ do Supabase (porta `6543`).
- `PRODUCTION_DIRECT_URL` — connection string _direta_ do Supabase (porta `5432`).
  A `migrate deploy` usa a URL direta (`directUrl` no `schema.prisma`).

**Recomendado:** marcar _Required reviewers_ nesse environment. Assim, toda alteração de
schema em produção espera uma aprovação humana antes de rodar.

## Regra de ouro: expand/contract

O código e a migration sobem **em paralelo** (Vercel e Actions disparam no mesmo push),
sem ordem garantida entre eles. Para que isso nunca quebre, mudanças de schema devem ser
**retrocompatíveis** — o código antigo tem que continuar funcionando com o schema novo
por alguns instantes. Na prática:

- **Aditivo é seguro:** adicionar tabela, coluna nullable, índice, novo enum.
- **Destrutivo exige duas etapas (dois PRs):**
  1. **Expand** — adiciona o novo, mantém o antigo; o código passa a escrever nos dois.
  2. **Contract** — depois que o código novo está 100% no ar, um segundo PR remove o antigo.

Exemplos de destrutivo que **não** pode ir num único PR: renomear/remover coluna, tornar
coluna `NOT NULL`, mudar tipo incompatível. Faça em expand → contract.

## Ambientes de preview

Deploys de _preview_ (por PR) **nunca** podem apontar para o banco de produção. Confirme
nas _Environment Variables_ da Vercel que o escopo **Preview** usa um banco separado
(Supabase branch ou banco de dev). Um preview que rode seed/migration contra produção é incidente.

## Rollback

- **Código:** _Instant Rollback_ da Vercel (promove o deploy anterior). Não toca no banco.
- **Banco:** o Prisma não faz _down migration_ automática. Reverter schema = **forward fix**:
  uma nova migration que desfaz o necessário (respeitando expand/contract). Por isso a
  disciplina acima importa — evita precisar reverter schema sob pressão.

## Rodar migration manualmente

Se precisar reaplicar fora de um push (ex.: o job falhou e foi corrigido):

- **Preferido:** GitHub → Actions → _Migrate (produção)_ → _Run workflow_ (`workflow_dispatch`).
- **Local (emergência):** com as URLs de produção no ambiente,
  `npx prisma migrate deploy`. Requer a URL **direta** em `DIRECT_URL`.
