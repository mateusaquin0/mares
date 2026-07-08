// Contador de caracteres para campos com limite (par com `maxLength` no input).
// O limite vem de @/schemas/limits para não divergir da validação do servidor.
export function CharCounter({ value, max }: { value?: string | null; max: number }) {
  return (
    <span className="text-xs text-muted-foreground">
      {(value ?? "").length}/{max}
    </span>
  )
}
