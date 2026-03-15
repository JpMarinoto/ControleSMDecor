import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import {
  SHOPEE_FAIXAS_CNPJ,
  calcularComissaoShopee,
} from "../data/shopeeComissao";
import { Tag, Plus, Trash2, ExternalLink, Copy, Pencil, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

/** Campos editáveis por linha (igual à planilha Shopee). */
interface LinhaPrecificacao {
  id: string;
  descricao: string;
  unidade: string;
  vlrUnitario: string;
  embalagem: string;
  etiqueta: string;
  fita: string;
  mo: string;
  nfe: string;
  outros: string;
  vlrVendaBruto: string;
  lucroOverride?: string;
  lucroPercentOverride?: string;
  corLinha?: string;
}

interface PrecificacaoSalva {
  id: string;
  nome: string;
  dataIso: string;
  mesReferencia: string;
  nfPercent: string;
  impostoPercent: string;
  linhas: LinhaPrecificacao[];
}

function parseNum(s: string): number {
  if (!s) return 0;
  // Remove símbolos de moeda, espaços e qualquer coisa que não seja número, vírgula, ponto ou sinal
  const cleaned = String(s)
    .replace(/[^\d,.\-]/g, "")
    .replace(",", ".");
  const v = parseFloat(cleaned);
  return isNaN(v) ? 0 : v;
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function formatPercent(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

const emptyLinha = (): LinhaPrecificacao => ({
  id: String(Date.now()),
  descricao: "",
  unidade: "1",
  vlrUnitario: "",
  embalagem: "",
  etiqueta: "",
  fita: "",
  mo: "",
  nfe: "",
  outros: "",
  vlrVendaBruto: "",
  lucroOverride: "",
  lucroPercentOverride: "",
  corLinha: "",
});

export function Precificacao() {
  const [linhas, setLinhas] = useState<LinhaPrecificacao[]>([{ ...emptyLinha(), id: "1" }]);
  const [mesReferencia, setMesReferencia] = useState<string>(() => {
    const now = new Date();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    return `${now.getFullYear()}-${m}`;
  });
  const [nfPercentGlobal, setNfPercentGlobal] = useState<string>("70");
  const [impostoPercentGlobal, setImpostoPercentGlobal] = useState<string>("10");
  const [mostrarConfigImposto, setMostrarConfigImposto] = useState(false);
  const [mostrarTabelaComissao, setMostrarTabelaComissao] = useState(false);
  const [nomePrecificacao, setNomePrecificacao] = useState<string>("");
  const [precificacoesSalvas, setPrecificacoesSalvas] = useState<PrecificacaoSalva[]>([]);
  const [idSelecionado, setIdSelecionado] = useState<string>("");

  const addLinha = () => setLinhas((prev) => [...prev, emptyLinha()]);

  const removeLinha = (id: string) => {
    if (linhas.length <= 1) {
      toast.info("Mantenha ao menos uma linha.");
      return;
    }
    setLinhas((prev) => prev.filter((l) => l.id !== id));
  };

  const updateLinha = (id: string, field: keyof LinhaPrecificacao, value: string) => {
    setLinhas((prev) =>
      prev.map((l) => (l.id === id ? { ...l, [field]: value } : l))
    );
  };

  const copiarLinha = (linha: LinhaPrecificacao) => {
    setLinhas((prev) => [
      ...prev,
      {
        ...linha,
        id: String(Date.now()),
      },
    ]);
  };

  const getComissao = (vlrBruto: number) => calcularComissaoShopee(vlrBruto);

  // Dado um lucro alvo em R$ e o gasto total, encontra o Vlr venda bruto
  // que gera esse lucro, respeitando as faixas de comissão da Shopee.
  const calcularVendaBrutaPorLucro = (lucroTarget: number, gastoTotal: number): number | null => {
    if (lucroTarget <= 0) return null;
    const faixas = SHOPEE_FAIXAS_CNPJ;
    for (const faixa of faixas) {
      const perc = faixa.percentual;
      const fixo = faixa.fixo;
      const liquidoTarget = gastoTotal + lucroTarget;
      const denom = 1 - perc;
      if (denom <= 0) continue;
      const vb = fixo + liquidoTarget / denom;
      if (vb >= faixa.min && vb <= faixa.max) {
        return vb;
      }
    }
    return null;
  };

  // Dado um lucro % alvo (sobre a venda bruta) e o gasto total,
  // encontra o Vlr venda bruto que gera esse % de lucro.
  const calcularVendaBrutaPorLucroPercent = (lucroPctTarget: number, gastoTotal: number): number | null => {
    if (lucroPctTarget <= 0) return null;
    const faixas = SHOPEE_FAIXAS_CNPJ;
    for (const faixa of faixas) {
      const perc = faixa.percentual;
      const fixo = faixa.fixo;
      const denom = (1 - perc) - lucroPctTarget;
      if (denom <= 0) continue;
      const vb = ((1 - perc) * fixo + gastoTotal) / denom;
      if (vb >= faixa.min && vb <= faixa.max) {
        return vb;
      }
    }
    return null;
  };

  // Carrega precificações salvas do localStorage na montagem
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("precificacoes_shopee");
      if (raw) {
        const parsed = JSON.parse(raw) as PrecificacaoSalva[];
        setPrecificacoesSalvas(parsed);
      }
    } catch {
      // ignora erro de parse
    }
  }, []);

  const salvarPrecificacao = () => {
    if (!nomePrecificacao.trim()) {
      toast.error("Informe um nome para a precificação antes de salvar.");
      return;
    }
    const agoraIso = new Date().toISOString();
    setPrecificacoesSalvas((prev) => {
      const existenteIdx = prev.findIndex((p) => p.nome === nomePrecificacao.trim());
      const nova: PrecificacaoSalva = {
        id: existenteIdx >= 0 ? prev[existenteIdx].id : String(Date.now()),
        nome: nomePrecificacao.trim(),
        dataIso: agoraIso,
        mesReferencia,
        nfPercent: nfPercentGlobal,
        impostoPercent: impostoPercentGlobal,
        linhas,
      };
      let lista: PrecificacaoSalva[];
      if (existenteIdx >= 0) {
        lista = [...prev];
        lista[existenteIdx] = nova;
      } else {
        lista = [...prev, nova];
      }
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem("precificacoes_shopee", JSON.stringify(lista));
        }
      } catch {
        toast.error("Não foi possível salvar no navegador (localStorage).");
      }
      toast.success("Precificação salva.");
      return lista;
    });
  };

  const carregarPrecificacao = (id: string) => {
    const p = precificacoesSalvas.find((x) => x.id === id);
    if (!p) return;
    setIdSelecionado(id);
    setNomePrecificacao(p.nome);
    setMesReferencia(p.mesReferencia);
    setNfPercentGlobal(p.nfPercent);
    setImpostoPercentGlobal(p.impostoPercent);
    setLinhas(p.linhas.length ? p.linhas : [{ ...emptyLinha(), id: "1" }]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Precificação</h1>
          <p className="text-[11px] sm:text-xs text-muted-foreground max-w-xl">
            Planilha compacta por produto: custos, insumos, imposto, comissão e lucro.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="mes" className="text-xs text-muted-foreground">
            Mês de referência
          </Label>
          <Select
            value={mesReferencia}
            onValueChange={(v) => setMesReferencia(v)}
          >
            <SelectTrigger id="mes" className="h-8 w-32 text-xs">
              <SelectValue placeholder="Mês" />
            </SelectTrigger>
            <SelectContent>
              {["2026-07","2026-08","2026-09","2026-10","2026-11","2026-12"].map((val) => {
                const [y, m] = val.split("-");
                const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("pt-BR", {
                  month: "long",
                  year: "numeric",
                });
                return (
                  <SelectItem key={val} value={val}>
                    {label}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Marketplaces tabs */}
      <Tabs defaultValue="shopee" className="w-full">
        <TabsList className="w-full max-w-md grid grid-cols-4 mb-2">
          <TabsTrigger value="shopee" className="text-xs sm:text-sm">
            Shopee
          </TabsTrigger>
          <TabsTrigger value="mercado-livre" className="text-xs sm:text-sm" disabled>
            Mercado Livre
          </TabsTrigger>
          <TabsTrigger value="shein" className="text-xs sm:text-sm" disabled>
            Shein
          </TabsTrigger>
          <TabsTrigger value="outros" className="text-xs sm:text-sm" disabled>
            Outros
          </TabsTrigger>
        </TabsList>

        <TabsContent value="shopee" className="space-y-3">
          {/* Tabela de referência Shopee (compacta) */}
          <Card className="border-dashed rounded-md border-orange-300 bg-orange-50/50">
            <CardHeader
              className="py-2 px-3 flex items-center justify-between gap-2 cursor-pointer"
              onClick={() => setMostrarTabelaComissao((v) => !v)}
            >
              <div className="flex items-center gap-2">
                {mostrarTabelaComissao ? (
                  <ChevronDown className="size-4 text-orange-500" />
                ) : (
                  <ChevronRight className="size-4 text-orange-500" />
                )}
                <CardTitle className="flex items-center gap-2 text-sm text-orange-700">
                  <Tag className="size-4 text-orange-500" />
                  Comissão Shopee 2026 (CNPJ)
                </CardTitle>
              </div>
              <a
                href="https://seller.shopee.com.br/edu/article/26839/Comissao-para-vendedores-CNPJ-e-CPF-em-2026"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-orange-700 hover:underline inline-flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                Ver política <ExternalLink className="size-3" />
              </a>
            </CardHeader>
            {mostrarTabelaComissao && (
              <CardContent className="pt-0 px-2 pb-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Faixa</TableHead>
                      <TableHead className="text-right text-xs">Comissão</TableHead>
                      <TableHead className="text-right text-xs">Pix</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {SHOPEE_FAIXAS_CNPJ.map((f) => (
                      <TableRow key={f.descricao}>
                        <TableCell className="text-xs">{f.descricao}</TableCell>
                        <TableCell className="text-right text-xs">
                          {(f.percentual * 100).toFixed(0)}% + {formatCurrency(f.fixo)}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {f.subsidioPix != null ? `${(f.subsidioPix * 100).toFixed(0)}%` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            )}
          </Card>

          {/* Tabela de precificação — igual à planilha Excel Shopee */}
          <Card className="rounded-md border-orange-200">
            <CardHeader className="py-2 px-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm text-orange-700">Precificação Shopee</CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-[11px] border-orange-300 text-orange-700 hover:bg-orange-50"
                  onClick={() => setMostrarConfigImposto((v) => !v)}
                >
                  Configurar imposto
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2 justify-start sm:justify-end">
                <Input
                  className="h-8 w-40 text-xs"
                  placeholder="Nome da precificação"
                  value={nomePrecificacao}
                  onChange={(e) => setNomePrecificacao(e.target.value)}
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-8 px-3 text-[11px] bg-orange-500 hover:bg-orange-600 text-white"
                  onClick={salvarPrecificacao}
                >
                  Salvar precificação
                </Button>
                <Select
                  value={idSelecionado}
                  onValueChange={(v) => {
                    setIdSelecionado(v);
                    carregarPrecificacao(v);
                  }}
                >
                  <SelectTrigger className="h-8 w-44 text-xs">
                    <SelectValue placeholder="Consultar precificação" />
                  </SelectTrigger>
                  <SelectContent>
                    {precificacoesSalvas.length === 0 && (
                      <SelectItem value="__none" disabled>
                        Nenhuma salva
                      </SelectItem>
                    )}
                    {precificacoesSalvas.map((p) => {
                      const d = new Date(p.dataIso);
                      const label = isNaN(d.getTime())
                        ? p.nome
                        : `${p.nome} — ${d.toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}`;
                      return (
                        <SelectItem key={p.id} value={p.id}>
                          {label}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="pt-1 px-2 pb-3">
              {mostrarConfigImposto && (
                <div className="mb-2 grid gap-2 rounded-md border bg-muted/40 px-2 py-2 text-[11px] sm:text-xs sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="nfPercent" className="text-[11px]">
                      % do valor na NF
                    </Label>
                    <Input
                      id="nfPercent"
                      className="h-7 w-16 text-right text-[11px]"
                      inputMode="decimal"
                      value={nfPercentGlobal}
                      onChange={(e) => setNfPercentGlobal(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="impPercent" className="text-[11px]">
                      % imposto sobre NF
                    </Label>
                    <Input
                      id="impPercent"
                      className="h-7 w-16 text-right text-[11px]"
                      inputMode="decimal"
                      value={impostoPercentGlobal}
                      onChange={(e) => setImpostoPercentGlobal(e.target.value)}
                    />
                  </div>
                  <p className="col-span-full text-[10px] text-muted-foreground">
                    Imposto (R$) = Venda bruta × (% NF / 100) × (% imposto / 100). Esse valor é somado ao gasto total.
                  </p>
                </div>
              )}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14"></TableHead>
                      <TableHead className="min-w-[180px] text-xs">Descrição</TableHead>
                      <TableHead className="w-20 text-right text-xs">Unidade</TableHead>
                      <TableHead className="w-28 text-right text-xs">Vlr uni</TableHead>
                      <TableHead className="w-28 text-right text-xs">Total insumos</TableHead>
                      <TableHead className="w-24 text-right text-xs">Imp. R$</TableHead>
                      <TableHead className="w-28 text-right text-xs">Gasto total</TableHead>
                      <TableHead className="w-28 text-right text-xs">Vlr venda bruto</TableHead>
                      <TableHead className="w-26 text-right text-xs">Vlr venda líquido</TableHead>
                      <TableHead className="w-26 text-right text-xs">Vlr final uni</TableHead>
                      <TableHead className="w-26 text-right text-xs">Lucro R$</TableHead>
                      <TableHead className="w-24 text-right text-xs">Lucro %</TableHead>
                      <TableHead className="w-24 text-right text-xs">Roas mínimo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhas.map((linha) => {
                  const unidade = Math.max(1, Math.floor(parseNum(linha.unidade)));
                  const vlrUnit = parseNum(linha.vlrUnitario);
                  const emb = parseNum(linha.embalagem);
                  const etq = parseNum(linha.etiqueta);
                  const fita = parseNum(linha.fita);
                  const mo = parseNum(linha.mo);
                  const nfe = parseNum(linha.nfe);
                  const outros = parseNum(linha.outros);
                  const ttInsumos = Math.round((emb + etq + fita + mo + nfe + outros) * 100) / 100;
                  const vlrBruto = parseNum(linha.vlrVendaBruto);
                  const nfPct = parseNum(nfPercentGlobal) / 100;
                  const impPct = parseNum(impostoPercentGlobal) / 100;
                  const impostoValor =
                    vlrBruto > 0 && nfPct > 0 && impPct > 0
                      ? Math.round((vlrBruto * nfPct * impPct) * 100) / 100
                      : 0;
                  const gastoTotal = Math.round(((vlrUnit * unidade) + ttInsumos + impostoValor) * 100) / 100;
                  const comissao = vlrBruto > 0 ? getComissao(vlrBruto) : 0;
                  const vlrLiquido = Math.round((vlrBruto - comissao) * 100) / 100;
                  const vlrFinalUni = unidade > 0 ? Math.round((vlrLiquido / unidade) * 100) / 100 : 0;
                  const lucroRs = Math.round((vlrLiquido - gastoTotal) * 100) / 100;
                  const lucroPct = vlrBruto > 0 ? lucroRs / vlrBruto : 0;
                      const roasMinimo = lucroPct > 0 ? Math.round((1 / lucroPct) * 100) / 100 : 0;

                      // Cor de fundo por linha
                      const corClasse =
                        linha.corLinha === "amarelo"
                          ? "bg-yellow-50"
                          : linha.corLinha === "verde"
                          ? "bg-green-50"
                          : linha.corLinha === "azul"
                          ? "bg-blue-50"
                          : linha.corLinha === "vermelho"
                          ? "bg-red-50"
                          : "";

                      return (
                        <TableRow key={linha.id} className={corClasse}>
                          <TableCell className="space-x-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => copiarLinha(linha)}
                              title="Copiar produto"
                            >
                              <Copy className="size-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:bg-destructive/10"
                              onClick={() => removeLinha(linha.id)}
                              title="Remover linha"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                            <Select
                              value={linha.corLinha || ""}
                              onValueChange={(v) =>
                                updateLinha(linha.id, "corLinha", v === "nenhuma" ? "" : v)
                              }
                            >
                              <SelectTrigger className="h-7 w-24 text-[11px] mt-1">
                                <SelectValue placeholder="Cor" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="nenhuma">Sem cor</SelectItem>
                                <SelectItem value="amarelo">Amarelo</SelectItem>
                                <SelectItem value="verde">Verde</SelectItem>
                                <SelectItem value="azul">Azul</SelectItem>
                                <SelectItem value="vermelho">Vermelho</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-10 text-sm min-w-[220px]"
                              placeholder="Produto"
                              value={linha.descricao}
                              onChange={(e) => updateLinha(linha.id, "descricao", e.target.value)}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              className="h-10 text-right text-sm min-w-[90px]"
                              inputMode="numeric"
                              placeholder="1"
                              value={linha.unidade}
                              onChange={(e) => updateLinha(linha.id, "unidade", e.target.value)}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              className="h-10 text-right text-sm min-w-[120px]"
                              inputMode="decimal"
                              placeholder="0,00"
                              value={linha.vlrUnitario}
                              onChange={(e) => updateLinha(linha.id, "vlrUnitario", e.target.value)}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <span className="text-xs text-muted-foreground tabular-nums">
                                {ttInsumos > 0 ? formatCurrency(ttInsumos) : "—"}
                              </span>
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                    title="Editar insumos"
                                  >
                                    <Pencil className="size-3.5" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-md">
                                  <DialogHeader>
                                    <DialogTitle>Insumos — {linha.descricao || "Produto"}</DialogTitle>
                                  </DialogHeader>
                                  <div className="grid gap-3 mt-2 text-sm">
                                    <div className="grid grid-cols-2 gap-3">
                                      <div>
                                        <Label className="text-xs">Embalagem (R$)</Label>
                                        <Input
                                          className="mt-1 h-9 text-right text-sm"
                                          inputMode="decimal"
                                          placeholder="0,00"
                                          value={linha.embalagem}
                                          onChange={(e) => updateLinha(linha.id, "embalagem", e.target.value)}
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-xs">Etiqueta (R$)</Label>
                                        <Input
                                          className="mt-1 h-9 text-right text-sm"
                                          inputMode="decimal"
                                          placeholder="0,00"
                                          value={linha.etiqueta}
                                          onChange={(e) => updateLinha(linha.id, "etiqueta", e.target.value)}
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-xs">Fita (R$)</Label>
                                        <Input
                                          className="mt-1 h-9 text-right text-sm"
                                          inputMode="decimal"
                                          placeholder="0,00"
                                          value={linha.fita}
                                          onChange={(e) => updateLinha(linha.id, "fita", e.target.value)}
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-xs">MO (R$)</Label>
                                        <Input
                                          className="mt-1 h-9 text-right text-sm"
                                          inputMode="decimal"
                                          placeholder="0,00"
                                          value={linha.mo}
                                          onChange={(e) => updateLinha(linha.id, "mo", e.target.value)}
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-xs">NFe (R$)</Label>
                                        <Input
                                          className="mt-1 h-9 text-right text-sm"
                                          inputMode="decimal"
                                          placeholder="0,00"
                                          value={linha.nfe}
                                          onChange={(e) => updateLinha(linha.id, "nfe", e.target.value)}
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-xs">Outros (R$)</Label>
                                        <Input
                                          className="mt-1 h-9 text-right text-sm"
                                          inputMode="decimal"
                                          placeholder="0,00"
                                          value={linha.outros}
                                          onChange={(e) => updateLinha(linha.id, "outros", e.target.value)}
                                        />
                                      </div>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      TT insumos: <span className="font-medium">{formatCurrency(ttInsumos)}</span>
                                    </p>
                                  </div>
                                </DialogContent>
                          </Dialog>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground tabular-nums text-xs">
                            {impostoValor > 0 ? formatCurrency(impostoValor) : "—"}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums text-xs">
                            {gastoTotal > 0 ? formatCurrency(gastoTotal) : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              className="h-10 text-right text-sm min-w-[130px]"
                              inputMode="decimal"
                              placeholder="0,00"
                              value={linha.vlrVendaBruto}
                              onChange={(e) => updateLinha(linha.id, "vlrVendaBruto", e.target.value)}
                            />
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums text-xs">
                            {vlrBruto > 0 ? formatCurrency(vlrLiquido) : "—"}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground tabular-nums text-xs">
                            {vlrBruto > 0 && unidade > 0 ? formatCurrency(vlrFinalUni) : "—"}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums text-xs">
                            <Input
                              className="h-8 text-right text-xs"
                              inputMode="decimal"
                              placeholder="0,00"
                              value={
                                linha.lucroOverride !== undefined && linha.lucroOverride !== ""
                                  ? linha.lucroOverride
                                  : vlrBruto > 0
                                  ? lucroRs.toFixed(2).replace(".", ",")
                                  : ""
                              }
                              onChange={(e) => updateLinha(linha.id, "lucroOverride", e.target.value)}
                              onBlur={() => {
                                const alvo = parseNum(linha.lucroOverride || "");
                                if (alvo > 0) {
                                  const novoBruto = calcularVendaBrutaPorLucro(alvo, gastoTotal);
                                  if (novoBruto && isFinite(novoBruto)) {
                                    const vbStr = novoBruto.toFixed(2).replace(".", ",");
                                    setLinhas((prev) =>
                                      prev.map((l) =>
                                        l.id === linha.id
                                          ? { ...l, vlrVendaBruto: vbStr, lucroOverride: "" }
                                          : l
                                      )
                                    );
                                    return;
                                  }
                                }
                                // se não conseguir calcular, só limpa o override para voltar ao valor calculado
                                setLinhas((prev) =>
                                  prev.map((l) =>
                                    l.id === linha.id ? { ...l, lucroOverride: "" } : l
                                  )
                                );
                              }}
                            />
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums text-xs">
                            <Input
                              className="h-8 text-right text-xs"
                              inputMode="decimal"
                              placeholder="0"
                              value={
                                linha.lucroPercentOverride !== undefined && linha.lucroPercentOverride !== ""
                                  ? linha.lucroPercentOverride
                                  : vlrBruto > 0
                                  ? (lucroPct * 100).toFixed(2).replace(".", ",")
                                  : ""
                              }
                              onChange={(e) =>
                                updateLinha(linha.id, "lucroPercentOverride", e.target.value)
                              }
                              onBlur={() => {
                                const pct = parseNum(linha.lucroPercentOverride || "") / 100;
                                if (pct > 0) {
                                  const novoBruto = calcularVendaBrutaPorLucroPercent(pct, gastoTotal);
                                  if (novoBruto && isFinite(novoBruto)) {
                                    const vbStr = novoBruto.toFixed(2).replace(".", ",");
                                    setLinhas((prev) =>
                                      prev.map((l) =>
                                        l.id === linha.id
                                          ? { ...l, vlrVendaBruto: vbStr, lucroPercentOverride: "" }
                                          : l
                                      )
                                    );
                                    return;
                                  }
                                }
                                setLinhas((prev) =>
                                  prev.map((l) =>
                                    l.id === linha.id ? { ...l, lucroPercentOverride: "" } : l
                                  )
                                );
                              }}
                            />
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground tabular-nums text-xs">
                            {vlrBruto > 0 && lucroPct > 0 ? roasMinimo.toFixed(2) : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <Button type="button" variant="outline" size="sm" className="mt-3 h-8 text-xs" onClick={addLinha}>
                <Plus className="size-3.5 mr-1" />
                Adicionar linha
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Placeholders para outros marketplaces */}
        <TabsContent value="mercado-livre">
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              Configuração de precificação para Mercado Livre será adicionada aqui no futuro.
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="shein">
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              Configuração de precificação para Shein será adicionada aqui no futuro.
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="outros">
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              Espaço reservado para outros marketplaces.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
