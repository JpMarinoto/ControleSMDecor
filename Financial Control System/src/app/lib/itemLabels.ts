import { formatCurrencyBrl } from "./format";

/** Custo unitário cadastrado do produto (venda). */
export function produtoCustoUnitario(produto: {
  preco_custo?: number | string | null;
  precoCusto?: number | string | null;
} | null | undefined): number {
  if (!produto) return 0;
  const n = Number(produto.preco_custo ?? produto.precoCusto ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Texto compacto de custo ao lado da quantidade (ex.: "R$ 12,00/un"). */
export function textoCustoUnitario(custoUnitario: number): string {
  return `${formatCurrencyBrl(Number.isFinite(custoUnitario) ? custoUnitario : 0)}/un`;
}

/** Rótulo "Produto X — Fornecedor Y" para listas de venda/compra. */
export function rotuloItemComFornecedor(nome: string, fornecedorNome?: string | null): string {
  const n = String(nome ?? "").trim();
  const f = String(fornecedorNome ?? "").trim();
  if (!n) return f || "—";
  if (!f) return n;
  return `${n} — ${f}`;
}

export function fornecedorNomeProduto(produto: {
  fornecedor_nome?: string | null;
  fornecedor?: number | string | null;
} | null | undefined, fornecedoresPorId?: Map<string, string>): string {
  if (!produto) return "";
  const direto = String(produto.fornecedor_nome ?? "").trim();
  if (direto) return direto;
  if (fornecedoresPorId && produto.fornecedor != null) {
    return fornecedoresPorId.get(String(produto.fornecedor)) ?? "";
  }
  return "";
}

export function fornecedorNomeMaterial(material: {
  fornecedor_padrao_nome?: string | null;
  fornecedor_padrao?: number | string | null;
  fornecedor_padrao_id?: number | string | null;
} | null | undefined, fornecedoresPorId?: Map<string, string>): string {
  if (!material) return "";
  const direto = String(material.fornecedor_padrao_nome ?? "").trim();
  if (direto) return direto;
  const fid = material.fornecedor_padrao ?? material.fornecedor_padrao_id;
  if (fornecedoresPorId && fid != null) {
    return fornecedoresPorId.get(String(fid)) ?? "";
  }
  return "";
}
