import React, { useState, useEffect, useMemo, useRef, type FormEvent } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { SearchableSelect } from "../components/SearchableSelect";
import { CadastroRapidoItemDialog, type CadastroRapidoModo } from "../components/CadastroRapidoItemDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
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
  tipo?: "material" | "produto";
  material?: number;
  material_nome?: string;
  produto?: number;
  produto_nome?: string;
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

type CompraPickOption = { id: string | number; nome: string };

function compraOptionRotulo(o: CompraPickOption): string {
  return o.nome;
}

function materialCompraOption(m: { id: number | string; nome?: string }): CompraPickOption {
  return {
    id: m.id,
    nome: String(m.nome ?? "").trim() || `Material #${m.id}`,
  };
}

function produtoCompraOption(p: { id: number | string; nome?: string }): CompraPickOption {
  return {
    id: p.id,
    nome: String(p.nome ?? "").trim() || `Produto #${p.id}`,
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

/** Lista de material ou produto com campo de pesquisa (aba Compra). */
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
  const mapped = useMemo(
    () =>
      options.map((o) => {
        const label = compraOptionRotulo(o);
        return { id: o.id, label, searchText: label };
      }),
    [options],
  );
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
  materialId: string;
  quantidade: string;
  precoUnitario: string;
}

/** Inclui na compra se o fornecedor do produto coincide com o da ordem ou ainda não foi definido (não mistura produto de outro fornecedor). */
function produtoDisponivelParaFornecedor(p: any, fid: string) {
  const pf = p.fornecedor;
  if (pf == null || pf === "" || String(pf) === "null" || String(pf) === "undefined") return true;
  return String(pf) === String(fid);
}

function precoUniMaterial(m: {
  precoUnitarioBase?: number | string | null;
  preco_unitario_base?: number | string | null;
} | null | undefined): string {
  if (!m) return "";
  const preco = m.precoUnitarioBase ?? m.preco_unitario_base;
  return preco != null && preco !== "" ? String(preco) : "";
}

function precoUniProdutoCompra(p: {
  preco_custo?: number | string | null;
  precoCusto?: number | string | null;
} | null | undefined): string {
  if (!p) return "";
  const preco = p.preco_custo ?? p.precoCusto;
  return preco != null && preco !== "" ? String(preco) : "";
}

/** Mesma regra da API: compra como item pronto se não é fabricado e (revenda ou tem fornecedor no cadastro). */
function produtoElegivelCompraPronta(p: any) {
  if (p.fabricado) return false;
  if (p.revenda) return true;
  const fid = p.fornecedor;
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

export function Compra() {
  const [ordens, setOrdens] = useState<OrdemCompra[]>([]);
  const [materiais, setMateriais] = useState<any[]>([]);
  const [produtosRevenda, setProdutosRevenda] = useState<any[]>([]);
  const [fornecedores, setFornecedores] = useState<any[]>([]);

  const [materialId, setMaterialId] = useState('');
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
  const [tipoItem, setTipoItem] = useState<"material" | "produto">("material");

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
  const materiaisDetalheCompra = useMemo(
    () =>
      fornecedorIdDetalheCompra
        ? materiais.filter(
            (m: any) => String(m.fornecedor_padrao ?? m.fornecedor_padrao_id) === fornecedorIdDetalheCompra,
          )
        : [],
    [materiais, fornecedorIdDetalheCompra],
  );
  const produtosDetalheCompra = useMemo(
    () =>
      fornecedorIdDetalheCompra
        ? produtosRevenda
            .filter((p: any) => produtoDisponivelParaFornecedor(p, fornecedorIdDetalheCompra))
            .sort((a: any, b: any) => String(a.nome ?? "").localeCompare(String(b.nome ?? ""), "pt-BR"))
        : [],
    [produtosRevenda, fornecedorIdDetalheCompra],
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
    tipo: 'material' | 'produto';
  } | null>(null);
  const [printPreview, setPrintPreview] = useState<{
    html: string;
    titulo: string;
    downloadBaseName: string;
  } | null>(null);
  const [editDetailDataCompra, setEditDetailDataCompra] = useState("");
  const [editDetailNumeroVendaFornecedor, setEditDetailNumeroVendaFornecedor] = useState("");
  const [addDetailTipo, setAddDetailTipo] = useState<"material" | "produto">("material");
  const [addDetailMaterialId, setAddDetailMaterialId] = useState("");
  const [addDetailProdutoId, setAddDetailProdutoId] = useState("");
  const [addDetailQtd, setAddDetailQtd] = useState("");
  const [addDetailPreco, setAddDetailPreco] = useState("");
  const [cadastroRapidoOpen, setCadastroRapidoOpen] = useState(false);
  const [cadastroRapidoModo, setCadastroRapidoModo] = useState<CadastroRapidoModo>("material-compra");
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
    const modo: CadastroRapidoModo =
      origem === "detalhe"
        ? addDetailTipo === "produto"
          ? "produto-compra"
          : "material-compra"
        : tipoItem === "produto"
          ? "produto-compra"
          : "material-compra";
    cadastroRapidoOrigemRef.current = origem;
    setCadastroRapidoModo(modo);
    setCadastroRapidoFornecedorId(fid);
    setCadastroRapidoOpen(true);
  };

  const handleItemCriadoRapido = async (created: Record<string, unknown>) => {
    const { origem } = cadastroRapidoOrigemRef.current;
    const id = String(created.id);
    if (cadastroRapidoModo === "material-compra") {
      const mats = await api.getMateriais().catch(() => []);
      setMateriais(Array.isArray(mats) ? mats : []);
      if (origem === "detalhe") {
        setAddDetailMaterialId(id);
        setAddDetailPreco(precoUniMaterial(created));
      } else {
        setTipoItem("material");
        setMaterialId(id);
        setPrecoUnitario(precoUniMaterial(created));
      }
    } else {
      const prods = await api.getProdutos().catch(() => []);
      const all = Array.isArray(prods) ? prods : [];
      setProdutosRevenda(all.filter((p: any) => produtoElegivelCompraPronta(p)));
      if (origem === "detalhe") {
        setAddDetailProdutoId(id);
        setAddDetailPreco(precoUniProdutoCompra(created));
      } else {
        setTipoItem("produto");
        setProdutoId(id);
        setPrecoUnitario(precoUniProdutoCompra(created));
      }
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
    if (tipoItem === "material" && materialId) {
      const mat = materiais.find((m: any) => String(m.id) === materialId);
      setPrecoUnitario(precoUniMaterial(mat));
    } else if (tipoItem === "produto" && produtoId) {
      const p = produtosRevenda.find((x: any) => String(x.id) === produtoId);
      setPrecoUnitario(precoUniProdutoCompra(p));
    } else {
      setPrecoUnitario("");
    }
  }, [tipoItem, materialId, produtoId, materiais, produtosRevenda]);

  useEffect(() => {
    if (addDetailTipo === "material" && addDetailMaterialId) {
      const mat = materiais.find((m: any) => String(m.id) === addDetailMaterialId);
      setAddDetailPreco(precoUniMaterial(mat));
    } else if (addDetailTipo === "produto" && addDetailProdutoId) {
      const p = produtosRevenda.find((x: any) => String(x.id) === addDetailProdutoId);
      setAddDetailPreco(precoUniProdutoCompra(p));
    } else {
      setAddDetailPreco("");
    }
  }, [addDetailTipo, addDetailMaterialId, addDetailProdutoId, materiais, produtosRevenda]);

  // Ao trocar o fornecedor, limpar material selecionado se não estiver vinculado a ele
  useEffect(() => {
    if (!fornecedorId) {
      setMaterialId("");
      return;
    }
    const vinculados = materiais.filter(
      (m: any) => String(m.fornecedor_padrao ?? m.fornecedor_padrao_id) === String(fornecedorId)
    );
    const pertence = vinculados.some((m: any) => String(m.id) === materialId);
    if (materialId && !pertence) setMaterialId("");
  }, [fornecedorId, materiais]);

  useEffect(() => {
    if (!fornecedorId || !produtoId) return;
    const p = produtosRevenda.find((x: any) => String(x.id) === produtoId);
    if (p && !produtoDisponivelParaFornecedor(p, fornecedorId)) setProdutoId("");
  }, [fornecedorId, produtoId, produtosRevenda]);

  const loadData = async () => {
    try {
      const [ordensRes, materiaisRes, produtosRes, fornRes] = await Promise.all([
        api.getCompras().catch(() => []),
        api.getMateriais().catch(() => []),
        api.getProdutos().catch(() => []),
        api.getFornecedores().catch(() => []),
      ]);
      setOrdens(
        Array.isArray(ordensRes)
          ? ordensRes.map((o: any) => ({
              id: o.id,
              fornecedor: o.fornecedor || "",
              fornecedor_id: o.fornecedor_id,
              data: o.data || "",
              data_lancamento: o.data_lancamento || "",
              cancelada: o.cancelada === true,
              ultima_alteracao_observacao:
                typeof o.ultima_alteracao_observacao === "string" ? o.ultima_alteracao_observacao : "",
              ultima_alteracao_em: o.ultima_alteracao_em ?? undefined,
              itens: (o.itens || []).map((i: any) => ({
                id: i.id,
                tipo: (i.tipo === "produto" ? "produto" : "material") as "material" | "produto",
                material: i.material,
                material_nome: i.material_nome || "",
                produto: i.produto,
                produto_nome: i.produto_nome || "",
                quantidade: parseQtdInteira(i.quantidade) ?? 0,
                preco_no_dia: Number(i.preco_no_dia) || 0,
                total: Number(i.total) || 0,
              })),
              total: Number(o.total) || 0,
            }))
          : []
      );
      setMateriais(Array.isArray(materiaisRes) ? materiaisRes : []);
      const allProds = Array.isArray(produtosRes) ? produtosRes : [];
      setProdutosRevenda(allProds.filter((p: any) => produtoElegivelCompraPronta(p)));
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
      setAddDetailTipo("material");
      setAddDetailMaterialId("");
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
    tipoLinha?: 'material' | 'produto',
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
      const preco = parseFloat(editPreco.replace(",", "."));
      if (isNaN(preco) || preco < 0) {
        toast.error("Preço deve ser válido");
        return;
      }
    }
    setItensForm((prev) =>
      prev.map((i) =>
        i.id === editingItemId
          ? { ...i, quantidade: String(qtd), ...(isChefe ? { precoUnitario: editPreco } : {}) }
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
    const preco = isChefe ? parseFloat(editCompraPreco.replace(",", ".")) : editingItem.preco_no_dia;
    if (isChefe && (isNaN(preco) || preco < 0)) {
      toast.error("Preço deve ser válido");
      return;
    }
    const itemId = String(editingItem.id);
    const ordemIdRef = editingItem.ordemId;
    const detId = detailCompra ? String(detailCompra.id) : null;
    const tipo: 'material' | 'produto' = editingItem.tipo === 'produto' ? 'produto' : 'material';
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
              <th style="width: 46%;">Material</th>
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
        const preco = parseFloat(item.precoUnitario.replace(',', '.'));
        return item.materialId && qtd !== null && qtd > 0 && !isNaN(preco) && preco > 0;
      })
      .map((item) => ({
        ...(item.materialId.startsWith("prod:") ? { tipo: "produto", produto: Number(item.materialId.replace("prod:", "")) } : { tipo: "material", material: Number(item.materialId.replace("mat:", "")) }),
        quantidade: parseQtdInteira(item.quantidade) as number,
        preco_no_dia: parseFloat(item.precoUnitario.replace(',', '.')),
      }));
    if (itensPayload.length === 0) {
      toast.error("Adicione itens válidos (material, quantidade e preço)");
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
    setMaterialId('');
    setProdutoId('');
    setFornecedorId('');
    setQuantidade('');
    setPrecoUnitario('');
    setNumeroVendaFornecedor('');
    setData(getTodayLocalISO());
    setItensForm([]);
  };

  const getItemNome = (i: ItemCompra) =>
    i.produto_nome || i.material_nome || (i.produto ? `#${i.produto}` : `#${i.material}`);

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
                Selecione o fornecedor e adicione os itens. Materiais só aparecem se estiverem vinculados a esse fornecedor no cadastro. Em produtos, aparecem itens de revenda ou produtos não fabricados com fornecedor cadastrado (mesmo fornecedor da compra, ou fornecedor do produto em branco).
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
                      <Label htmlFor="materialId" className="flex-1">Item para adicionar *</Label>
                      {fornecedorId ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          title={tipoItem === "material" ? "Cadastrar novo material" : "Cadastrar novo produto"}
                          onClick={() => abrirCadastroRapido("nova")}
                        >
                          <Plus className="size-4" />
                        </Button>
                      ) : null}
                    </div>
                    {!fornecedorId ? (
                      <p className="text-sm text-muted-foreground py-2">Selecione o fornecedor para ver os materiais vinculados.</p>
                    ) : (() => {
                      const materiaisDoFornecedor = materiais.filter(
                        (m: any) => String(m.fornecedor_padrao ?? m.fornecedor_padrao_id) === String(fornecedorId)
                      );
                      const produtosLista = produtosRevenda
                        .filter((p: any) => produtoDisponivelParaFornecedor(p, fornecedorId))
                        .sort((a: any, b: any) =>
                          String(a.nome ?? "").localeCompare(String(b.nome ?? ""), "pt-BR")
                        );

                      return (
                        <div className="space-y-2">
                          <Label>Tipo de item</Label>
                          <Select
                            value={tipoItem}
                            onValueChange={(v) => {
                              const t = v as "material" | "produto";
                              setTipoItem(t);
                              if (t === "material") setProdutoId("");
                              else setMaterialId("");
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="material">Material</SelectItem>
                              <SelectItem value="produto">Produto (revenda)</SelectItem>
                            </SelectContent>
                          </Select>

                          {tipoItem === "material" ? (
                            materiaisDoFornecedor.length > 0 ? (
                              <CompraSearchableSelect
                                value={materialId}
                                onValueChange={(id) => {
                                  setMaterialId(id);
                                  const mat = materiais.find((m: any) => String(m.id) === id);
                                  setPrecoUnitario(precoUniMaterial(mat));
                                }}
                                options={materiaisDoFornecedor.map((m: any) => materialCompraOption(m))}
                                placeholder="Selecione o material"
                                triggerId="materialId"
                                emptyHint="Nenhum material encontrado."
                                searchPlaceholder="Pesquisar material…"
                              />
                            ) : (
                              <p className="text-sm text-muted-foreground py-2">
                                Nenhum material vinculado a este fornecedor. Vincule na aba Cadastro (materiais).
                              </p>
                            )
                          ) : produtosLista.length > 0 ? (
                            <CompraSearchableSelect
                              value={produtoId}
                              onValueChange={(id) => {
                                setProdutoId(id);
                                const p = produtosRevenda.find((x: any) => String(x.id) === id);
                                setPrecoUnitario(precoUniProdutoCompra(p));
                              }}
                              options={produtosLista.map((p: any) => produtoCompraOption(p))}
                              placeholder="Selecione o produto de revenda"
                              triggerId="produtoId"
                              emptyHint="Nenhum produto encontrado."
                              searchPlaceholder="Pesquisar produto…"
                            />
                          ) : (
                            <p className="text-sm text-muted-foreground py-2">
                              Nenhum produto disponível para este fornecedor. No cadastro, marque revenda ou defina o
                              fornecedor do produto (e não marque como fabricado).
                            </p>
                          )}
                        </div>
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
                      {formatCurrencyBrl(parseFloat(quantidade) * parseFloat(precoUnitario))}
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
                      const selectedId = tipoItem === "produto" ? produtoId : materialId;
                      if (!selectedId || !quantidade) {
                        toast.error(`Selecione ${tipoItem === "produto" ? "produto" : "material"} e quantidade`);
                        return;
                      }
                      const qtd = parseQtdInteira(quantidade);
                      if (qtd === null) {
                        toast.error('Quantidade inválida');
                        return;
                      }
                      const precoBase =
                        tipoItem === "produto"
                          ? (produtosRevenda.find((p: any) => String(p.id) === selectedId)?.preco_custo ?? 0)
                          : (materiais.find((m: any) => String(m.id) === selectedId)?.precoUnitarioBase ??
                             materiais.find((m: any) => String(m.id) === selectedId)?.preco_unitario_base ??
                             0);
                      const precoParaItem = isChefe
                        ? (parseFloat(String(precoUnitario).replace(',', '.')) || Number(precoBase))
                        : Number(precoBase);
                      if (isNaN(precoParaItem) || precoParaItem <= 0) {
                        toast.error('Preço não definido. Informe o preço ou cadastre o valor base.');
                        return;
                      }
                      setItensForm((prev) => [
                        ...prev,
                        {
                          id: `${Date.now()}-${prev.length}`,
                          materialId: tipoItem === "produto" ? `prod:${selectedId}` : `mat:${selectedId}`,
                          quantidade: String(qtd),
                          precoUnitario: String(precoParaItem),
                        },
                      ]);
                      setMaterialId('');
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
                        const isProd = item.materialId.startsWith("prod:");
                        const refId = item.materialId.replace("prod:", "").replace("mat:", "");
                        const label = isProd
                          ? compraOptionRotulo(
                              produtoCompraOption(
                                produtosRevenda.find((p: any) => String(p.id) === refId) ?? { id: refId, nome: `Produto #${refId}` },
                              ),
                            )
                          : compraOptionRotulo(
                              materialCompraOption(
                                materiais.find((m: any) => String(m.id) === refId) ?? { id: refId, nome: `Material #${refId}` },
                              ),
                            );
                        const qtdItem = parseQtdInteira(item.quantidade) ?? 0;
                        const precoItem = parseFloat(item.precoUnitario.replace(',', '.') || '0');
                        const isEditing = editingItemId === item.id;
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
                                    {formatCurrencyBrl(
                                      !isNaN(parseFloat(editQtd.replace(",", ".")) * parseFloat(editPreco.replace(",", ".")))
                                        ? parseFloat(editQtd.replace(",", ".")) * parseFloat(editPreco.replace(",", "."))
                                        : 0
                                    )}
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
                                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => copiarItemNaLista(item.id)} title="Copiar item (mesmo material, altere a quantidade)">
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
                    Nenhum item adicionado ainda. Selecione o fornecedor, o material e a quantidade
                    {isChefe ? " e o preço" : ""} e clique em &quot;Adicionar material à lista&quot;.
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
                  <Label htmlFor="searchProduto">Produto / Material</Label>
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
                            const preco = parseFloat(String(addDetailPreco).replace(",", "."));
                            if (!Number.isFinite(preco) || preco < 0) {
                              toast.error("Informe o preço unitário");
                              return;
                            }
                            const payload =
                              addDetailTipo === "material"
                                ? {
                                    ordemId,
                                    tipo: "material" as const,
                                    material: Number(addDetailMaterialId),
                                    quantidade: qtd,
                                    preco_no_dia: preco,
                                  }
                                : {
                                    ordemId,
                                    tipo: "produto" as const,
                                    produto: Number(addDetailProdutoId),
                                    quantidade: qtd,
                                    preco_no_dia: preco,
                                  };
                            if (addDetailTipo === "material") {
                              if (!addDetailMaterialId) {
                                toast.error("Selecione o material");
                                return;
                              }
                            } else if (!addDetailProdutoId) {
                              toast.error("Selecione o produto");
                              return;
                            }
                            setDetailSaving(true);
                            try {
                              const updated = await api.addCompraItem(payload.ordemId, {
                                tipo: payload.tipo,
                                material: payload.tipo === "material" ? payload.material : undefined,
                                produto: payload.tipo === "produto" ? payload.produto : undefined,
                                quantidade: payload.quantidade,
                                preco_no_dia: payload.preco_no_dia,
                              });
                              toast.success("Item adicionado");
                              await loadData();
                              if (detailCompra && String(detailCompra.id) === ordemId) {
                                setDetailCompra(updated as OrdemCompra);
                              }
                              setAddDetailMaterialId("");
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

                    <div className="mt-3 grid gap-3 md:grid-cols-4">
                      <div className="space-y-2 md:col-span-1">
                        <Label>Tipo</Label>
                        <Select
                          value={addDetailTipo}
                          onValueChange={(v) => {
                            const t = v as "material" | "produto";
                            setAddDetailTipo(t);
                            setAddDetailMaterialId("");
                            setAddDetailProdutoId("");
                            setAddDetailPreco("");
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="material">Material</SelectItem>
                            <SelectItem value="produto">Produto</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2 md:col-span-1">
                        <div className="flex items-center gap-2">
                          <Label className="flex-1">{addDetailTipo === "material" ? "Material" : "Produto"}</Label>
                          {fornecedorIdDetalheCompra ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              title={addDetailTipo === "material" ? "Cadastrar novo material" : "Cadastrar novo produto"}
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
                        ) : addDetailTipo === "material" ? (
                          materiaisDetalheCompra.length > 0 ? (
                            <CompraSearchableSelect
                              value={addDetailMaterialId}
                              onValueChange={(id) => {
                                setAddDetailMaterialId(id);
                                const mat = materiais.find((m: any) => String(m.id) === id);
                                setAddDetailPreco(precoUniMaterial(mat));
                              }}
                              options={materiaisDetalheCompra.map((m: any) => materialCompraOption(m))}
                              placeholder="Selecione o material"
                              emptyHint="Nenhum material encontrado."
                              searchPlaceholder="Pesquisar material…"
                            />
                          ) : (
                            <p className="text-sm text-muted-foreground py-2">
                              Nenhum material vinculado a este fornecedor.
                            </p>
                          )
                        ) : produtosDetalheCompra.length > 0 ? (
                          <CompraSearchableSelect
                            value={addDetailProdutoId}
                            onValueChange={(id) => {
                              setAddDetailProdutoId(id);
                              const p = produtosRevenda.find((x: any) => String(x.id) === id);
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
                      <div className="space-y-2 md:col-span-1">
                        <Label>Quantidade</Label>
                        <Input value={addDetailQtd} onChange={(e) => setAddDetailQtd(e.target.value)} type="number" min={1} />
                      </div>
                      <div className="space-y-2 md:col-span-1">
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
                                  tipo: item.tipo === 'produto' ? 'produto' : 'material',
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
