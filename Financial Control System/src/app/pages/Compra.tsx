import React, { useState, useEffect, useMemo, useRef, type FormEvent } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { SearchableSelect, normalizeSearchText } from "../components/SearchableSelect";
import { CadastroRapidoItemDialog, type CadastroRapidoModo } from "../components/CadastroRapidoItemDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "../components/ui/command";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../components/ui/collapsible";
import {
  ShoppingCart,
  Plus,
  Trash2,
  Copy,
  Pencil,
  Check,
  X,
  Printer,
  Calendar,
  Hash,
  Package,
  Ban,
  MessageSquare,
  PanelRightOpen,
  ChevronsUpDown,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import {
  formatDateOnly,
  parseDateOnlyToTime,
  parseLancamentoToTime,
  getTodayLocalISO,
  formatCurrencyBrl,
} from "../lib/format";
import { useAuth } from "../contexts/AuthContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { empresa, empresaEnderecoLinha, empresaDocumento } from "../data/empresa";
import { SimpleConfirmDialog, ConfirmacaoComSenhaDialog } from "../components/ConfirmacaoDialog";
import { DocumentPrintPreview } from "../components/DocumentPrintPreview";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip";
import { cn } from "../components/ui/utils";
interface ItemCompra {
  id: number;
  tipo?: "produto";
  produto?: number;
  produto_nome?: string;
  /** Legado (API antiga); preferir produto_nome */
  material?: number;
  material_nome?: string;
  quantidade: number;
  preco_no_dia: number;
  total: number;
}

interface OrdemCompra {
  id: string | number;
  fornecedor: string;
  fornecedor_id?: number;
  numero_venda_fornecedor?: string;
  data: string;
  data_lancamento?: string;
  cancelada?: boolean;
  /** Texto da última alteração (API); exibido em tooltip discreto. */
  ultima_alteracao_observacao?: string;
  ultima_alteracao_em?: string | null;
  itens: ItemCompra[];
  total: number;
}

type CompraPickOption = { id: string | number; nome: string; categoria?: string };

function compraOptionRotulo(o: CompraPickOption): string {
  return o.nome;
}

function produtoCompraOption(p: {
  id: number | string;
  nome?: string;
  categoria_nome?: string | null;
  categoriaNome?: string | null;
}): CompraPickOption {
  const base = String(p.nome ?? "").trim() || `Produto #${p.id}`;
  const cat = String(p.categoria_nome ?? p.categoriaNome ?? "").trim();
  return {
    id: p.id,
    nome: base,
    categoria: cat || undefined,
  };
}

function fornecedorSearchText(f: {
  nome?: string;
  nomeRazaoSocial?: string;
  cpf?: string;
  cnpj?: string;
  telefone?: string;
}): string {
  return [f.nome ?? f.nomeRazaoSocial, f.cpf, f.cnpj, f.telefone].filter(Boolean).join(" ");
}

/** API de detalhe nem sempre trazia fornecedor_id; resolve pelo nome se necessário. */
function fornecedorIdDaOrdem(
  ordem: { fornecedor_id?: number | string | null; fornecedor?: string },
  fornecedores: { id: number | string; nome?: string; nomeRazaoSocial?: string }[],
): string {
  if (ordem.fornecedor_id != null && ordem.fornecedor_id !== "") {
    return String(ordem.fornecedor_id);
  }
  const nome = String(ordem.fornecedor ?? "").trim().toLowerCase();
  if (!nome) return "";
  const f = fornecedores.find((x) => {
    const n = String(x.nome ?? x.nomeRazaoSocial ?? "").trim().toLowerCase();
    return n === nome;
  });
  return f ? String(f.id) : "";
}

function ordemDuplicadaNumeroVenda(
  ordens: OrdemCompra[],
  fornecedorId: string,
  numero: string,
  excludeOrdemId?: string | number,
): OrdemCompra | undefined {
  const n = numero.trim();
  if (!n || !fornecedorId) return undefined;
  return ordens.find(
    (o) =>
      !o.cancelada &&
      /^\d+$/.test(String(o.id)) &&
      (excludeOrdemId == null || String(o.id) !== String(excludeOrdemId)) &&
      String(o.fornecedor_id ?? "") === String(fornecedorId) &&
      String(o.numero_venda_fornecedor ?? "").trim().toLowerCase() === n.toLowerCase(),
  );
}

function categoriaLabel(raw?: string): string {
  const t = (raw ?? "").trim();
  return t || "Sem categoria";
}

/** Lista de produto com pesquisa; com 2+ categorias usa o mesmo UX agrupado/expansível da Venda. */
function CompraSearchableSelect({
  value,
  onValueChange,
  options,
  placeholder,
  triggerId,
  disabled,
  emptyHint,
  searchPlaceholder = "Pesquisar por nome…",
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: CompraPickOption[];
  placeholder: string;
  triggerId?: string;
  disabled?: boolean;
  emptyHint?: string;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const mapped = useMemo(
    () =>
      options.map((o) => {
        const label = compraOptionRotulo(o);
        return {
          id: o.id,
          label,
          searchText: [label, o.categoria].filter(Boolean).join(" "),
          group: o.categoria,
        };
      }),
    [options],
  );

  const agrupados = useMemo(() => {
    const m = new Map<string, typeof mapped>();
    for (const o of mapped) {
      const g = categoriaLabel(o.group);
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(o);
    }
    return [...m.entries()].sort(([a], [b]) => {
      if (a === "Sem categoria") return 1;
      if (b === "Sem categoria") return -1;
      return a.localeCompare(b, "pt-BR");
    });
  }, [mapped]);

  const multiCategoria = agrupados.length > 1;

  const filtradosAgrupados = useMemo(() => {
    const q = normalizeSearchText(query);
    if (!q) return agrupados;
    return agrupados
      .map(
        ([cat, list]) =>
          [
            cat,
            list.filter((o) =>
              normalizeSearchText([o.searchText ?? o.label, o.group].filter(Boolean).join(" ")).includes(q),
            ),
          ] as const,
      )
      .filter(([, list]) => list.length > 0);
  }, [agrupados, query]);

  const selected = mapped.find((o) => String(o.id) === value);

  if (!multiCategoria) {
    return (
      <SearchableSelect
        value={value}
        onValueChange={onValueChange}
        options={mapped}
        placeholder={placeholder}
        triggerId={triggerId}
        disabled={disabled}
        emptyHint={emptyHint}
        searchPlaceholder={searchPlaceholder}
        listClassName="w-[min(36rem,95vw)] p-0"
      />
    );
  }

  const selecionar = (id: string) => {
    onValueChange(id);
    setOpen(false);
    setQuery("");
  };

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
      <PopoverContent className="w-[min(36rem,95vw)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={searchPlaceholder} value={query} onValueChange={setQuery} />
          <CommandList className="max-h-[320px]">
            {/* Sem CommandEmpty: categorias colapsadas fazem o cmdk achar a lista vazia */}
            {options.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {emptyHint ?? "Nenhum produto cadastrado."}
              </p>
            ) : query.trim() && filtradosAgrupados.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhum produto corresponde à pesquisa.
              </p>
            ) : query.trim() ? (
              filtradosAgrupados.map(([cat, list]) => (
                <CommandGroup
                  key={cat}
                  heading={cat}
                  className={
                    "p-0 " +
                    "[&_[cmdk-group-heading]]:sticky [&_[cmdk-group-heading]]:top-0 [&_[cmdk-group-heading]]:z-10 " +
                    "[&_[cmdk-group-heading]]:bg-primary/5 [&_[cmdk-group-heading]]:text-primary " +
                    "[&_[cmdk-group-heading]]:border-y [&_[cmdk-group-heading]]:border-primary/30 " +
                    "[&_[cmdk-group-heading]]:border-l-4 [&_[cmdk-group-heading]]:border-l-primary " +
                    "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2.5 " +
                    "[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide"
                  }
                >
                  {list.map((o) => (
                    <CommandItem
                      key={String(o.id)}
                      value={`${o.id} ${o.label}`}
                      onSelect={() => selecionar(String(o.id))}
                    >
                      <span className="truncate">{o.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))
            ) : (
              agrupados.map(([cat, list]) => {
                const isOpen = expanded.has(cat);
                return (
                  <Collapsible
                    key={cat}
                    open={isOpen}
                    onOpenChange={(next) => {
                      setExpanded((prev) => {
                        const n = new Set(prev);
                        if (next) n.add(cat);
                        else n.delete(cat);
                        return n;
                      });
                    }}
                  >
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between border-y border-primary/30 border-l-4 border-l-primary bg-primary/5 px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-primary hover:bg-primary/10"
                      >
                        <span className="truncate">{cat}</span>
                        <span className="text-xs font-normal tabular-nums text-primary/70">{list.length}</span>
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="py-1">
                        {list.map((o) => (
                          <CommandItem
                            key={String(o.id)}
                            value={`${o.id} ${o.label}`}
                            onSelect={() => selecionar(String(o.id))}
                          >
                            <span className="truncate">{o.label}</span>
                          </CommandItem>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function OrdemAlteracaoMarker({
  observacao,
  className,
}: {
  observacao?: string | null;
  className?: string;
}) {
  const text = (observacao ?? "").trim();
  if (!text) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex size-5 shrink-0 cursor-help items-center justify-center rounded-full bg-muted/90 text-muted-foreground shadow-sm ring-1 ring-border/50 hover:bg-muted hover:text-foreground",
            className,
          )}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="Ordem alterada — observação da última alteração"
        >
          <MessageSquare className="size-3 opacity-85" />
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        className="max-w-[min(340px,88vw)] border border-border bg-popover px-3 py-2 text-left text-popover-foreground shadow-md [&>svg]:hidden"
      >
        <p className="whitespace-pre-wrap text-xs leading-relaxed">{text}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function sortOrdemCompraRecentFirst(a: OrdemCompra, b: OrdemCompra): number {
  const t =
    parseLancamentoToTime(b.data_lancamento, b.data) - parseLancamentoToTime(a.data_lancamento, a.data);
  if (t !== 0) return t;
  const na = Number(a.id);
  const nb = Number(b.id);
  if (!isNaN(na) && !isNaN(nb)) return nb - na;
  return String(b.id).localeCompare(String(a.id));
}

interface NovoItemCompraForm {
  id: string;
  /** Sempre id do produto (unificado; insumos também são produtos). */
  produtoId: string;
  quantidade: string;
  precoUnitario: string;
}

/** Só produtos com fornecedor exatamente igual ao da ordem — nunca null = todos. */
function produtoDoFornecedor(p: any, fid: string) {
  if (!fid) return false;
  const pf = p.fornecedor ?? p.fornecedor_id ?? p.fornecedorId;
  if (pf == null || pf === "" || String(pf) === "null" || String(pf) === "undefined") return false;
  return String(pf) === String(fid);
}

function precoUniProdutoCompra(p: {
  preco_custo?: number | string | null;
  precoCusto?: number | string | null;
  preco_unitario_base?: number | string | null;
  precoUnitarioBase?: number | string | null;
} | null | undefined): string {
  if (!p) return "";
  const preco = p.preco_custo ?? p.precoCusto ?? p.preco_unitario_base ?? p.precoUnitarioBase;
  return preco != null && preco !== "" ? String(preco) : "";
}

/** Elegível para compra: não fabricado e com fornecedor cadastrado. */
function produtoElegivelCompraPronta(p: any) {
  if (p.fabricado) return false;
  const fid = p.fornecedor ?? p.fornecedor_id ?? p.fornecedorId;
  return fid != null && fid !== "" && String(fid) !== "null" && String(fid) !== "undefined";
}

/**
 * Quantidade inteira na compra: parseInt("2999.999…", 10) vira 2999 (input number / float em texto).
 * Aceita milhar pt-BR (ex.: 30.000).
 */
function parseQtdInteira(raw: string | number): number | null {
  if (raw === "" || raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    const r = Math.round(raw);
    return r > 0 ? r : null;
  }
  const s = String(raw).trim().replace(/\s/g, "");
  if (!s) return null;
  const milharOpcDecimal = /^(\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/;
  const norm = milharOpcDecimal.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(",", ".");
  const n = parseFloat(norm);
  if (!Number.isFinite(n) || n <= 0) return null;
  const r = Math.round(n);
  return r > 0 ? r : null;
}

/** Preço unitário pt-BR (vírgula ou ponto) → número; inválido → NaN. */
function parsePrecoDecimal(raw: string | number): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : NaN;
  const s = String(raw ?? "").trim().replace(/\s/g, "");
  if (!s) return NaN;
  const milharOpcDecimal = /^(\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/;
  const norm = milharOpcDecimal.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(",", ".");
  const n = parseFloat(norm);
  return Number.isFinite(n) ? n : NaN;
}

export function Compra() {
  const [ordens, setOrdens] = useState<OrdemCompra[]>([]);
  const [produtosCompra, setProdutosCompra] = useState<any[]>([]);
  const [fornecedores, setFornecedores] = useState<any[]>([]);

  const [produtoId, setProdutoId] = useState('');
  const [fornecedorId, setFornecedorId] = useState('');

  const fornecedoresPorId = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of fornecedores) {
      m.set(String(f.id), String(f.nome ?? f.nomeRazaoSocial ?? "").trim());
    }
    return m;
  }, [fornecedores]);

  const fornecedorSelecionadoNome = fornecedorId ? (fornecedoresPorId.get(fornecedorId) ?? "") : "";
  const [quantidade, setQuantidade] = useState('');
  const [precoUnitario, setPrecoUnitario] = useState('');
  const [numeroVendaFornecedor, setNumeroVendaFornecedor] = useState('');
  const [data, setData] = useState(getTodayLocalISO());

  const [itensForm, setItensForm] = useState<NovoItemCompraForm[]>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editQtd, setEditQtd] = useState("");
  const [editPreco, setEditPreco] = useState("");
  const [searchFornecedor, setSearchFornecedor] = useState("");
  const [searchData, setSearchData] = useState("");
  const [searchProduto, setSearchProduto] = useState("");
  const [searchNumero, setSearchNumero] = useState("");
  const [searchNumeroVendaFornecedor, setSearchNumeroVendaFornecedor] = useState("");
  const [editingItem, setEditingItem] = useState<ItemCompra & { ordemId: string | number } | null>(null);
  const [editCompraQtd, setEditCompraQtd] = useState("");
  const [editCompraPreco, setEditCompraPreco] = useState("");
  const [detailCompra, setDetailCompra] = useState<OrdemCompra | null>(null);
  const fornecedorIdDetalheCompra = useMemo(
    () => (detailCompra ? fornecedorIdDaOrdem(detailCompra, fornecedores) : ""),
    [detailCompra, fornecedores],
  );
  const produtosDetalheCompra = useMemo(
    () =>
      fornecedorIdDetalheCompra
        ? produtosCompra
            .filter((p: any) => produtoDoFornecedor(p, fornecedorIdDetalheCompra))
            .sort((a: any, b: any) => {
              const ca = String(a.categoria_nome ?? "").trim() || "Sem categoria";
              const cb = String(b.categoria_nome ?? "").trim() || "Sem categoria";
              if (ca === "Sem categoria" && cb !== "Sem categoria") return 1;
              if (cb === "Sem categoria" && ca !== "Sem categoria") return -1;
              const byCat = ca.localeCompare(cb, "pt-BR");
              if (byCat !== 0) return byCat;
              return String(a.nome ?? "").localeCompare(String(b.nome ?? ""), "pt-BR");
            })
        : [],
    [produtosCompra, fornecedorIdDetalheCompra],
  );
  const [simpleConfirm, setSimpleConfirm] = useState<{
    title: string;
    description: string;
    confirmLabel?: string;
    onConfirm: () => void;
  } | null>(null);
  const [excluirCompraOpen, setExcluirCompraOpen] = useState(false);
  const [excluirItemCompra, setExcluirItemCompra] = useState<{
    id: string | number;
    tipo: 'produto';
  } | null>(null);
  const [printPreview, setPrintPreview] = useState<{
    html: string;
    titulo: string;
    downloadBaseName: string;
  } | null>(null);
  const [editDetailDataCompra, setEditDetailDataCompra] = useState("");
  const [editDetailNumeroVendaFornecedor, setEditDetailNumeroVendaFornecedor] = useState("");
  const [addDetailProdutoId, setAddDetailProdutoId] = useState("");
  const [addDetailQtd, setAddDetailQtd] = useState("");
  const [addDetailPreco, setAddDetailPreco] = useState("");
  const [cadastroRapidoOpen, setCadastroRapidoOpen] = useState(false);
  const [cadastroRapidoModo, setCadastroRapidoModo] = useState<CadastroRapidoModo>("produto-compra");
  const [cadastroRapidoFornecedorId, setCadastroRapidoFornecedorId] = useState("");
  const cadastroRapidoOrigemRef = useRef<"nova" | "detalhe">("nova");
  const [detailSaving, setDetailSaving] = useState(false);
  const { user } = useAuth();
  const isChefe = user?.is_chefe === true;

  const avisoNumeroVendaDuplicada = useMemo(() => {
    const dup = ordemDuplicadaNumeroVenda(ordens, fornecedorId, numeroVendaFornecedor);
    return dup ? `Já existe a ordem #${dup.id} com este nº para este fornecedor.` : null;
  }, [ordens, fornecedorId, numeroVendaFornecedor]);

  const avisoDetalheNumeroDuplicada = useMemo(() => {
    if (!detailCompra || !fornecedorIdDetalheCompra) return null;
    const dup = ordemDuplicadaNumeroVenda(
      ordens,
      fornecedorIdDetalheCompra,
      editDetailNumeroVendaFornecedor,
      detailCompra.id,
    );
    return dup ? `Já existe a ordem #${dup.id} com este nº para este fornecedor.` : null;
  }, [ordens, fornecedorIdDetalheCompra, editDetailNumeroVendaFornecedor, detailCompra]);

  const abrirCadastroRapido = (origem: "nova" | "detalhe") => {
    const fid = origem === "detalhe" ? fornecedorIdDetalheCompra : fornecedorId;
    if (!fid) {
      toast.error("Selecione o fornecedor primeiro");
      return;
    }
    cadastroRapidoOrigemRef.current = origem;
    setCadastroRapidoModo("produto-compra");
    setCadastroRapidoFornecedorId(fid);
    setCadastroRapidoOpen(true);
  };

  const handleItemCriadoRapido = async (created: Record<string, unknown>) => {
    const origem = cadastroRapidoOrigemRef.current;
    const id = String(created.id);
    const fidFallback =
      origem === "detalhe" ? fornecedorIdDetalheCompra : fornecedorId || cadastroRapidoFornecedorId;
    // Garante que o item novo entre na lista mesmo se a API atrasar o fornecedor no GET.
    const createdNorm = {
      ...created,
      id: created.id,
      fornecedor: created.fornecedor ?? created.fornecedor_id ?? fidFallback,
      fabricado: Boolean(created.fabricado),
    };
    const prods = await api.getProdutos().catch(() => []);
    const all = Array.isArray(prods) ? prods : [];
    const merged = [...all];
    if (!merged.some((p: any) => String(p.id) === id)) {
      merged.push(createdNorm);
    } else {
      const idx = merged.findIndex((p: any) => String(p.id) === id);
      const cur = merged[idx];
      if (!produtoDoFornecedor(cur, fidFallback) && fidFallback) {
        merged[idx] = { ...cur, fornecedor: cur.fornecedor ?? fidFallback };
      }
    }
    setProdutosCompra(merged.filter((p: any) => produtoElegivelCompraPronta(p)));
    if (origem === "detalhe") {
      setAddDetailProdutoId(id);
      setAddDetailPreco(precoUniProdutoCompra(createdNorm));
    } else {
      setProdutoId(id);
      setPrecoUnitario(precoUniProdutoCompra(createdNorm));
    }
  };

  useEffect(() => {
    if (detailCompra?.data) setEditDetailDataCompra(String(detailCompra.data).slice(0, 10));
    setEditDetailNumeroVendaFornecedor(String(detailCompra?.numero_venda_fornecedor ?? "").trim());
  }, [detailCompra?.id, detailCompra?.data, detailCompra?.numero_venda_fornecedor]);

  const getEmpresaHeaderHtml = () => {
    const doc = empresaDocumento();
    const endereco = empresaEnderecoLinha();
    const contatos = [empresa.telefone, empresa.email, empresa.site].filter(Boolean).join(" • ");
    return `
      <div class="os-header">
        <div class="os-logo">
          <img src="/logo/logo.png" alt="Logo" onerror="this.onerror=null;this.src='/logo/logo.jpg';" />
        </div>
        <div class="empresa-block">
          <div class="empresa-nome">${empresa.nome || "Empresa"}</div>
          ${empresa.nomeFantasia && empresa.nomeFantasia !== (empresa.nome || "") ? `<div class="empresa-fantasia">${empresa.nomeFantasia}</div>` : ""}
          <div class="empresa-docs">
            ${doc ? `<span>${doc}</span>` : ""}
            ${empresa.ie ? `<span>IE: ${empresa.ie}</span>` : ""}
          </div>
          ${endereco ? `<div class="empresa-endereco">${endereco}</div>` : ""}
          ${contatos ? `<div class="empresa-contato">${contatos}</div>` : ""}
        </div>
      </div>`;
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (produtoId) {
      const p = produtosCompra.find((x: any) => String(x.id) === produtoId);
      setPrecoUnitario(precoUniProdutoCompra(p));
    } else {
      setPrecoUnitario("");
    }
  }, [produtoId, produtosCompra]);

  useEffect(() => {
    if (addDetailProdutoId) {
      const p = produtosCompra.find((x: any) => String(x.id) === addDetailProdutoId);
      setAddDetailPreco(precoUniProdutoCompra(p));
    } else {
      setAddDetailPreco("");
    }
  }, [addDetailProdutoId, produtosCompra]);

  // Ao trocar o fornecedor, limpar produto se não estiver vinculado a ele
  useEffect(() => {
    if (!fornecedorId) {
      setProdutoId("");
      return;
    }
    if (!produtoId) return;
    const p = produtosCompra.find((x: any) => String(x.id) === produtoId);
    if (!p || !produtoDoFornecedor(p, fornecedorId)) setProdutoId("");
  }, [fornecedorId, produtoId, produtosCompra]);

  const loadData = async () => {
    try {
      const [ordensRes, produtosRes, fornRes] = await Promise.all([
        api.getCompras().catch(() => []),
        api.getProdutos().catch(() => []),
        api.getFornecedores().catch(() => []),
      ]);
      setOrdens(
        Array.isArray(ordensRes)
          ? ordensRes.map((o: any) => ({
              id: o.id,
              fornecedor: o.fornecedor || "",
              fornecedor_id: o.fornecedor_id,
              numero_venda_fornecedor:
                typeof o.numero_venda_fornecedor === "string"
                  ? o.numero_venda_fornecedor
                  : o.numero_venda_fornecedor != null
                    ? String(o.numero_venda_fornecedor)
                    : "",
              data: o.data || "",
              data_lancamento: o.data_lancamento || "",
              cancelada: o.cancelada === true,
              ultima_alteracao_observacao:
                typeof o.ultima_alteracao_observacao === "string" ? o.ultima_alteracao_observacao : "",
              ultima_alteracao_em: o.ultima_alteracao_em ?? undefined,
              itens: (o.itens || []).map((i: any) => ({
                id: i.id,
                tipo: "produto" as const,
                material: i.material,
                material_nome: i.material_nome || "",
                produto: i.produto ?? i.material,
                produto_nome: i.produto_nome || i.material_nome || "",
                quantidade: parseQtdInteira(i.quantidade) ?? 0,
                preco_no_dia: Number(i.preco_no_dia) || 0,
                total: Number(i.total) || 0,
              })),
              total: Number(o.total) || 0,
            }))
          : []
      );
      const allProds = Array.isArray(produtosRes) ? produtosRes : [];
      setProdutosCompra(allProds.filter((p: any) => produtoElegivelCompraPronta(p)));
      setFornecedores(Array.isArray(fornRes) ? fornRes : []);
    } catch {
      toast.error("Erro ao carregar dados");
    }
  };

  const openDetail = async (ordem: OrdemCompra) => {
    const idStr = String(ordem.id);
    if (idStr.startsWith("item-")) {
      setDetailCompra(ordem);
      return;
    }
    try {
      const d = await api.getCompraDetalhe(idStr);
      const fornecedorId = fornecedorIdDaOrdem(
        { fornecedor_id: d.fornecedor_id ?? ordem.fornecedor_id, fornecedor: d.fornecedor ?? ordem.fornecedor },
        fornecedores,
      );
      setDetailCompra({
        ...d,
        fornecedor_id: fornecedorId ? Number(fornecedorId) : d.fornecedor_id ?? ordem.fornecedor_id,
      });
      setAddDetailProdutoId("");
      setAddDetailQtd("");
      setAddDetailPreco("");
    } catch {
      toast.error("Erro ao carregar detalhe da compra");
    }
  };

  const aplicarPatchOrdem = async (patch: {
    ordemId: string;
    data?: string;
    numero_venda_fornecedor?: string;
  }) => {
    setDetailSaving(true);
    try {
      const raw = await api.patchCompraOrdemData(patch.ordemId, {
        ...(patch.data ? { data: patch.data } : {}),
        ...(patch.numero_venda_fornecedor !== undefined
          ? { numero_venda_fornecedor: patch.numero_venda_fornecedor }
          : {}),
      });
      const r = raw as Record<string, unknown>;
      const next: OrdemCompra =
        raw && typeof raw === "object"
          ? {
              id: r.id as string | number,
              fornecedor: (r.fornecedor as string) || (detailCompra?.fornecedor || ""),
              fornecedor_id: (r.fornecedor_id as number) ?? detailCompra?.fornecedor_id,
              numero_venda_fornecedor:
                typeof r.numero_venda_fornecedor === "string"
                  ? r.numero_venda_fornecedor
                  : patch.numero_venda_fornecedor ?? detailCompra?.numero_venda_fornecedor,
              data: (r.data as string) || patch.data || detailCompra?.data || "",
              data_lancamento: (r.data_lancamento as string) || detailCompra?.data_lancamento,
              cancelada: (r.cancelada as boolean) === true,
              ultima_alteracao_observacao:
                typeof r.ultima_alteracao_observacao === "string"
                  ? r.ultima_alteracao_observacao
                  : detailCompra?.ultima_alteracao_observacao,
              ultima_alteracao_em:
                (r.ultima_alteracao_em as string | null | undefined) ?? detailCompra?.ultima_alteracao_em,
              itens: (r.itens as ItemCompra[]) || detailCompra?.itens || [],
              total: Number(r.total) || detailCompra?.total || 0,
            }
          : (detailCompra as OrdemCompra);
      setDetailCompra(next);
      setOrdens((prev) =>
        prev.map((x) =>
          String(x.id) === String(patch.ordemId)
            ? {
                ...x,
                data: next.data,
                numero_venda_fornecedor: next.numero_venda_fornecedor,
                data_lancamento: next.data_lancamento,
                cancelada: next.cancelada,
                ultima_alteracao_observacao: next.ultima_alteracao_observacao,
                ultima_alteracao_em: next.ultima_alteracao_em,
              }
            : x
        )
      );
      toast.success(
        patch.numero_venda_fornecedor !== undefined
          ? "Nº venda do fornecedor atualizado"
          : "Data da compra atualizada",
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar ordem");
    } finally {
      setDetailSaving(false);
    }
  };

  const salvarDataCompraNoDetalhe = () => {
    if (!detailCompra || !/^\d+$/.test(String(detailCompra.id))) return;
    if (detailCompra.cancelada) {
      toast.error("Esta ordem está cancelada.");
      return;
    }
    const trimmed = (editDetailDataCompra || "").trim().slice(0, 10);
    if (trimmed.length < 10) {
      toast.error("Informe a data da compra");
      return;
    }
    if (trimmed === String(detailCompra.data || "").slice(0, 10)) {
      toast.info("Data já é esta.");
      return;
    }
    void aplicarPatchOrdem({ ordemId: String(detailCompra.id), data: trimmed });
  };

  const salvarNumeroVendaNoDetalhe = () => {
    if (!detailCompra || !/^\d+$/.test(String(detailCompra.id))) return;
    if (detailCompra.cancelada) {
      toast.error("Esta ordem está cancelada.");
      return;
    }
    const trimmed = editDetailNumeroVendaFornecedor.trim().slice(0, 64);
    const atual = String(detailCompra.numero_venda_fornecedor ?? "").trim();
    if (trimmed === atual) {
      toast.info("Nº venda do fornecedor já é este.");
      return;
    }
    if (trimmed && fornecedorIdDetalheCompra) {
      const dup = ordemDuplicadaNumeroVenda(
        ordens,
        fornecedorIdDetalheCompra,
        trimmed,
        detailCompra.id,
      );
      if (dup) {
        toast.error(`Já existe a ordem #${dup.id} com este nº de venda do fornecedor.`);
        return;
      }
    }
    void aplicarPatchOrdem({
      ordemId: String(detailCompra.id),
      numero_venda_fornecedor: trimmed,
    });
  };

  const handleCopiarOrdem = () => {
    if (!detailCompra) return;
    if (detailCompra.cancelada) {
      toast.error("Não é possível copiar uma ordem cancelada.");
      return;
    }
    const idCopia = String(detailCompra.id);
    setSimpleConfirm({
      title: "Copiar ordem de compra",
      description: "Será criada uma nova ordem com os mesmos itens e fornecedor. Confirma?",
      confirmLabel: "Copiar",
      onConfirm: () => {
        void (async () => {
          try {
            await api.copiarCompra(idCopia);
            toast.success("Ordem copiada com sucesso");
            await loadData();
            setDetailCompra(null);
          } catch {
            toast.error("Erro ao copiar ordem");
          }
        })();
      },
    });
  };

  const handleDeleteCompra = async (
    id: string | number,
    password: string,
    observacao: string,
    tipoLinha?: 'produto',
  ) => {
    try {
      await api.deleteCompra(String(id), {
        password,
        observacao,
        ...(tipoLinha ? { tipo: tipoLinha } : {}),
      });
      toast.success("Item excluído");
      await loadData();
      setDetailCompra(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir");
    }
  };

  const copiarItemNaLista = (id: string) => {
    const item = itensForm.find((i) => i.id === id);
    if (!item) return;
    setItensForm((prev) => [...prev, { ...item, id: `${Date.now()}-${prev.length}` }]);
    toast.success("Item duplicado na lista");
  };

  const iniciarEdicaoItem = (item: NovoItemCompraForm) => {
    setEditingItemId(item.id);
    setEditQtd(item.quantidade);
    setEditPreco(item.precoUnitario);
  };

  const salvarEdicaoItem = () => {
    if (!editingItemId) return;
    const qtd = parseQtdInteira(editQtd);
    if (qtd === null) {
      toast.error("Quantidade deve ser válida");
      return;
    }
    if (isChefe) {
      const preco = parsePrecoDecimal(editPreco);
      if (isNaN(preco) || preco < 0) {
        toast.error("Preço deve ser válido");
        return;
      }
    }
    setItensForm((prev) =>
      prev.map((i) =>
        i.id === editingItemId
          ? {
              ...i,
              quantidade: String(qtd),
              ...(isChefe
                ? { precoUnitario: String(parsePrecoDecimal(editPreco)) }
                : {}),
            }
          : i
      )
    );
    setEditingItemId(null);
    setEditQtd("");
    setEditPreco("");
    toast.success("Item atualizado");
  };

  const cancelarEdicaoItem = () => {
    setEditingItemId(null);
    setEditQtd("");
    setEditPreco("");
  };

  const abrirEditarItem = (item: ItemCompra, ordemId: string | number) => {
    setEditingItem({ ...item, ordemId });
    setEditCompraQtd(String(item.quantidade));
    setEditCompraPreco(String(item.preco_no_dia));
  };

  const salvarEdicaoItemCompra = async () => {
    if (!editingItem) return;
    const qtd = parseQtdInteira(editCompraQtd);
    if (qtd === null) {
      toast.error("Quantidade deve ser válida");
      return;
    }
    const preco = isChefe ? parsePrecoDecimal(editCompraPreco) : editingItem.preco_no_dia;
    if (isChefe && (isNaN(preco) || preco < 0)) {
      toast.error("Preço deve ser válido");
      return;
    }
    const itemId = String(editingItem.id);
    const ordemIdRef = editingItem.ordemId;
    const detId = detailCompra ? String(detailCompra.id) : null;
    const tipo: 'produto' = 'produto';
    setDetailSaving(true);
    try {
      await api.updateCompra(itemId, {
        quantidade: qtd,
        preco_no_dia: preco,
        tipo,
      });
      toast.success("Item atualizado");
      await loadData();
      setEditingItem(null);
      if (detId && detId === String(ordemIdRef)) {
        const d = await api.getCompraDetalhe(String(ordemIdRef));
        setDetailCompra(d as OrdemCompra);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar item");
    } finally {
      setDetailSaving(false);
    }
  };

  const imprimirCompra = (ordem: OrdemCompra) => {
    const dataFormatada = formatDateOnly(ordem.data);
    const mostrarValores = isChefe;
    const usuarioNome =
      (user as any)?.first_name ||
      (user as any)?.username ||
      (user as any)?.email ||
      "";

    const itensRows = (ordem.itens || [])
      .map((i) => {
        if (mostrarValores) {
          return `<tr>
            <td>${getItemNome(i)}</td>
            <td class="num">${i.quantidade}</td>
            <td class="num">${formatCurrencyBrl(i.preco_no_dia)}</td>
            <td class="num">${formatCurrencyBrl(i.total)}</td>
          </tr>`;
        }
        return `<tr>
          <td>${getItemNome(i)}</td>
          <td class="num">${i.quantidade}</td>
          <td class="num">-</td>
          <td class="num">-</td>
        </tr>`;
      })
      .join("");

    const hojeStr = new Date().toLocaleString("pt-BR");

    const html = `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><title>Ordem de compra – ${ordem.fornecedor}</title>
    <style>
      @page { size: A4; margin: 15mm; }
      body { font-family: 'Segoe UI', system-ui, sans-serif; font-size: 12px; color: #1a1a1a; line-height: 1.45; max-width: 210mm; margin: 0 auto; padding: 16px; background: #f3f4f6; }
      .doc { background: #ffffff; border-radius: 10px; border: 1px solid #e2e8f0; padding: 18px 20px 20px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); }
      .os-header{display:flex;gap:8px;align-items:center;margin-bottom:6px}
      .os-logo img{max-height:56px;max-width:56px;object-fit:contain}
      .empresa-block { font-size: 0.7rem; }
      .empresa-nome { font-size: 0.85rem; font-weight: 600; color: #111827; letter-spacing: 0.02em; line-height: 1.3; }
      .empresa-fantasia { font-size: 0.7rem; color: #4b5563; margin-top: 2px; }
      .empresa-docs { font-size: 0.65rem; color: #6b7280; margin-top: 4px; }
      .empresa-docs span + span::before { content: " | "; }
      .empresa-endereco { font-size: 0.65rem; color: #6b7280; margin-top: 2px; }
      .empresa-contato { font-size: 0.65rem; color: #6b7280; margin-top: 2px; }
      .doc-title { text-align: right; margin-bottom: 10px; }
      .doc-title h1 { margin: 0; font-size: 16px; letter-spacing: 0.16em; color: #111827; }
      .doc-title .sub { font-size: 11px; color: #6b7280; margin-top: 4px; }
      .info {
        background: #f9fafb;
        border-radius: 10px;
        padding: 12px 14px;
        margin-bottom: 18px;
        font-size: 12px;
        border: 1px solid #e5e7eb;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px 14px;
      }
      .info strong { font-weight: 600; color: #374151; }
      .resumo-box {
        background: linear-gradient(135deg, #fefce8 0%, #fef3c7 100%);
        border: 1px solid #facc15;
        border-radius: 10px;
        padding: 10px 12px;
        margin-bottom: 16px;
        font-size: 12px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
      }
      .resumo-box .label { font-weight: 600; color: #854d0e; }
      .resumo-box .valor { font-weight: 700; font-size: 14px; color: #b45309; }
      .tabela-itens table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 11px; border-radius: 6px; overflow: hidden; }
      .tabela-itens th, .tabela-itens td { border: 1px solid #e5e7eb; padding: 7px 8px; text-align: left; }
      .tabela-itens th { background: #f3f4f6; font-weight: 600; color: #374151; }
      .tabela-itens .num { text-align: right; white-space: nowrap; }
      .muted { color: #6b7280; font-size: 11px; margin-top: 18px; display: flex; justify-content: space-between; gap: 8px; }
      .assinatura { margin-top: 28px; text-align: center; }
      .assinatura-linha { width: 60%; max-width: 240px; margin: 0 auto 6px; border-bottom: 2px solid #4b5563; height: 28px; }
      .assinatura-texto { font-size: 11px; color: #6b7280; }
      @media print {
        body { background: #ffffff; padding: 0; }
        .doc { box-shadow: none; border-radius: 0; border: none; }
      }
    </style>
  </head>
  <body>
    <div class="doc">
      ${getEmpresaHeaderHtml()}
      <div class="doc-title">
        <h1>ORDEM DE COMPRA</h1>
        <div class="sub">Nº ${ordem.id} — ${dataFormatada}</div>
      </div>

      <div class="info">
        <div><strong>Fornecedor:</strong> ${ordem.fornecedor}</div>
        <div><strong>Data da ordem:</strong> ${dataFormatada}</div>
        ${ordem.numero_venda_fornecedor ? `<div><strong>Nº venda fornecedor:</strong> ${ordem.numero_venda_fornecedor}</div>` : ""}
        <div><strong>Lançado por:</strong> ${usuarioNome || "-"}</div>
      </div>

      ${
        mostrarValores
          ? `<div class="resumo-box">
              <div class="label">Total da ordem</div>
              <div class="valor">${formatCurrencyBrl(ordem.total)}</div>
            </div>`
          : ""
      }

      <div class="tabela-itens">
        <table>
          <thead>
            <tr>
              <th style="width: 46%;">Produto</th>
              <th class="num" style="width: 14%;">Qtd</th>
              <th class="num" style="width: 20%;">V. unitário</th>
              <th class="num" style="width: 20%;">Total item</th>
            </tr>
          </thead>
          <tbody>
            ${itensRows}
          </tbody>
        </table>
      </div>

      <div class="assinatura">
        <div class="assinatura-linha"></div>
        <div class="assinatura-texto">Assinatura / Conferência</div>
      </div>

      <div class="muted">
        <span>Documento gerado para controle interno de compras.</span>
        <span>Impresso em ${hojeStr}</span>
      </div>
    </div>
  </body>
</html>`;
    const tituloPrev = `Ordem #${ordem.id} — ${ordem.fornecedor || ""}`.trim();
    void api
      .registrarImpressao({
        tipo: "compra",
        titulo: tituloPrev,
        html,
        meta: { ordem_id: ordem.id },
      })
      .catch(() => {});
    setPrintPreview({
      html,
      titulo: tituloPrev,
      downloadBaseName: `ordem-compra-${ordem.id}`,
    });
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    if (!fornecedorId) {
      toast.error('Selecione o fornecedor');
      return;
    }

    if (itensForm.length === 0) {
      toast.error('Adicione pelo menos um item na compra');
      return;
    }

    const dataCompra = (data || "").trim().slice(0, 10);
    if (dataCompra.length < 10) {
      toast.error("Informe a data da compra");
      return;
    }

    const itensPayload = itensForm
      .filter((item) => {
        const qtd = parseQtdInteira(item.quantidade);
        const preco = parsePrecoDecimal(item.precoUnitario);
        return item.produtoId && qtd !== null && qtd > 0 && !isNaN(preco) && preco > 0;
      })
      .map((item) => ({
        tipo: "produto" as const,
        produto: Number(item.produtoId),
        quantidade: parseQtdInteira(item.quantidade) as number,
        preco_no_dia: parsePrecoDecimal(item.precoUnitario),
      }));
    if (itensPayload.length === 0) {
      toast.error("Adicione itens válidos (produto, quantidade e preço)");
      return;
    }
    const numeroTrim = numeroVendaFornecedor.trim().slice(0, 64);
    const dupNumero = numeroTrim ? ordemDuplicadaNumeroVenda(ordens, fornecedorId, numeroTrim) : undefined;
    if (dupNumero) {
      toast.error(`Já existe a ordem #${dupNumero.id} com este nº de venda do fornecedor.`);
      return;
    }
    const fornId = Number(fornecedorId);
    setSimpleConfirm({
      title: "Registrar compra",
      description: "Confirma registrar esta ordem de compra com os itens indicados?",
      confirmLabel: "Registrar",
      onConfirm: () => {
        void (async () => {
          try {
            await api.createCompra({
              fornecedor_id: fornId,
              itens: itensPayload,
              data: dataCompra,
              data_compra: dataCompra,
              ...(numeroTrim ? { numero_venda_fornecedor: numeroTrim } : {}),
            });
            toast.success("Compra registrada com sucesso");
            await loadData();
            resetForm();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Erro ao registrar compra");
          }
        })();
      },
    });
  };

  const resetForm = () => {
    setProdutoId('');
    setFornecedorId('');
    setQuantidade('');
    setPrecoUnitario('');
    setNumeroVendaFornecedor('');
    setData(getTodayLocalISO());
    setItensForm([]);
  };

  const getItemNome = (i: ItemCompra) =>
    i.produto_nome || i.material_nome || (i.produto ? `#${i.produto}` : i.material ? `#${i.material}` : "—");

  const totalCompras = ordens.reduce((sum, o) => sum + o.total, 0);

  const ordensFiltradas = ordens.filter((o) => {
    if (searchNumero.trim()) {
      const termo = searchNumero.trim().replace(/^#/, "");
      if (!String(o.id ?? "").includes(termo)) return false;
    }
    if (searchFornecedor.trim() && !(o.fornecedor || "").toLowerCase().includes(searchFornecedor.trim().toLowerCase()))
      return false;
    if (searchData) {
      const oData = o.data ? o.data.slice(0, 10) : "";
      if (oData !== searchData) return false;
    }
    if (searchProduto.trim()) {
      const termo = searchProduto.trim().toLowerCase();
      const temMatch = (o.itens || []).some((i) => getItemNome(i).toLowerCase().includes(termo));
      if (!temMatch) return false;
    }
    if (searchNumeroVendaFornecedor.trim()) {
      const termo = searchNumeroVendaFornecedor.trim().toLowerCase();
      const nv = String(o.numero_venda_fornecedor ?? "").toLowerCase();
      if (!nv.includes(termo)) return false;
    }
    return true;
  });

    return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <h1 className="text-3xl font-semibold">Compras</h1>
          <p className="text-muted-foreground">Registre compras e consulte o histórico</p>
        </div>
        {isChefe && ordens.length > 0 && (
          <Card className="shrink-0 px-6 py-3">
            <p className="text-sm text-muted-foreground">Total em Compras</p>
            <p className="text-2xl font-semibold text-red-600">{formatCurrencyBrl(totalCompras)}</p>
          </Card>
        )}
      </div>

      <Tabs defaultValue="nova" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="nova">Nova compra</TabsTrigger>
          <TabsTrigger value="historico">Histórico de compras</TabsTrigger>
        </TabsList>

        <TabsContent value="nova" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="size-5" />
                Nova Compra
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Selecione o fornecedor e adicione os produtos vinculados a ele. Só aparecem itens com esse fornecedor no cadastro — produtos sem fornecedor não entram na lista.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="fornecedorId">Fornecedor *</Label>
                    {fornecedores.length > 0 ? (
                      <SearchableSelect
                        value={fornecedorId}
                        onValueChange={setFornecedorId}
                        triggerId="fornecedorId"
                        placeholder="Selecione o fornecedor"
                        searchPlaceholder="Pesquisar fornecedor"
                        emptyHint="Nenhum fornecedor encontrado."
                        options={fornecedores.map((f: any) => ({
                          id: f.id,
                          label: String(f.nome ?? f.nomeRazaoSocial ?? "").trim() || `Fornecedor #${f.id}`,
                          searchText: fornecedorSearchText(f),
                        }))}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">Cadastre fornecedores na aba Cadastro.</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="produtoId" className="flex-1">Produto *</Label>
                      {fornecedorId ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          title="Cadastrar novo produto"
                          onClick={() => abrirCadastroRapido("nova")}
                        >
                          <Plus className="size-4" />
                        </Button>
                      ) : null}
                    </div>
                    {!fornecedorId ? (
                      <p className="text-sm text-muted-foreground py-2">Selecione o fornecedor para ver os produtos vinculados.</p>
                    ) : (() => {
                      const produtosLista = produtosCompra
                        .filter((p: any) => produtoDoFornecedor(p, fornecedorId))
                        .sort((a: any, b: any) => {
                          const ca = String(a.categoria_nome ?? "").trim() || "Sem categoria";
                          const cb = String(b.categoria_nome ?? "").trim() || "Sem categoria";
                          if (ca === "Sem categoria" && cb !== "Sem categoria") return 1;
                          if (cb === "Sem categoria" && ca !== "Sem categoria") return -1;
                          const byCat = ca.localeCompare(cb, "pt-BR");
                          if (byCat !== 0) return byCat;
                          return String(a.nome ?? "").localeCompare(String(b.nome ?? ""), "pt-BR");
                        });

                      return produtosLista.length > 0 ? (
                        <CompraSearchableSelect
                          value={produtoId}
                          onValueChange={(id) => {
                            setProdutoId(id);
                            const p = produtosCompra.find((x: any) => String(x.id) === id);
                            setPrecoUnitario(precoUniProdutoCompra(p));
                          }}
                          options={produtosLista.map((p: any) => produtoCompraOption(p))}
                          placeholder="Selecione o produto"
                          triggerId="produtoId"
                          emptyHint="Nenhum produto encontrado."
                          searchPlaceholder="Pesquisar produto…"
                        />
                      ) : (
                        <p className="text-sm text-muted-foreground py-2">
                          Nenhum produto vinculado a este fornecedor. Cadastre o produto com este fornecedor (aba Cadastro).
                        </p>
                      );
                    })()}
                  </div>

              <div className="space-y-2">
                <Label htmlFor="quantidade">Quantidade *</Label>
                <Input
                  id="quantidade"
                  type="number"
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                  placeholder="0"
                  min={1}
                  max={999999999}
                  step={1}
                />
              </div>

              {isChefe && (
                <div className="space-y-2">
                  <Label htmlFor="precoUnitario">Vlr Uni</Label>
                  <Input
                    id="precoUnitario"
                    type="text"
                    inputMode="decimal"
                    value={precoUnitario}
                    onChange={(e) => setPrecoUnitario(e.target.value)}
                  />
                </div>
              )}

              {isChefe && quantidade && precoUnitario && (
                <div className="space-y-2">
                  <Label>Total deste item</Label>
                  <div className="h-10 px-3 py-2 border rounded-md bg-muted flex items-center">
                    <span className="text-lg font-semibold">
                      {(() => {
                        const qtd = parseQtdInteira(quantidade) ?? parseFloat(String(quantidade).replace(",", "."));
                        const preco = parsePrecoDecimal(precoUnitario);
                        const total = Number.isFinite(qtd) && Number.isFinite(preco) ? qtd * preco : 0;
                        return formatCurrencyBrl(total);
                      })()}
                    </span>
                  </div>
                </div>
              )}

              <div className="space-y-2 md:col-span-2">
                <Label>Itens desta compra</Label>
                <p className="text-xs text-muted-foreground">
                  Use <span className="inline-flex items-center gap-0.5"><Copy className="size-3" /> Copiar</span> no item para duplicar na lista e alterar só a quantidade.
                </p>
                <div className="flex flex-wrap gap-2 items-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (!fornecedorId) {
                        toast.error('Selecione o fornecedor primeiro');
                        return;
                      }
                      if (!produtoId || !quantidade) {
                        toast.error("Selecione produto e quantidade");
                        return;
                      }
                      const qtd = parseQtdInteira(quantidade);
                      if (qtd === null) {
                        toast.error('Quantidade inválida');
                        return;
                      }
                      const precoBase =
                        produtosCompra.find((p: any) => String(p.id) === produtoId)?.preco_custo ?? 0;
                      const precoDigitado = parsePrecoDecimal(precoUnitario);
                      const precoParaItem = isChefe
                        ? (Number.isFinite(precoDigitado) && precoDigitado > 0
                            ? precoDigitado
                            : Number(precoBase))
                        : Number(precoBase);
                      if (isNaN(precoParaItem) || precoParaItem <= 0) {
                        toast.error('Preço não definido. Informe o preço ou cadastre o valor base.');
                        return;
                      }
                      setItensForm((prev) => [
                        ...prev,
                        {
                          id: `${Date.now()}-${prev.length}`,
                          produtoId,
                          quantidade: String(qtd),
                          precoUnitario: String(precoParaItem),
                        },
                      ]);
                      setProdutoId('');
                      setQuantidade('');
                      setPrecoUnitario('');
                    }}
                  >
                    <Plus className="size-4 mr-2" />
                    Adicionar item à lista
                  </Button>
                </div>
                {itensForm.length > 0 ? (
                  <div className="w-full overflow-x-auto rounded-md border border-border/60">
                    <Table className="min-w-[720px] text-sm">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[200px]">Item</TableHead>
                        <TableHead className="w-20 text-right">Qtd</TableHead>
                        {isChefe && <TableHead className="w-32 text-right whitespace-nowrap">Vlr Uni</TableHead>}
                        {isChefe && <TableHead className="w-32 text-right whitespace-nowrap">Total</TableHead>}
                        <TableHead className="w-[132px] text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itensForm.map((item) => {
                        const label = compraOptionRotulo(
                          produtoCompraOption(
                            produtosCompra.find((p: any) => String(p.id) === item.produtoId) ?? {
                              id: item.produtoId,
                              nome: `Produto #${item.produtoId}`,
                            },
                          ),
                        );
                        const qtdItem = parseQtdInteira(item.quantidade) ?? 0;
                        const precoItem = parsePrecoDecimal(item.precoUnitario);
                        const isEditing = editingItemId === item.id;
                        const totalEdit =
                          (parseQtdInteira(editQtd) ?? 0) * (parsePrecoDecimal(editPreco) || 0);
                        return (
                          <TableRow key={item.id} className={isEditing ? "bg-primary/5 border-l-2 border-l-primary" : ""}>
                            <TableCell className="align-middle truncate">{label}</TableCell>
                            {isEditing ? (
                              <>
                                <TableCell className="text-right align-middle py-2">
                                  <Input
                                    type="text"
                                    inputMode="numeric"
                                    className="h-8 w-full min-w-0 max-w-16 text-right text-sm tabular-nums ml-auto block"
                                    value={editQtd}
                                    onChange={(e) => setEditQtd(e.target.value)}
                                    placeholder="Qtd"
                                  />
                                </TableCell>
                                {isChefe && (
                                  <TableCell className="text-right align-middle py-2">
                                    <Input
                                      type="text"
                                      inputMode="decimal"
                                      className="h-8 w-full min-w-0 max-w-28 text-right text-sm tabular-nums ml-auto block"
                                      value={editPreco}
                                      onChange={(e) => setEditPreco(e.target.value)}
                                      placeholder="Preço"
                                    />
                                  </TableCell>
                                )}
                                {isChefe && (
                                  <TableCell className="text-right align-middle tabular-nums">
                                    {formatCurrencyBrl(Number.isFinite(totalEdit) ? totalEdit : 0)}
                                  </TableCell>
                                )}
                                <TableCell className="text-right align-middle py-2">
                                  <div className="flex items-center justify-end gap-0.5">
                                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-green-600 hover:bg-green-500/10 hover:text-green-700" onClick={salvarEdicaoItem} title="Salvar">
                                      <Check className="size-4" />
                                    </Button>
                                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 hover:bg-destructive/10 hover:text-destructive" onClick={cancelarEdicaoItem} title="Cancelar">
                                      <X className="size-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </>
                            ) : (
                              <>
                                <TableCell className="text-right align-middle tabular-nums font-medium">
                                  {item.quantidade}
                                </TableCell>
                                {isChefe && (
                                  <TableCell className="text-right align-middle tabular-nums">
                                    {formatCurrencyBrl(!isNaN(precoItem) ? precoItem : 0)}
                                  </TableCell>
                                )}
                                {isChefe && (
                                  <TableCell className="text-right align-middle tabular-nums">
                                    {formatCurrencyBrl(!isNaN(qtdItem * precoItem) ? qtdItem * precoItem : 0)}
                                  </TableCell>
                                )}
                                <TableCell className="text-right align-middle">
                                  <div className="flex items-center justify-end gap-0.5">
                                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => iniciarEdicaoItem(item)} title="Editar">
                                      <Pencil className="size-4" />
                                    </Button>
                                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => copiarItemNaLista(item.id)} title="Copiar item (mesmo produto, altere a quantidade)">
                                      <Copy className="size-4" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                      onClick={() => setItensForm((prev) => prev.filter((i) => i.id !== item.id))}
                                      title="Excluir"
                                    >
                                      <Trash2 className="size-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Nenhum item adicionado ainda. Selecione o fornecedor, o produto e a quantidade
                    {isChefe ? " e o preço" : ""} e clique em &quot;Adicionar item à lista&quot;.
                  </p>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-[minmax(0,11rem)_minmax(0,11rem)] sm:items-end">
                <div className="space-y-2">
                  <Label htmlFor="numeroVendaFornecedor">Nº venda fornecedor</Label>
                  <Input
                    id="numeroVendaFornecedor"
                    className="max-w-[11rem]"
                    value={numeroVendaFornecedor}
                    onChange={(e) => setNumeroVendaFornecedor(e.target.value.slice(0, 64))}
                    placeholder="Opcional"
                    disabled={!fornecedorId}
                  />
                  {avisoNumeroVendaDuplicada ? (
                    <p className="text-xs text-destructive">{avisoNumeroVendaDuplicada}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="data">Data *</Label>
                  <Input
                    id="data"
                    className="max-w-[11rem]"
                    type="date"
                    value={data}
                    onChange={(e) => setData(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <Button type="submit">
              <Plus className="size-4 mr-2" />
              Registrar compra
            </Button>
          </form>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="historico" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Histórico de compras</CardTitle>
              <p className="text-sm text-muted-foreground">
                Filtre por número da ordem, nº venda do fornecedor, fornecedor, data ou produto. Clique para ver detalhes, editar, copiar ou excluir.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                <div className="space-y-2">
                  <Label htmlFor="searchNumeroCompra">Nº da ordem</Label>
                  <Input
                    id="searchNumeroCompra"
                    inputMode="numeric"
                    placeholder="Ex.: 42"
                    value={searchNumero}
                    onChange={(e) => setSearchNumero(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="searchNumeroVendaFornecedor">Nº venda forn.</Label>
                  <Input
                    id="searchNumeroVendaFornecedor"
                    className="max-w-[11rem]"
                    placeholder="Pedido/nota"
                    value={searchNumeroVendaFornecedor}
                    onChange={(e) => setSearchNumeroVendaFornecedor(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="searchFornecedor">Fornecedor</Label>
                  <Input
                    id="searchFornecedor"
                    placeholder="Nome do fornecedor"
                    value={searchFornecedor}
                    onChange={(e) => setSearchFornecedor(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="searchProduto">Produto</Label>
                  <Input
                    id="searchProduto"
                    placeholder="Nome do item"
                    value={searchProduto}
                    onChange={(e) => setSearchProduto(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="searchData">Data</Label>
                  <Input
                    id="searchData"
                    type="date"
                    value={searchData}
                    onChange={(e) => setSearchData(e.target.value)}
                  />
                </div>
              </div>
              {ordensFiltradas.length > 0 ? (
                <div className="w-full overflow-x-auto rounded-md border border-border/60">
                <Table className="min-w-[920px] text-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[140px]">Fornecedor</TableHead>
                      <TableHead className="w-32 whitespace-nowrap">Nº venda forn.</TableHead>
                      <TableHead className="w-28 whitespace-nowrap">Data</TableHead>
                      <TableHead className="min-w-[220px]">Itens</TableHead>
                      {isChefe && <TableHead className="w-36 text-right whitespace-nowrap">Total</TableHead>}
                      <TableHead className="w-[148px] text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...ordensFiltradas]
                      .sort(sortOrdemCompraRecentFirst)
                      .map((ordem) => (
                        <TableRow
                          key={ordem.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => openDetail(ordem)}
                        >
                          <TableCell className="font-medium truncate">
                            <span className="inline-flex min-w-0 items-center gap-1.5">
                              {ordem.cancelada && /^\d+$/.test(String(ordem.id)) ? (
                                <Ban className="size-3.5 shrink-0 text-destructive" aria-label="Ordem cancelada" />
                              ) : null}
                              <span className={cn("min-w-0 truncate", ordem.cancelada ? "text-muted-foreground" : undefined)}>
                                {ordem.fornecedor}
                              </span>
                              <OrdemAlteracaoMarker observacao={ordem.ultima_alteracao_observacao} className="shrink-0" />
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground whitespace-nowrap tabular-nums">
                            {ordem.numero_venda_fornecedor?.trim() || "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground whitespace-nowrap">
                            {formatDateOnly(ordem.data)}
                          </TableCell>
                          <TableCell className="max-w-md">
                            <span className="line-clamp-2 break-words">
                            {ordem.itens?.length === 1
                              ? getItemNome(ordem.itens[0])
                              : `${ordem.itens?.length ?? 0} itens`}
                            </span>
                          </TableCell>
                          {isChefe && (
                            <TableCell className="text-right font-medium text-red-600 tabular-nums whitespace-nowrap">
                              {formatCurrencyBrl(ordem.total)}
                            </TableCell>
                          )}
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-0.5">
                              <span className="relative inline-flex">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDetail(ordem)} title="Ver detalhes">
                                  <PanelRightOpen className="size-4" />
                                </Button>
                                {ordem.cancelada && /^\d+$/.test(String(ordem.id)) ? (
                                  <span
                                    className="pointer-events-none absolute -right-0.5 -top-0.5 size-2 rounded-full bg-destructive ring-2 ring-background"
                                    title="Cancelada"
                                    aria-hidden
                                  />
                                ) : null}
                              </span>
                              {isChefe && (
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => imprimirCompra(ordem)} title="Imprimir">
                                  <Printer className="size-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
                </div>
              ) : (
                <p className="py-8 text-center text-muted-foreground">
                  {ordens.length === 0 ? "Nenhuma compra registrada" : "Nenhuma compra encontrada com os filtros informados."}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!detailCompra} onOpenChange={(open) => !open && setDetailCompra(null)}>
        <DialogContent className="flex max-h-[90vh] w-[min(72rem,calc(100vw-1rem))] max-w-none flex-col overflow-hidden gap-0 p-0 sm:max-w-[min(72rem,calc(100vw-1.5rem))]">
          {detailCompra && (
            <>
              <DialogHeader className="shrink-0 space-y-4 border-b bg-gradient-to-br from-muted/80 to-muted/30 px-6 pb-5 pt-6 text-left sm:pr-12">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Detalhe da ordem de compra
                </p>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <DialogTitle className="flex flex-wrap items-center gap-2 text-xl font-semibold leading-tight sm:text-2xl">
                      {detailCompra.cancelada ? (
                        <Ban className="size-5 shrink-0 text-destructive" aria-label="Ordem cancelada" />
                      ) : null}
                      <span className="min-w-0">{detailCompra.fornecedor}</span>
                      <OrdemAlteracaoMarker observacao={detailCompra.ultima_alteracao_observacao} />
                    </DialogTitle>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="size-3.5 shrink-0" />
                        {formatDateOnly(detailCompra.data)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Hash className="size-3.5 shrink-0" />
                        {/^\d+$/.test(String(detailCompra.id)) ? `Nº ${detailCompra.id}` : `Rascunho (${detailCompra.id})`}
                      </span>
                      {detailCompra.numero_venda_fornecedor?.trim() ? (
                        <span className="inline-flex items-center gap-1.5">
                          <ShoppingCart className="size-3.5 shrink-0" />
                          Venda forn.: {detailCompra.numero_venda_fornecedor.trim()}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {detailCompra.cancelada ? (
                      <Badge variant="destructive">Cancelada</Badge>
                    ) : (
                      <Badge variant="secondary" className="font-normal bg-sky-100 text-sky-950 dark:bg-sky-950/50 dark:text-sky-100">
                        Ativa
                      </Badge>
                    )}
                    <Badge variant="outline" className="font-normal">
                      <Package className="size-3" />
                      {(detailCompra.itens || []).length} item(ns)
                    </Badge>
                  </div>
                </div>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <div className="mb-4 space-y-3 rounded-xl border bg-muted/20 p-4">
                  <div className="grid gap-0.5 text-sm">
                    <span className="text-muted-foreground">Data de lançamento (registro no sistema)</span>
                    <span className="font-medium tabular-nums">
                      {detailCompra.data_lancamento ? formatDateOnly(detailCompra.data_lancamento) : "—"}
                    </span>
                  </div>
                  {/^\d+$/.test(String(detailCompra.id)) && !detailCompra.cancelada && (
                    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                      <div className="space-y-1.5">
                        <Label htmlFor="detalhe-data-compra">Data da compra (operação)</Label>
                        <Input
                          id="detalhe-data-compra"
                          name="compra-operacao-data-uid"
                          type="date"
                          autoComplete="off"
                          className="max-w-[11rem]"
                          value={editDetailDataCompra}
                          onChange={(e) => setEditDetailDataCompra(e.target.value.slice(0, 10))}
                        />
                      </div>
                      <Button type="button" variant="secondary" disabled={detailSaving} onClick={() => salvarDataCompraNoDetalhe()}>
                        Guardar data
                      </Button>
                      <div className="space-y-1.5">
                        <Label htmlFor="detalhe-numero-venda-fornecedor">Nº venda fornecedor</Label>
                        <Input
                          id="detalhe-numero-venda-fornecedor"
                          className="max-w-[11rem]"
                          value={editDetailNumeroVendaFornecedor}
                          onChange={(e) => setEditDetailNumeroVendaFornecedor(e.target.value.slice(0, 64))}
                          placeholder="Opcional"
                        />
                        {avisoDetalheNumeroDuplicada ? (
                          <p className="text-xs text-destructive">{avisoDetalheNumeroDuplicada}</p>
                        ) : null}
                      </div>
                      <Button type="button" variant="secondary" disabled={detailSaving} onClick={() => salvarNumeroVendaNoDetalhe()}>
                        Guardar nº venda
                      </Button>
                    </div>
                  )}
                </div>
                {/^\d+$/.test(String(detailCompra.id)) && !detailCompra.cancelada && isChefe ? (
                  <div className="mb-4 rounded-xl border bg-card p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium">Adicionar item</h3>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={detailSaving}
                        onClick={() => {
                          void (async () => {
                            const ordemId = String(detailCompra.id);
                            const qtd = parseQtdInteira(addDetailQtd);
                            if (!qtd) {
                              toast.error("Informe a quantidade");
                              return;
                            }
                            const preco = parsePrecoDecimal(addDetailPreco);
                            if (!Number.isFinite(preco) || preco < 0) {
                              toast.error("Informe o preço unitário");
                              return;
                            }
                            const payload = {
                              ordemId,
                              tipo: "produto" as const,
                              produto: Number(addDetailProdutoId),
                              quantidade: qtd,
                              preco_no_dia: preco,
                            };
                            if (!addDetailProdutoId) {
                              toast.error("Selecione o produto");
                              return;
                            }
                            setDetailSaving(true);
                            try {
                              const updated = await api.addCompraItem(payload.ordemId, {
                                tipo: payload.tipo,
                                produto: payload.produto,
                                quantidade: payload.quantidade,
                                preco_no_dia: payload.preco_no_dia,
                              });
                              toast.success("Item adicionado");
                              await loadData();
                              if (detailCompra && String(detailCompra.id) === ordemId) {
                                setDetailCompra(updated as OrdemCompra);
                              }
                              setAddDetailProdutoId("");
                              setAddDetailQtd("");
                              setAddDetailPreco("");
                            } catch (e: unknown) {
                              toast.error(e instanceof Error ? e.message : "Erro ao adicionar item");
                            } finally {
                              setDetailSaving(false);
                            }
                          })();
                        }}
                      >
                        <Plus className="size-4 mr-2" />
                        Adicionar
                      </Button>
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Label className="flex-1">Produto</Label>
                          {fornecedorIdDetalheCompra ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              title="Cadastrar novo produto"
                              onClick={() => abrirCadastroRapido("detalhe")}
                            >
                              <Plus className="size-4" />
                            </Button>
                          ) : null}
                        </div>
                        {!fornecedorIdDetalheCompra ? (
                          <p className="text-sm text-muted-foreground py-2">
                            Fornecedor da ordem não identificado. Feche e abra o detalhe novamente.
                          </p>
                        ) : produtosDetalheCompra.length > 0 ? (
                          <CompraSearchableSelect
                            value={addDetailProdutoId}
                            onValueChange={(id) => {
                              setAddDetailProdutoId(id);
                              const p = produtosCompra.find((x: any) => String(x.id) === id);
                              setAddDetailPreco(precoUniProdutoCompra(p));
                            }}
                            options={produtosDetalheCompra.map((p: any) => produtoCompraOption(p))}
                            placeholder="Selecione o produto"
                            emptyHint="Nenhum produto encontrado."
                            searchPlaceholder="Pesquisar produto…"
                          />
                        ) : (
                          <p className="text-sm text-muted-foreground py-2">
                            Nenhum produto disponível para este fornecedor.
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>Quantidade</Label>
                        <Input value={addDetailQtd} onChange={(e) => setAddDetailQtd(e.target.value)} type="number" min={1} />
                      </div>
                      <div className="space-y-2">
                        <Label>Vlr Uni</Label>
                        <Input value={addDetailPreco} onChange={(e) => setAddDetailPreco(e.target.value)} inputMode="decimal" />
                      </div>
                    </div>
                  </div>
                ) : null}
                <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                  <Table className="w-full table-fixed text-sm">
                  <TableHeader>
                    <TableRow className="border-b bg-muted/50 hover:bg-muted/50">
                      <TableHead className={cn("min-w-0 font-semibold", isChefe ? "w-[32%]" : "w-[58%]")}>Item</TableHead>
                      <TableHead className={cn("text-right font-semibold", isChefe ? "w-[10%]" : "w-[14%]")}>Qtd</TableHead>
                      {isChefe && (
                        <TableHead className="w-[19%] text-right font-semibold whitespace-nowrap">Preço un.</TableHead>
                      )}
                      {isChefe && (
                        <TableHead className="w-[19%] text-right font-semibold whitespace-nowrap">Total</TableHead>
                      )}
                      <TableHead className={cn("text-right font-semibold", isChefe ? "w-[20%]" : "w-[28%]")}>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(detailCompra.itens || []).map((item) => (
                      <TableRow key={item.id} className="border-border/60">
                        <TableCell className="min-w-0 font-medium break-words align-top py-2 pr-2">
                          {getItemNome(item)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums align-top py-2 px-1">{item.quantidade}</TableCell>
                        {isChefe && (
                          <TableCell className="text-right tabular-nums align-top py-2 px-1 text-xs sm:text-sm whitespace-nowrap">
                            {formatCurrencyBrl(item.preco_no_dia)}
                          </TableCell>
                        )}
                        {isChefe && (
                          <TableCell className="text-right text-red-600 tabular-nums align-top py-2 px-1 text-xs sm:text-sm whitespace-nowrap">
                            {formatCurrencyBrl(item.total)}
                          </TableCell>
                        )}
                        <TableCell className="text-right align-top py-1.5 pl-1">
                          <div className="flex flex-wrap items-center justify-end gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              disabled={!!detailCompra.cancelada}
                              onClick={() => abrirEditarItem(item, detailCompra.id)}
                              title={detailCompra.cancelada ? "Ordem cancelada" : "Editar"}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              title="Excluir"
                              disabled={!!detailCompra.cancelada}
                              onClick={() =>
                                setExcluirItemCompra({
                                  id: item.id,
                                  tipo: 'produto' as const,
                                })
                              }
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
                {isChefe && (detailCompra.itens?.length ?? 0) > 0 && (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3.5">
                    <span className="text-sm font-medium text-muted-foreground">Total da ordem</span>
                    <span className="text-xl font-bold tabular-nums tracking-tight text-foreground">
                      {formatCurrencyBrl(detailCompra.total)}
                    </span>
                  </div>
                )}
              </div>
              <DialogFooter className="shrink-0 flex-wrap gap-2 border-t bg-muted/30 px-6 py-4 sm:justify-end">
                {isChefe && (
                  <>
                    <Button variant="outline" onClick={() => detailCompra && imprimirCompra(detailCompra)}>
                      <Printer className="size-4 mr-2" />
                      Imprimir
                    </Button>
                    <Button variant="outline" onClick={handleCopiarOrdem} disabled={!!detailCompra.cancelada} title={detailCompra.cancelada ? "Ordem cancelada" : undefined}>
                      <Copy className="size-4 mr-2" />
                      Copiar ordem
                    </Button>
                  </>
                )}
                {detailCompra && /^\d+$/.test(String(detailCompra.id)) && !detailCompra.cancelada && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setExcluirCompraOpen(true)}
                    title="Cancelar esta ordem (exige senha)"
                  >
                    <Trash2 className="size-4 mr-2" />
                    Excluir ordem
                  </Button>
                )}
                <Button variant="default" onClick={() => setDetailCompra(null)}>
                  Fechar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar item da compra</DialogTitle>
          </DialogHeader>
          {editingItem && (
            <>
              <p className="text-sm text-muted-foreground">
                {getItemNome(editingItem)}
              </p>
              <div className="grid gap-4 py-2">
                <div className="space-y-2">
                  <Label>Quantidade</Label>
                  <Input
                    type="number"
                    min={1}
                    value={editCompraQtd}
                    onChange={(e) => setEditCompraQtd(e.target.value)}
                  />
                </div>
                {isChefe && (
                  <div className="space-y-2">
                    <Label>Preço unitário</Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={editCompraPreco}
                      onChange={(e) => setEditCompraPreco(e.target.value)}
                      placeholder="0,00"
                    />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button onClick={salvarEdicaoItemCompra}>Salvar</Button>
                <Button variant="outline" onClick={() => setEditingItem(null)}>Cancelar</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {simpleConfirm ? (
        <SimpleConfirmDialog
          open
          onOpenChange={(o) => {
            if (!o) setSimpleConfirm(null);
          }}
          title={simpleConfirm.title}
          description={simpleConfirm.description}
          confirmLabel={simpleConfirm.confirmLabel}
          onConfirm={simpleConfirm.onConfirm}
        />
      ) : null}

      <ConfirmacaoComSenhaDialog
        open={excluirCompraOpen}
        onOpenChange={setExcluirCompraOpen}
        title="Cancelar ordem de compra"
        description="A ordem ficará no histórico como cancelada e deixará de contar no saldo do fornecedor (os itens não são apagados). Informe o motivo e confirme com sua senha."
        confirmLabel="Confirmar cancelamento"
        requireObservacao
        observacaoLabel="Motivo do cancelamento"
        onVerified={async ({ password, observacao }) => {
          if (!detailCompra || !/^\d+$/.test(String(detailCompra.id))) return;
          const idStr = String(detailCompra.id);
          await api.deleteCompra(idStr, { password, observacao });
          toast.success("Ordem cancelada");
          await loadData();
          try {
            const refreshed = await api.getCompraDetalhe(idStr);
            setDetailCompra(
              refreshed && typeof refreshed === "object"
                ? { ...(refreshed as OrdemCompra), cancelada: (refreshed as OrdemCompra).cancelada === true }
                : { ...detailCompra, cancelada: true }
            );
          } catch {
            setDetailCompra({ ...detailCompra, cancelada: true });
          }
        }}
      />

      <ConfirmacaoComSenhaDialog
        open={excluirItemCompra != null}
        onOpenChange={(o) => {
          if (!o) setExcluirItemCompra(null);
        }}
        title="Excluir item da ordem"
        description="O valor deixará de contar nas compras do fornecedor. Informe o motivo e confirme com sua senha."
        confirmLabel="Confirmar exclusão"
        requireObservacao
        observacaoLabel="Motivo da exclusão"
        onVerified={async ({ password, observacao }) => {
          if (excluirItemCompra == null) return;
          const { id: idDel, tipo } = excluirItemCompra;
          setExcluirItemCompra(null);
          await handleDeleteCompra(idDel, password, observacao, tipo);
        }}
      />

      <CadastroRapidoItemDialog
        modo={cadastroRapidoModo}
        open={cadastroRapidoOpen}
        onOpenChange={setCadastroRapidoOpen}
        onCreated={(item) => void handleItemCriadoRapido(item)}
        fornecedorId={cadastroRapidoFornecedorId}
        isChefe={isChefe}
      />

      <DocumentPrintPreview
        open={printPreview != null}
        onOpenChange={(o) => {
          if (!o) setPrintPreview(null);
        }}
        html={printPreview?.html ?? ""}
        titulo={printPreview?.titulo ?? ""}
        downloadBaseName={printPreview?.downloadBaseName}
      />
    </div>
  );
}
