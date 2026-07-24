// Com um prisma.config.ts presente, o CLI PARA de carregar o .env sozinho
// ("Prisma config detected, skipping environment variable loading"). Este import
// restaura esse comportamento para o fluxo local (migrate dev, db seed, studio).
// Em CI/produção as variáveis já vêm do ambiente e o dotenv não as sobrescreve.
import "dotenv/config"
import { defineConfig } from "prisma/config"

// Substitui a chave `prisma` do package.json, depreciada e removida no Prisma 7.
// Ver aviso do CLI: https://pris.ly/prisma-config
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
})
