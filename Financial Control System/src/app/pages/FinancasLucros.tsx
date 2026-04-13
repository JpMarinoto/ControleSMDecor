import React, { useEffect, useMemo, useState } from "react";
import { api, type RelatorioComprasPeriodo, type RelatorioLucrosVendas } from "../lib/api";
import { formatDateOnly, getTodayLocalISO } from "../lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";

type ModoPeriodo = "dia" | "semana" | "mes" | "personalizado";

function localDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISODateLocal(iso: string): Date {
  const s = iso.trim().slice(0, 10);
  const [y, m, d] = s.split("-").map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return new Date();
  return new Date(y, m - 1, d);
}

/** Segunda a domingo da semana que contém `base`, em datas locais (YYYY-MM-DD). */
function limitesSemanaLocal(base: Date): { data_inicio: string; data_fim: string } {
  const dow = base.getDay();
  const offsetSeg = dow === 0 ? -6 : 1 - dow;
  const seg = new Date(base);
  seg.setDate(base.getDate() + offsetSeg);
  const dom = new Date(seg);
  dom.setDate(seg.getDate() + 6);
  return { data_inicio: localDateISO(seg), data_fim: localDateISO(dom) };
}

function limitesMesLocal(yyyyMm: string): { data_inicio: string; data_fim: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(yyyyMm.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const first = `${y}-${String(mo).padStart(2, "0")}-01`;
  const lastD = new Date(y, mo, 0);
  return { data_inicio: first, data_fim: localDateISO(lastD) };
}

function addDaysISO(iso: string, days: number): string {
  const d = parseISODateLocal(iso);
  d.setDate(d.getDate() + days);
  return localDateISO(d);
}

function addMonthsYYYYMM(ym: string, delta: number): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym.trim());
  if (!m) return ym;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function mesAtualYYYYMM(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function safeNum(x: unknown): number {
  const n = Number(x);
  return typeof n === "number" && isFinite(n) ? n : 0;
}

export function FinancasLucros() {
  const [modo, setModo] = useState<ModoPeriodo>("semana");
  const [refDateISO, setRefDateISO] = useState(() => getTodayLocalISO());
  const [mesRef, setMesRef] = useState(() => mesAtualYYYYMM());
  const [customInicio, setCustomInicio] = useState("");
  const [customFim, setCustomFim] = useState("");

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [data, setData] = useState<RelatorioLucrosVendas | null>(null);
  const [comprasData, setComprasData] = useState<RelatorioComprasPeriodo | null>(null);

  const [clienteDialog, setClienteDialog] = useState<{ id: number; nome: string } | null>(null);
  const [clienteDetalheLoading, setClienteDetalheLoading] = useState(false);
  const [clienteDetalheErro, setClienteDetalheErro] = useState<string | null>(null);
  const [clienteDetalheData, setClienteDetalheData] = useState<RelatorioLucrosVendas | null>(null);

  const periodoInvalidoMsg = useMemo(() => {
    if (modo !== "personalizado") return null;
    if (!customInicio || !customFim) return null;
    if (customInicio > customFim) return "A data inicial não pode ser posterior à data final.";
    return null;
  }, [modo, customInicio, customFim]);

  const periodo = useMemo(() => {
    if (modo === "personalizado") {
      if (!customInicio || !customFim || customInicio > customFim) return null;
      return { data_inicio: customInicio, data_fim: customFim };
    }
    if (modo === "dia") {
      if (!refDateISO || refDateISO.length < 10) return null;
      return { data_inicio: refDateISO.slice(0, 10), data_fim: refDateISO.slice(0, 10) };
    }
    if (modo === "semana") {
      if (!refDateISO || refDateISO.length < 10) return null;
      return limitesSemanaLocal(parseISODateLocal(refDateISO));
    }
    if (modo === "mes") {
      return limitesMesLocal(mesRef);
    }
    return null;
  }, [modo, refDateISO, mesRef, customInicio, customFim]);

  useEffect(() => {
    if (!periodo) {
      setData(null);
      setComprasData(null);
      setLoading(false);
      setErro(null);
      return;
    }
    let cancel = false;
    setLoading(true);
    setErro(null);
    Promise.all([
      api.getRelatorioLucrosVendas({
        data_inicio: periodo.data_inicio,
        data_fim: periodo.data_fim,
      }),
      api.getRelatorioComprasPeriodo({
        data_inicio: periodo.data_inicio,
        data_fim: periodo.data_fim,
      }),
    ])
      .then(([lucros, compras]) => {
        if (!cancel) {
          setData(lucros);
          setComprasData(compras);
        }
      })
      .catch((e) => {
        if (!cancel) {
          setData(null);
          setComprasData(null);
          setErro(e instanceof Error ? e.message : "Não foi possível carregar os relatórios.");
        }
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [periodo?.data_inicio, periodo?.data_fim]);

  useEffect(() => {
    if (!clienteDialog || !periodo) {
      setClienteDetalheData(null);
      setClienteDetalheErro(null);
      setClienteDetalheLoading(false);
      return;
    }
    let cancel = false;
    setClienteDetalheLoading(true);
    setClienteDetalheErro(null);
    setClienteDetalheData(null);
    api
      .getRelatorioLucrosVendas({
        data_inicio: periodo.data_inicio,
        data_fim: periodo.data_fim,
        cliente_id: String(clienteDialog.id),
      })
      .then((res) => {
        if (!cancel) setClienteDetalheData(res);
      })
      .catch((e) => {
        if (!cancel) {
          setClienteDetalheData(null);
          setClienteDetalheErro(e instanceof Error ? e.message : "Não foi possível carregar o detalhe.");
        }
      })
      .finally(() => {
        if (!cancel) setClienteDetalheLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [clienteDialog?.id, periodo?.data_inicio, periodo?.data_fim]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const porClienteOrdenado = useMemo(() => {
    if (!data?.por_cliente) return [];
    return [...data.por_cliente].sort((a, b) => safeNum(b.lucro) - safeNum(a.lucro));
  }, [data]);

  const produtosMaisVendidos = useMemo(() => {
    if (!data?.por_produto) return [];
    return [...data.por_produto].sort((a, b) => safeNum(b.quantidade) - safeNum(a.quantidade));
  }, [data]);

  const produtosClienteDetalhe = useMemo(() => {
    if (!clienteDetalheData?.por_produto) return [];
    return [...clienteDetalheData.por_produto].sort((a, b) => safeNum(b.lucro) - safeNum(a.lucro));
  }, [clienteDetalheData]);

  const labelPeriodo = useMemo(() => {
    if (!periodo) {
      if (modo === "personalizado") return "Defina o intervalo de datas";
      return "—";
    }
    if (modo === "dia") return formatDateOnly(periodo.data_inicio);
    if (modo === "semana")
      return `${formatDateOnly(periodo.data_inicio)} a ${formatDateOnly(periodo.data_fim)}`;
    if (modo === "mes")
      return `${formatDateOnly(periodo.data_inicio)} a ${formatDateOnly(periodo.data_fim)}`;
    return `${formatDateOnly(periodo.data_inicio)} a ${formatDateOnly(periodo.data_fim)}`;
  }, [modo, periodo]);

  const hojeEhRefDia =
    modo === "dia" && refDateISO.slice(0, 10) === getTodayLocalISO();
  const semanaEhAtual =
    modo === "semana" && limitesSemanaLocal(parseISODateLocal(getTodayLocalISO())).data_inicio === periodo?.data_inicio;
  const mesEhAtual = modo === "mes" && mesRef === mesAtualYYYYMM();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Lucro com mercadorias</CardTitle>
          <p className="text-sm text-muted-foreground">
            (Preço de venda − custo unitário) × quantidade nas notas do período. Vendas canceladas não entram. Custo conforme
            snapshot no item da venda.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2 min-w-[11rem]">
              <Label>Período</Label>
              <Select
                value={modo}
                onValueChange={(v) => {
                  const next = v as ModoPeriodo;
                  setModo(next);
                  const hoje = getTodayLocalISO();
                  if (next === "dia" || next === "semana") setRefDateISO(hoje);
                  if (next === "mes") setMesRef(mesAtualYYYYMM());
                  if (next === "personalizado") {
                    const [y, m] = hoje.split("-").map(Number);
                    setCustomInicio(`${y}-${String(m).padStart(2, "0")}-01`);
                    setCustomFim(hoje);
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dia">Dia</SelectItem>
                  <SelectItem value="semana">Semana</SelectItem>
                  <SelectItem value="mes">Mês</SelectItem>
                  <SelectItem value="personalizado">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {modo === "dia" ? (
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-2">
                  <Label htmlFor="lucro-dia">Data</Label>
                  <Input
                    id="lucro-dia"
                    type="date"
                    value={refDateISO.slice(0, 10)}
                    onChange={(e) => setRefDateISO(e.target.value)}
                    className="w-[11rem]"
                  />
                </div>
                <div className="flex gap-1">
                  <Button type="button" variant="outline" size="icon" aria-label="Dia anterior" onClick={() => setRefDateISO((d) => addDaysISO(d, -1))}>
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button type="button" variant="outline" size="icon" aria-label="Próximo dia" onClick={() => setRefDateISO((d) => addDaysISO(d, 1))}>
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
                {!hojeEhRefDia ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setRefDateISO(getTodayLocalISO())}>
                    Hoje
                  </Button>
                ) : null}
              </div>
            ) : null}

            {modo === "semana" ? (
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-2">
                  <Label htmlFor="lucro-semana-ref">Semana que contém</Label>
                  <Input
                    id="lucro-semana-ref"
                    type="date"
                    value={refDateISO.slice(0, 10)}
                    onChange={(e) => setRefDateISO(e.target.value)}
                    className="w-[11rem]"
                  />
                </div>
                <div className="flex gap-1">
                  <Button type="button" variant="outline" size="icon" aria-label="Semana anterior" onClick={() => setRefDateISO((d) => addDaysISO(d, -7))}>
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button type="button" variant="outline" size="icon" aria-label="Próxima semana" onClick={() => setRefDateISO((d) => addDaysISO(d, 7))}>
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
                {!semanaEhAtual ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setRefDateISO(getTodayLocalISO())}
                  >
                    Semana atual
                  </Button>
                ) : null}
              </div>
            ) : null}

            {modo === "mes" ? (
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-2">
                  <Label htmlFor="lucro-mes">Mês</Label>
                  <Input id="lucro-mes" type="month" value={mesRef} onChange={(e) => setMesRef(e.target.value)} className="w-[11rem]" />
                </div>
                <div className="flex gap-1">
                  <Button type="button" variant="outline" size="icon" aria-label="Mês anterior" onClick={() => setMesRef((m) => addMonthsYYYYMM(m, -1))}>
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button type="button" variant="outline" size="icon" aria-label="Próximo mês" onClick={() => setMesRef((m) => addMonthsYYYYMM(m, 1))}>
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
                {!mesEhAtual ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setMesRef(mesAtualYYYYMM())}>
                    Mês atual
                  </Button>
                ) : null}
              </div>
            ) : null}

            {modo === "personalizado" ? (
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-2">
                  <Label htmlFor="lucro-ini">Data inicial</Label>
                  <Input id="lucro-ini" type="date" value={customInicio} onChange={(e) => setCustomInicio(e.target.value)} className="w-[11rem]" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lucro-fim">Data final</Label>
                  <Input id="lucro-fim" type="date" value={customFim} onChange={(e) => setCustomFim(e.target.value)} className="w-[11rem]" />
                </div>
              </div>
            ) : null}
          </div>

          {periodo ? (
            <p className="text-sm font-medium text-foreground">
              Intervalo na consulta: <span className="tabular-nums">{labelPeriodo}</span>
            </p>
          ) : null}
        </CardContent>
      </Card>

      {periodoInvalidoMsg ? <p className="text-sm text-destructive">{periodoInvalidoMsg}</p> : null}
      {erro ? <p className="text-sm text-destructive">{erro}</p> : null}

      <Card className="border-primary/25 bg-primary/[0.04]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Lucro total no período</CardTitle>
        </CardHeader>
        <CardContent>
          {!periodo ? (
            <p className="text-muted-foreground text-sm">
              {modo === "personalizado" ? "Informe data inicial e data final." : "—"}
            </p>
          ) : loading ? (
            <p className="text-muted-foreground">Carregando…</p>
          ) : data ? (
            <p className="text-3xl font-bold tabular-nums text-primary">{formatCurrency(safeNum(data.lucro_total))}</p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">Lucro por cliente</CardTitle>
            <p className="text-sm text-muted-foreground font-normal">
              Toque no nome do cliente para ver itens vendidos e lucro por produto.
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Lucro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!periodo ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground">
                      Defina o período para consultar
                    </TableCell>
                  </TableRow>
                ) : loading ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground">
                      Carregando…
                    </TableCell>
                  </TableRow>
                ) : !data || porClienteOrdenado.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground">
                      Nenhuma venda com lucro neste período
                    </TableCell>
                  </TableRow>
                ) : (
                  porClienteOrdenado.map((row) => (
                    <TableRow key={row.cliente_id}>
                      <TableCell className="font-medium p-0">
                        <button
                          type="button"
                          className="w-full text-left px-2 py-2 rounded-md text-primary hover:underline hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => setClienteDialog({ id: row.cliente_id, nome: row.cliente_nome })}
                        >
                          {row.cliente_nome}
                        </button>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{formatCurrency(safeNum(row.lucro))}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">Itens mais vendidos</CardTitle>
            <p className="text-sm text-muted-foreground font-normal">Produtos por quantidade no período (receita e lucro).</p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                  <TableHead className="text-right">Lucro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!periodo ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      Defina o período
                    </TableCell>
                  </TableRow>
                ) : loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      Carregando…
                    </TableCell>
                  </TableRow>
                ) : produtosMaisVendidos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      Nenhuma venda neste período
                    </TableCell>
                  </TableRow>
                ) : (
                  produtosMaisVendidos.map((row) => (
                    <TableRow key={row.produto_id}>
                      <TableCell className="font-medium max-w-[10rem] truncate" title={row.produto_nome}>
                        {row.produto_nome}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.quantidade}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(safeNum(row.receita))}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{formatCurrency(safeNum(row.lucro))}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Itens comprados no período</CardTitle>
          <p className="text-sm text-muted-foreground font-normal">
            Compras a fornecedores pela data da compra (ordens canceladas não entram).
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {!periodo ? (
            <p className="text-sm text-muted-foreground">Defina o período para consultar.</p>
          ) : loading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : comprasData ? (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="min-w-0">
                <h3 className="text-sm font-medium mb-2">Materiais</h3>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Material</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {comprasData.materiais.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground text-sm">
                            Nenhuma compra de material
                          </TableCell>
                        </TableRow>
                      ) : (
                        comprasData.materiais.map((m) => (
                          <TableRow key={m.material_id}>
                            <TableCell className="font-medium max-w-[9rem] truncate" title={m.nome}>
                              {m.nome}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{m.quantidade}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatCurrency(safeNum(m.total_gasto))}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-medium mb-2">Produtos (revenda)</h3>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {comprasData.produtos.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground text-sm">
                            Nenhuma compra de produto
                          </TableCell>
                        </TableRow>
                      ) : (
                        comprasData.produtos.map((p) => (
                          <TableRow key={p.produto_id}>
                            <TableCell className="font-medium max-w-[9rem] truncate" title={p.nome}>
                              {p.nome}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{p.quantidade}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatCurrency(safeNum(p.total_gasto))}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sem dados de compras.</p>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={clienteDialog !== null}
        onOpenChange={(open) => {
          if (!open) setClienteDialog(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[min(85vh,720px)] flex flex-col gap-0 p-0 sm:max-w-2xl">
          <DialogHeader className="p-6 pb-2 shrink-0">
            <DialogTitle>{clienteDialog?.nome ?? "Cliente"}</DialogTitle>
            <DialogDescription>
              Vendas no período {periodo ? labelPeriodo : "—"}: receita, custo e lucro por produto.
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-2 shrink-0 flex flex-wrap gap-4 text-sm">
            {clienteDetalheLoading ? (
              <p className="text-muted-foreground">Carregando detalhe…</p>
            ) : clienteDetalheErro ? (
              <p className="text-destructive">{clienteDetalheErro}</p>
            ) : clienteDetalheData ? (
              <>
                <div>
                  <span className="text-muted-foreground">Receita </span>
                  <span className="font-semibold tabular-nums">{formatCurrency(safeNum(clienteDetalheData.receita_total))}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Custo </span>
                  <span className="font-semibold tabular-nums">{formatCurrency(safeNum(clienteDetalheData.custo_total))}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Lucro </span>
                  <span className="font-semibold tabular-nums text-primary">{formatCurrency(safeNum(clienteDetalheData.lucro_total))}</span>
                </div>
              </>
            ) : null}
          </div>
          <div className="overflow-y-auto flex-1 min-h-0 px-6 pb-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                  <TableHead className="text-right">Custo</TableHead>
                  <TableHead className="text-right">Lucro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clienteDetalheLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      Carregando…
                    </TableCell>
                  </TableRow>
                ) : produtosClienteDetalhe.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      Nenhum item neste período
                    </TableCell>
                  </TableRow>
                ) : (
                  produtosClienteDetalhe.map((row) => (
                    <TableRow key={row.produto_id}>
                      <TableCell className="font-medium max-w-[8rem] truncate" title={row.produto_nome}>
                        {row.produto_nome}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.quantidade}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(safeNum(row.receita))}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(safeNum(row.custo))}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{formatCurrency(safeNum(row.lucro))}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
