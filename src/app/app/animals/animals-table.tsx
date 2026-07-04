"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Download, Globe, Lock, MoreHorizontal } from "lucide-react";

import type { AnimalListItem } from "@/types/animal";
import { useTable } from "@/lib/use-table";
import { downloadAnimalsExport, type ExportFormat } from "@/lib/export-download";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableHead } from "@/components/ui/sortable-head";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Tabela de animais: busca, ordenação e ações (ver/editar/excluir). O estado dos
// dados vive no AnimalsManager; aqui só apresentamos e sinalizamos ações.
export function AnimalsTable({
  items,
  isOrgAdmin,
  onEdit,
  onDelete,
}: {
  items: AnimalListItem[];
  isOrgAdmin: boolean;
  onEdit: (a: AnimalListItem) => void;
  onDelete: (a: AnimalListItem) => void;
}) {
  const t = useTranslations("animals");
  const tc = useTranslations("common");
  const locale = useLocale();

  const controlOf = (a: AnimalListItem) =>
    a.controlId ?? a.simbaRecordNumber ?? "";
  const locationOf = (a: AnimalListItem) =>
    [a.municipality, a.state].filter(Boolean).join(", ");
  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(locale) : "";
  const sexLabel = (s: string | null) =>
    s === "M"
      ? t("sexMale")
      : s === "F"
        ? t("sexFemale")
        : s === "U"
          ? t("sexUndetermined")
          : (s ?? "");

  const table = useTable(items, {
    locale,
    initialSort: { key: "date", dir: "desc" },
    columns: {
      control: controlOf,
      species: (a) => a.species,
      sex: (a) => sexLabel(a.sex),
      lifeStage: (a) => a.lifeStage ?? "",
      location: locationOf,
      date: (a) => a.eventDate ?? "",
      research: (a) => a.research.name,
      isPublic: (a) => a.isPublic ? "1" : "0",
      samples: (a) => a._count.samples,
    },
    search: (a) =>
      [
        controlOf(a),
        a.species,
        sexLabel(a.sex),
        a.lifeStage ?? "",
        locationOf(a),
        a.research.name,
      ].join(" "),
  });

  // Seleção para exportação (ids acumulados; a seleção "todos" age sobre as linhas filtradas).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const rowIds = table.rows.map((a) => a.id);
  const allSelected = rowIds.length > 0 && rowIds.every((id) => selected.has(id));
  const someSelected = rowIds.some((id) => selected.has(id));

  const toggleRow = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const toggleAll = (on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of rowIds) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  async function exportAs(format: ExportFormat) {
    if (selected.size === 0) return;
    setExporting(true);
    try {
      await downloadAnimalsExport([...selected], format);
    } catch {
      toast.error(t("exportError"));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          value={table.query}
          onChange={(e) => table.setQuery(e.target.value)}
          placeholder={tc("search")}
          className="max-w-sm"
        />
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {t("selectedCount", { count: selected.size })}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" loading={exporting}>
                  <Download className="size-4" />
                  {t("export")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => exportAs("xlsx")}>
                  {t("exportExcel")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => exportAs("darwin-core")}>
                  {t("exportDarwin")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
      <div className="overflow-hidden rounded-xl border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  aria-label={t("selectAll")}
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={(v) => toggleAll(v === true)}
                />
              </TableHead>
              <SortableHead
                sortKey="control"
                sort={table.sort}
                onToggle={table.toggleSort}
              >
                {t("colControl")}
              </SortableHead>
              <SortableHead
                sortKey="species"
                sort={table.sort}
                onToggle={table.toggleSort}
              >
                {t("colSpecies")}
              </SortableHead>
              <SortableHead
                sortKey="sex"
                sort={table.sort}
                onToggle={table.toggleSort}
              >
                {t("colSex")}
              </SortableHead>
              <SortableHead
                sortKey="location"
                sort={table.sort}
                onToggle={table.toggleSort}
              >
                {t("colLocation")}
              </SortableHead>
              <SortableHead
                sortKey="date"
                sort={table.sort}
                onToggle={table.toggleSort}
              >
                {t("colDate")}
              </SortableHead>
              <SortableHead
                sortKey="research"
                sort={table.sort}
                onToggle={table.toggleSort}
              >
                {t("colResearch")}
              </SortableHead>
              <SortableHead
                sortKey="isPublic"
                sort={table.sort}
                onToggle={table.toggleSort}
              >
                {t("colVisibility")}
              </SortableHead>
              <SortableHead
                sortKey="samples"
                sort={table.sort}
                onToggle={table.toggleSort}
                align="right"
              >
                {t("colSamples")}
              </SortableHead>
              <TableHead className="w-16 text-right">{tc("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="text-center text-sm text-muted-foreground"
                >
                  {tc("noResults")}
                </TableCell>
              </TableRow>
            ) : (
              table.rows.map((a) => (
                <TableRow key={a.id} data-state={selected.has(a.id) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      aria-label={t("selectRow")}
                      checked={selected.has(a.id)}
                      onCheckedChange={(v) => toggleRow(a.id, v === true)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link
                      href={`/app/animals/${a.id}`}
                      className="hover:underline"
                    >
                      {controlOf(a) || (
                        <span className="text-muted-foreground">
                          {t("notInformed")}
                        </span>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="italic">{a.species}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {sexLabel(a.sex)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {locationOf(a)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {fmtDate(a.eventDate)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {a.research.name}
                  </TableCell>
                  <TableCell>
                    {a.isPublic ? (
                      <Badge variant="public" className="gap-1">
                        <Globe className="size-3" />
                        {t("public")}
                      </Badge>
                    ) : (
                      <Badge variant="private" className="gap-1">
                        <Lock className="size-3" />
                        {t("private")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {a._count.samples}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontal className="size-4" />
                          <span className="sr-only">{tc("actions")}</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/app/animals/${a.id}`}>{t("view")}</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onEdit(a)}>
                          {tc("edit")}
                        </DropdownMenuItem>
                        {isOrgAdmin && (
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => onDelete(a)}
                          >
                            {tc("delete")}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
