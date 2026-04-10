import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { api } from "../lib/api";
import { formatDateOnly, getTodayLocalISO, parseDateOnlyToTime, parseLancamentoToTime } from "../lib/format";
import { useAuth } from "../contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { cn } from "../components/ui/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { ArrowLeft, User, Receipt, CreditCard, Printer, Calendar, FileCheck, Wallet, Tag, Trash2, Pencil, CheckCircle2 } from "lucide-react";
import { motion } from "motion/react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Checkbox } from "../components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../components/ui/collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { empresa, empresaEnderecoLinha, empresaDocumento } from "../data/empresa";
import { ConfirmacaoComSenhaDialog } from "../components/ConfirmacaoDialog";
import { DocumentPrintPreview } from "../components/DocumentPrintPreview";

interface ItemVenda {
  produto: string;
  quantidade: number;
  preco_unitario: number;
  total_item: number;
}

interface VendaCliente {
  id: number;
  data: string;
  data_lancamento?: string;
  total: number;
  itens?: ItemVenda[];
  marcada_paga?: boolean;
}

/** Ordem: data da nota (mais recente primeiro); no mesmo dia, último lançamento primeiro. */
function sortVendaClienteMaisRecentePrimeiro(a: VendaCliente, b: VendaCliente): number {
  const da = parseDateOnlyToTime(a.data);
  const db = parseDateOnlyToTime(b.data);
  if (db !== da) return db - da;
  const ta = parseLancamentoToTime(a.data_lancamento, a.data);
  const tb = parseLancamentoToTime(b.data_lancamento, b.data);
  if (tb !== ta) return tb - ta;
  return b.id - a.id;
}

interface ClienteDetalheData {
  cliente: { id: number; nome: string; telefone: string; cpf: string; cnpj: string };
  total_vendas: number;
  total_pago: number;
  saldo_devedor: number;
  vendas: VendaCliente[];
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

type Periodo = "todos" | "semana" | "mes" | "personalizado";

/** Alinhado ao backend METODO_PAGAMENTO_CHOICES */
const METODOS_PAGAMENTO_API = ["Pix", "Dinheiro", "Cartão crédito", "Cartão débito", "Cheque"] as const;

const rowVendaMarcadaPaga =
  "border-l-[3px] border-l-emerald-500 bg-emerald-50/90 dark:border-l-emerald-400 dark:bg-emerald-950/35";
const rowVendaSelecionada = "bg-primary/[0.07] dark:bg-primary/12 ring-1 ring-inset ring-primary/25";
const rowVendaPagaSelecionada =
  "border-l-[3px] border-l-emerald-600 bg-emerald-100/95 dark:border-l-emerald-300 dark:bg-emerald-950/45 ring-2 ring-inset ring-emerald-500/30 dark:ring-emerald-400/25";

function parseData(s: string): number {
  return parseDateOnlyToTime(s);
}

function slugForFileName(s: string): string {
  try {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 60);
  } catch {
    return String(s || "").replace(/\s+/g, "-").slice(0, 60);
  }
}

export function ClienteDetalhe() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isChefe = user?.is_chefe === true;
  const [data, setData] = useState<ClienteDetalheData | null>(null);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<Periodo>("todos");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [selectedVendaIds, setSelectedVendaIds] = useState<Set<number>>(new Set());
  const [pagamentoOpen, setPagamentoOpen] = useState(false);
  const [pagamentoValor, setPagamentoValor] = useState("");
  const [pagamentoContaId, setPagamentoContaId] = useState("");
  const [pagamentoData, setPagamentoData] = useState(getTodayLocalISO());
  const [contas, setContas] = useState<{ id: number; nome: string }[]>([]);
  const [pagamentoLoading, setPagamentoLoading] = useState(false);
  const [pagamentoMetodo, setPagamentoMetodo] = useState<string>("Dinheiro");
  const [editPagamentoOpen, setEditPagamentoOpen] = useState(false);
  const [editPagamentoId, setEditPagamentoId] = useState<number | null>(null);
  const [editPagValor, setEditPagValor] = useState("");
  const [editPagMetodo, setEditPagMetodo] = useState("");
  const [editPagData, setEditPagData] = useState("");
  const [editPagContaId, setEditPagContaId] = useState("");
  const [editPagObs, setEditPagObs] = useState("");
  const [editPagSaving, setEditPagSaving] = useState(false);
  const [pagamentoExcluir, setPagamentoExcluir] = useState<ClienteDetalheData["pagamentos"][0] | null>(null);
  const [marcacaoVendaSaving, setMarcacaoVendaSaving] = useState<number | null>(null);
  const [printPreview, setPrintPreview] = useState<{
    html: string;
    titulo: string;
    downloadBaseName: string;
  } | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const [precosProdutos, setPrecosProdutos] = useState<{ id: number; produto_id: number; produto_nome: string; preco: number }[]>([]);
  const [produtos, setProdutos] = useState<{ id: number; nome: string; preco_venda?: number }[]>([]);
  const [precoProdutoId, setPrecoProdutoId] = useState("");
  const [precoProdutoValor, setPrecoProdutoValor] = useState("");
  const [precoLoading, setPrecoLoading] = useState(false);
  const [editingPrecoProdutoId, setEditingPrecoProdutoId] = useState<number | null>(null);
  const [editingPrecoVal, setEditingPrecoVal] = useState("");
  const [savingPrecoProdutoId, setSavingPrecoProdutoId] = useState<number | null>(null);
  const [selectedPrecoBulkIds, setSelectedPrecoBulkIds] = useState<Set<number>>(new Set());
  const [bulkPrecoComum, setBulkPrecoComum] = useState("");
  const [bulkPrecoLoading, setBulkPrecoLoading] = useState(false);
  /** Só chefe: impressão do fechamento com valores em R$; desmarcado = apenas quantidades (como funcionário). */
  const [fechamentoImpressaoComValores, setFechamentoImpressaoComValores] = useState(true);

  const loadDetalhe = () => {
    if (!id) return;
    api.getClienteDetalhe(id).then((d) => setData(d)).catch(() => setData(null));
  };

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.getClienteDetalhe(id).then((d) => setData(d)).catch(() => setData(null)).finally(() => setLoading(false));
  }, [id]);

  const loadPrecosProdutos = () => {
    if (!id || !isChefe) return;
    api.getClientePrecosProdutos(id).then(setPrecosProdutos).catch(() => setPrecosProdutos([]));
  };

  useEffect(() => {
    if (!id || !isChefe) return;
    loadPrecosProdutos();
    api.getProdutos().then((list) => setProdutos(Array.isArray(list) ? list : [])).catch(() => setProdutos([]));
  }, [id, isChefe]);

  useEffect(() => {
    if (!isChefe) return;
    loadContas();
  }, [isChefe]);

  useEffect(() => {
    if (!precoProdutoId) {
      setPrecoProdutoValor("");
      return;
    }
    const p = precosProdutos.find((x) => String(x.produto_id) === precoProdutoId);
    setPrecoProdutoValor(p ? p.preco.toFixed(2).replace(".", ",") : "");
  }, [precoProdutoId, precosProdutos]);

  const handleDefinirPreco = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !precoProdutoId || precoProdutoValor.trim() === "") {
      toast.error("Selecione o produto e informe o preço.");
      return;
    }
    const valor = parseFloat(precoProdutoValor.replace(",", "."));
    if (isNaN(valor) || valor < 0) {
      toast.error("Preço inválido.");
      return;
    }
    setPrecoLoading(true);
    try {
      await api.setClientePrecoProduto(id, { produto_id: Number(precoProdutoId), preco: valor });
      toast.success("Preço definido");
      loadPrecosProdutos();
      const jaExiste = precosProdutos.some((p) => String(p.produto_id) === precoProdutoId);
      if (!jaExiste) {
        setPrecoProdutoId("");
        setPrecoProdutoValor("");
      } else {
        setPrecoProdutoValor("");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar preço");
    } finally {
      setPrecoLoading(false);
    }
  };

  const handleRemoverPreco = async (produtoId: number) => {
    if (!id) return;
    try {
      await api.deleteClientePrecoProduto(id, produtoId);
      toast.success("Preço removido; o produto voltará a usar o valor inicial.");
      loadPrecosProdutos();
    } catch {
      toast.error("Erro ao remover preço");
    }
  };

  const handleSavePrecoInline = async (produtoId: number, novoValorStr: string) => {
    if (!id) return;
    const v = parseFloat(novoValorStr.replace(",", "."));
    if (isNaN(v) || v < 0) {
      toast.error("Preço inválido.");
      setEditingPrecoProdutoId(null);
      return;
    }
    const atual = precosProdutos.find((x) => x.produto_id === produtoId)?.preco;
    if (atual !== undefined && Math.abs(atual - v) < 0.005) {
      setEditingPrecoProdutoId(null);
      return;
    }
    setSavingPrecoProdutoId(produtoId);
    try {
      await api.setClientePrecoProduto(id, { produto_id: produtoId, preco: v });
      toast.success("Preço atualizado");
      loadPrecosProdutos();
    } catch {
      toast.error("Erro ao salvar preço");
    } finally {
      setSavingPrecoProdutoId(null);
      setEditingPrecoProdutoId(null);
    }
  };

  const togglePrecoBulkSelect = (produtoId: number) => {
    setSelectedPrecoBulkIds((prev) => {
      const next = new Set(prev);
      if (next.has(produtoId)) next.delete(produtoId);
      else next.add(produtoId);
      return next;
    });
  };

  const toggleSelecionarTodosProdutosPreco = () => {
    if (produtos.length === 0) return;
    const allSelected = produtos.every((p) => selectedPrecoBulkIds.has(p.id));
    if (allSelected) {
      setSelectedPrecoBulkIds(new Set());
    } else {
      setSelectedPrecoBulkIds(new Set(produtos.map((p) => p.id)));
    }
  };

  const handleAplicarPrecoEmLote = async () => {
    if (!id) return;
    if (selectedPrecoBulkIds.size === 0) {
      toast.error("Selecione pelo menos um produto na tabela abaixo.");
      return;
    }
    const valor = parseFloat(bulkPrecoComum.replace(",", "."));
    if (isNaN(valor) || valor < 0) {
      toast.error("Informe um preço válido (≥ 0).");
      return;
    }
    const updates = [...selectedPrecoBulkIds].map((produto_id) => ({ produto_id, preco: valor }));
    setBulkPrecoLoading(true);
    try {
      const res = await api.setClientePrecoProdutosBulk(id, updates);
      if (res.ok > 0) {
        toast.success(`Preço aplicado a ${res.ok} produto(s).`);
      }
      if (res.errors.length > 0) {
        toast.warning(
          `${res.errors.length} item(ns) falhou(aram): ${res.errors
            .slice(0, 3)
            .map((e) => e.error)
            .join("; ")}${res.errors.length > 3 ? "…" : ""}`
        );
      }
      loadPrecosProdutos();
      setSelectedPrecoBulkIds(new Set());
      setBulkPrecoComum("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao aplicar preços em lote");
    } finally {
      setBulkPrecoLoading(false);
    }
  };

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

  const limites = getLimites();
  const safeNum = (v: unknown): number => {
    if (typeof v === "number") return isNaN(v) ? 0 : v;
    if (typeof v === "string") {
      const n = Number(v.replace(",", "."));
      return isNaN(n) ? 0 : n;
    }
    if (v == null) return 0;
    const n = Number(v as any);
    return isNaN(n) ? 0 : n;
  };
  const vendasFiltradas = data
    ? [...data.vendas
        .filter((v) => {
          if (!limites) return true;
          const t = parseData(v.data);
          return t >= limites.inicio && t <= limites.fim;
        })]
        .sort(sortVendaClienteMaisRecentePrimeiro)
    : [];
  const pagamentosFiltrados = data
    ? data.pagamentos.filter((p) => {
        if (!limites) return true;
        const t = parseData(p.data);
        return t >= limites.inicio && t <= limites.fim;
      })
    : [];

  const totalVendasPeriodo = vendasFiltradas.reduce((s, v) => s + safeNum(v.total), 0);
  const saldoDevedorGeral = safeNum(data?.saldo_devedor);

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

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

  const imprimirFechamento = () => {
    if (!printRef.current || !data) return;
    const comValores = isChefe && fechamentoImpressaoComValores;
    const periodoLabel =
      periodo === "semana"
        ? "Última semana"
        : periodo === "mes"
          ? "Último mês"
          : periodo === "personalizado" && dataInicio && dataFim
            ? `${formatDateOnly(dataInicio)} a ${formatDateOnly(dataFim)}`
            : "Todo o período";
    const resumoBlock = comValores
      ? `<div class="resumo">
            <div class="linha"><span>Valor das vendas neste período (soma das notas)</span><strong>${formatCurrency(totalVendasPeriodo)}</strong></div>
            ${
              isChefe
                ? `<div class="linha total-a-pagar"><span>Saldo devedor atual do cliente (referência no sistema)</span><strong>${formatCurrency(saldoDevedorGeral)}</strong></div>`
                : ""
            }
            <div style="margin-top:10px;color:#64748b;font-size:11px;">
              Este documento não discrimina pagamentos: um pagamento pode referir-se a fechamentos anteriores. Use o saldo no sistema para conferência financeira.
            </div>
          </div>`
      : `<div class="resumo">
            <div class="linha"><span>Notas no período</span><strong>${vendasFiltradas.length}</strong></div>
            <div style="margin-top:10px;color:#64748b;font-size:11px;">
              Listagem apenas com quantidades e produtos, sem valores em R$.
            </div>
          </div>`;
    const vendasThead = comValores
      ? `<tr><th>Data</th><th>Itens (quantidade × produto)</th><th>Total</th></tr>`
      : `<tr><th>Data</th><th>Itens (quantidade × produto)</th></tr>`;
    const vendasTbody = vendasFiltradas
      .map((v) => {
        const itensHtml =
          v.itens && v.itens.length > 0
            ? v.itens
                .map((i) =>
                  comValores
                    ? `${i.quantidade}× ${i.produto} (${formatCurrency(i.preco_unitario)} un.)`
                    : `${i.quantidade}× ${i.produto}`
                )
                .join("<br/>")
            : "—";
        return comValores
          ? `<tr><td>${formatDateOnly(v.data)}</td><td>${itensHtml}</td><td>${formatCurrency(v.total)}</td></tr>`
          : `<tr><td>${formatDateOnly(v.data)}</td><td>${itensHtml}</td></tr>`;
      })
      .join("");
    const htmlFech = `
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"><title>Fechamento – ${data.cliente.nome}</title>
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
            .total { font-weight: 700; font-size: 14px; margin-top: 16px; color: #1e3a5f; }
            .muted { color: #64748b; font-size: 11px; margin-top: 24px; }
            .resumo {
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 10px;
              padding: 14px 16px;
              margin: 10px 0 16px;
            }
            .resumo .linha { display:flex; justify-content:space-between; gap:12px; margin: 6px 0; }
            .resumo .linha strong { white-space: nowrap; }
            .resumo .total-a-pagar { font-weight: 800; font-size: 14px; color: #0f172a; margin-top: 10px; padding-top: 10px; border-top: 1px solid #e2e8f0; }
          </style>
        </head>
        <body>
          ${getEmpresaHeaderHtml()}
          <h1>Fechamento – ${data.cliente.nome}</h1>
          <p class="meta">Período: ${periodoLabel}${comValores ? "" : " · sem valores (R$)"}</p>
          ${resumoBlock}
          <p class="meta"><strong>Vendas no período:</strong> ${vendasFiltradas.length}</p>
          <h3 style="font-size:14px;margin:20px 0 8px;">Vendas</h3>
          <table>
            <thead>${vendasThead}</thead>
            <tbody>
              ${vendasTbody}
            </tbody>
          </table>
          <p class="muted">${empresa.nome || "Empresa"} — Impresso em ${new Date().toLocaleString("pt-BR")}</p>
        </body>
      </html>
    `;
    const tituloPrev = `Fechamento — ${data.cliente.nome} (${periodoLabel})${comValores ? "" : " · só quantidades"}`;
    void api
      .registrarImpressao({
        tipo: "fechamento_cliente",
        titulo: tituloPrev,
        html: htmlFech,
        meta: { cliente_id: Number(id), periodo: periodoLabel, com_valores: comValores },
      })
      .catch(() => {});
    setPrintPreview({
      html: htmlFech,
      titulo: tituloPrev,
      downloadBaseName: `fechamento-${slugForFileName(data.cliente.nome)}-${id}-${periodoLabel.replace(/\s+/g, "-").slice(0, 40)}${comValores ? "" : "-sem-valores"}`,
    });
  };

  const toggleVendaSelection = (vendaId: number) => {
    setSelectedVendaIds((prev) => {
      const next = new Set(prev);
      if (next.has(vendaId)) next.delete(vendaId);
      else next.add(vendaId);
      return next;
    });
  };

  const imprimirFechamentoSelecionadas = (
    vendasSelecionadas: VendaCliente[],
    totalSelecionado: number
  ) => {
    if (vendasSelecionadas.length === 0) {
      toast.error("Selecione pelo menos uma venda para gerar o fechamento.");
      return;
    }
    if (!data) return;

    const comValores = isChefe && fechamentoImpressaoComValores;
    const porData = [...vendasSelecionadas].sort((a, b) => parseData(a.data) - parseData(b.data));
    const notasHtml = porData
      .map((v) => {
        const itens = Array.isArray(v.itens) ? v.itens : [];
        const itensRows = comValores
          ? itens.length > 0
            ? itens
                .map((i) => {
                  const totalItem =
                    (typeof (i as any).total_item === "number" ? (i as any).total_item : null) ??
                    (typeof (i as any).total === "number" ? (i as any).total : null) ??
                    (typeof i.preco_unitario === "number" && typeof i.quantidade === "number"
                      ? i.preco_unitario * i.quantidade
                      : 0);
                  return `<tr>
                      <td>${i.produto}</td>
                      <td class="num">${i.quantidade}</td>
                      <td class="num">${formatCurrency(i.preco_unitario)}</td>
                      <td class="num">${formatCurrency(totalItem)}</td>
                    </tr>`;
                })
                .join("")
            : `<tr><td colspan="4" style="text-align:center;">Nenhum item registrado</td></tr>`
          : itens.length > 0
            ? itens
                .map(
                  (i) =>
                    `<tr><td>${i.produto}</td><td class="num">${i.quantidade}</td></tr>`
                )
                .join("")
            : `<tr><td colspan="2" style="text-align:center;">Nenhum item registrado</td></tr>`;

        const dataVenda = formatDateOnly(v.data);

        if (!comValores) {
          return `
          <div class="nota">
            <div class="nota-header">
              <div><strong>Nota #${v.id}</strong></div>
              <div><strong>Data:</strong> ${dataVenda}</div>
              <div><strong>Cliente:</strong> ${data.cliente.nome}</div>
            </div>
            <div class="nota-items">
              <table>
                <thead>
                  <tr>
                    <th style="width: 72%;">Produto</th>
                    <th class="num" style="width: 28%;">Qtd</th>
                  </tr>
                </thead>
                <tbody>
                  ${itensRows}
                </tbody>
              </table>
            </div>
          </div>
        `;
        }

        const totalCalculado = itens.reduce((s, i) => {
          const t =
            (typeof (i as any).total_item === "number" ? (i as any).total_item : null) ??
            (typeof (i as any).total === "number" ? (i as any).total : null) ??
            (typeof i.preco_unitario === "number" && typeof i.quantidade === "number" ? i.preco_unitario * i.quantidade : 0);
          return s + (typeof t === "number" && !isNaN(t) ? t : 0);
        }, 0);
        const totalNota =
          typeof (v as any).total === "number" && (v as any).total > 0 ? (v as any).total : totalCalculado;

        return `
          <div class="nota">
            <div class="nota-header">
              <div><strong>Nota #${v.id}</strong></div>
              <div><strong>Data:</strong> ${dataVenda}</div>
              <div><strong>Cliente:</strong> ${data.cliente.nome}</div>
              <div><strong>Total da nota:</strong> ${formatCurrency(totalNota)}</div>
            </div>
            <div class="nota-items">
              <table>
                <thead>
                  <tr>
                    <th style="width: 48%;">Produto</th>
                    <th class="num" style="width: 14%;">Qtd</th>
                    <th class="num" style="width: 18%;">V. unitário</th>
                    <th class="num" style="width: 20%;">Total item</th>
                  </tr>
                </thead>
                <tbody>
                  ${itensRows}
                </tbody>
              </table>
            </div>
          </div>
        `;
      })
      .join("");

    const hojeStr = new Date().toLocaleString("pt-BR");
    const saldoTotal = safeNum(data.saldo_devedor);
    const totalSelNum = safeNum(totalSelecionado);

    const resumoSelecaoHtml = comValores
      ? `<div class="resumo-box">
            <div class="linha"><span>Valor deste fechamento (soma das notas selecionadas)</span><strong>${formatCurrency(totalSelNum)}</strong></div>
            ${
              isChefe
                ? `<div class="linha"><span>Saldo devedor atual do cliente (referência no sistema)</span><strong>${formatCurrency(saldoTotal)}</strong></div>`
                : ""
            }
            <div style="margin-top:10px;color:#64748b;font-size:11px;">
              Pagamentos não aparecem neste documento: podem referir-se a outros fechamentos. Use o saldo no sistema para conferência.
            </div>
          </div>`
      : `<div class="resumo-box">
            <div class="linha"><span>Notas neste fechamento</span><strong>${vendasSelecionadas.length}</strong></div>
            <div style="margin-top:10px;color:#64748b;font-size:11px;">
              Documento apenas com quantidades e produtos, sem valores em R$.
            </div>
          </div>`;

    const htmlSel = `
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"><title>Fechamento – ${data.cliente.nome}</title>
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
            .cliente-info {
              background: #f8fafc;
              border-radius: 10px;
              padding: 16px 18px;
              margin-bottom: 20px;
              font-size: 12px;
              border: 1px solid #e2e8f0;
            }
            .cliente-info > div { margin-bottom: 6px; }
            .cliente-info > div:last-child { margin-bottom: 0; }
            .cliente-info strong { font-weight: 600; color: #334155; }
            .resumo-box {
              background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
              border: 1px solid #bae6fd;
              border-radius: 10px;
              padding: 16px 18px;
              margin-bottom: 24px;
              font-size: 12px;
            }
            .resumo-box .linha { display: flex; justify-content: space-between; margin-bottom: 8px; align-items: center; }
            .resumo-box .linha:last-child { margin-bottom: 0; }
            .resumo-box .total-fech { font-weight: 700; font-size: 15px; color: #0c4a6e; margin-top: 12px; padding-top: 12px; border-top: 2px solid #7dd3fc; }
            .nota {
              border: 1px solid #e2e8f0;
              border-radius: 10px;
              padding: 14px 16px;
              margin-top: 16px;
              page-break-inside: avoid;
              background: #fafafa;
            }
            .nota-header { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px; flex-wrap: wrap; gap: 4px; }
            .nota-items table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; border-radius: 6px; overflow: hidden; }
            .nota-items th, .nota-items td { border: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; }
            .nota-items th { background: #f1f5f9; font-weight: 600; color: #475569; }
            .nota-items .num { text-align: right; }
            .muted { color: #64748b; font-size: 11px; margin-top: 28px; text-align: center; }
            .assinatura { margin-top: 40px; text-align: center; }
            .assinatura-linha { width: 60%; max-width: 240px; margin: 0 auto 8px; border-bottom: 2px solid #334155; height: 32px; }
            .assinatura-texto { font-size: 11px; color: #64748b; }
            .doc-footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #64748b; }
          </style>
        </head>
        <body>
          ${getEmpresaHeaderHtml()}

          <div class="cliente-info">
            <div><strong>Cliente:</strong> ${data.cliente.nome}</div>
            ${data.cliente.cpf ? `<div><strong>CPF:</strong> ${data.cliente.cpf}</div>` : ""}
            ${data.cliente.cnpj ? `<div><strong>CNPJ:</strong> ${data.cliente.cnpj}</div>` : ""}
            ${data.cliente.telefone ? `<div><strong>Telefone:</strong> ${data.cliente.telefone}</div>` : ""}
            <div><strong>Notas neste fechamento:</strong> ${vendasSelecionadas.length}</div>
          </div>

          ${resumoSelecaoHtml}

          ${notasHtml}

          <div class="assinatura">
            <div class="assinatura-linha"></div>
            <div class="assinatura-texto">Assinatura do cliente</div>
          </div>

          <div class="doc-footer">
            <strong>${empresa.nome || "Empresa"}</strong>
            ${empresa.telefone || empresa.email ? ` — ${[empresa.telefone, empresa.email].filter(Boolean).join(" • ")}` : ""}
            <br>Impresso em ${hojeStr}
          </div>
        </body>
      </html>
    `;
    const tituloSel = `Fechamento (seleção) — ${data.cliente.nome} · ${vendasSelecionadas.length} nota(s)${comValores ? "" : " · só quantidades"}`;
    void api
      .registrarImpressao({
        tipo: "fechamento_cliente_selecao",
        titulo: tituloSel,
        html: htmlSel,
        meta: {
          cliente_id: Number(id),
          venda_ids: vendasSelecionadas.map((v) => v.id),
          total_selecionado: totalSelecionado,
          com_valores: comValores,
          saldo_devedor_atual: saldoTotal,
        },
      })
      .catch(() => {});
    setPrintPreview({
      html: htmlSel,
      titulo: tituloSel,
      downloadBaseName: `fechamento-${slugForFileName(data.cliente.nome)}-${id}-selecao${comValores ? "" : "-sem-valores"}`,
    });
  };

  const normalizarContas = (res: any): { id: number; nome: string }[] => {
    if (Array.isArray(res)) return res.map((x: any) => ({ id: x.id, nome: x.nome ?? "" }));
    if (res && typeof res === "object" && Array.isArray(res.results)) return res.results.map((x: any) => ({ id: x.id, nome: x.nome ?? "" }));
    if (res && typeof res === "object" && Array.isArray(res.data)) return res.data.map((x: any) => ({ id: x.id, nome: x.nome ?? "" }));
    return [];
  };
  const loadContas = () => {
    api.getContas().then((list: any) => setContas(normalizarContas(list))).catch((e) => {
      setContas([]);
      toast.error(e?.message || "Erro ao carregar contas bancárias.");
    });
  };

  const abrirDialogLancarPagamento = () => {
    setPagamentoValor("");
    setPagamentoContaId("");
    setPagamentoMetodo("Dinheiro");
    setPagamentoData(getTodayLocalISO());
    loadContas();
    setPagamentoOpen(true);
  };

  const handleLancarPagamento = async () => {
    const valor = parseFloat(pagamentoValor.replace(",", "."));
    if (isNaN(valor) || valor <= 0) {
      toast.error("Informe um valor válido.");
      return;
    }
    if (!id) return;
    setPagamentoLoading(true);
    try {
      await api.caixaPagamento({
        tipo: "cliente",
        cliente_id: Number(id),
        valor,
        metodo: pagamentoMetodo,
        data: pagamentoData,
        ...(pagamentoContaId && pagamentoContaId !== "nenhuma" ? { conta_id: Number(pagamentoContaId) } : {}),
      });
      toast.success("Pagamento lançado com sucesso.");
      setPagamentoOpen(false);
      setPagamentoValor("");
      setPagamentoContaId("");
      setPagamentoMetodo("Dinheiro");
      setPagamentoData(getTodayLocalISO());
      loadDetalhe();
    } catch {
      toast.error("Erro ao lançar pagamento.");
    } finally {
      setPagamentoLoading(false);
    }
  };

  const abrirEdicaoPagamento = (p: ClienteDetalheData["pagamentos"][0]) => {
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
    if (editPagamentoId == null || !id) return;
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
      await api.updatePagamentoCliente(editPagamentoId, {
        valor,
        metodo: editPagMetodo,
        data: editPagData.slice(0, 10),
        conta_id: editPagContaId && editPagContaId !== "nenhuma" ? Number(editPagContaId) : null,
        observacao: editPagObs.trim() || "",
      });
      toast.success("Pagamento atualizado.");
      setEditPagamentoOpen(false);
      setEditPagamentoId(null);
      loadDetalhe();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar pagamento.");
    } finally {
      setEditPagSaving(false);
    }
  };

  const excluirPagamento = (p: ClienteDetalheData["pagamentos"][0]) => {
    setPagamentoExcluir(p);
  };

  const vendasRaw = data?.vendas ?? [];
  const pagamentosRaw = data?.pagamentos ?? [];
  const vendasOrdenadas = useMemo(
    () => [...vendasRaw].sort(sortVendaClienteMaisRecentePrimeiro),
    [vendasRaw]
  );
  const exibirVendas = limites ? vendasFiltradas : vendasOrdenadas;
  const exibirPagamentos = limites ? pagamentosFiltrados : pagamentosRaw;
  const vendasSelecionadas = useMemo(
    () =>
      [...exibirVendas.filter((v) => selectedVendaIds.has(v.id))].sort(
        (a, b) => parseData(a.data) - parseData(b.data)
      ),
    [exibirVendas, selectedVendaIds]
  );
  const totalSelecionado = useMemo(
    () => vendasSelecionadas.reduce((s, v) => s + safeNum(v.total), 0),
    [vendasSelecionadas]
  );
  /** Soma dos totais das notas em exibição que não estão na seleção (valor bruto, sem abater pagamentos). */
  const restanteBrutoNotasForaSelecao = useMemo(
    () =>
      exibirVendas
        .filter((v) => !selectedVendaIds.has(v.id))
        .reduce((s, v) => s + safeNum(v.total), 0),
    [exibirVendas, selectedVendaIds]
  );
  if (!id) return null;
  if (loading && !data) return <p className="text-muted-foreground">Carregando...</p>;
  if (!data) return <p className="text-muted-foreground">Cliente não encontrado.</p>;

  const { cliente, total_vendas, total_pago, saldo_devedor } = data;

  const selecionarTodasExibidas = () => setSelectedVendaIds(new Set(exibirVendas.map((v) => v.id)));
  const limparSelecao = () => setSelectedVendaIds(new Set());

  const aplicarMarcacaoVenda = async (vendaId: number, valor: boolean) => {
    setMarcacaoVendaSaving(vendaId);
    try {
      await api.patchVenda(String(vendaId), { marcada_paga: valor });
      toast.success(valor ? "Venda marcada como paga." : "Marcação de paga removida.");
      loadDetalhe();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar.");
    } finally {
      setMarcacaoVendaSaving(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/clientes">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-semibold">{cliente.nome}</h1>
            <p className="text-muted-foreground">
              {cliente.telefone && `Tel: ${cliente.telefone}`}
              {(cliente.cpf || cliente.cnpj) && ` • ${cliente.cpf || cliente.cnpj}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
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
            <div className="flex items-center gap-1">
              <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="w-36" />
              <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="w-36" />
            </div>
          )}
          {isChefe && (
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
              <Checkbox
                id="fechamento-impressao-valores"
                checked={fechamentoImpressaoComValores}
                onCheckedChange={(c) => setFechamentoImpressaoComValores(c === true)}
              />
              <Label htmlFor="fechamento-impressao-valores" className="cursor-pointer text-xs font-normal leading-snug">
                Incluir valores (R$) na impressão do fechamento
              </Label>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              imprimirFechamento();
            }}
          >
            <FileCheck className="size-4 mr-2" />
            Imprimir fechamento do período
          </Button>
          <Button
            variant="default"
            size="sm"
            disabled={vendasSelecionadas.length === 0}
            onClick={() =>
              imprimirFechamentoSelecionadas(vendasSelecionadas, totalSelecionado)
            }
            title={vendasSelecionadas.length === 0 ? "Selecione pelo menos 1 venda" : "Imprimir apenas as vendas selecionadas"}
          >
            <Printer className="size-4 mr-2" />
            Imprimir selecionadas
          </Button>
          {isChefe && (
            <Button size="sm" onClick={abrirDialogLancarPagamento}>
              <Wallet className="size-4 mr-2" />
              Lançar pagamento
            </Button>
          )}
        </div>
      </div>

      {isChefe && (
      <Dialog open={pagamentoOpen} onOpenChange={setPagamentoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lançar pagamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="valor">Valor (R$)</Label>
              <Input
                id="valor"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={pagamentoValor}
                onChange={(e) => setPagamentoValor(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Forma de pagamento</Label>
              <Select value={pagamentoMetodo} onValueChange={setPagamentoMetodo}>
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
            <div className="space-y-2">
              <Label>Data do pagamento</Label>
              <Input
                type="date"
                value={pagamentoData}
                onChange={(e) => setPagamentoData(e.target.value || getTodayLocalISO())}
              />
              <p className="text-xs text-muted-foreground">Sugestão: hoje. Você pode alterar se quiser.</p>
            </div>
            <div className="space-y-2">
              <Label>Conta bancária (opcional)</Label>
              <Select value={pagamentoContaId} onValueChange={setPagamentoContaId}>
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
              <p className="text-xs text-muted-foreground">Se escolher uma conta, o saldo dela será atualizado automaticamente.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPagamentoOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleLancarPagamento} disabled={pagamentoLoading}>
              {pagamentoLoading ? "Salvando..." : "Lançar"}
            </Button>
          </DialogFooter>
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
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Valor (R$)</Label>
                <Input type="text" inputMode="decimal" value={editPagValor} onChange={(e) => setEditPagValor(e.target.value)} />
              </div>
              <div className="space-y-2">
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
              <div className="space-y-2">
                <Label>Data</Label>
                <Input type="date" value={editPagData} onChange={(e) => setEditPagData(e.target.value)} />
              </div>
              <div className="space-y-2">
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
              <div className="space-y-2">
                <Label>Observação (opcional)</Label>
                <Input value={editPagObs} onChange={(e) => setEditPagObs(e.target.value)} maxLength={255} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditPagamentoOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={() => void salvarEdicaoPagamento()} disabled={editPagSaving}>
                {editPagSaving ? "Salvando…" : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Card className={vendasSelecionadas.length > 0 ? "border-primary/30 bg-primary/[0.03]" : ""}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Receipt className="size-5 text-muted-foreground" />
            Fechamento (seleção)
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Selecione vendas na tabela ou use &quot;Imprimir fechamento do período&quot; no cabeçalho. A coluna{" "}
            <strong>Marcada paga</strong> é só controle visual (não lança pagamento).
            {isChefe && (
              <>
                {" "}
                Como chefe, use a opção <strong>Incluir valores (R$) na impressão</strong> ao lado dos botões de
                impressão: desmarcada, a impressão fica só com quantidades (como para funcionários).
              </>
            )}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={selecionarTodasExibidas} disabled={exibirVendas.length === 0}>
                Selecionar todas ({exibirVendas.length})
              </Button>
              <Button variant="outline" size="sm" onClick={limparSelecao} disabled={selectedVendaIds.size === 0}>
                Limpar seleção
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              Selecionadas: <span className="font-medium tabular-nums text-foreground">{vendasSelecionadas.length}</span>
            </div>
          </div>

          {isChefe && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg border bg-background p-4">
                <p className="text-xs font-medium text-muted-foreground">Total selecionado (soma das notas)</p>
                <p className="text-xl font-bold text-primary">{formatCurrency(totalSelecionado)}</p>
              </div>
              <div className="rounded-lg border bg-background p-4">
                <p className="text-xs font-medium text-muted-foreground">Saldo atual do cliente</p>
                <p className={`text-xl font-bold ${(data?.saldo_devedor ?? 0) > 0 ? "text-destructive" : ""}`}>
                  {formatCurrency(data?.saldo_devedor ?? 0)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Conferência geral no sistema; não vincula pagamentos a este fechamento.
                </p>
              </div>
              <div className="rounded-lg border bg-background p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Restante bruto (fora da seleção)
                </p>
                <p
                  className={`text-xl font-bold ${restanteBrutoNotasForaSelecao > 0 ? "text-amber-600" : "text-muted-foreground"}`}
                >
                  {formatCurrency(restanteBrutoNotasForaSelecao)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Soma das notas listadas que não estão selecionadas (sem descontar pagamentos).
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() =>
                imprimirFechamentoSelecionadas(vendasSelecionadas, totalSelecionado)
              }
              disabled={vendasSelecionadas.length === 0}
              title={vendasSelecionadas.length === 0 ? "Selecione pelo menos 1 venda" : "Imprimir apenas a seleção"}
            >
              <Printer className="size-4 mr-2" />
              Imprimir seleção
            </Button>
          </div>
        </CardContent>
      </Card>

      {isChefe && (
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total vendas</CardTitle>
            <Receipt className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(total_vendas)}</p>
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
            <User className="size-4 text-muted-foreground" />
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
              <Tag className="size-5" />
              Preços específicos por produto
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Defina o valor que este cliente paga por produto. Clique para abrir.
            </p>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
        <CardContent className="space-y-4 pt-0">
          <form onSubmit={handleDefinirPreco} className="flex flex-wrap items-end gap-3">
            <div className="space-y-2 min-w-[200px]">
              <Label>Produto</Label>
              <Select value={precoProdutoId} onValueChange={(v) => setPrecoProdutoId(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {produtos.map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.nome}
                      {precosProdutos.some((x) => x.produto_id === p.id)
                        ? ` — já R$ ${precosProdutos.find((x) => x.produto_id === p.id)?.preco.toFixed(2).replace(".", ",")}`
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 w-32">
              <Label>Preço (R$)</Label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={precoProdutoValor}
                onChange={(e) => setPrecoProdutoValor(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={precoLoading}>
              {precoLoading ? "Salvando..." : precosProdutos.some((p) => String(p.produto_id) === precoProdutoId) ? "Atualizar" : "Definir"}
            </Button>
          </form>
          <p className="text-sm font-medium text-muted-foreground">Preços alterados para este cliente</p>
          {precosProdutos.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right w-32">Preço para este cliente</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {precosProdutos.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.produto_nome}</TableCell>
                    <TableCell className="text-right">
                      {savingPrecoProdutoId === p.produto_id ? (
                        <span className="text-muted-foreground text-sm">Salvando...</span>
                      ) : (
                        <Input
                          type="text"
                          inputMode="decimal"
                          className="h-8 w-24 text-right"
                          value={editingPrecoProdutoId === p.produto_id ? editingPrecoVal : p.preco.toFixed(2).replace(".", ",")}
                          onChange={(e) => {
                            setEditingPrecoProdutoId(p.produto_id);
                            setEditingPrecoVal(e.target.value);
                          }}
                          onFocus={() => {
                            setEditingPrecoProdutoId(p.produto_id);
                            setEditingPrecoVal(p.preco.toFixed(2).replace(".", ","));
                          }}
                          onBlur={() => handleSavePrecoInline(p.produto_id, editingPrecoProdutoId === p.produto_id ? editingPrecoVal : p.preco.toFixed(2).replace(".", ","))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:bg-destructive/10"
                        onClick={() => handleRemoverPreco(p.produto_id)}
                        title="Remover preço (usar valor inicial)"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhum preço específico definido. Este cliente paga o valor inicial de todos os produtos. Use o formulário acima para definir exceções.
            </p>
          )}

          <p className="text-sm font-medium text-muted-foreground pt-4">Lista de todos os produtos e preço para este cliente</p>
          <p className="text-xs text-muted-foreground">
            Marque os produtos na tabela e defina um preço único para aplicar a todos de uma vez.
          </p>
          {produtos.length > 0 ? (
            <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
              <div className="flex flex-wrap items-end gap-2">
                <span className="text-sm text-muted-foreground">
                  {selectedPrecoBulkIds.size} produto(s) selecionado(s)
                </span>
                <Button type="button" variant="outline" size="sm" onClick={toggleSelecionarTodosProdutosPreco}>
                  {produtos.length > 0 && produtos.every((p) => selectedPrecoBulkIds.has(p.id))
                    ? "Desmarcar todos"
                    : "Marcar todos"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedPrecoBulkIds(new Set())}
                  disabled={selectedPrecoBulkIds.size === 0}
                >
                  Limpar seleção
                </Button>
                <div className="flex flex-wrap items-end gap-2 sm:ml-auto">
                  <div className="space-y-1">
                    <Label className="text-xs">Preço para os selecionados (R$)</Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      className="h-9 w-32"
                      value={bulkPrecoComum}
                      onChange={(e) => setBulkPrecoComum(e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={bulkPrecoLoading || selectedPrecoBulkIds.size === 0}
                    onClick={handleAplicarPrecoEmLote}
                  >
                    {bulkPrecoLoading ? "Aplicando…" : "Aplicar preço aos selecionados"}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
          {produtos.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <span className="sr-only">Selecionar para preço em lote</span>
                    <Checkbox
                      checked={
                        produtos.length > 0 && produtos.every((p) => selectedPrecoBulkIds.has(p.id))
                      }
                      onCheckedChange={() => toggleSelecionarTodosProdutosPreco()}
                      aria-label="Marcar ou desmarcar todos os produtos"
                    />
                  </TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right w-32">Preço</TableHead>
                  <TableHead className="w-28">Tipo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {produtos.map((p: any) => {
                  const especifico = precosProdutos.find((x) => x.produto_id === p.id);
                  const preco = especifico ? especifico.preco : Number(p.preco_venda ?? p.precoInicial ?? 0);
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedPrecoBulkIds.has(p.id)}
                          onCheckedChange={() => togglePrecoBulkSelect(p.id)}
                          aria-label={`Selecionar ${p.nome}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{p.nome}</TableCell>
                      <TableCell className="text-right">{formatCurrency(preco)}</TableCell>
                      <TableCell>
                        <span className={especifico ? "text-primary font-medium" : "text-muted-foreground"}>
                          {especifico ? "Específico" : "Valor inicial"}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum produto cadastrado.</p>
          )}
        </CardContent>
        </CollapsibleContent>
      </Card>
      </Collapsible>
      )}

      {limites && isChefe && (
        <Card ref={printRef}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="size-5" />
              Fechamento no período
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Total das vendas no período: <strong className="text-foreground">{formatCurrency(totalVendasPeriodo)}</strong>
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Pagamentos por período não são mostrados aqui: costumam misturar fechamentos. Use os cards{" "}
              <span className="font-medium text-foreground">Total pago</span> e{" "}
              <span className="font-medium text-foreground">Saldo devedor</span> acima para o saldo geral do cliente.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Vendas{limites ? " (no período)" : ""}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">Selecionar</TableHead>
                  {isChefe && <TableHead className="w-[120px]">Marcada paga</TableHead>}
                  <TableHead>Data</TableHead>
                  <TableHead>Itens (quantidade × produto)</TableHead>
                  {isChefe && <TableHead className="text-right">Total</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {exibirVendas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isChefe ? 5 : 3} className="text-center text-muted-foreground">
                      Nenhuma venda{limites ? " no período" : ""}
                    </TableCell>
                  </TableRow>
                ) : (
                  exibirVendas.map((v) => {
                    const sel = selectedVendaIds.has(v.id);
                    const paga = v.marcada_paga === true;
                    return (
                    <TableRow
                      key={v.id}
                      className={cn(
                        "transition-[background-color,box-shadow,border-color] duration-150",
                        paga && rowVendaMarcadaPaga,
                        sel && !paga && rowVendaSelecionada,
                        sel && paga && rowVendaPagaSelecionada,
                      )}
                    >
                      <TableCell>
                        <Checkbox
                          checked={sel}
                          onCheckedChange={() => toggleVendaSelection(v.id)}
                        />
                      </TableCell>
                      {isChefe && (
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            {paga ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/12 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                                <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
                                Paga
                              </span>
                            ) : null}
                            <Checkbox
                              checked={paga}
                              disabled={marcacaoVendaSaving === v.id}
                              onCheckedChange={(checked) =>
                                void aplicarMarcacaoVenda(v.id, checked === true)
                              }
                              aria-label={`Marcar venda ${v.id} como paga`}
                            />
                          </div>
                        </TableCell>
                      )}
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {formatDateOnly(v.data)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {v.itens && v.itens.length > 0 ? (
                          <ul className="list-none space-y-1 py-0 my-0">
                            {v.itens.map((item, idx) => (
                              <li key={idx}>
                                <span className="font-medium">{item.quantidade}×</span> {item.produto}
                                <span className="text-muted-foreground ml-1">
                                  ({formatCurrency(item.preco_unitario)} un.)
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      {isChefe && <TableCell className="text-right font-medium">{formatCurrency(v.total)}</TableCell>}
                    </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
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
            await api.deletePagamentoCliente(pid, motivo);
            toast.success("Pagamento excluído.");
            loadDetalhe();
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
