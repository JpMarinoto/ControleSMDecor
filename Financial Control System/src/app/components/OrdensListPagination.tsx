import React from "react";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "./ui/pagination";

/** Quantidade de ordens (vendas / grupos de compra) por página nas telas de detalhe. */
export const ORDENS_PAGE_SIZE = 100;

function buildPageItems(current: number, totalPages: number): (number | "ellipsis")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const items: (number | "ellipsis")[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(totalPages - 1, current + 1);
  if (left > 2) items.push("ellipsis");
  for (let p = left; p <= right; p += 1) items.push(p);
  if (right < totalPages - 1) items.push("ellipsis");
  items.push(totalPages);
  return items;
}

type OrdensListPaginationProps = {
  page: number;
  totalItems: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  itemLabel?: string;
  className?: string;
};

export function OrdensListPagination({
  page,
  totalItems,
  pageSize = ORDENS_PAGE_SIZE,
  onPageChange,
  itemLabel = "ordens",
  className,
}: OrdensListPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems <= pageSize) return null;

  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, totalItems);
  const pages = buildPageItems(safePage, totalPages);

  const go = (p: number) => {
    const next = Math.min(Math.max(1, p), totalPages);
    if (next !== safePage) onPageChange(next);
  };

  return (
    <div className={className}>
      <p className="mb-2 text-center text-xs text-muted-foreground sm:text-left">
        Mostrando {from}–{to} de {totalItems} {itemLabel} · Página {safePage} de {totalPages}
      </p>
      <Pagination className="justify-center sm:justify-end">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              onClick={(e) => {
                e.preventDefault();
                go(safePage - 1);
              }}
              className={safePage <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
              aria-disabled={safePage <= 1}
            >
              <span className="hidden sm:block">Anterior</span>
            </PaginationPrevious>
          </PaginationItem>
          {pages.map((p, idx) =>
            p === "ellipsis" ? (
              <PaginationItem key={`ellipsis-${idx}`}>
                <PaginationEllipsis />
              </PaginationItem>
            ) : (
              <PaginationItem key={p}>
                <PaginationLink
                  href="#"
                  isActive={p === safePage}
                  onClick={(e) => {
                    e.preventDefault();
                    go(p);
                  }}
                  className="cursor-pointer min-w-9"
                >
                  {p}
                </PaginationLink>
              </PaginationItem>
            )
          )}
          <PaginationItem>
            <PaginationNext
              href="#"
              onClick={(e) => {
                e.preventDefault();
                go(safePage + 1);
              }}
              className={safePage >= totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
              aria-disabled={safePage >= totalPages}
            >
              <span className="hidden sm:block">Próxima</span>
            </PaginationNext>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
