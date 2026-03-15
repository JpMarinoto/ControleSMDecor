import React, { useEffect, useState } from "react";
import { Link } from "react-router";
import { storage, Transaction } from "../lib/storage";
import { api } from "../lib/api";
import { formatDateOnly, parseDateOnlyToTime } from "../lib/format";
import { useAuth } from "../contexts/AuthContext";
import { StatCard } from "../components/StatCard";
import { TransactionDialog } from "../components/TransactionDialog";
import { Tooltip, TooltipTrigger, TooltipContent } from "../components/ui/tooltip";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { TrendingUp, TrendingDown, Wallet, Receipt, Calendar, DollarSign, Users, Package as PackageIcon, ShoppingCart } from "lucide-react";
import { BarChart, Bar, LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid, Legend } from "recharts";
import { motion } from "motion/react";

type PeriodoEntradaSaida = "dia" | "semana" | "mes";
type PeriodoResumo = "tudo" | "dia" | "semana" | "mes";

/** Dashboard do funcionário: atalhos para Venda, Compra, Estoque e Cadastro (valores só chefe). */
function DashboardFuncionario() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground">Atalhos rápidos</p>
      </div>
      <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-4 max-w-5xl mx-auto">
        <Link to="/venda">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="h-full"
          >
            <Card className="h-full border-2 border-primary/20 hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer">
              <CardContent className="flex flex-col items-center justify-center py-12 px-6">
                <div className="rounded-full bg-primary/10 p-4 mb-4">
                  <TrendingUp className="size-10 text-primary" />
                </div>
                <h2 className="text-xl font-semibold">Nova Venda</h2>
                <p className="text-sm text-muted-foreground mt-1 text-center">Registrar venda para cliente</p>
              </CardContent>
            </Card>
          </motion.div>
        </Link>
        <Link to="/compra">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.05 }}
            className="h-full"
          >
            <Card className="h-full border-2 border-primary/20 hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer">
              <CardContent className="flex flex-col items-center justify-center py-12 px-6">
                <div className="rounded-full bg-primary/10 p-4 mb-4">
                  <ShoppingCart className="size-10 text-primary" />
                </div>
                <h2 className="text-xl font-semibold">Nova Compra</h2>
                <p className="text-sm text-muted-foreground mt-1 text-center">Registrar compra de materiais</p>
              </CardContent>
            </Card>
          </motion.div>
        </Link>
        <Link to="/estoque">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.1 }}
            className="h-full"
          >
            <Card className="h-full border-2 border-primary/20 hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer">
              <CardContent className="flex flex-col items-center justify-center py-12 px-6">
                <div className="rounded-full bg-primary/10 p-4 mb-4">
                  <PackageIcon className="size-10 text-primary" />
                </div>
                <h2 className="text-xl font-semibold">Estoque</h2>
                <p className="text-sm text-muted-foreground mt-1 text-center">Contagem e ajustes por categoria</p>
              </CardContent>
            </Card>
          </motion.div>
        </Link>
        <Link to="/cadastro">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.15 }}
            className="h-full"
          >
            <Card className="h-full border-2 border-primary/20 hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer">
              <CardContent className="flex flex-col items-center justify-center py-12 px-6">
                <div className="rounded-full bg-primary/10 p-4 mb-4">
                  <Users className="size-10 text-primary" />
                </div>
                <h2 className="text-xl font-semibold">Cadastro</h2>
                <p className="text-sm text-muted-foreground mt-1 text-center">Clientes, fornecedores e produtos</p>
              </CardContent>
            </Card>
          </motion.div>
        </Link>
      </div>
    </div>
  );
}

/** Garante número finito para exibição e cálculos (evita Infinity/NaN). */
function safeNum(x: unknown): number {
  const n = Number(x);
  return typeof n === "number" && isFinite(n) ? n : 0;
}

/** Normaliza resposta da API de contas (array ou { data } / { results }). */
function normalizarContas(res: unknown): { id: number; nome: string; saldo_atual?: number; saldo?: number }[] {
  if (Array.isArray(res)) return res as { id: number; nome: string; saldo_atual?: number; saldo?: number }[];
  if (res && typeof res === "object" && "results" in res && Array.isArray((res as any).results)) return (res as any).results;
  if (res && typeof res === "object" && "data" in res && Array.isArray((res as any).data)) return (res as any).data;
  return [];
}

/** Dashboard do chefe: finanças, a receber, a pagar, diário, transações, etc. */
function DashboardChefe() {
  const [periodoEntradaSaida, setPeriodoEntradaSaida] = useState<PeriodoEntradaSaida>("semana");
  const [periodoResumo, setPeriodoResumo] = useState<PeriodoResumo>("tudo");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [fornecedores, setFornecedores] = useState<any[]>([]);
  const [vendas, setVendas] = useState<any[]>([]);
  const [compras, setCompras] = useState<any[]>([]);
  const [contas, setContas] = useState<any[]>([]);
  const [materiais, setMateriais] = useState<any[]>([]);
  const [dividasGerais, setDividasGerais] = useState<any[]>([]);

  const loadFromApi = async () => {
    try {
      const [txRes, clientesRes, fornRes, vendasRes, comprasRes, contasRes, materiaisRes, dividasRes] = await Promise.all([
        api.getTransactions().catch(() => []),
        api.getClientes().catch(() => []),
        api.getFornecedores().catch(() => []),
        api.getVendas().catch(() => []),
        api.getCompras().catch(() => []),
        api.getContas().catch(() => []),
        api.getMateriais().catch(() => []),
        api.getDividasGerais().catch(() => []),
      ]);
      setTransactions(Array.isArray(txRes) ? txRes : []);
      setClientes(Array.isArray(clientesRes) ? clientesRes : []);
      setFornecedores(Array.isArray(fornRes) ? fornRes : []);
      setVendas(Array.isArray(vendasRes) ? vendasRes : []);
      setCompras(Array.isArray(comprasRes) ? comprasRes : []);
      setContas(normalizarContas(contasRes));
      setMateriais(Array.isArray(materiaisRes) ? materiaisRes : []);
      setDividasGerais(Array.isArray(dividasRes) ? dividasRes : []);
    } catch {
      // Fallback para localStorage (ex.: backend offline)
      setTransactions(storage.getTransactions());
      const load = (key: string) => {
        try {
          const d = localStorage.getItem(key);
          return d ? JSON.parse(d) : [];
        } catch { return []; }
      };
      setClientes(load('sm_decor_clientes'));
      setFornecedores(load('sm_decor_fornecedores'));
      setVendas(load('sm_decor_vendas'));
      setCompras(load('sm_decor_compras'));
      setContas(normalizarContas(load('sm_decor_contas')));
      setMateriais(load('sm_decor_materiais'));
      setDividasGerais([]);
    }
  };

  const loadTransactions = () => {
    loadFromApi();
  };

  useEffect(() => {
    loadFromApi();
  }, []);

  const filtrarPorPeriodoResumo = (txs: Transaction[], periodo: PeriodoResumo): Transaction[] => {
    if (periodo === "tudo") return txs;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const hojeKey = hoje.toISOString().split("T")[0];

    if (periodo === "dia") {
      return txs.filter((t) => t.date === hojeKey);
    }

    if (periodo === "semana") {
      const semanaInicio = new Date(hoje);
      semanaInicio.setDate(hoje.getDate() - hoje.getDay());
      const semanaFim = new Date(semanaInicio);
      semanaFim.setDate(semanaFim.getDate() + 6);
      return txs.filter((t) => {
        const d = new Date(t.date);
        return d >= semanaInicio && d <= semanaFim;
      });
    }

    // "mes" = últimos 30 dias
    const limite = new Date(hoje);
    limite.setDate(limite.getDate() - 30);
    return txs.filter((t) => {
      const d = new Date(t.date);
      return d >= limite && d <= hoje;
    });
  };

  const transactionsResumo = filtrarPorPeriodoResumo(transactions, periodoResumo);

  const totalIncome = transactionsResumo
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + safeNum(t.amount), 0);

  const totalExpense = transactionsResumo
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + safeNum(t.amount), 0);

  const balance = totalIncome - totalExpense;

  // A receber: soma do saldo devedor de cada cliente
  const clientesComSaldo = (clientes || []).filter((c: any) => safeNum(c.saldo_devedor) > 0);
  const aReceber = (clientes || []).reduce((sum: number, c: any) => sum + safeNum(c.saldo_devedor), 0);

  // A pagar: saldo devedor dos fornecedores + dívidas gerais
  const fornecedoresComSaldo = (fornecedores || []).filter((f: any) => safeNum(f.saldo_devedor) > 0);
  const totalDividasGerais = (dividasGerais || []).reduce((s: number, d: any) => s + safeNum(d.valor), 0);
  const aPagar =
    (fornecedores || []).reduce((s: number, f: any) => s + safeNum(f.saldo_devedor), 0) + totalDividasGerais;

  // Weekly balance calculation
  const now = new Date();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const weeklyTransactions = transactions.filter(t => {
    const tDate = new Date(t.date);
    return tDate >= weekStart && tDate <= weekEnd;
  });

  const weeklyIncome = weeklyTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + safeNum(t.amount), 0);
  const weeklyExpense = weeklyTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + safeNum(t.amount), 0);
  const weeklyBalance = weeklyIncome - weeklyExpense;

  // A Receber chart data (last 7 days) — vendas do backend têm campo "data" (iso) e "total"
  const getReceivableData = (): { date: number; label: string; valor: number }[] => {
    const days: { date: number; label: string; valor: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      const dayVendas = vendas.filter((v: any) => (v.data ?? v.data_venda ?? '') === dateKey || (v.data_venda && String(v.data_venda).slice(0, 10) === dateKey));
      const total = dayVendas.reduce((sum, v) => sum + safeNum(v.total ?? v.total_venda), 0);
      days.push({
        date: date.getDate(),
        label: date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        valor: total,
      });
    }
    return days;
  };

  // A Pagar chart data (last 7 days) — compras do backend têm "data" (iso) e "total"
  const getPayableData = (): { date: number; label: string; valor: number }[] => {
    const days: { date: number; label: string; valor: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      const dayCompras = compras.filter((c: any) => (c.data ?? '') === dateKey || (c.data_compra && String(c.data_compra).slice(0, 10) === dateKey));
      const total = dayCompras.reduce((sum, c) => sum + safeNum(c.total), 0);
      days.push({
        date: date.getDate(),
        label: date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        valor: total,
      });
    }
    return days;
  };

  // Weekly balance chart
  const getWeeklyBalanceData = (): { day: string; saldo: number }[] => {
    const days: { day: string; saldo: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      const dayTransactions = transactions.filter(t => t.date === dateKey);
      const income = dayTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + safeNum(t.amount), 0);
      const expense = dayTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + safeNum(t.amount), 0);
      days.push({
        day: date.toLocaleDateString('pt-BR', { weekday: 'short' }),
        saldo: income - expense,
      });
    }
    return days;
  };

  // Diário financeiro: saldo acumulado até cada dia (transações com date <= dateKey)
  const getDiarioFinanceiro = (): { data: string; saldo: number }[] => {
    const days: { data: string; saldo: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      const dayTransactions = transactions.filter(t => t.date <= dateKey);
      const income = dayTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + safeNum(t.amount), 0);
      const expense = dayTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + safeNum(t.amount), 0);
      days.push({
        data: date.toLocaleDateString('pt-BR'),
        saldo: income - expense,
      });
    }
    return days;
  };

  // Entradas x Saídas (dia / semana / mês) - baseado em transações
  const getEntradasSaidasData = (): { label: string; entradas: number; saidas: number }[] => {
    const hoje = new Date();
    const hojeKey = hoje.toISOString().split('T')[0];
    if (periodoEntradaSaida === 'dia') {
      const dayTx = transactions.filter(t => t.date === hojeKey);
      const entradas = dayTx.filter(t => t.type === 'income').reduce((s, t) => s + safeNum(t.amount), 0);
      const saidas = dayTx.filter(t => t.type === 'expense').reduce((s, t) => s + safeNum(t.amount), 0);
      return [{ label: 'Hoje', entradas, saidas }];
    }
    if (periodoEntradaSaida === 'semana') {
      const days: { label: string; entradas: number; saidas: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(hoje);
        date.setDate(date.getDate() - i);
        const dateKey = date.toISOString().split('T')[0];
        const dayTx = transactions.filter(t => t.date === dateKey);
        const entradas = dayTx.filter(t => t.type === 'income').reduce((s, t) => s + safeNum(t.amount), 0);
        const saidas = dayTx.filter(t => t.type === 'expense').reduce((s, t) => s + safeNum(t.amount), 0);
        days.push({
          label: date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }),
          entradas,
          saidas,
        });
      }
      return days;
    }
    const days: { label: string; entradas: number; saidas: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date(hoje);
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      const dayTx = transactions.filter(t => t.date === dateKey);
      const entradas = dayTx.filter(t => t.type === 'income').reduce((s, t) => s + safeNum(t.amount), 0);
      const saidas = dayTx.filter(t => t.type === 'expense').reduce((s, t) => s + safeNum(t.amount), 0);
      days.push({
        label: date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        entradas,
        saidas,
      });
    }
    return days;
  };

  const entradasSaidasData = getEntradasSaidasData();

  // Latest payments received
  const ultimosPagamentosRecebidos = transactions
    .filter(t => t.type === 'income')
    .sort((a, b) => parseDateOnlyToTime(b.date) - parseDateOnlyToTime(a.date))
    .slice(0, 5);

  // Latest expenses
  const historicoSaida = transactions
    .filter(t => t.type === 'expense')
    .sort((a, b) => parseDateOnlyToTime(b.date) - parseDateOnlyToTime(a.date))
    .slice(0, 5);

  // Total stock value (preço unitário × quantidade em estoque)
  const faltqueTotal = materiais.reduce(
    (sum, m) => sum + safeNum(m.precoUnitarioBase ?? m.preco_unitario_base) * safeNum(m.estoque_atual),
    0
  );

  const totalSaldoContas = contas.reduce(
    (sum, c) => sum + safeNum(c.saldo_atual ?? c.saldo),
    0
  );

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const receivableData = getReceivableData();
  const payableData = getPayableData();
  const weeklyBalanceData = getWeeklyBalanceData();
  const diarioFinanceiro = getDiarioFinanceiro();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Dashboard</h1>
          <p className="text-muted-foreground">Visão geral das suas finanças</p>
        </div>
        <TransactionDialog onTransactionAdded={loadTransactions} />
      </div>

      {/* Top 4 Charts - mesmo tamanho, centralizados */}
      <div className="flex justify-center">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 w-full max-w-6xl">
          {/* A Receber - soma por cliente (sem repetir) */}
          <motion.div className="flex" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <Card className="border-green-200 bg-green-50/50 flex flex-col w-full min-h-[320px]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-green-700">A receber</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col flex-1">
                <div className="flex justify-center h-[100px]">
                  <ResponsiveContainer width="100%" height={100}>
                    <BarChart data={receivableData}>
                      <RechartsTooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length > 0) {
                            const p = payload[0].payload;
                            return (
                              <div className="rounded-lg border bg-background px-3 py-2 shadow-sm text-xs">
                                <p className="text-muted-foreground font-medium mb-1">{p.label ?? `Dia ${p.date}`}</p>
                                <p className="text-green-600 font-semibold">A receber: {formatCurrency(p.valor ?? 0)}</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                        cursor={{ fill: 'rgba(16, 185, 129, 0.1)' }}
                      />
                      <Bar dataKey="valor" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 text-center">
                  <p className="text-xl font-bold text-green-600">{formatCurrency(aReceber)}</p>
                </div>
                <div className="mt-3 space-y-2 max-h-36 overflow-y-auto flex-1">
                  {clientesComSaldo.length > 0 ? (
                    clientesComSaldo.map((c: any) => (
                      <div key={c.id} className="flex items-center justify-between p-2 rounded bg-white border border-green-200">
                        <p className="text-sm font-medium truncate flex-1 min-w-0">{c.nome}</p>
                        <p className="text-sm font-semibold text-green-600 ml-2">{formatCurrency(safeNum(c.saldo_devedor))}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-center text-muted-foreground py-3">Nenhum cliente com saldo a receber</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* A Pagar */}
          <motion.div className="flex" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
            <Card className="border-red-200 bg-red-50/50 flex flex-col w-full min-h-[320px]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-red-700">A pagar</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col flex-1">
                <div className="flex justify-center h-[100px]">
                  <ResponsiveContainer width="100%" height={100}>
                    <BarChart data={payableData}>
                      <RechartsTooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length > 0) {
                            const p = payload[0].payload;
                            return (
                              <div className="rounded-lg border bg-background px-3 py-2 shadow-sm text-xs">
                                <p className="text-muted-foreground font-medium mb-1">{p.label ?? `Dia ${p.date}`}</p>
                                <p className="text-red-600 font-semibold">A pagar: {formatCurrency(p.valor ?? 0)}</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                        cursor={{ fill: 'rgba(239, 68, 68, 0.1)' }}
                      />
                      <Bar dataKey="valor" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 text-center">
                  <p className="text-xl font-bold text-red-600">{formatCurrency(aPagar)}</p>
                </div>
                <div className="mt-3 space-y-2 max-h-36 overflow-y-auto flex-1">
                  {fornecedoresComSaldo.length > 0 || (dividasGerais && dividasGerais.length > 0) ? (
                    <>
                      {fornecedoresComSaldo.map((f: any) => (
                        <div key={`forn-${f.id}`} className="flex items-center justify-between p-2 rounded bg-white border border-red-200">
                          <p className="text-sm font-medium truncate flex-1 min-w-0">{f.nome}</p>
                          <p className="text-sm font-semibold text-red-600 ml-2">{formatCurrency(safeNum(f.saldo_devedor))}</p>
                        </div>
                      ))}
                      {(dividasGerais || []).map((d: any) => (
                        <div key={`dg-${d.id}`} className="flex items-center justify-between p-2 rounded bg-white border border-red-200">
                          <p className="text-sm font-medium truncate flex-1 min-w-0">{d.nome}</p>
                          <p className="text-sm font-semibold text-red-600 ml-2">{formatCurrency(safeNum(d.valor))}</p>
                        </div>
                      ))}
                    </>
                  ) : (
                    <p className="text-xs text-center text-muted-foreground py-3">Nenhuma dívida a pagar</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Diário Finanças - linha ao passar o mouse com valor */}
          <motion.div className="flex" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
            <Card className="border-blue-200 bg-blue-50/50 flex flex-col w-full min-h-[320px]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-blue-700">Diário Finanças</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col flex-1">
                <div className="flex justify-center h-[100px]">
                  <ResponsiveContainer width="100%" height={100}>
                    <LineChart data={weeklyBalanceData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                      <YAxis hide />
                      <RechartsTooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length > 0) {
                            const p = payload[0].payload;
                            return (
                              <div className="rounded-lg border bg-background px-3 py-2 shadow-sm">
                                <p className="text-xs text-muted-foreground">{p.day}</p>
                                <p className={`font-semibold ${(p.saldo ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {formatCurrency(p.saldo ?? 0)}
                                </p>
                              </div>
                            );
                          }
                          return null;
                        }}
                        cursor={{ stroke: '#3b82f6', strokeWidth: 1, strokeDasharray: '4 2' }}
                  />
                      <Line type="monotone" dataKey="saldo" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 text-center">
                  <p className={`text-xl font-bold ${weeklyBalance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    {formatCurrency(weeklyBalance)}
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Entradas x Saídas - filtro Dia / Semana / Mês */}
          <motion.div className="flex" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.25 }}>
            <Card className="border-violet-200 bg-violet-50/50 flex flex-col w-full min-h-[320px]">
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-sm font-medium text-violet-700">Entradas x Saídas</CardTitle>
                <Select value={periodoEntradaSaida} onValueChange={(v) => setPeriodoEntradaSaida(v as PeriodoEntradaSaida)}>
                  <SelectTrigger className="w-[110px] h-8 text-xs border-violet-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dia">Dia</SelectItem>
                    <SelectItem value="semana">Semana</SelectItem>
                    <SelectItem value="mes">Mês</SelectItem>
                  </SelectContent>
                </Select>
              </CardHeader>
              <CardContent className="flex flex-col flex-1">
                <div className="flex justify-center h-[100px]">
                  <ResponsiveContainer width="100%" height={100}>
                    <BarChart data={entradasSaidasData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                      <YAxis hide />
                      <RechartsTooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length > 0) {
                            const p = payload[0].payload;
                            return (
                              <div className="rounded-lg border bg-background px-3 py-2 shadow-sm text-xs">
                                <p className="text-muted-foreground font-medium mb-1">{p.label}</p>
                                <p className="text-green-600">Entradas: {formatCurrency(p.entradas ?? 0)}</p>
                                <p className="text-red-600">Saídas: {formatCurrency(p.saidas ?? 0)}</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                        cursor={{ fill: 'rgba(139, 92, 246, 0.1)' }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="entradas" name="Entradas" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="saidas" name="Saídas" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 flex justify-center gap-4 text-sm">
                  <span className="text-green-600 font-medium">
                    Entradas: {formatCurrency(entradasSaidasData.reduce((s, d) => s + (d.entradas ?? 0), 0))}
                  </span>
                  <span className="text-red-600 font-medium">
                    Saídas: {formatCurrency(entradasSaidasData.reduce((s, d) => s + (d.saidas ?? 0), 0))}
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Totais por período</h2>
        <Select value={periodoResumo} onValueChange={(v) => setPeriodoResumo(v as PeriodoResumo)}>
          <SelectTrigger className="w-40 h-8 text-xs">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tudo">Todo período</SelectItem>
            <SelectItem value="dia">Hoje</SelectItem>
            <SelectItem value="semana">Última semana</SelectItem>
            <SelectItem value="mes">Últimos 30 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <StatCard
                title="Saldo Total"
                value={formatCurrency(balance)}
                icon={Wallet}
                iconColor="bg-primary/10 text-primary"
              />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Saldo Total = Receitas - Despesas (todas as transações registradas).</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <StatCard
                title="Total de Receitas"
                value={formatCurrency(totalIncome)}
                icon={TrendingUp}
                iconColor="bg-green-500/10 text-green-500"
              />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p className="font-medium mb-1">Total de Receitas (período selecionado)</p>
            <p className="text-xs text-muted-foreground">
              Soma de: recebimentos de clientes (Caixa) + entradas de caixa + entradas em contas bancárias.
            </p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <StatCard
                title="Total de Despesas"
                value={formatCurrency(totalExpense)}
                icon={TrendingDown}
                iconColor="bg-red-500/10 text-red-500"
              />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p className="font-medium mb-1">Total de Despesas (período selecionado)</p>
            <p className="text-xs text-muted-foreground">
              Soma de: pagamentos a fornecedores (Caixa) + saídas de caixa + saídas de contas bancárias.
            </p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <StatCard
                title="Saldo em Contas"
                value={formatCurrency(totalSaldoContas)}
                icon={DollarSign}
                iconColor="bg-blue-500/10 text-blue-500"
              />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Saldo em Contas = soma do saldo atual de todas as contas bancárias.</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Resumo tipo Excel: A Receber (Clientes + Total), Dívidas, Total geral com Saldo */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* A Receber (Clientes) */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.3 }}>
          <Card className="h-full flex flex-col min-h-[280px]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-green-700">A Receber (Clientes)</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-2">
              {clientesComSaldo.length > 0 ? (
                clientesComSaldo.slice(0, 8).map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between py-1.5 border-b border-green-100 last:border-0">
                    <span className="text-sm truncate flex-1 min-w-0">{c.nome}</span>
                    <span className="text-sm font-medium text-green-600 ml-2">{formatCurrency(safeNum(c.saldo_devedor))}</span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground py-2">Nenhum valor a receber</p>
              )}
              <div className="mt-auto pt-2 border-t border-green-200">
                <div className="flex items-center justify-between font-semibold text-green-700">
                  <span>Total</span>
                  <span>{formatCurrency(aReceber)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Dívidas de Fornecedores */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.35 }}>
          <Card className="h-full flex flex-col min-h-[280px]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-red-700">Dívidas de Fornecedores</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-2">
              {fornecedoresComSaldo.length > 0 ? (
                fornecedoresComSaldo.slice(0, 8).map((f: any) => (
                  <div key={f.id} className="flex items-center justify-between py-1.5 border-b border-red-100 last:border-0">
                    <span className="text-sm truncate flex-1 min-w-0">{f.nome}</span>
                    <span className="text-sm font-medium text-red-600 ml-2">{formatCurrency(safeNum(f.saldo_devedor))}</span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground py-2">Nenhuma dívida</p>
              )}
              <div className="mt-auto pt-2 border-t border-red-200">
                <div className="flex items-center justify-between font-semibold text-red-700">
                  <span>Total</span>
                  <span>{formatCurrency((fornecedores || []).reduce((s: number, f: any) => s + safeNum(f.saldo_devedor), 0))}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Resumo do total de despesas */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.4 }}>
          <Card className="h-full flex flex-col min-h-[280px]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-red-700">Resumo de despesas</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-2">
              <div className="flex items-center justify-between py-2 border-b border-red-100">
                <span className="text-sm font-medium text-red-800">Fornecedores (a pagar)</span>
                <span className="text-sm font-semibold text-red-600">
                  {formatCurrency((fornecedores || []).reduce((s: number, f: any) => s + safeNum(f.saldo_devedor), 0))}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-red-100">
                <span className="text-sm font-medium text-red-800">Dívidas gerais</span>
                <span className="text-sm font-semibold text-red-600">{formatCurrency(totalDividasGerais)}</span>
              </div>
              <div className="mt-auto pt-2 border-t-2 border-red-200">
                <div className="flex items-center justify-between font-semibold text-red-700">
                  <span>Total de despesas</span>
                  <span>{formatCurrency(aPagar)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Total geral (inclui investimento em estoque) */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.45 }}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Card className="h-full flex flex-col min-h-[280px] cursor-help">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Total</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col gap-3">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-green-50 border border-green-200">
                    <span className="text-sm font-medium text-green-700">A Receber</span>
                    <span className="font-semibold text-green-600">{formatCurrency(aReceber)}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-red-50 border border-red-200">
                    <span className="text-sm font-medium text-red-700">Dívidas (Fornecedores + Gerais)</span>
                    <span className="font-semibold text-red-600">{formatCurrency(aPagar)}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-blue-50 border border-blue-200">
                    <span className="text-sm font-medium text-blue-700">Caixa / Contas</span>
                    <span className="font-semibold text-blue-600">{formatCurrency(totalSaldoContas)}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-50 border border-emerald-200">
                    <span className="text-sm font-medium text-emerald-700">Estoque (investimento)</span>
                    <span className="font-semibold text-emerald-600">{formatCurrency(faltqueTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-primary/10 border border-primary/20 mt-auto">
                    <span className="font-semibold">Saldo</span>
                    <span className={`text-lg font-bold ${(aReceber - aPagar + totalSaldoContas + faltqueTotal) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(safeNum(aReceber - aPagar + totalSaldoContas + faltqueTotal))}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                Total = A Receber ({formatCurrency(aReceber)}) + Caixa/Contas ({formatCurrency(totalSaldoContas)}) + Estoque ({formatCurrency(faltqueTotal)}) - Dívidas (Fornecedores + Gerais) ({formatCurrency(aPagar)}).
              </p>
            </TooltipContent>
          </Tooltip>
        </motion.div>
      </div>

      {/* Main Content Grid - Histórico e Pagamentos */}
      <div className="grid gap-4 md:grid-cols-2">

        {/* Histórico de Saída */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.4 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Histórico de Saída</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historicoSaida.length > 0 ? (
                    historicoSaida.map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell className="text-sm">
                          {formatDateOnly(transaction.date)}
                        </TableCell>
                        <TableCell className="text-sm">{transaction.description}</TableCell>
                        <TableCell className="text-sm text-right text-red-600">
                          {formatCurrency(transaction.amount)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        Nenhuma despesa registrada
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </motion.div>

        {/* Últimos Pagamentos Recebidos */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.5 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Últimos Pagamentos (Recebidos)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ultimosPagamentosRecebidos.length > 0 ? (
                    ultimosPagamentosRecebidos.map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell className="text-sm">
                          {formatDateOnly(transaction.date)}
                        </TableCell>
                        <TableCell className="text-sm">{transaction.description}</TableCell>
                        <TableCell className="text-sm text-right text-green-600">
                          {formatCurrency(transaction.amount)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        Nenhuma receita registrada
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Bottom Section - cards com mesma altura para alinhamento */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Estoque Total */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.7 }}
          className="flex"
        >
          <Card className="flex flex-col w-full min-h-[320px]">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2">
                <PackageIcon className="size-5" />
                Estoque total
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <span className="font-medium">Total em Materiais</span>
                  <span className="text-xl font-bold text-primary">{formatCurrency(faltqueTotal)}</span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material</TableHead>
                      <TableHead className="text-right">Qnt</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {materiais.length > 0 ? (
                      materiais.slice(0, 3).map((material) => {
                        const qty = safeNum(material.estoque_atual);
                        const preco = safeNum(material.precoUnitarioBase ?? material.preco_unitario_base);
                        return (
                          <TableRow key={material.id}>
                            <TableCell className="text-sm">{material.nome}</TableCell>
                            <TableCell className="text-sm text-right">{qty}</TableCell>
                            <TableCell className="text-sm text-right">{formatCurrency(preco * qty)}</TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground">
                          Nenhum material cadastrado
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Quick Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.8 }}
          className="flex"
        >
          <Card className="flex flex-col w-full min-h-[320px]">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2">
                <Users className="size-5" />
                Estatísticas Rápidas
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <span className="text-sm text-muted-foreground">Total de Clientes</span>
                  <Badge variant="outline">{clientes.length}</Badge>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <span className="text-sm text-muted-foreground">Total de Fornecedores</span>
                  <Badge variant="outline">{fornecedores.length}</Badge>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <span className="text-sm text-muted-foreground">Vendas Realizadas</span>
                  <Badge variant="outline">{vendas.length}</Badge>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <span className="text-sm text-muted-foreground">Compras Realizadas</span>
                  <Badge variant="outline">{compras.length}</Badge>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <span className="text-sm text-muted-foreground">Contas Bancárias</span>
                  <Badge variant="outline">{contas.length}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Contas Bancárias - mesma altura que Estoque e Estatísticas */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.9 }}
          className="flex"
        >
          <Card className="flex flex-col w-full min-h-[320px]">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="size-5" />
                Contas Bancárias
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <div className="space-y-2">
                {contas.length > 0 ? (
                  contas.map((conta) => (
                    <div key={conta.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <span className="text-sm font-medium">{conta.nome}</span>
                      <span className={`font-semibold ${safeNum(conta.saldo_atual ?? conta.saldo) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(safeNum(conta.saldo_atual ?? conta.saldo))}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-muted-foreground py-4">
                    Nenhuma conta cadastrada
                  </div>
                )}
                <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20 mt-auto">
                  <span className="font-medium">Saldo Total</span>
                  <span className={`text-xl font-bold ${totalSaldoContas >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(totalSaldoContas)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { user } = useAuth();
  if (!user?.is_chefe) return <DashboardFuncionario />;
  return <DashboardChefe />;
}