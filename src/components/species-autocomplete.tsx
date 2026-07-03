"use client";

import { useTranslations } from "next-intl";

import { useWormsSearch } from "@/hooks/use-worms";
import type { WormsMatch } from "@/types/worms";
import { TaxonAutocomplete } from "@/components/taxon-autocomplete";

export type { WormsMatch };

// Campo de espécie com busca no WoRMS. Fino wrapper sobre TaxonAutocomplete (a lógica de
// autocomplete é compartilhada com o campo de patógeno, que usa o NCBI).
export function SpeciesAutocomplete({
  id,
  value,
  onChange,
  className,
  invalid,
}: {
  id?: string;
  value: string;
  onChange: (species: string, match?: WormsMatch) => void;
  className?: string;
  invalid?: boolean;
}) {
  const t = useTranslations("animals");
  const search = useWormsSearch();

  return (
    <TaxonAutocomplete
      id={id}
      value={value}
      invalid={invalid}
      className={className}
      searchingText={t("wormsSearching")}
      emptyText={t("wormsEmpty")}
      search={search}
      onChange={(name, m) =>
        onChange(
          name,
          m
            ? {
                aphiaId: m.id,
                scientificName: m.scientificName,
                rank: m.rank,
                status: null,
                family: m.family,
                order: m.order,
              }
            : undefined
        )
      }
    />
  );
}
