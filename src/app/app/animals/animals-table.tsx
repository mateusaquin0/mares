"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { MoreHorizontal } from "lucide-react";

import type { AnimalListItem } from "@/types/animal";
import { useTable } from "@/lib/use-table";
import { Button } from "@/components/ui/button";
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

  return (
    <div className="space-y-3">
      <Input
        value={table.query}
        onChange={(e) => table.setQuery(e.target.value)}
        placeholder={tc("search")}
        className="max-w-sm"
      />
      <div className="overflow-hidden rounded-xl border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
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
                  colSpan={8}
                  className="text-center text-sm text-muted-foreground"
                >
                  {tc("noResults")}
                </TableCell>
              </TableRow>
            ) : (
              table.rows.map((a) => (
                <TableRow key={a.id}>
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
                  <TableCell className="italic">{a.species}</TableCell>
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
