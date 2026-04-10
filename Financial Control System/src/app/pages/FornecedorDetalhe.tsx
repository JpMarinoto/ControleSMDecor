import React, { Fragment, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { api } from "../lib/api";
import { formatDateOnly, getTodayLocalISO, parseDateOnlyToTime } from "../lib/format";
import { useAuth } from "../contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { cn } from "../components/ui/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { ArrowLeft, Truck, Receipt, CreditCard, DollarSign, Printer, Package, ChevronRight, Ban, Pencil, Trash2, CheckCircle2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../components/ui/collapsible";
import { Checkbox } from "../components/ui/checkbox";
import { toast } from "sonner";
import { motion } from "motion/react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { empresa, empresaEnderecoLinha, empresaDocumento } from "../data/empresa";
import { ConfirmacaoComSenhaDialog } from "../components/ConfirmacaoDialog";
import { DocumentPrintPreview } from "../components/DocumentPrintPreview";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";

type CompraLinhaFornecedor = {
  id: string;
  data: string;
  material: string;
  quantidade?: number;
  /** Preço unitário registrado na compra (preco_no_dia no banco). */
  preco_unitario?: number;
  total: number;
  ordem_id?: number | null;
  ordem_cancelada?: boolean;
  marcada_paga?: boolean;
};

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function agruparComprasPorOrdem(
  exibirCompras: CompraLinhaFornecedor[],
  parseDataFn: (s: string) => number
): { key: string; ordemId: number | null; lines: CompraLinhaFornecedor[]; totalGrupo: number; dataRef: string }[] {
  const map = new Map<string, CompraLinhaFornecedor[]>();
  for (const c of exibirCompras) {
    const k = c.ordem_id != null && c.ordem_id !== undefined ? `ordem-${c.ordem_id}` : `solo-${c.id}`;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(c);
  }
  const groups = Array.from(map.entries()).map(([key, lines]) => {
    const sorted = [...lines].sort((a, b) => parseDataFn(b.data) - parseDataFn(a.data));
    const ordemId = sorted[0]?.ordem_id ?? null;
    const totalGrupo = sorted.reduce((s, x) => s + x.total, 0);
    const dataRef = sorted[0]?.data ?? "";
    return { key, ordemId, lines: sorted, totalGrupo, dataRef };
  });
  groups.sort((a, b) => parseDataFn(b.dataRef) - parseDataFn(a.dataRef));
  return groups;
}

const METODOS_PAGAMENTO_API = ["Pix", "Dinheiro", "Cartão crédito", "Cartão débito", "Cheque"] as const;

const rowCompraMarcadaPaga =
  "border-l-[3px] border-l-emerald-500 bg-emerald-50/90 dark:border-l-emerald-400 dark:bg-emerald-950/35";
const rowCompraMarcadaPagaFilha = "bg-emerald-50/55 dark:bg-emerald-950/25";
const rowCompraSelecionada = "bg-primary/[0.07] dark:bg-primary/12 ring-1 ring-inset ring-primary/25";
const rowCompraPagaSelecionada =
  "border-l-[3px] border-l-emerald-600 bg-emerald-100/95 dark:border-l-emerald-300 dark:bg-emerald-950/45 ring-2 ring-inset ring-emerald-500/30 dark:ring-emerald-400/25";
const rowCompraPagaFilhaSelecionada =
  "bg-emerald-100/75 dark:bg-emerald-950/35 ring-1 ring-inset ring-emerald-400/25 dark:ring-emerald-500/20";

interface FornecedorDetalheData {
  fornecedor: { id: number; nome: string; telefone: string };
  total_compras: number;
  total_pago: number;
  saldo_devedor: number;
  compras: CompraLinhaFornecedor[];
  pagamentos: {
    id: number;
    data: string;
    valor: number;
    metodo?: string;
    conta_nome?: string;
    conta_id?: number | null;
    observacao?: string;
  }[];
}

export function FornecedorDetalhe() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isChefe = user?.is_chefe === true;
  const [data, setData] = useState<FornecedorDetalheData | null>(null);
  const [loading, setLoading] = useState(true);
  const [openPagamento, setOpenPagamento] = useState(false);
  const [valorPagamento, setValorPagamento] = useState("");
  const [metodoPagamento, setMetodoPagamento] = useState("");
  const [observacaoPagamento, setObservacaoPagamento] = useState("");
  const [contaId, setContaId] = useState("");
  const [dataPagamento, setDataPagamento] = useState(getTodayLocalISO());
  const [contas, setContas] = useState<{ id: number; nome: string }[]>([]);
  type Periodo = "todos" | "semana" | "mes" | "personalizado";
  const [periodo, setPeriodo] = useState<Periodo>("todos");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [materiais, setMateriais] = useState<{ id: number; nome: string; preco_unitario_base: number }[]>([]);
  const [produtos, setProdutos] = useState<{ id: number; nome: string; preco_venda: number; estoque_atual: number; ativo: boolean }[]>([]);
  const [editingMaterialId, setEditingMaterialId] = useState<number | null>(null);
  const [editingMaterialPreco, setEditingMaterialPreco] = useState("");
  const [savingMaterialId, setSavingMaterialId] = useState<number | null>(null);
  const [selectedCompraIds, setSelectedCompraIds] = useState<Set<string>>(new Set());
  const [marcacaoSaving, setMarcacaoSaving] = useState<string | null>(null);
  const [editPagamentoOpen, setEditPagamentoOpen] = useState(false);
  const [editPagamentoId, setEditPagamentoId] = useState<number | null>(null);
  const [editPagValor, setEditPagValor] = useState("");
  const [editPagMetodo, setEditPagMetodo] = useState("");
  const [editPagData, setEditPagData] = useState("");
  const [editPagContaId, setEditPagContaId] = useState("");
  const [editPagObs, setEditPagObs] = useState("");
  const [editPagSaving, setEditPagSaving] = useState(false);
  const [pagamentoExcluir, setPagamentoExcluir] = useState<FornecedorDetalheData["pagamentos"][0] | null>(null);
  const [printPreview, setPrintPreview] = useState<{
    html: string;
    titulo: string;
    downloadBaseName: string;
  } | null>(null);

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

  const load = () => {
    if (!id) return;
    api.getFornecedorDetalhe(id)
      .then((d) => setData(d && d.fornecedor ? d : null))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [id]);

  const loadMateriais = () => {
    if (!id) return;
    api.getFornecedorMateriais(id).then(setMateriais).catch(() => setMateriais([]));
  };
  const loadProdutos = () => {
    if (!id) return;
    api.getFornecedorProdutos(id).then(setProdutos).catch(() => setProdutos([]));
  };

  useEffect(() => {
    if (id) loadMateriais();
  }, [id]);
  useEffect(() => {
    if (id) loadProdutos();
  }, [id]);

  const handleSaveMaterialPreco = async (materialId: number, novoValorStr: string) => {
    const v = parseFloat(novoValorStr.replace(",", "."));
    if (isNaN(v) || v < 0) {
      toast.error("Preço inválido.");
      setEditingMaterialId(null);
      return;
    }
    const mat = materiais.find((m) => m.id === materialId);
    if (mat && Math.abs(mat.preco_unitario_base - v) < 0.005) {
      setEditingMaterialId(null);
      return;
    }
    setSavingMaterialId(materialId);
    try {
      await api.updateMaterial(String(materialId), { precoUnitarioBase: v });
      toast.success("Preço do material atualizado");
      loadMateriais();
    } catch {
      toast.error("Erro ao atualizar preço");
    } finally {
      setSavingMaterialId(null);
      setEditingMaterialId(null);
    }
  };

  const handlePagar = async (e: FormEvent) => {
    e.preventDefault();
    if (!id) return;
    const v = parseFloat(valorPagamento.replace(",", "."));
    if (isNaN(v) || v <= 0) {
      toast.error("Informe um valor positivo.");
      return;
    }
    if (!metodoPagamento) {
      toast.error("Selecione a forma de pagamento.");
      return;
    }
    try {
      const res = await api.caixaPagamento({
        tipo: "fornecedor",
        fornecedor_id: Number(id),
        valor: v,
        metodo: metodoPagamento,
        data: dataPagamento,
        ...(observacaoPagamento.trim() ? { observacao: observacaoPagamento.trim() } : {}),
        ...(contaId && contaId !== "nenhuma" ? { conta_id: Number(contaId) } : {}),
      });
      const msg = res?.data_gravada ? `Registrado. Data gravada: ${res.data_gravada}` : "Pagamento registrado";
      toast.success(msg);
      setValorPagamento("");
      setMetodoPagamento("");
      setObservacaoPagamento("");
      setContaId("");
      setDataPagamento(getTodayLocalISO());
      setOpenPagamento(false);
      load();
    } catch {
      toast.error("Erro ao registrar pagamento");
    }
  };

  const abrirEdicaoPagamento = (p: FornecedorDetalheData["pagamentos"][0]) => {
    setEditPagamentoId(p.id);
    setEditPagValor(String(p.valor).replace(".", ","));
    const m = p.metodo || "Dinheiro";
    setEditPagMetodo(METODOS_PAGAMENTO_API.includes(m as (typeof METODOS_PAGAMENTO_API)[number]) ? m : "Dinheiro");
    setEditPagData((p.data || "").slice(0, 10));
    setEditPagContaId(p.conta_id != null && p.conta_id !== undefined ? String(p.conta_id) : "nenhuma");
    setEditPagObs(p.observacao || "");
    setEditPagamentoOpen(true);
    loadContas();
  };

  const salvarEdicaoPagamento = async () => {
    if (editPagamentoId == null) return;
    const valor = parseFloat(editPagValor.replace(",", "."));
    if (isNaN(valor) || valor <= 0) {
      toast.error("Informe um valor válido.");
      return;
    }
    if (!editPagMetodo) {
      toast.error("Selecione a forma de pagamento.");
      return;
    }
    setEditPagSaving(true);
    try {
      await api.updatePagamentoFornecedor(editPagamentoId, {
        valor,
        metodo: editPagMetodo,
        data: editPagData.slice(0, 10),
        conta_id: editPagContaId && editPagContaId !== "nenhuma" ? Number(editPagContaId) : null,
        observacao: editPagObs.trim() || "",
      });
      toast.success("Pagamento atualizado.");
      setEditPagamentoOpen(false);
      setEditPagamentoId(null);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar pagamento.");
    } finally {
      setEditPagSaving(false);
    }
  };

  const excluirPagamento = (p: FornecedorDetalheData["pagamentos"][0]) => {
    setPagamentoExcluir(p);
  };

  const normalizarContas = (res: any): { id: number; nome: string }[] => {
    if (Array.isArray(res)) return res.map((x: any) => ({ id: x.id, nome: x.nome ?? "" }));
    if (res && typeof res === "object" && Array.isArray(res.results)) return res.results.map((x: any) => ({ id: x.id, nome: x.nome ?? "" }));
    if (res && typeof res === "object" && Array.isArray(res.data)) return res.data.map((x: any) => ({ id: x.id, nome: x.nome ?? "" }));
    return [];
  };
  const loadContas = () => {
    api.getContas().then((list: any) => setContas(normalizarContas(list))).catch(() => setContas([]));
  };

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

  const getLimites = (): { inicio: number; fim: number } | null => {
    const hoje = new Date();
    hoje.setHours(23, 59, 59, 999);
    const fim = hoje.getTime();
    if (periodo === "todos") return null;
    if (periodo === "semana") {
      const inicio = new Date(hoje);
      inicio.setDate(inicio.getDate() - 7);
      inicio.setHours(0, 0, 0, 0);
      return { inicio: inicio.getTime(), fim };
    }
    if (periodo === "mes") {
      const inicio = new Date(hoje);
      inicio.setDate(inicio.getDate() - 30);
      inicio.setHours(0, 0, 0, 0);
      return { inicio: inicio.getTime(), fim };
    }
    if (periodo === "personalizado" && dataInicio && dataFim) {
      const inicio = parseDateOnlyToTime(dataInicio);
      const [y, m, d] = dataFim.slice(0, 10).split("-").map(Number);
      const fim = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
      return { inicio, fim };
    }
    return null;
  };

  const parseData = (s: string) => parseDateOnlyToTime(s);
  const limites = getLimites();
  const comprasFiltradas = data
    ? data.compras.filter((c) => {
        if (!limites) return true;
        const t = parseData(c.data);
        return t >= limites.inicio && t <= limites.fim;
      })
    : [];
  /** Compras que ainda contam no saldo (ordens não canceladas e linhas avulsas). */
  const exibirCompras = comprasFiltradas.filter((c) => c.ordem_cancelada !== true);
  /** Apenas itens de ordens canceladas — só na secção Histórico. */
  const exibirComprasHistorico = comprasFiltradas.filter((c) => c.ordem_cancelada === true);

  const pagamentosFiltrados = data
    ? data.pagamentos.filter((p) => {
        if (!limites) return true;
        const t = parseData(p.data);
        return t >= limites.inicio && t <= limites.fim;
      })
    : [];
  const totalComprasPeriodo = exibirCompras.reduce((s, c) => s + c.total, 0);
  const totalPagoPeriodo = pagamentosFiltrados.reduce((s, p) => s + p.valor, 0);
  const saldoNoPeriodo = totalComprasPeriodo - totalPagoPeriodo;

  const imprimirFechamento = (usarSelecao?: boolean) => {
    if (!data) return;
    const usarComprasSelecionadas = usarSelecao && comprasSelecionadas.length > 0;
    const comprasAtivasDoc = data.compras.filter((c) => c.ordem_cancelada !== true);
    const comprasParaImprimir = usarComprasSelecionadas
      ? comprasSelecionadas
      : limites
        ? comprasFiltradas.filter((c) => c.ordem_cancelada !== true)
        : comprasAtivasDoc;
    const gruposImpressao = agruparComprasPorOrdem(comprasParaImprimir, parseData);
    const linhaQtd = (q: number | undefined) =>
      q != null && !Number.isNaN(Number(q)) ? String(q) : "—";
    const linhaPU = (linha: CompraLinhaFornecedor) =>
      linha.preco_unitario != null && !Number.isNaN(Number(linha.preco_unitario))
        ? formatCurrency(linha.preco_unitario)
        : "—";
    const comprasRows = gruposImpressao
      .map((g) => {
        if (g.ordemId != null) {
          const cabecalho = `Ordem #${g.ordemId} · ${formatDateOnly(g.dataRef)} · ${g.lines.length} item(ns) · Total: ${formatCurrency(g.totalGrupo)}`;
          const itens = g.lines
            .map((linha) => {
              const q = linhaQtd(linha.quantidade);
              const pu = linhaPU(linha);
              return `<tr class="row-item-ordem"><td></td><td>${escapeHtml(linha.material)}</td><td class="num">${q}</td><td class="num">${pu}</td><td class="num">${formatCurrency(linha.total)}</td></tr>`;
            })
            .join("");
          return `<tr class="row-ordem-cabecalho"><td colspan="5">${escapeHtml(cabecalho)}</td></tr>${itens}`;
        }
        const linha = g.lines[0];
        const qtd = linhaQtd(linha.quantidade);
        const pu = linhaPU(linha);
        return `<tr><td>${formatDateOnly(linha.data)}</td><td>${escapeHtml(linha.material)}</td><td class="num">${qtd}</td><td class="num">${pu}</td><td class="num">${formatCurrency(linha.total)}</td></tr>`;
      })
      .join("");
    const pagRows = (limites ? pagamentosFiltrados : data.pagamentos)
      .map((p) => `<tr><td>${formatDateOnly(p.data)}</td><td class="num">${formatCurrency(p.valor)}</td></tr>`)
      .join("");
    const totalComprasDoc = comprasParaImprimir.reduce((s, c) => s + c.total, 0);
    const ordensNoDoc = gruposImpressao.filter((g) => g.ordemId != null).length;
    const avulsasNoDoc = gruposImpressao.filter((g) => g.ordemId == null).length;
    const partesSelecao: string[] = [];
    if (ordensNoDoc > 0) partesSelecao.push(`${ordensNoDoc} ordem(ns)`);
    if (avulsasNoDoc > 0) partesSelecao.push(`${avulsasNoDoc} compra(s) avulsa(s)`);
    const periodoLabel = usarComprasSelecionadas
      ? `Fechamento selecionado (${partesSelecao.join(" · ") || "—"})`
      : periodo === "semana"
        ? "Última semana"
        : periodo === "mes"
          ? "Último mês"
          : periodo === "personalizado" && dataInicio && dataFim
            ? `${formatDateOnly(dataInicio)} a ${formatDateOnly(dataFim)}`
            : "Todo o período";
    const hojeStr = new Date().toLocaleString("pt-BR");
    const tipoImp = usarComprasSelecionadas ? "fechamento_fornecedor_selecao" : "fechamento_fornecedor";
    const htmlForn = `
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"><title>Fechamento – ${data.fornecedor.nome}</title>
          <style>
            @page { size: A4; margin: 15mm; }
            body { font-family: 'Segoe UI', system-ui, sans-serif; font-size: 12px; color: #1a1a1a; line-height: 1.45; max-width: 210mm; margin: 0 auto; padding: 16px; }
            .os-header{display:flex;gap:8px;align-items:center;margin-bottom:6px}
            .os-logo img{max-height:56px;max-width:56px;object-fit:contain}
            .empresa-block { font-size: 0.7rem; }
            .empresa-nome { font-size: 0.85rem; font-weight: 600; color: #1e3a5f; letter-spacing: 0.02em; line-height: 1.3; }
            .empresa-fantasia { font-size: 0.7rem; color: #475569; margin-top: 2px; }
            .empresa-docs { font-size: 0.65rem; color: #64748b; margin-top: 4px; }
            .empresa-docs span + span::before { content: " | "; }
            .empresa-endereco { font-size: 0.65rem; color: #64748b; margin-top: 2px; }
            .empresa-contato { font-size: 0.65rem; color: #64748b; margin-top: 2px; }
            h1 { font-size: 16px; margin: 0 0 8px; color: #0f172a; }
            .meta { color: #64748b; font-size: 11px; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; margin: 12px 0 20px; font-size: 12px; }
            th, td { border: 1px solid #e2e8f0; padding: 10px 12px; text-align: left; }
            th { background: #f1f5f9; font-weight: 600; color: #334155; }
            .num { text-align: right; white-space: nowrap; }
            tr.row-ordem-cabecalho td { background: #e2e8f0; font-weight: 600; color: #0f172a; padding: 10px 12px; }
            tr.row-item-ordem td { background: #f8fafc; }
            tr.row-item-ordem td:nth-child(2) { padding-left: 18px; }
            .resumo-box {
              background: linear-gradient(135deg, #fefce8 0%, #fef3c7 100%);
              border: 1px solid #facc15;
              border-radius: 10px;
              padding: 10px 12px;
              margin: 12px 0 18px;
              font-size: 12px;
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 10px;
            }
            .resumo-box .label { font-weight: 600; color: #854d0e; }
            .resumo-box .valor { font-weight: 700; font-size: 14px; color: #b45309; }
            .muted { color: #64748b; font-size: 11px; margin-top: 24px; text-align: center; }
          </style>
        </head>
        <body>
          ${getEmpresaHeaderHtml()}
          <h1>Fechamento – ${data.fornecedor.nome}</h1>
          <p class="meta">Período: ${periodoLabel}</p>
          <div class="resumo-box">
            <div class="label">Total de compras neste período</div>
            <div class="valor">${formatCurrency(totalComprasDoc)}</div>
          </div>
          <h3 style="font-size:14px;margin:16px 0 8px;">Compras</h3>
          <table>
            <thead><tr><th>Data</th><th>Item</th><th class="num">Qtd</th><th class="num">V. unit.</th><th class="num">Total</th></tr></thead>
            <tbody>${comprasRows}</tbody>
          </table>
          <h3 style="font-size:14px;margin:20px 0 8px;">Pagamentos</h3>
          <table>
            <thead><tr><th>Data</th><th class="num">Valor</th></tr></thead>
            <tbody>${pagRows}</tbody>
          </table>
          <p class="muted">Impresso em ${hojeStr}</p>
        </body>
      </html>`;
    const tituloPrev = `Fechamento — ${data.fornecedor.nome} (${periodoLabel})`;
    void api
      .registrarImpressao({
        tipo: tipoImp,
        titulo: tituloPrev,
        html: htmlForn,
        meta: {
          fornecedor_id: Number(id),
          periodo: periodoLabel,
          selecao: usarComprasSelecionadas,
        },
      })
      .catch(() => {});
    setPrintPreview({
      html: htmlForn,
      titulo: tituloPrev,
      downloadBaseName: usarComprasSelecionadas
        ? `fechamento-fornecedor-${id}-selecao`
        : `fechamento-fornecedor-${id}`,
    });
  };

  if (!id) return null;
  if (loading && !data) return <p className="text-muted-foreground">Carregando...</p>;
  if (!data) return <p className="text-muted-foreground">Fornecedor não encontrado.</p>;

  const { fornecedor, total_compras, total_pago, saldo_devedor, pagamentos } = data;
  const exibirPagamentos = limites ? pagamentosFiltrados : pagamentos;

  const gruposCompras = agruparComprasPorOrdem(exibirCompras, parseData);
  const gruposComprasHistorico = agruparComprasPorOrdem(exibirComprasHistorico, parseData);

  const toggleOrdemGrupo = (lineIds: string[]) => {
    setSelectedCompraIds((prev) => {
      const next = new Set(prev);
      const allIn = lineIds.length > 0 && lineIds.every((id) => next.has(id));
      if (allIn) lineIds.forEach((id) => next.delete(id));
      else lineIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const comprasSelecionadas = exibirCompras.filter((c) => selectedCompraIds.has(c.id));
  const totalSelecionadoCompras = comprasSelecionadas.reduce((s, c) => s + c.total, 0);
  const ordensTotalmenteSelecionadas = gruposCompras.filter((g) => {
    const ids = g.lines.map((l) => l.id);
    return ids.length > 0 && ids.every((id) => selectedCompraIds.has(id));
  }).length;

  const pagamentosRaw = data.pagamentos;
  const safeNumFn = (v: unknown) => {
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : 0;
  };
  const rangeSelecaoCompras =
    comprasSelecionadas.length === 0
      ? null
      : (() => {
          const times = comprasSelecionadas
            .map((c) => parseData(c.data))
            .filter((t) => typeof t === "number" && !isNaN(t));
          if (times.length === 0) return null;
          return { inicio: Math.min(...times), fim: Math.max(...times) };
        })();
  const totalPagoNoIntervaloSelecao =
    rangeSelecaoCompras == null
      ? 0
      : pagamentosRaw.reduce((s, p) => {
          const t = parseData(p.data);
          if (t < rangeSelecaoCompras.inicio || t > rangeSelecaoCompras.fim) return s;
          return s + safeNumFn(p.valor);
        }, 0);
  const aPagarDaSelecaoCompras = Math.max(0, totalSelecionadoCompras - totalPagoNoIntervaloSelecao);
  const restanteBrutoComprasForaSelecao = exibirCompras
    .filter((c) => !selectedCompraIds.has(c.id))
    .reduce((s, c) => s + safeNumFn(c.total), 0);

  const aplicarMarcacaoCompra = async (opts: { ordemId?: number; linhaId?: string; valor: boolean }) => {
    if (!id) return;
    const key = opts.ordemId != null ? `ordem-${opts.ordemId}` : opts.linhaId ?? "";
    setMarcacaoSaving(key);
    try {
      await api.patchFornecedorCompraMarcacaoPaga(id, {
        marcada_paga: opts.valor,
        ...(opts.ordemId != null ? { ordem_id: opts.ordemId } : {}),
        ...(opts.linhaId != null ? { linha_id: opts.linhaId } : {}),
      });
      toast.success(opts.valor ? "Marcada como paga." : "Marcação de paga removida.");
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar.");
    } finally {
      setMarcacaoSaving(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/fornecedores">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-semibold">{fornecedor.nome}</h1>
            <p className="text-muted-foreground">{fornecedor.telefone && `Tel: ${fornecedor.telefone}`}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select
            value={periodo}
            onValueChange={(v) => {
              setSelectedCompraIds(new Set());
              setPeriodo(v as Periodo);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todo o período</SelectItem>
              <SelectItem value="semana">Última semana</SelectItem>
              <SelectItem value="mes">Último mês</SelectItem>
              <SelectItem value="personalizado">Personalizado</SelectItem>
            </SelectContent>
          </Select>
          {periodo === "personalizado" && (
            <>
              <Input
                type="date"
                value={dataInicio}
                onChange={(e) => {
                  setSelectedCompraIds(new Set());
                  setDataInicio(e.target.value);
                }}
                className="w-36"
              />
              <Input
                type="date"
                value={dataFim}
                onChange={(e) => {
                  setSelectedCompraIds(new Set());
                  setDataFim(e.target.value);
                }}
                className="w-36"
              />
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => imprimirFechamento(false)}>
            <Printer className="size-4 mr-2" />
            Imprimir fechamento (período)
          </Button>
          <Button
            variant="default"
            size="sm"
            disabled={comprasSelecionadas.length === 0}
            onClick={() => imprimirFechamento(true)}
            title={comprasSelecionadas.length === 0 ? "Selecione itens na tabela abaixo" : "Imprimir só a seleção"}
          >
            <Printer className="size-4 mr-2" />
            Imprimir selecionadas
          </Button>
          {isChefe && (
          <Dialog open={openPagamento} onOpenChange={(open) => { setOpenPagamento(open); if (open) { setDataPagamento(getTodayLocalISO()); loadContas(); } }}>
          <DialogTrigger asChild>
            <Button>
              <DollarSign className="size-4 mr-2" />
              Pagar fornecedor
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Registrar pagamento</DialogTitle>
              <DialogDescription>Valor pago a {fornecedor.nome}</DialogDescription>
            </DialogHeader>
            <form onSubmit={handlePagar} className="space-y-4">
              <div>
                <Label>Valor (R$)</Label>
                <Input
                  type="text"
                  value={valorPagamento}
                  onChange={(e) => setValorPagamento(e.target.value)}
                  placeholder="0,00"
                />
              </div>
              <div>
                <Label>Data do pagamento</Label>
                <Input
                  type="date"
                  value={dataPagamento}
                  onChange={(e) => setDataPagamento(e.target.value || getTodayLocalISO())}
                />
                <p className="text-xs text-muted-foreground mt-1">Sugestão: hoje. Você pode alterar se quiser.</p>
              </div>
              <div>
                <Label>Forma de pagamento *</Label>
                <Select value={metodoPagamento} onValueChange={setMetodoPagamento} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a forma de pagamento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pix">Pix</SelectItem>
                    <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="Cartão crédito">Cartão crédito</SelectItem>
                    <SelectItem value="Cartão débito">Cartão débito</SelectItem>
                    <SelectItem value="Cheque">Cheque</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Observação (opcional)</Label>
                <Input
                  type="text"
                  value={observacaoPagamento}
                  onChange={(e) => setObservacaoPagamento(e.target.value)}
                  placeholder="Ex.: ref. parcela, comprovante..."
                  maxLength={255}
                />
              </div>
              <div>
              <Label>Conta bancária (opcional)</Label>
              <Select value={contaId} onValueChange={setContaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Nenhuma — só registrar pagamento" />
                  </SelectTrigger>
                  <SelectContent>
                  <SelectItem value="nenhuma">Nenhuma</SelectItem>
                    {contas.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Se escolher uma conta, o saldo será debitado automaticamente.</p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpenPagamento(false)}>
                  Cancelar
                </Button>
                <Button type="submit">Registrar</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
          )}

          {isChefe && (
            <Dialog
              open={editPagamentoOpen}
              onOpenChange={(open) => {
                setEditPagamentoOpen(open);
                if (!open) setEditPagamentoId(null);
              }}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Editar pagamento</DialogTitle>
                  <DialogDescription>Alterar valor, data, forma ou conta vinculada.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Valor (R$)</Label>
                    <Input type="text" inputMode="decimal" value={editPagValor} onChange={(e) => setEditPagValor(e.target.value)} />
                  </div>
                  <div>
                    <Label>Forma de pagamento</Label>
                    <Select value={editPagMetodo} onValueChange={setEditPagMetodo}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {METODOS_PAGAMENTO_API.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Data</Label>
                    <Input type="date" value={editPagData} onChange={(e) => setEditPagData(e.target.value)} />
                  </div>
                  <div>
                    <Label>Conta bancária</Label>
                    <Select value={editPagContaId} onValueChange={setEditPagContaId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Nenhuma" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nenhuma">Nenhuma</SelectItem>
                        {contas.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Observação</Label>
                    <Input value={editPagObs} onChange={(e) => setEditPagObs(e.target.value)} maxLength={255} />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setEditPagamentoOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="button" onClick={() => void salvarEdicaoPagamento()} disabled={editPagSaving}>
                    {editPagSaving ? "Salvando…" : "Salvar"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <Card className={comprasSelecionadas.length > 0 ? "border-primary/30 bg-primary/[0.03]" : ""}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Receipt className="size-5 text-muted-foreground" />
            Fechamento (seleção)
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Selecione ordens ou compras avulsas na tabela abaixo. O resumo segue o mesmo critério do detalhe do
            cliente: total selecionado, pagamentos no intervalo das datas marcadas e saldo do fornecedor.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {isChefe && exibirCompras.length > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedCompraIds(new Set(exibirCompras.map((c) => c.id)))}
                >
                  Selecionar todas ({exibirCompras.length})
                </Button>
              ) : null}
              <Button type="button" variant="outline" size="sm" onClick={() => setSelectedCompraIds(new Set())} disabled={selectedCompraIds.size === 0}>
                Limpar seleção
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              {ordensTotalmenteSelecionadas} ordem(ns) completa(s) · {comprasSelecionadas.length} linha(s) · Total{" "}
              <span className="font-medium tabular-nums text-foreground">{formatCurrency(totalSelecionadoCompras)}</span>
            </div>
          </div>

          {isChefe && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border bg-background p-4">
                <p className="text-xs font-medium text-muted-foreground">Total selecionado</p>
                <p className="text-xl font-bold text-primary">{formatCurrency(totalSelecionadoCompras)}</p>
              </div>
              <div className="rounded-lg border bg-background p-4">
                <p className="text-xs font-medium text-muted-foreground">Saldo atual do fornecedor</p>
                <p className={`text-xl font-bold ${saldo_devedor > 0 ? "text-destructive" : ""}`}>
                  {formatCurrency(saldo_devedor)}
                </p>
              </div>
              <div className="rounded-lg border bg-background p-4">
                <p className="text-xs font-medium text-muted-foreground">Pago no intervalo da seleção</p>
                <p className="text-xl font-bold text-green-600">{formatCurrency(totalPagoNoIntervaloSelecao)}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Pagamentos entre a menor e a maior data das linhas selecionadas.
                </p>
              </div>
              <div className="rounded-lg border bg-background p-4">
                <p className="text-xs font-medium text-muted-foreground">A pagar desta seleção</p>
                <p className={`text-xl font-bold ${aPagarDaSelecaoCompras > 0 ? "text-primary" : "text-muted-foreground"}`}>
                  {formatCurrency(aPagarDaSelecaoCompras)}
                </p>
              </div>
              <div className="rounded-lg border bg-background p-4 sm:col-span-2 lg:col-span-4">
                <p className="text-xs font-medium text-muted-foreground">Compras listadas fora da seleção (bruto)</p>
                <p className={`text-xl font-bold ${restanteBrutoComprasForaSelecao > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                  {formatCurrency(restanteBrutoComprasForaSelecao)}
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => imprimirFechamento(true)} disabled={comprasSelecionadas.length === 0}>
              <Printer className="size-4 mr-2" />
              Imprimir seleção
            </Button>
          </div>
        </CardContent>
      </Card>

      {limites && isChefe && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-muted-foreground">No período: Compras {formatCurrency(totalComprasPeriodo)} | Pago {formatCurrency(totalPagoPeriodo)}</p>
            <p className={`font-semibold ${saldoNoPeriodo > 0 ? "text-destructive" : ""}`}>Saldo no período: {formatCurrency(saldoNoPeriodo)}</p>
          </CardContent>
        </Card>
      )}

      {isChefe && (
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total compras</CardTitle>
            <Receipt className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(total_compras)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total pago</CardTitle>
            <CreditCard className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(total_pago)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Saldo devedor</CardTitle>
            <Truck className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${saldo_devedor > 0 ? "text-destructive" : ""}`}>
              {formatCurrency(saldo_devedor)}
            </p>
          </CardContent>
        </Card>
      </div>
      )}

      {isChefe && (
      <Collapsible defaultOpen={false} className="group">
      <Card>
        <CardHeader className="cursor-pointer hover:bg-muted/50 rounded-lg transition-colors">
          <CollapsibleTrigger className="flex w-full flex-col items-start gap-1 text-left">
            <CardTitle className="flex items-center gap-2">
              <ChevronRight className="size-5 transition-transform group-data-[state=open]:rotate-90" />
              <Package className="size-5" />
              Produtos e materiais deste fornecedor
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Produtos/materiais cadastrados com este fornecedor. Clique para abrir.
            </p>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
        <CardContent className="pt-0">
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="text-sm font-medium">Produtos</div>
              {produtos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum produto vinculado a este fornecedor. Vincule no Cadastro (Produtos).</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-right w-44">Preço venda</TableHead>
                      <TableHead className="text-right w-28">Estoque</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {produtos.map((p) => (
                      <TableRow key={p.id} className={p.ativo === false ? "opacity-60" : ""}>
                        <TableCell className="font-medium">{p.nome}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(Number(p.preco_venda ?? 0))}</TableCell>
                        <TableCell className="text-right tabular-nums">{Number(p.estoque_atual ?? 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Materiais</div>
              {materiais.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum material vinculado a este fornecedor. Vincule no Cadastro (Materiais).</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material</TableHead>
                      <TableHead className="text-right w-40">Preço base (R$)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {materiais.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.nome}</TableCell>
                        <TableCell className="text-right">
                          {savingMaterialId === m.id ? (
                            <span className="text-muted-foreground text-sm">Salvando...</span>
                          ) : (
                            <Input
                              type="text"
                              inputMode="decimal"
                              className="h-8 w-28 text-right ml-auto"
                              value={editingMaterialId === m.id ? editingMaterialPreco : m.preco_unitario_base.toFixed(2).replace(".", ",")}
                              onChange={(e) => {
                                setEditingMaterialId(m.id);
                                setEditingMaterialPreco(e.target.value);
                              }}
                              onFocus={() => {
                                setEditingMaterialId(m.id);
                                setEditingMaterialPreco(m.preco_unitario_base.toFixed(2).replace(".", ","));
                              }}
                              onBlur={() => handleSaveMaterialPreco(m.id, editingMaterialId === m.id ? editingMaterialPreco : m.preco_unitario_base.toFixed(2).replace(".", ","))}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                              }}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </CardContent>
        </CollapsibleContent>
      </Card>
      </Collapsible>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="space-y-3">
            <div className="space-y-1">
              <CardTitle>Compras{limites ? " (no período)" : ""}</CardTitle>
              <p className="text-sm text-muted-foreground">
                Ordens canceladas não aparecem aqui — ficam em <strong>Histórico</strong> abaixo. Use o resumo{" "}
                <strong>Fechamento (seleção)</strong> acima para selecionar tudo e ver totais. A coluna{" "}
                <strong>Marcada paga</strong> é só controle visual (não registra pagamento no caixa).
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  {isChefe && <TableHead className="w-10">Sel.</TableHead>}
                  {isChefe && <TableHead className="w-[120px]">Marcada paga</TableHead>}
                  <TableHead>Data</TableHead>
                  <TableHead>Detalhe</TableHead>
                  <TableHead className="text-right w-20 tabular-nums">Qtd</TableHead>
                  <TableHead className="text-right w-28 tabular-nums">V. unit.</TableHead>
                  {isChefe && <TableHead className="text-right">Total</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {exibirCompras.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isChefe ? 7 : 4} className="text-center text-muted-foreground">
                      Nenhuma compra ativa{limites ? " no período" : ""}
                    </TableCell>
                  </TableRow>
                ) : (
                  gruposCompras.map((g) => {
                    const ids = g.lines.map((l) => l.id);
                    const allSel = ids.length > 0 && ids.every((id) => selectedCompraIds.has(id));
                    const someSel = ids.some((id) => selectedCompraIds.has(id)) && !allSel;
                    const checkState = allSel ? true : someSel ? ("indeterminate" as const) : false;
                    const linhaRef = g.lines[0];
                    const mp = linhaRef?.marcada_paga === true;
                    const saveKey = g.ordemId != null ? `ordem-${g.ordemId}` : linhaRef?.id ?? "";
                    const ordemSel = allSel || someSel;
                    if (g.ordemId != null) {
                      return (
                        <Fragment key={g.key}>
                          <TableRow
                            className={cn(
                              "transition-[background-color,box-shadow,border-color] duration-150",
                              mp && rowCompraMarcadaPaga,
                              ordemSel && !mp && rowCompraSelecionada,
                              ordemSel && mp && rowCompraPagaSelecionada,
                            )}
                          >
                            {isChefe && (
                              <TableCell className="align-top">
                                <Checkbox checked={checkState} onCheckedChange={() => toggleOrdemGrupo(ids)} />
                              </TableCell>
                            )}
                            {isChefe && (
                              <TableCell className="align-top">
                                <div className="flex flex-wrap items-center gap-2">
                                  {mp ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/12 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                                      <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
                                      Paga
                                    </span>
                                  ) : null}
                                  <Checkbox
                                    checked={mp}
                                    disabled={marcacaoSaving === saveKey}
                                    onCheckedChange={(v) =>
                                      void aplicarMarcacaoCompra({ ordemId: g.ordemId!, valor: v === true })
                                    }
                                    aria-label={`Marcar ordem ${g.ordemId} como paga`}
                                  />
                                </div>
                              </TableCell>
                            )}
                            <TableCell className="text-muted-foreground align-top">{formatDateOnly(g.dataRef)}</TableCell>
                            <TableCell>
                              <span className="font-medium">Ordem #{g.ordemId}</span>
                              <span className="text-muted-foreground text-sm block">{g.lines.length} item(ns) nesta compra</span>
                            </TableCell>
                            <TableCell className="text-right align-top text-muted-foreground tabular-nums">—</TableCell>
                            <TableCell className="text-right align-top text-muted-foreground tabular-nums">—</TableCell>
                            {isChefe && (
                              <TableCell className="text-right align-top font-medium">{formatCurrency(g.totalGrupo)}</TableCell>
                            )}
                          </TableRow>
                          {g.lines.map((linha) => {
                            const linhaSel = selectedCompraIds.has(linha.id);
                            return (
                            <TableRow
                              key={linha.id}
                              className={cn(
                                "transition-[background-color,box-shadow] duration-150",
                                mp ? rowCompraMarcadaPagaFilha : "bg-muted/25",
                                linhaSel && !mp && rowCompraSelecionada,
                                linhaSel && mp && rowCompraPagaFilhaSelecionada,
                              )}
                            >
                              {isChefe && <TableCell />}
                              {isChefe && <TableCell />}
                              <TableCell />
                              <TableCell className="pl-6 text-sm text-muted-foreground">{linha.material}</TableCell>
                              <TableCell className="text-right text-sm tabular-nums">
                                {linha.quantidade != null ? linha.quantidade : "—"}
                              </TableCell>
                              <TableCell className="text-right text-sm tabular-nums">
                                {linha.preco_unitario != null && !Number.isNaN(Number(linha.preco_unitario))
                                  ? formatCurrency(linha.preco_unitario)
                                  : "—"}
                              </TableCell>
                              {isChefe && <TableCell className="text-right text-sm">{formatCurrency(linha.total)}</TableCell>}
                            </TableRow>
                            );
                          })}
                        </Fragment>
                      );
                    }
                    const linha = g.lines[0];
                    const mpAv = linha.marcada_paga === true;
                    const skAv = linha.id;
                    const selAv = selectedCompraIds.has(linha.id);
                    return (
                      <TableRow
                        key={g.key}
                        className={cn(
                          "transition-[background-color,box-shadow,border-color] duration-150",
                          mpAv && rowCompraMarcadaPaga,
                          selAv && !mpAv && rowCompraSelecionada,
                          selAv && mpAv && rowCompraPagaSelecionada,
                        )}
                      >
                        {isChefe && (
                          <TableCell>
                            <Checkbox
                              checked={selAv}
                              onCheckedChange={() => toggleOrdemGrupo(ids)}
                            />
                          </TableCell>
                        )}
                        {isChefe && (
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-2">
                              {mpAv ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/12 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                                  <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
                                  Paga
                                </span>
                              ) : null}
                              <Checkbox
                                checked={mpAv}
                                disabled={marcacaoSaving === skAv}
                                onCheckedChange={(v) =>
                                  void aplicarMarcacaoCompra({ linhaId: linha.id, valor: v === true })
                                }
                                aria-label="Marcar compra avulsa como paga"
                              />
                            </div>
                          </TableCell>
                        )}
                        <TableCell className="text-muted-foreground">{formatDateOnly(linha.data)}</TableCell>
                        <TableCell>{linha.material}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {linha.quantidade != null ? linha.quantidade : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {linha.preco_unitario != null && !Number.isNaN(Number(linha.preco_unitario))
                            ? formatCurrency(linha.preco_unitario)
                            : "—"}
                        </TableCell>
                        {isChefe && <TableCell className="text-right">{formatCurrency(linha.total)}</TableCell>}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>

            {exibirComprasHistorico.length > 0 ? (
              <Collapsible defaultOpen={false} className="group mt-8 border-t pt-6">
                <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md py-2 text-left font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground">
                  <ChevronRight className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
                  <Ban className="size-4 shrink-0 text-destructive" aria-hidden />
                  <span>
                    Histórico — ordens canceladas
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      ({exibirComprasHistorico.length} item(ns) · só consulta)
                    </span>
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {isChefe && <TableHead className="w-10" />}
                        <TableHead>Data</TableHead>
                        <TableHead>Detalhe</TableHead>
                        <TableHead className="text-right w-20 tabular-nums">Qtd</TableHead>
                        <TableHead className="text-right w-28 tabular-nums">V. unit.</TableHead>
                        {isChefe && <TableHead className="text-right">Total</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {gruposComprasHistorico.map((g) => {
                        if (g.ordemId != null) {
                          return (
                            <Fragment key={g.key}>
                              <TableRow>
                                {isChefe && <TableCell className="align-top" />}
                                <TableCell className="text-muted-foreground align-top">{formatDateOnly(g.dataRef)}</TableCell>
                                <TableCell>
                                  <span className="inline-flex items-center gap-1.5 font-medium">
                                    <Ban className="size-3.5 shrink-0 text-destructive" aria-hidden />
                                    Ordem #{g.ordemId}
                                  </span>
                                  <span className="text-muted-foreground text-sm block">
                                    {g.lines.length} item(ns) — cancelada
                                  </span>
                                </TableCell>
                                <TableCell className="text-right align-top text-muted-foreground tabular-nums">—</TableCell>
                                <TableCell className="text-right align-top text-muted-foreground tabular-nums">—</TableCell>
                                {isChefe && (
                                  <TableCell className="text-right align-top font-medium">{formatCurrency(g.totalGrupo)}</TableCell>
                                )}
                              </TableRow>
                              {g.lines.map((linha) => (
                                <TableRow key={linha.id} className="bg-muted/15">
                                  {isChefe && <TableCell />}
                                  <TableCell />
                                  <TableCell className="pl-6 text-sm text-muted-foreground">{linha.material}</TableCell>
                                  <TableCell className="text-right text-sm tabular-nums">
                                    {linha.quantidade != null ? linha.quantidade : "—"}
                                  </TableCell>
                                  <TableCell className="text-right text-sm tabular-nums">
                                    {linha.preco_unitario != null && !Number.isNaN(Number(linha.preco_unitario))
                                      ? formatCurrency(linha.preco_unitario)
                                      : "—"}
                                  </TableCell>
                                  {isChefe && <TableCell className="text-right text-sm">{formatCurrency(linha.total)}</TableCell>}
                                </TableRow>
                              ))}
                            </Fragment>
                          );
                        }
                        const linha = g.lines[0];
                        return (
                          <TableRow key={g.key}>
                            {isChefe && <TableCell />}
                            <TableCell className="text-muted-foreground">{formatDateOnly(linha.data)}</TableCell>
                            <TableCell>{linha.material}</TableCell>
                            <TableCell className="text-right tabular-nums">{linha.quantidade != null ? linha.quantidade : "—"}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {linha.preco_unitario != null && !Number.isNaN(Number(linha.preco_unitario))
                                ? formatCurrency(linha.preco_unitario)
                                : "—"}
                            </TableCell>
                            {isChefe && <TableCell className="text-right">{formatCurrency(linha.total)}</TableCell>}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CollapsibleContent>
              </Collapsible>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pagamentos{limites ? " (no período)" : ""}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  {isChefe && <TableHead className="text-right">Valor</TableHead>}
                  {isChefe && <TableHead>Forma de pagamento</TableHead>}
                  {isChefe && <TableHead>Conta</TableHead>}
                  {isChefe && <TableHead className="w-[100px] text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {exibirPagamentos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isChefe ? 5 : 1} className="text-center text-muted-foreground">
                      Nenhum pagamento{limites ? " no período" : ""}
                    </TableCell>
                  </TableRow>
                ) : (
                  exibirPagamentos.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-muted-foreground">
                        {formatDateOnly(p.data)}
                      </TableCell>
                      {isChefe && <TableCell className="text-right text-green-600">{formatCurrency(p.valor)}</TableCell>}
                      {isChefe && <TableCell className="text-muted-foreground">{p.metodo || "-"}</TableCell>}
                      {isChefe && <TableCell className="text-muted-foreground">{p.conta_nome || "-"}</TableCell>}
                      {isChefe && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-0.5">
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Editar" onClick={() => abrirEdicaoPagamento(p)}>
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10"
                              title="Excluir"
                              onClick={() => excluirPagamento(p)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <ConfirmacaoComSenhaDialog
        open={pagamentoExcluir != null}
        onOpenChange={(o) => {
          if (!o) setPagamentoExcluir(null);
        }}
        title="Excluir pagamento"
        description={
          pagamentoExcluir
            ? `Pagamento de ${formatCurrency(pagamentoExcluir.valor)} em ${formatDateOnly(pagamentoExcluir.data)}. O saldo da conta (se houver) será ajustado. Informe o motivo e confirme com sua senha.`
            : ""
        }
        confirmLabel="Confirmar exclusão"
        requireMotivo
        onVerified={async ({ motivo }) => {
          if (!pagamentoExcluir) return;
          const pid = pagamentoExcluir.id;
          setPagamentoExcluir(null);
          try {
            await api.deletePagamentoFornecedor(pid, motivo);
            toast.success("Pagamento excluído.");
            load();
          } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Erro ao excluir.");
          }
        }}
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
