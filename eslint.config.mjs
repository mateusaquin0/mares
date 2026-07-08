import { dirname } from "path"
import { fileURLToPath } from "url"
import { FlatCompat } from "@eslint/eslintrc"
import eslintConfigPrettier from "eslint-config-prettier"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname,
})

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // Desliga regras do ESLint que conflitam com a formatação do Prettier
  // (o Prettier cuida de estilo; o ESLint, da qualidade). Ver .prettierrc.json.
  eslintConfigPrettier,
]

export default eslintConfig
