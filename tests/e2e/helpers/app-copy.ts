import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  lstatSync,
  rmSync,
  rmdirSync,
  statSync,
  unlinkSync,
  utimesSync,
} from "node:fs"
import path from "node:path"

import { ROOT } from "./env"

// O servidor da suíte roda a partir de uma CÓPIA do app, e não da raiz do repositório.
//
// Motivo 1 — não derrubar o desenvolvimento: o `next dev` apaga o diretório de saída (`.next`)
// ao iniciar. Um segundo `next dev` na mesma pasta apagaria o que o servidor de desenvolvimento
// já em execução compilou, e ele passaria a responder erro até ser reiniciado.
//
// Motivo 2 — produção fora de alcance: o Next carrega sozinho o `.env` da pasta em que roda, e
// o da raiz aponta para produção. A cópia não tem `.env` nenhum; o servidor da suíte só enxerga
// as variáveis que tests/e2e/server.ts entrega (as do `.env.teste`).
export const APP_COPY = path.join(ROOT, ".e2e-app")

const DIRS = ["src", "public", "messages"]
const FILES = [
  "next.config.ts",
  "tsconfig.json",
  "package.json",
  "postcss.config.mjs",
  "tailwind.config.ts",
]

function copyIfChanged(from: string, to: string) {
  const src = statSync(from)
  const dst = existsSync(to) ? statSync(to) : null
  if (dst && dst.size === src.size && Math.abs(dst.mtimeMs - src.mtimeMs) < 2) return
  copyFileSync(from, to)
  // Preserva a data de modificação: é ela que diz, na próxima execução, que nada mudou.
  utimesSync(to, src.atime, src.mtime)
}

// Remove uma entrada da cópia SEM atravessar links: um link (inclusive "junction" de pasta, no
// Windows) é desfeito pelo próprio link, nunca apagando o conteúdo para onde ele aponta.
function removeEntry(target: string) {
  const stat = lstatSync(target, { throwIfNoEntry: false })
  if (!stat) return
  if (stat.isSymbolicLink()) {
    try {
      unlinkSync(target)
    } catch {
      rmdirSync(target)
    }
    return
  }
  if (!stat.isDirectory()) return rmSync(target, { force: true })
  for (const entry of readdirSync(target)) removeEntry(path.join(target, entry))
  rmdirSync(target)
}

function mirrorDir(from: string, to: string) {
  mkdirSync(to, { recursive: true })
  const wanted = new Set<string>()
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    wanted.add(entry.name)
    const src = path.join(from, entry.name)
    const dst = path.join(to, entry.name)
    if (entry.isDirectory()) mirrorDir(src, dst)
    else if (entry.isFile()) copyIfChanged(src, dst)
  }
  // O que saiu da origem sai da cópia: um arquivo de rota apagado continuaria sendo servido.
  for (const entry of readdirSync(to)) {
    if (!wanted.has(entry)) removeEntry(path.join(to, entry))
  }
}

// Atualiza a cópia com o código atual. Só toca no que mudou, então o `next dev` da cópia (se
// já estiver de pé) recompila apenas o necessário, e o cache do webpack sobrevive entre execuções.
export function syncAppCopy() {
  mkdirSync(APP_COPY, { recursive: true })
  for (const dir of DIRS) mirrorDir(path.join(ROOT, dir), path.join(APP_COPY, dir))
  for (const file of FILES) copyIfChanged(path.join(ROOT, file), path.join(APP_COPY, file))

  // Dependências não são copiadas nem "linkadas": a cópia fica DENTRO do repositório, e a
  // resolução de módulos do Node (e do webpack) sobe até o node_modules da raiz. Um link para
  // ele aqui dentro faria editores e qualquer limpeza recursiva atravessarem para a pasta real.
  // (Versões anteriores deste arquivo criavam esse link: se sobrou, sai — só o link.)
  const staleLink = path.join(APP_COPY, "node_modules")
  if (lstatSync(staleLink, { throwIfNoEntry: false })?.isSymbolicLink()) removeEntry(staleLink)
}
