// Contador de caracteres para campos com limite (par com `maxLength` no input).
// O limite vem de @/schemas/limits para não divergir da validação do servidor.
import { cn } from "@/lib/utils"

export function CharCounter({ value, max }: { value?: string | null; max: number }) {
  const length = (value ?? "").length
  // Passar do limite só acontece com dado antigo, anterior a uma redução do limite: o
  // `maxLength` do input barra a digitação, mas não trunca o valor já carregado no formulário.
  return (
    <span className={cn("text-xs", length > max ? "text-destructive" : "text-muted-foreground")}>
      {length}/{max}
    </span>
  )
}
