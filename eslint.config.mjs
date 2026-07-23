import { dirname } from "path"
import { fileURLToPath } from "url"
import { FlatCompat } from "@eslint/eslintrc"
import eslintConfigPrettier from "eslint-config-prettier"
import pluginSecurity from "eslint-plugin-security"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname,
})

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // Regras de segurança (code smells de risco: eval, regex ReDoS, acesso a fs
  // com caminho dinâmico, uso de child_process etc.). Roda no mesmo `npm run lint`.
  pluginSecurity.configs.recommended,
  {
    rules: {
      // detect-object-injection tem taxa altíssima de falso-positivo (marca qualquer
      // `obj[key]`) — os próprios mantenedores desaconselham em TS. Desligada no projeto
      // todo; o valor do plugin vem das outras regras (eval, unsafe-regex, fs dinâmico...).
      "security/detect-object-injection": "off",
    },
  },
  // Testes e scripts locais não são superfície de ataque de produção — evita ruído.
  {
    files: ["**/*.test.*", "tests/**", "scripts/**", "prisma/**"],
    rules: {
      "security/detect-non-literal-fs-filename": "off",
    },
  },
  // Desliga regras do ESLint que conflitam com a formatação do Prettier
  // (o Prettier cuida de estilo; o ESLint, da qualidade). Ver .prettierrc.json.
  eslintConfigPrettier,
]

export default eslintConfig
