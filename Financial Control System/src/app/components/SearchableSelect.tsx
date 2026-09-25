import React, { useMemo, useState } from "react";
import { ChevronsUpDown, Search } from "lucide-react";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./ui/command";
import { cn } from "./ui/utils";

export type SearchableSelectOption = {
  id: string | number;
  label: string;
  /** Texto extra para pesquisa (ex.: CPF, telefone). Se omitido, usa `label`. */
  searchText?: string;
  /** Agrupa itens na lista (ex.: nome da categoria). */
  group?: string;
};

export function normalizeSearchText(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

type SearchableSelectProps = {
  value: string;
  onValueChange: (v: string) => void;
  options: SearchableSelectOption[];
  placeholder: string;
  triggerId?: string;
  disabled?: boolean;
  emptyHint?: string;
  searchPlaceholder?: string;
  listMaxHeight?: string;
  /** Largura do painel ao abrir (ex.: lista de produto/material). O botão mantém o tamanho normal. */
  listClassName?: string;
};

function groupLabel(raw: string | undefined): string {
  const t = (raw ?? "").trim();
  return t || "Sem categoria";
}

export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder,
  triggerId,
  disabled,
  emptyHint,
  searchPlaceholder = "Pesquisar…",
  listMaxHeight = "280px",
  listClassName,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = normalizeSearchText(query);
    if (!q) return options;
    return options.filter((o) => {
      const hay = normalizeSearchText(
        [o.searchText ?? o.label, o.group].filter(Boolean).join(" "),
      );
      return hay.includes(q);
    });
  }, [options, query]);

  const grouped = useMemo(() => {
    const hasAnyGroup = filtered.some((o) => (o.group ?? "").trim() !== "");
    if (!hasAnyGroup) return null;

    const m = new Map<string, SearchableSelectOption[]>();
    for (const o of filtered) {
      const g = groupLabel(o.group);
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(o);
    }
    return [...m.entries()].sort(([a], [b]) => {
      if (a === "Sem categoria") return 1;
      if (b === "Sem categoria") return -1;
      return a.localeCompare(b, "pt-BR");
    });
  }, [filtered]);

  const selected = options.find((o) => String(o.id) === value);

  const renderItem = (o: SearchableSelectOption) => (
    <CommandItem
      key={String(o.id)}
      value={String(o.id)}
      onSelect={() => {
        onValueChange(String(o.id));
        setOpen(false);
        setQuery("");
      }}
    >
      <span className="truncate">{o.label}</span>
    </CommandItem>
  );

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          id={triggerId}
          disabled={disabled || options.length === 0}
          className="w-full justify-between font-normal"
        >
          <span className="truncate text-left">{selected?.label ?? placeholder}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={
          listClassName ??
          "w-[var(--radix-popover-trigger-width)] min-w-[min(100%,20rem)] p-0"
        }
        align="start"
      >
        <Command shouldFilter={false}>
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <CommandInput
              placeholder={searchPlaceholder}
              value={query}
              onValueChange={setQuery}
              className="h-9 border-0 shadow-none focus:ring-0"
            />
          </div>
          <CommandList style={{ maxHeight: listMaxHeight }}>
            <CommandEmpty>{emptyHint ?? "Nenhum item encontrado."}</CommandEmpty>
            {grouped ? (
              grouped.map(([cat, list]) => (
                <CommandGroup
                  key={cat}
                  heading={cat}
                  className={cn(
                    "p-0",
                    "[&_[cmdk-group-heading]]:sticky [&_[cmdk-group-heading]]:top-0 [&_[cmdk-group-heading]]:z-10",
                    "[&_[cmdk-group-heading]]:bg-primary/5 [&_[cmdk-group-heading]]:text-primary",
                    "[&_[cmdk-group-heading]]:border-y [&_[cmdk-group-heading]]:border-primary/30",
                    "[&_[cmdk-group-heading]]:border-l-4 [&_[cmdk-group-heading]]:border-l-primary",
                    "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2.5",
                    "[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide",
                  )}
                >
                  {list.map(renderItem)}
                </CommandGroup>
              ))
            ) : (
              <CommandGroup>{filtered.map(renderItem)}</CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
