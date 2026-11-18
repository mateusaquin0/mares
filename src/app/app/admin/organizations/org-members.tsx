"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Trash2, Search } from "lucide-react"

import { addMemberSchema, type AddMemberData } from "@/schemas/organization.schema"
import { useAddOrgMember, useSetOrgMemberRole, useRemoveOrgMember } from "@/hooks/use-admin"
import { useLookupUser } from "@/hooks/use-users"
import type { AdminOrg } from "@/types/admin"
import type { OrgMemberRole } from "@/types/organization"
import { useErrorMessage } from "@/lib/use-error-message"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DialogBody, DialogFooter } from "@/components/ui/dialog"
import { InputActionButton, InputWithAction } from "@/components/ui/input-action"
import { FormSectionTitle } from "@/components/ui/section"
import { ConfirmDialog } from "@/components/confirm-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Truncate } from "@/components/ui/truncate"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Gestão de membros de um grupo pelo admin global (adicionar, mudar papel, remover).
export function OrgMembers({ org }: { org: AdminOrg }) {
  const t = useTranslations("adminOrgs")
  const tc = useTranslations("common")
  const tval = useTranslations("validation")
  const em = useErrorMessage()

  const addM = useAddOrgMember(org.id)
  const roleM = useSetOrgMemberRole(org.id)
  const removeM = useRemoveOrgMember(org.id)
  const lookupM = useLookupUser()
  const [removing, setRemoving] = useState<string | null>(null)
  // Resultado da lupa: null = ainda não buscou; found = já existe (nome preenchido e travado).
  const [lookup, setLookup] = useState<{ found: boolean } | null>(null)

  const form = useForm<AddMemberData>({
    resolver: zodResolver(addMemberSchema),
    defaultValues: { email: "", name: "", role: "RESEARCHER" },
  })

  // Lupa: busca o e-mail na plataforma. Se existir, preenche o nome e trava o campo; senão,
  // libera o nome para convidar um novo usuário. (Mesma lógica da lista de membros do grupo.)
  async function lookupEmail() {
    const email = form.getValues("email").trim().toLowerCase()
    if (!EMAIL_RE.test(email)) {
      form.setError("email", { message: "email" })
      return
    }
    try {
      const res = await lookupM.mutateAsync(email)
      setLookup({ found: res.exists })
      // Encontrado: preenche o nome (vazio → undefined, para não exigir o campo travado);
      // não encontrado: libera o campo. Buscar nunca invalida o nome.
      form.setValue("name", res.exists ? res.name || undefined : "", { shouldValidate: false })
      form.clearErrors("name")
    } catch (err) {
      toast.error(t("addLookupError"), { description: em(err) })
    }
  }

  async function onAdd(data: AddMemberData) {
    try {
      const res = await addM.mutateAsync({ ...data, name: data.name?.trim() || undefined })
      toast.success(res.invited ? t("memberInvited") : t("memberAdded"))
      form.reset({ email: "", name: "", role: "RESEARCHER" })
      setLookup(null)
    } catch (err) {
      toast.error(t("addError"), { description: em(err) })
    }
  }

  async function changeRole(userId: string, role: OrgMemberRole) {
    try {
      await roleM.mutateAsync({ userId, role })
      toast.success(t("roleChanged"))
    } catch (err) {
      toast.error(t("roleError"), { description: em(err) })
    }
  }

  async function remove(userId: string) {
    setRemoving(userId)
    try {
      const res = await removeM.mutateAsync(userId)
      toast.success(res.orgDeactivated ? t("orgDeactivatedToast") : t("memberRemoved"))
    } catch (err) {
      toast.error(t("removeError"), { description: em(err) })
    } finally {
      setRemoving(null)
    }
  }

  // Corpo e rodapé do diálogo do grupo: a lista de usuários e o formulário de adição rolam
  // juntos; o botão Adicionar fica na faixa do rodapé.
  return (
    <form onSubmit={form.handleSubmit(onAdd)} className="flex min-h-0 flex-1 flex-col gap-4">
      <DialogBody>
        <FormSectionTitle className="mt-0">{t("membersSection")}</FormSectionTitle>
        {org.members.length === 0 ? (
          <p className="py-2 text-muted-foreground">{t("noMembers")}</p>
        ) : (
          <ul>
            {org.members.map((m) => (
              <li key={m.userId} className="flex items-center gap-2 border-b border-border py-2">
                <span className="min-w-0 flex-1">
                  <Truncate className="max-w-full font-semibold">{m.name ?? "—"}</Truncate>
                  <Truncate className="max-w-full text-[13px] text-muted-foreground">
                    {m.email}
                  </Truncate>
                </span>
                <Select
                  value={m.role}
                  onValueChange={(v) => changeRole(m.userId, v as OrgMemberRole)}
                >
                  <SelectTrigger
                    className="w-[164px] shrink-0"
                    aria-label={`${t("colUserRole")}: ${m.name ?? m.email}`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ORG_ADMIN">{tc("roleAdmin")}</SelectItem>
                    <SelectItem value="RESEARCHER">{tc("roleResearcher")}</SelectItem>
                  </SelectContent>
                </Select>
                <ConfirmDialog
                  title={t("removeMemberTitle")}
                  description={t("removeMemberDesc", { email: m.email })}
                  confirmLabel={tc("remove")}
                  destructive
                  onConfirm={() => remove(m.userId)}
                  trigger={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0 text-destructive hover:text-destructive"
                      disabled={removing === m.userId}
                    >
                      <Trash2 className="size-4" />
                      <span className="sr-only">{tc("remove")}</span>
                    </Button>
                  }
                />
              </li>
            ))}
          </ul>
        )}

        <FormSectionTitle>{t("addMemberTitle")}</FormSectionTitle>
        <div className="mt-2 space-y-2.5">
          <div className="space-y-0.5">
            <Label htmlFor="add-email" required>
              {t("addEmailLabel")}
            </Label>
            <InputWithAction
              action={
                <InputActionButton
                  onClick={lookupEmail}
                  loading={lookupM.isPending}
                  title={t("addLookupTitle")}
                  aria-label={t("addLookupTitle")}
                >
                  {!lookupM.isPending && <Search />}
                </InputActionButton>
              }
            >
              {(() => {
                const emailReg = form.register("email")
                return (
                  <Input
                    id="add-email"
                    type="email"
                    {...emailReg}
                    onChange={(e) => {
                      emailReg.onChange(e)
                      // Editar o e-mail invalida a busca anterior.
                      if (lookup) setLookup(null)
                    }}
                  />
                )
              })()}
            </InputWithAction>
            {form.formState.errors.email && (
              <p className="text-xs text-destructive">
                {tval(form.formState.errors.email.message!)}
              </p>
            )}
            {lookup?.found && <p className="text-xs text-success">{t("addLookupFound")}</p>}
          </div>

          <div className="grid grid-cols-2 gap-x-3.5 gap-y-2.5">
            <div className="space-y-0.5">
              <Label htmlFor="add-name">{t("addNameLabel")}</Label>
              <Input id="add-name" readOnly={lookup?.found} {...form.register("name")} />
              {lookup == null ? (
                <p className="text-[13px] text-muted-foreground">{t("addNameLookupHint")}</p>
              ) : (
                !lookup.found && (
                  <p className="text-[13px] text-muted-foreground">{t("addNameNewUserHint")}</p>
                )
              )}
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">
                  {tval(form.formState.errors.name.message!)}
                </p>
              )}
            </div>
            <div className="space-y-0.5">
              <Label htmlFor="add-role">{t("colUserRole")}</Label>
              <Select
                value={form.watch("role") ?? "RESEARCHER"}
                onValueChange={(v) => form.setValue("role", v as OrgMemberRole)}
              >
                <SelectTrigger id="add-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ORG_ADMIN">{tc("roleAdmin")}</SelectItem>
                  <SelectItem value="RESEARCHER">{tc("roleResearcher")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </DialogBody>

      <DialogFooter>
        <Button type="submit" loading={form.formState.isSubmitting}>
          {t("addMemberButton")}
        </Button>
      </DialogFooter>
    </form>
  )
}
