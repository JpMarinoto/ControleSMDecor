import { Fragment, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { api } from "../lib/api";
import { formatDateOnly, getTodayLocalISO, parseDateOnlyToTime } from "../lib/format";
import { useAuth } from "../contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { ArrowLeft, Truck, Receipt, CreditCard, DollarSign, Printer, Package, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../components/ui/collapsible";
import { Checkbox } from "../components/ui/checkbox";
import { toast } from "sonner";
import { motion } from "motion/react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { empresa, empresaEnderecoLinha, empresaDocumento } from "../data/empresa";
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
  total: number;
  ordem_id?: number | null;
};

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

interface FornecedorDetalheData {
  fornecedor: { id: number; nome: string; telefone: string };
  total_compras: number;
  total_pago: number;
  saldo_devedor: number;
  compras: CompraLinhaFornecedor[];
  pagamentos: { id: number; data: string; valor: number; metodo?: string; conta_nome?: string }[];
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
  const [editingMaterialId, setEditingMaterialId] = useState<number | null>(null);
  const [editingMaterialPreco, setEditingMaterialPreco] = useState("");
  const [savingMaterialId, setSavingMaterialId] = useState<number | null>(null);
  const [selectedCompraIds, setSelectedCompraIds] = useState<Set<string>>(new Set());

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

  useEffect(() => {
    if (id) loadMateriais();
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

  const handlePagar = async (e: React.FormEvent) => {
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
  const pagamentosFiltrados = data
    ? data.pagamentos.filter((p) => {
        if (!limites) return true;
        const t = parseData(p.data);
        return t >= limites.inicio && t <= limites.fim;
      })
    : [];
  const totalComprasPeriodo = comprasFiltradas.reduce((s, c) => s + c.total, 0);
  const totalPagoPeriodo = pagamentosFiltrados.reduce((s, p) => s + p.valor, 0);
  const saldoNoPeriodo = totalComprasPeriodo - totalPagoPeriodo;

  const imprimirFechamento = (usarSelecao?: boolean) => {
    if (!data) return;
    const janela = window.open("", "_blank");
    if (!janela) return;
    const usarComprasSelecionadas = usarSelecao && comprasSelecionadas.length > 0;
    const comprasParaImprimir = usarComprasSelecionadas ? comprasSelecionadas : (limites ? comprasFiltradas : data.compras);
    const comprasRows = comprasParaImprimir
      .map((c) => `<tr><td>${formatDateOnly(c.data)}</td><td>${c.material}</td><td class="num">${formatCurrency(c.total)}</td></tr>`)
      .join("");
    const pagRows = (limites ? pagamentosFiltrados : data.pagamentos)
      .map((p) => `<tr><td>${formatDateOnly(p.data)}</td><td class="num">${formatCurrency(p.valor)}</td></tr>`)
      .join("");
    const totalComprasDoc = comprasParaImprimir.reduce((s, c) => s + c.total, 0);
    const periodoLabel = usarComprasSelecionadas
      ? `Fechamento selecionado (${comprasSelecionadas.length} item(ns))`
      : periodo === "semana"
        ? "Última semana"
        : periodo === "mes"
          ? "Último mês"
          : periodo === "personalizado" && dataInicio && dataFim
            ? `${formatDateOnly(dataInicio)} a ${formatDateOnly(dataFim)}`
            : "Todo o período";
    const hojeStr = new Date().toLocaleString("pt-BR");
    janela.document.write(`
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
            <thead><tr><th>Data</th><th>Material</th><th class="num">Total</th></tr></thead>
            <tbody>${comprasRows}</tbody>
          </table>
          <h3 style="font-size:14px;margin:20px 0 8px;">Pagamentos</h3>
          <table>
            <thead><tr><th>Data</th><th class="num">Valor</th></tr></thead>
            <tbody>${pagRows}</tbody>
          </table>
          <p class="muted">Impresso em ${hojeStr}</p>
        </body>
      </html>`);
    janela.document.close();
    janela.focus();
    setTimeout(() => janela.print(), 300);
  };

  if (!id) return null;
  if (loading && !data) return <p className="text-muted-foreground">Carregando...</p>;
  if (!data) return <p className="text-muted-foreground">Fornecedor não encontrado.</p>;

  const { fornecedor, total_compras, total_pago, saldo_devedor, compras, pagamentos } = data;
  const exibirCompras = limites ? comprasFiltradas : compras;
  const exibirPagamentos = limites ? pagamentosFiltrados : pagamentos;

  const gruposCompras = agruparComprasPorOrdem(exibirCompras, parseData);

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
            <>
              <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="w-36" />
              <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="w-36" />
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => imprimirFechamento(false)}>
            <Printer className="size-4 mr-2" />
            Imprimir fechamento (período)
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
        </div>
      </div>

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

      {comprasSelecionadas.length > 0 && (
        <Card className="border-primary/30 bg-primary/[0.03]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="size-5 text-primary" />
              Fechamento selecionado
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {ordensTotalmenteSelecionadas} ordem(ns) de compra · {comprasSelecionadas.length} item(ns). Total:{" "}
              {formatCurrency(totalSelecionadoCompras)}. Use &quot;Imprimir fechamento selecionado&quot; para o comprovante.
            </p>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => imprimirFechamento(true)}>
              <Printer className="size-4 mr-2" />
              Imprimir fechamento selecionado
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSelectedCompraIds(new Set())}>
              Limpar seleção
            </Button>
          </CardContent>
        </Card>
      )}

      {isChefe && (
      <Collapsible defaultOpen={false} className="group">
      <Card>
        <CardHeader className="cursor-pointer hover:bg-muted/50 rounded-lg transition-colors">
          <CollapsibleTrigger className="flex w-full flex-col items-start gap-1 text-left">
            <CardTitle className="flex items-center gap-2">
              <ChevronRight className="size-5 transition-transform group-data-[state=open]:rotate-90" />
              <Package className="size-5" />
              Materiais deste fornecedor
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Produtos/materiais cadastrados com este fornecedor. Clique para abrir.
            </p>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
        <CardContent className="pt-0">
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
        </CardContent>
        </CollapsibleContent>
      </Card>
      </Collapsible>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Compras{limites ? " (no período)" : ""}</CardTitle>
            <p className="text-sm text-muted-foreground">
              Marque por <strong>ordem de compra</strong> (um único checkbox agrupa todos os itens da mesma compra). Registos antigos sem ordem aparecem como uma linha isolada.
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  {isChefe && <TableHead className="w-10">Ordem</TableHead>}
                  <TableHead>Data</TableHead>
                  <TableHead>Detalhe</TableHead>
                  {isChefe && <TableHead className="text-right">Total</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {exibirCompras.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isChefe ? 4 : 2} className="text-center text-muted-foreground">
                      Nenhuma compra{limites ? " no período" : ""}
                    </TableCell>
                  </TableRow>
                ) : (
                  gruposCompras.map((g) => {
                    const ids = g.lines.map((l) => l.id);
                    const allSel = ids.length > 0 && ids.every((id) => selectedCompraIds.has(id));
                    const someSel = ids.some((id) => selectedCompraIds.has(id)) && !allSel;
                    const checkState = allSel ? true : someSel ? ("indeterminate" as const) : false;
                    if (g.ordemId != null) {
                      return (
                        <Fragment key={g.key}>
                          <TableRow>
                            {isChefe && (
                              <TableCell className="align-top">
                                <Checkbox checked={checkState} onCheckedChange={() => toggleOrdemGrupo(ids)} />
                              </TableCell>
                            )}
                            <TableCell className="text-muted-foreground align-top">{formatDateOnly(g.dataRef)}</TableCell>
                            <TableCell>
                              <span className="font-medium">Ordem #{g.ordemId}</span>
                              <span className="text-muted-foreground text-sm block">
                                {g.lines.length} item(ns) nesta compra
                              </span>
                            </TableCell>
                            {isChefe && (
                              <TableCell className="text-right align-top font-medium">{formatCurrency(g.totalGrupo)}</TableCell>
                            )}
                          </TableRow>
                          {g.lines.map((linha) => (
                            <TableRow key={linha.id} className="bg-muted/25">
                              {isChefe && <TableCell />}
                              <TableCell />
                              <TableCell className="pl-6 text-sm text-muted-foreground">{linha.material}</TableCell>
                              {isChefe && <TableCell className="text-right text-sm">{formatCurrency(linha.total)}</TableCell>}
                            </TableRow>
                          ))}
                        </Fragment>
                      );
                    }
                    const linha = g.lines[0];
                    return (
                      <TableRow key={g.key}>
                        {isChefe && (
                          <TableCell>
                            <Checkbox
                              checked={selectedCompraIds.has(linha.id)}
                              onCheckedChange={() => toggleOrdemGrupo(ids)}
                            />
                          </TableCell>
                        )}
                        <TableCell className="text-muted-foreground">{formatDateOnly(linha.data)}</TableCell>
                        <TableCell>{linha.material}</TableCell>
                        {isChefe && <TableCell className="text-right">{formatCurrency(linha.total)}</TableCell>}
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {exibirPagamentos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isChefe ? 4 : 1} className="text-center text-muted-foreground">
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
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
