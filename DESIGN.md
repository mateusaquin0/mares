---
name: MARES 1a — Caderno de campo
colors:
  background: "#EAE6DC"
  popover: "#FBFAF6"
  muted: "#E1DCD0"
  foreground: "#1A1D1B"
  muted-foreground: "#565B56"
  border: "#D8D4C6"
  input: "#7C8079"
  primary: "#0F4F49"
  on-primary: "#FFFFFF"
  accent: "#D6E1D6"
  positive: "#1F6B2E"
  positive-subtle: "#E3EEDD"
  warning: "#8A4B08"
  warning-subtle: "#F6E7CC"
  info: "#1D4E80"
  info-subtle: "#E0E9F2"
  destructive: "#A3211B"
  destructive-subtle: "#F6DEDA"
  chart-1: "#0F4F49"
colors-dark:
  background: "#131614"
  popover: "#1A1E1B"
  muted: "#232824"
  foreground: "#ECE9E0"
  muted-foreground: "#A4A99F"
  border: "#343A35"
  input: "#7E857D"
  primary: "#8ACDC2"
  on-primary: "#0B1F1C"
  accent: "#1F2A26"
  positive: "#9BD3A0"
  positive-subtle: "#1F3323"
  warning: "#EDBE78"
  warning-subtle: "#3A2C17"
  info: "#9DC3EA"
  info-subtle: "#1B2C3F"
  destructive: "#F2A199"
  destructive-subtle: "#40201D"
  chart-1: "#8ACDC2"
typography:
  page-title:
    fontFamily: Newsreader
    fontSize: 28px
    fontWeight: "500"
    lineHeight: 32px
  section-title:
    fontFamily: Newsreader
    fontSize: 17px
    fontWeight: "600"
    lineHeight: 22px
  dialog-title:
    fontFamily: Newsreader
    fontSize: 22px
    fontWeight: "500"
    lineHeight: 26px
  body:
    fontFamily: Source Sans 3
    fontSize: 14px
    fontWeight: "400"
    lineHeight: 20px
  label:
    fontFamily: Source Sans 3
    fontSize: 13px
    fontWeight: "600"
    lineHeight: 16px
  table-header:
    fontFamily: Source Sans 3
    fontSize: 12px
    fontWeight: "700"
    lineHeight: 16px
    letterSpacing: 0.05em
    textTransform: uppercase
rounded:
  default: 2px
  control-max: 4px
spacing:
  base: 4px
  container-max: 1280px
  gutter: 24px
  control-height: 30px
  public-touch-target: 44px
---

Os valores acima são os que o app usa. A fonte da verdade é `src/app/globals.css` (variáveis
CSS, claro e `.dark`) e `tailwind.config.ts`; quando este arquivo e o código divergirem,
corrija o que estiver errado na mesma mudança. O desenho de referência é o handoff
"MARES 1a — Caderno de campo" (Claude Design). O redesenho entra por fatias: tokens, fontes e
primitivos e a casca (navegação no topo) já estão no código; o que está marcado **(alvo)**
ainda depende das telas.

## Direção

Sóbrio e institucional, como um caderno de campo. A estrutura é feita por **linhas e
tipografia**, não por cartões: borda de 1px `--border` entre itens e seções abertas com
borda superior de 2px `--foreground`. Sem pílulas, sem degradês, sem cartões flutuantes.

## Cor

- **Uma cor de ação**: `primary` (#0F4F49 / escuro #8ACDC2). Botão principal, link, foco,
  aba ativa, séries de gráfico.
- **Cor de status só para status**, sempre com ícone ou rótulo: `positive`, `warning`
  (alerta e inconclusivo), `info` (informativo, ex.: Publicado), `destructive` (erro). As
  variantes `-subtle` são o fundo do selo. **"Negativo" é neutro.**
- `accent` é a cor de seleção (linha selecionada, item ativo de menu).
- Claro e escuro são de primeira classe; todos os pares de texto passam WCAG AA (4,5:1) e
  contornos de campo passam 3:1.
- Nomes antigos (`success-*`, `bio`, `warning-soft/border`, `brand-cyan`) ainda existem como
  apelidos dos tokens novos em `globals.css`; saem quando a última tela migrar.

## Tipografia

- **Source Sans 3** no texto e na interface (14/20). **Newsreader** nos títulos (página 28/32
  peso 500, seção 17/22 peso 600, diálogo 22/26 peso 500) e nos **nomes científicos, sempre
  em itálico**.
- Rótulo de campo: 13px semibold. Cabeçalho de tabela: 12px bold, maiúsculas, `0.05em`.
- Números alinhados à direita com `tabular-nums`. Campo vazio = travessão (—).

## Forma e elevação

- Raio de 2px (`--radius`); no máximo 4px em controles. `rounded-full` só para pontos e
  marcadores de mapa.
- **Sombra só em menus e diálogos**: `shadow-menu` (0 8px 24px rgba(0,0,0,.18)) e
  `shadow-dialog` (0 12px 32px rgba(0,0,0,.28)). As demais sombras do Tailwind são nulas.
- Véu de diálogo chapado (`bg-scrim`).

## Componentes

- **Botões**: 30px de altura (28px `sm`, 44px `lg` nas públicas), borda de 1px. Principal
  preenchido na cor de ação; secundário com contorno `--input`; destrutivo em `destructive`.
  Confirmações usam o rótulo do código (Excluir, Remover, Sair, Confirmar…).
- **Campos**: 30px, fundo `popover`, contorno `--input`; aberto/foco na cor de ação. Erro com
  borda e texto em `destructive`. Obrigatório marcado com `*` conforme o schema.
- **Selos**: 22px, retangulares, com borda; cor só para status.
- **Tabelas**: borda superior de 2px e inferior de 1px `--foreground` no cabeçalho; linhas de
  ~34px separadas por `--border`; seleção em `accent`. **(alvo)** Tabelas largas rolam no
  próprio contêiner com a coluna de identificação fixa.
- **Abas**: texto 15px; ativa em semibold com sublinhado de 3px na cor de ação, sobre uma
  linha de 1px `--foreground`.
- **Acordeão**: seções com borda superior de 2px e título em Newsreader; abrem uma por vez
  (Necrópsia, Pesquisa).
- **Diálogos**: borda de 1px `--foreground`, cabeçalho com título e linha de 1px; detalhes de
  linha abrem em diálogo (não há painel lateral).
- **Retorno temporário (toast)**: painel com borda e ícone na cor do status.
- **Carregamento**: blocos `--muted`, sem animação, na grade do conteúdo final, com
  `aria-busy`.
- **Ordenação**: um clique alterna crescente → decrescente → sem ordem; uma coluna por vez.
- **Contador de caracteres**: monoespaçado, `atual/máx`; acima do limite em `destructive`.

## Mapas

Leaflet com tiles do OpenStreetMap dessaturados (`.map-tiles`: `grayscale(.85)`), claros nos
dois temas. **(alvo)** Marcadores: publicado preenchido, não publicado vazado; grupos são quadrados com o
número; o mapa de calor usa a rampa da cor de ação.

## Larguras

- **Área logada e administração**: só desktop, mínimo 1024×600 (abaixo, aviso com o tamanho atual
  da janela). Navegação no topo (`src/components/layout/app-header.tsx`): 1280+ tem a faixa da
  marca (48px: grupo, Como usar, Sugestão / Bug, Meus envios, usuário) e a dos itens (40px);
  1024–1279 é uma faixa só (44px) com os 5 primeiros itens e o resto em "Mais". Item ativo com
  traço inferior de 3px na cor de ação; pendências em número na cor de alerta. O admin da
  aplicação não participa de grupos e só vê os itens da administração. **(alvo)** Conteúdo
  limitado a 1280px (`padding: 0 max(24px, calc(50% - 640px))`); o mapa usa a largura total.
- **(alvo)** **Públicas** (landing, login, acesso, senhas, termos, mapa público): responsivas a partir de
  360px, alvos de toque de 44px; abaixo de 760px o painel da marca vira logotipo no topo.

## Movimento

Quem pede menos movimento no sistema não vê animações nem transições (`globals.css`).
