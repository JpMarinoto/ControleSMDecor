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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { cn } from "../components/ui/utils";
import {
  SHOPEE_FAIXAS_CNPJ,
  calcularComissaoShopee,
} from "../data/shopeeComissao";
import {
  TIKTOK_TAXAS_PADRAO,
  type TiktokTaxasConfig,
  calcularTaxasTiktok,
  calcularVendaBrutaPorLucroTiktok,
  calcularVendaBrutaPorLucroPercentTiktok,
} from "../data/tiktokTaxas";
import { Tag, Plus, Trash2, ExternalLink, Copy, Pencil, ChevronDown, ChevronRight, Music2 } from "lucide-react";
import { toast } from "sonner";
import { api, type PrecificacaoShopeeApiRow, type PrecificacaoTiktokApiRow } from "../lib/api";

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

function mapFromApi(row: PrecificacaoShopeeApiRow): PrecificacaoSalva {
  const raw = row.linhas;
  const linhasNorm: LinhaPrecificacao[] = Array.isArray(raw)
    ? (raw as LinhaPrecificacao[]).map((l, i) => ({
        ...l,
        id: String(l?.id ?? `${row.id}-${i}`),
      }))
    : [];
  return {
    id: String(row.id),
    nome: row.nome,
    dataIso: row.dataIso,
    mesReferencia: row.mesReferencia ?? "",
    nfPercent: row.nfPercent ?? "70",
    impostoPercent: row.impostoPercent ?? "10",
    linhas: linhasNorm,
  };
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

/** Planilha: colunas por tema (preco-col-* em theme.css) + células neutras */
const XL = {
  tituloBarra: "preco-titulo-bloco",
  headBase:
    "border border-border px-0.5 py-0 text-base font-bold leading-none tracking-tight text-foreground align-middle",
  cellBorder: "border border-border",
  branco: "bg-card",
  ttInsumos: "preco-col-insumos",
  vlrBruto: "preco-col-venda-bruto",
  vlrFinalUni: "preco-col-final-uni",
  lucroRs: "preco-col-lucro-rs",
  lucroPct: "preco-col-lucro-pct",
  /**
   * Altura baixa: o Input base usa h-9 — forçar altura fixa pequena e anel de foco fino.
   */
  inputCell:
    "!h-[28px] !min-h-[28px] !py-0 !px-1.5 border-border bg-input-background text-base leading-none tracking-tight tabular-nums shadow-none focus-visible:ring-1 focus-visible:ring-ring/40",
  cellText: "text-base leading-none tracking-tight tabular-nums",
};

/** Planilha Shopee: células compactas + tipografia herdada na tabela. */
const TABELA_PRECO_CLASS =
  "w-full min-w-[1280px] border-collapse text-base leading-none [&_th]:!h-auto [&_th]:min-h-0 [&_th]:!p-px [&_td]:!p-px [&_td]:align-middle";

const LINHA_PRECO_CLASS =
  "border-border hover:bg-transparent [&_td]:transition-[filter] [&_td]:duration-150 hover:[&_td]:brightness-[0.94] dark:hover:[&_td]:brightness-[1.06]";

/** `XL.headBase` já define `leading-none`. */
const thPreco = `${XL.headBase} whitespace-normal`;

const inpPreco = (...extra: string[]) => cn(XL.inputCell, "w-full min-w-0", ...extra);

/** Marcador visual da linha + overlay de fundo nas células quando há cor. `value` persiste no JSON/banco. */
const MARCACAO_CORES: { value: string; label: string; swatch: string; border: string; tintOverlay: string }[] = [
  { value: "", label: "Nenhuma", swatch: "bg-card ring-1 ring-inset ring-border", border: "border-l-[3px] border-l-transparent", tintOverlay: "" },
  { value: "amarelo", label: "Amarelo", swatch: "bg-yellow-400", border: "border-l-[3px] border-l-yellow-400", tintOverlay: "shadow-[inset_0_0_0_9999px_rgba(250,204,21,0.26)]" },
  { value: "lima", label: "Lima", swatch: "bg-lime-500", border: "border-l-[3px] border-l-lime-500", tintOverlay: "shadow-[inset_0_0_0_9999px_rgba(132,204,22,0.26)]" },
  { value: "verde", label: "Verde", swatch: "bg-green-600", border: "border-l-[3px] border-l-green-600", tintOverlay: "shadow-[inset_0_0_0_9999px_rgba(22,163,74,0.24)]" },
  { value: "esmeralda", label: "Esmeralda", swatch: "bg-emerald-600", border: "border-l-[3px] border-l-emerald-600", tintOverlay: "shadow-[inset_0_0_0_9999px_rgba(5,150,105,0.24)]" },
  { value: "teal", label: "Teal", swatch: "bg-teal-600", border: "border-l-[3px] border-l-teal-600", tintOverlay: "shadow-[inset_0_0_0_9999px_rgba(13,148,136,0.24)]" },
  { value: "ciano", label: "Ciano", swatch: "bg-cyan-500", border: "border-l-[3px] border-l-cyan-500", tintOverlay: "shadow-[inset_0_0_0_9999px_rgba(6,182,212,0.24)]" },
  { value: "azul", label: "Azul", swatch: "bg-blue-600", border: "border-l-[3px] border-l-blue-600", tintOverlay: "shadow-[inset_0_0_0_9999px_rgba(37,99,235,0.24)]" },
  { value: "indigo", label: "Índigo", swatch: "bg-indigo-600", border: "border-l-[3px] border-l-indigo-600", tintOverlay: "shadow-[inset_0_0_0_9999px_rgba(79,70,229,0.24)]" },
  { value: "violeta", label: "Violeta", swatch: "bg-violet-600", border: "border-l-[3px] border-l-violet-600", tintOverlay: "shadow-[inset_0_0_0_9999px_rgba(124,58,237,0.24)]" },
  { value: "roxo", label: "Roxo", swatch: "bg-purple-600", border: "border-l-[3px] border-l-purple-600", tintOverlay: "shadow-[inset_0_0_0_9999px_rgba(147,51,234,0.24)]" },
  { value: "fuchsia", label: "Fúcsia", swatch: "bg-fuchsia-500", border: "border-l-[3px] border-l-fuchsia-500", tintOverlay: "shadow-[inset_0_0_0_9999px_rgba(217,70,239,0.24)]" },
  { value: "rosa", label: "Rosa", swatch: "bg-pink-500", border: "border-l-[3px] border-l-pink-500", tintOverlay: "shadow-[inset_0_0_0_9999px_rgba(236,72,153,0.24)]" },
  { value: "vermelho", label: "Vermelho", swatch: "bg-red-500", border: "border-l-[3px] border-l-red-500", tintOverlay: "shadow-[inset_0_0_0_9999px_rgba(239,68,68,0.24)]" },
  { value: "laranja", label: "Laranja", swatch: "bg-orange-500", border: "border-l-[3px] border-l-orange-500", tintOverlay: "shadow-[inset_0_0_0_9999px_rgba(249,115,22,0.24)]" },
  { value: "amb", label: "Âmbar", swatch: "bg-amber-500", border: "border-l-[3px] border-l-amber-500", tintOverlay: "shadow-[inset_0_0_0_9999px_rgba(245,158,11,0.26)]" },
  { value: "marrom", label: "Marrom", swatch: "bg-amber-900", border: "border-l-[3px] border-l-amber-900", tintOverlay: "shadow-[inset_0_0_0_9999px_rgba(120,53,15,0.22)]" },
  { value: "cinza", label: "Cinza", swatch: "bg-slate-500", border: "border-l-[3px] border-l-slate-500", tintOverlay: "shadow-[inset_0_0_0_9999px_rgba(100,116,139,0.24)]" },
  { value: "celeste", label: "Celeste", swatch: "bg-sky-500", border: "border-l-[3px] border-l-sky-500", tintOverlay: "shadow-[inset_0_0_0_9999px_rgba(14,165,233,0.24)]" },
];

function normalizarCorLinha(cor: string | undefined): string {
  const s = (cor ?? "").trim();
  if (s === "nenhuma") return "";
  return s;
}

/** Borda esquerda + tom só nas células brancas (um único `.find` por linha). */
function estiloMarcaLinha(cor: string | undefined): { bordaLinha: string; tintBranco: string } {
  const hit = MARCACAO_CORES.find((c) => c.value === normalizarCorLinha(cor));
  return {
    bordaLinha: hit?.border ?? "border-l-[3px] border-l-transparent",
    tintBranco: hit?.tintOverlay ?? "",
  };
}

/** Cabeçalho da tabela Shopee (topo; repetido só após o usuário mudar a cor da linha, ver estado na página). */
function CabecalhoTabelaPrecificacaoShopee({ repeticao = false }: { repeticao?: boolean }) {
  return (
    <TableRow
      className={cn(
        "border-0 hover:bg-transparent [&_th]:transition-[filter] [&_th]:duration-150 hover:[&_th]:brightness-[0.96]",
        repeticao &&
          "bg-neutral-200/90 shadow-[inset_0_1px_0_0_rgba(0,0,0,0.08)] dark:bg-muted/80 dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]",
      )}
    >
      <TableHead className={`w-[84px] min-w-[84px] max-w-[84px] bg-muted text-center ${thPreco}`}>Ações</TableHead>
      <TableHead className={`w-[176px] min-w-[148px] max-w-[176px] bg-muted text-left ${thPreco}`}>
        Descrição
      </TableHead>
      <TableHead className={`w-[3.5rem] min-w-[3.5rem] bg-muted text-center ${thPreco}`}>Unidade</TableHead>
      <TableHead className={`min-w-[6rem] bg-muted text-center ${thPreco}`}>
        Valor
        <br />
        unitário
      </TableHead>
      <TableHead className={`min-w-[7.5rem] ${XL.ttInsumos} text-center ${thPreco}`}>
        Total
        <br />
        insumos
      </TableHead>
      <TableHead className={`min-w-[6rem] bg-muted text-center ${thPreco}`}>
        Imposto
        <br />
        (R$)
      </TableHead>
      <TableHead className={`min-w-[6.5rem] bg-muted text-center ${thPreco}`}>
        Gasto
        <br />
        total
      </TableHead>
      <TableHead className={`min-w-[7rem] ${XL.vlrBruto} text-center ${thPreco}`}>
        Valor venda
        <br />
        bruto
      </TableHead>
      <TableHead className={`min-w-[7rem] bg-muted text-center ${thPreco}`}>
        Valor venda
        <br />
        líquida
      </TableHead>
      <TableHead className={`min-w-[6.5rem] ${XL.vlrFinalUni} text-center ${thPreco}`}>
        Valor final
        <br />
        unitário
      </TableHead>
      <TableHead className={`min-w-[6rem] ${XL.lucroRs} text-center ${thPreco}`}>
        Lucro
        <br />
        (R$)
      </TableHead>
      <TableHead className={`min-w-[5.5rem] ${XL.lucroPct} text-center ${thPreco}`}>
        Lucro
        <br />
        percentual
      </TableHead>
      <TableHead className={`min-w-[5.5rem] bg-muted text-center font-extrabold ${thPreco}`}>
        Roas
        <br />
        mínimo
      </TableHead>
    </TableRow>
  );
}

function CelulaAcoesPrecificacao({
  linha,
  tintClass,
  onCopiar,
  onRemover,
  onDefinirCor,
}: {
  linha: LinhaPrecificacao;
  tintClass: string;
  onCopiar: () => void;
  onRemover: () => void;
  onDefinirCor: (cor: string) => void;
}) {
  const [corAberto, setCorAberto] = useState(false);
  const atual =
    MARCACAO_CORES.find((c) => c.value === normalizarCorLinha(linha.corLinha)) ??
    MARCACAO_CORES[0];

  return (
    <TableCell
      className={cn(
        `w-[84px] min-w-[84px] max-w-[84px] ${XL.branco} ${XL.cellBorder} align-middle p-px`,
        tintClass,
      )}
    >
      <div className="mx-auto flex w-full flex-col items-stretch gap-px px-px py-0">
        <div className="flex shrink-0 flex-row items-center justify-center gap-px">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-5 w-5 shrink-0 p-0 text-muted-foreground hover:text-foreground"
            onClick={onCopiar}
            title="Copiar linha"
          >
            <Copy className="size-2.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-5 w-5 shrink-0 p-0 text-destructive hover:bg-destructive/10"
            onClick={onRemover}
            title="Remover linha"
          >
            <Trash2 className="size-2.5" />
          </Button>
        </div>
        <Popover open={corAberto} onOpenChange={setCorAberto}>
          <PopoverTrigger asChild>
            <button
              type="button"
              title={`Cor da linha${atual.label ? `: ${atual.label}` : ""}`}
              className="flex h-[28px] w-full min-w-0 shrink-0 items-center justify-center rounded border border-border bg-muted/50 px-0.5 hover:bg-muted"
            >
              <span className={cn("size-3 shrink-0 rounded-sm", atual.swatch)} aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[220px] p-2" align="center" side="right" sideOffset={6}>
            <p className="mb-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Marca da linha
            </p>
            <div className="grid grid-cols-6 gap-1">
              {MARCACAO_CORES.map((c) => (
                <button
                  key={c.value || "__sem"}
                  type="button"
                  aria-label={c.label}
                  title={c.label}
                  onClick={() => {
                    onDefinirCor(c.value);
                    setCorAberto(false);
                  }}
                  className={cn(
                    "size-7 shrink-0 rounded border border-border shadow-sm outline-none transition-transform hover:z-10 hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring",
                    c.swatch,
                normalizarCorLinha(linha.corLinha) === c.value && "ring-2 ring-primary ring-offset-1",
                  )}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </TableCell>
  );
}

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
  const [precificacoesCarregando, setPrecificacoesCarregando] = useState(true);
  const [salvandoPrecificacao, setSalvandoPrecificacao] = useState(false);
  /** Linhas em que o usuário acabou de escolher cor nesta sessão (repete cabeçalho acima, se não for a 1ª linha). */
  const [linhaIdsSubcabecalhoAposCor, setLinhaIdsSubcabecalhoAposCor] = useState<Set<string>>(
    () => new Set(),
  );

  const addLinha = () => setLinhas((prev) => [...prev, emptyLinha()]);

  const removeLinha = (id: string) => {
    if (linhas.length <= 1) {
      toast.info("Mantenha ao menos uma linha.");
      return;
    }
    setLinhas((prev) => prev.filter((l) => l.id !== id));
    setLinhaIdsSubcabecalhoAposCor((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
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

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    (async () => {
      setPrecificacoesCarregando(true);
      try {
        let list = (await api.getPrecificacoesShopee()).map(mapFromApi);
        if (cancelled) return;
        if (list.length === 0) {
          const ls = window.localStorage.getItem("precificacoes_shopee");
          if (ls) {
            try {
              const parsed = JSON.parse(ls) as PrecificacaoSalva[];
              for (const p of parsed) {
                if (!p?.nome?.trim()) continue;
                await api.savePrecificacaoShopee({
                  nome: p.nome.trim(),
                  mesReferencia: p.mesReferencia || "",
                  nfPercent: p.nfPercent || "70",
                  impostoPercent: p.impostoPercent || "10",
                  linhas: p.linhas || [],
                });
              }
              window.localStorage.removeItem("precificacoes_shopee");
              list = (await api.getPrecificacoesShopee()).map(mapFromApi);
            } catch {
              /* mantém lista vazia se import falhar */
            }
          }
        }
        if (!cancelled) setPrecificacoesSalvas(list);
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "Erro ao carregar precificações.");
          setPrecificacoesSalvas([]);
        }
      } finally {
        if (!cancelled) setPrecificacoesCarregando(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const salvarPrecificacao = async () => {
    if (!nomePrecificacao.trim()) {
      toast.error("Informe um nome para a precificação antes de salvar.");
      return;
    }
    setSalvandoPrecificacao(true);
    try {
      await api.savePrecificacaoShopee({
        nome: nomePrecificacao.trim(),
        mesReferencia,
        nfPercent: nfPercentGlobal,
        impostoPercent: impostoPercentGlobal,
        linhas,
      });
      const list = (await api.getPrecificacoesShopee()).map(mapFromApi);
      setPrecificacoesSalvas(list);
      toast.success("Precificação salva no banco de dados.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvandoPrecificacao(false);
    }
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
    setLinhaIdsSubcabecalhoAposCor(new Set());
  };

  const [excluindoPrecificacao, setExcluindoPrecificacao] = useState(false);
  const [confirmExcluirOpen, setConfirmExcluirOpen] = useState(false);
  const precificacaoSelecionadaAlvo = precificacoesSalvas.find((x) => x.id === idSelecionado) || null;

  const solicitarExcluirPrecificacao = () => {
    if (!idSelecionado) {
      toast.info("Selecione uma precificação salva para excluir.");
      return;
    }
    if (!precificacaoSelecionadaAlvo) return;
    setConfirmExcluirOpen(true);
  };

  const excluirPrecificacao = async () => {
    if (!idSelecionado) return;
    setConfirmExcluirOpen(false);
    setExcluindoPrecificacao(true);
    try {
      await api.deletePrecificacaoShopee(idSelecionado);
      const list = (await api.getPrecificacoesShopee()).map(mapFromApi);
      setPrecificacoesSalvas(list);
      setIdSelecionado("");
      setNomePrecificacao("");
      setLinhas([{ ...emptyLinha(), id: "1" }]);
      setLinhaIdsSubcabecalhoAposCor(new Set());
      toast.success("Precificação excluída.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir.");
    } finally {
      setExcluindoPrecificacao(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Precificação</h1>
          <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
            <span className="font-medium text-foreground">Precificação precisa para cálculo de lucros reais:</span>{" "}
            some custo do produto, insumos, impostos sobre a nota, comissão do marketplace e mão de obra para obter o
            gasto total; a partir do preço de venda você vê{" "}
            <span className="font-medium text-foreground">lucro em reais, percentual sobre a venda e ROAS mínimo</span>{" "}
            antes de anunciar — sem confundir margem com lucro líquido.
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
        <TabsList className="mb-2 grid w-full max-w-2xl grid-cols-5 sm:max-w-none bg-muted/50 p-1">
          <TabsTrigger value="shopee" className="text-xs sm:text-sm">
            Shopee
          </TabsTrigger>
          <TabsTrigger value="tiktok" className="text-xs sm:text-sm">
            TikTok Shop
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
          <Card className="dash-tone-flow rounded-sm border-dashed">
            <CardHeader
              className="py-2 px-3 flex items-center justify-between gap-2 cursor-pointer"
              onClick={() => setMostrarTabelaComissao((v) => !v)}
            >
              <div className="flex items-center gap-2">
                {mostrarTabelaComissao ? (
                  <ChevronDown className="size-4 text-[var(--dashboard-flow)]" />
                ) : (
                  <ChevronRight className="size-4 text-[var(--dashboard-flow)]" />
                )}
                <CardTitle className="flex items-center gap-2 text-sm dash-title-flow">
                  <Tag className="size-4 text-[var(--dashboard-flow)]" />
                  Comissão Shopee 2026 (CNPJ)
                </CardTitle>
              </div>
              <a
                href="https://seller.shopee.com.br/edu/article/26839/Comissao-para-vendedores-CNPJ-e-CPF-em-2026"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] dash-title-flow hover:underline inline-flex items-center gap-1 opacity-90 hover:opacity-100"
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

          {/* Tabela de precificação — layout visual tipo Excel */}
          <Card className="overflow-hidden rounded-sm border border-border p-0 shadow-sm">
            <div className={`${XL.tituloBarra} px-4 py-3 text-center sm:text-left`}>
              <h2 className="text-lg font-bold tracking-tight text-primary-foreground">Precificação Shopee</h2>
            </div>
            <div className="flex flex-col gap-2 border-b border-border bg-muted/35 px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-fit text-[11px] border-border bg-background/80"
                onClick={() => setMostrarConfigImposto((v) => !v)}
              >
                Configurar imposto
              </Button>
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
                  className="h-8 px-3 text-[11px]"
                  onClick={() => void salvarPrecificacao()}
                  disabled={salvandoPrecificacao}
                >
                  {salvandoPrecificacao ? "Salvando..." : "Salvar precificação"}
                </Button>
                <Select
                  value={idSelecionado}
                  onValueChange={(v) => {
                    setIdSelecionado(v);
                    carregarPrecificacao(v);
                  }}
                  disabled={precificacoesCarregando}
                >
                  <SelectTrigger className="h-8 w-44 text-xs">
                    <SelectValue placeholder={precificacoesCarregando ? "Carregando..." : "Consultar precificação"} />
                  </SelectTrigger>
                  <SelectContent>
                    {precificacoesSalvas.length === 0 && (
                      <SelectItem value="__none" disabled>
                        {precificacoesCarregando ? "Carregando..." : "Nenhuma salva"}
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-[11px] text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                  onClick={solicitarExcluirPrecificacao}
                  disabled={!idSelecionado || excluindoPrecificacao || precificacoesCarregando}
                  title="Excluir precificação selecionada"
                >
                  <Trash2 className="size-3.5 mr-1" />
                  {excluindoPrecificacao ? "Excluindo..." : "Excluir"}
                </Button>
              </div>
            </div>
            <CardContent className="space-y-2 px-2 pb-3 pt-2 sm:px-3">
              {mostrarConfigImposto && (
                <div className="mb-2 grid gap-2 rounded-sm border bg-muted/40 px-2 py-2 text-[11px] sm:text-xs sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
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
              <div className="overflow-x-auto rounded border border-border bg-card shadow-sm transition-[box-shadow,border-color] duration-200 hover:border-muted-foreground/30 hover:shadow-md">
                <Table className={TABELA_PRECO_CLASS}>
                  <TableHeader>
                    <CabecalhoTabelaPrecificacaoShopee />
                  </TableHeader>
                  <TableBody>
                    {linhas.map((linha, indexLinha) => {
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
                      const repetirCabecalho =
                        linhaIdsSubcabecalhoAposCor.has(linha.id) && indexLinha > 0;
                      const { bordaLinha, tintBranco: tintClass } = estiloMarcaLinha(linha.corLinha);

                      return (
                        <React.Fragment key={linha.id}>
                          {repetirCabecalho && <CabecalhoTabelaPrecificacaoShopee repeticao />}
                        <TableRow className={cn(bordaLinha, LINHA_PRECO_CLASS)}>
                          <CelulaAcoesPrecificacao
                            linha={linha}
                            tintClass={tintClass}
                            onCopiar={() => copiarLinha(linha)}
                            onRemover={() => removeLinha(linha.id)}
                            onDefinirCor={(v) => {
                              updateLinha(linha.id, "corLinha", v);
                              setLinhaIdsSubcabecalhoAposCor((prev) => {
                                const next = new Set(prev);
                                if (normalizarCorLinha(v)) next.add(linha.id);
                                else next.delete(linha.id);
                                return next;
                              });
                            }}
                          />
                          <TableCell
                            className={cn(
                              `${XL.branco} ${XL.cellBorder} align-top w-[176px] min-w-[148px] max-w-[176px] whitespace-normal`,
                              tintClass,
                            )}
                          >
                            <Input
                              className={inpPreco("max-w-full", "text-left")}
                              placeholder="Produto"
                              value={linha.descricao}
                              onChange={(e) => updateLinha(linha.id, "descricao", e.target.value)}
                            />
                          </TableCell>
                          <TableCell
                            className={cn(`min-w-[3.5rem] text-center ${XL.branco} ${XL.cellBorder}`, tintClass)}
                          >
                            <Input
                              className={inpPreco("text-center")}
                              inputMode="numeric"
                              placeholder="1"
                              value={linha.unidade}
                              onChange={(e) => updateLinha(linha.id, "unidade", e.target.value)}
                            />
                          </TableCell>
                          <TableCell
                            className={cn(`min-w-[6rem] text-center ${XL.branco} ${XL.cellBorder}`, tintClass)}
                          >
                            <Input
                              className={inpPreco("text-right")}
                              inputMode="decimal"
                              placeholder="0,00"
                              value={linha.vlrUnitario}
                              onChange={(e) => updateLinha(linha.id, "vlrUnitario", e.target.value)}
                            />
                          </TableCell>
                          <TableCell className={`min-w-[7.5rem] text-right ${XL.ttInsumos} ${XL.cellBorder}`}>
                            <div className="flex min-w-0 items-center justify-end gap-0">
                              <span className={`${XL.cellText} shrink-0 font-medium text-foreground`}>
                                {ttInsumos > 0 ? formatCurrency(ttInsumos) : "—"}
                              </span>
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 shrink-0 text-muted-foreground hover:text-foreground"
                                    title="Editar insumos"
                                  >
                                    <Pencil className="size-2.5" />
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
                          <TableCell
                            className={cn(
                              `min-w-[6rem] text-center ${XL.cellText} text-foreground ${XL.branco} ${XL.cellBorder}`,
                              tintClass,
                            )}
                          >
                            {impostoValor > 0 ? formatCurrency(impostoValor) : "—"}
                          </TableCell>
                          <TableCell
                            className={cn(
                              `min-w-[6.5rem] text-center font-medium ${XL.cellText} ${XL.branco} ${XL.cellBorder}`,
                              tintClass,
                            )}
                          >
                            {gastoTotal > 0 ? formatCurrency(gastoTotal) : "—"}
                          </TableCell>
                          <TableCell className={`min-w-[7rem] text-center ${XL.vlrBruto} ${XL.cellBorder}`}>
                            <Input
                              className={inpPreco("text-right")}
                              inputMode="decimal"
                              placeholder="0,00"
                              value={linha.vlrVendaBruto}
                              onChange={(e) => updateLinha(linha.id, "vlrVendaBruto", e.target.value)}
                            />
                          </TableCell>
                          <TableCell
                            className={cn(
                              `min-w-[7rem] text-center font-medium ${XL.cellText} ${XL.branco} ${XL.cellBorder}`,
                              tintClass,
                            )}
                          >
                            {vlrBruto > 0 ? formatCurrency(vlrLiquido) : "—"}
                          </TableCell>
                          <TableCell
                            className={`min-w-[6.5rem] text-center ${XL.cellText} text-foreground ${XL.vlrFinalUni} ${XL.cellBorder}`}
                          >
                            {vlrBruto > 0 && unidade > 0 ? formatCurrency(vlrFinalUni) : "—"}
                          </TableCell>
                          <TableCell className={`min-w-[6rem] text-center ${XL.lucroRs} ${XL.cellBorder}`}>
                            <Input
                              className={inpPreco("text-right")}
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
                          <TableCell className={`min-w-[5.5rem] text-center ${XL.lucroPct} ${XL.cellBorder}`}>
                            <Input
                              className={inpPreco("text-right")}
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
                          <TableCell
                            className={cn(
                              `min-w-[5.5rem] text-center font-bold ${XL.cellText} text-foreground ${XL.branco} ${XL.cellBorder}`,
                              tintClass,
                            )}
                          >
                            {vlrBruto > 0 && lucroPct > 0 ? roasMinimo.toFixed(2) : "—"}
                          </TableCell>
                        </TableRow>
                        </React.Fragment>
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

        <TabsContent value="tiktok" className="space-y-3">
          <AbaTiktok mesReferencia={mesReferencia} />
        </TabsContent>

        {/* Placeholders para outros marketplaces */}
        <TabsContent value="mercado-livre">
          <Card className="dash-tone-balance border-dashed">
            <CardContent className="py-6 text-sm text-muted-foreground">
              Configuração de precificação para Mercado Livre será adicionada aqui no futuro.
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="shein">
          <Card className="dash-tone-balance border-dashed">
            <CardContent className="py-6 text-sm text-muted-foreground">
              Configuração de precificação para Shein será adicionada aqui no futuro.
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="outros">
          <Card className="dash-tone-balance border-dashed">
            <CardContent className="py-6 text-sm text-muted-foreground">
              Espaço reservado para outros marketplaces.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={confirmExcluirOpen} onOpenChange={setConfirmExcluirOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir precificação?</AlertDialogTitle>
            <AlertDialogDescription>
              {precificacaoSelecionadaAlvo
                ? `Você está prestes a excluir a precificação "${precificacaoSelecionadaAlvo.nome}". Esta ação não pode ser desfeita.`
                : "Esta ação não pode ser desfeita."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindoPrecificacao}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void excluirPrecificacao();
              }}
              disabled={excluindoPrecificacao}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {excluindoPrecificacao ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ============================================================================
 * Aba TikTok Shop — taxas oficiais TikTok Shop Brasil (a partir de 06/02/2026):
 *   • Comissão da plataforma: 6% (cap R$ 50/produto)
 *   • Tarifa fixa por item: R$ 4
 *   • Programa de Taxas de Envio (PTE): 6% (cap R$ 50/produto)
 *   • Comissão de afiliado: definida pelo vendedor (geralmente 8–15%)
 * ========================================================================== */

/** Linha da planilha TikTok: herda os campos da Shopee + % afiliado por linha. */
interface LinhaTiktok extends LinhaPrecificacao {
  /** Override de % afiliado da linha (vazio = usa o padrão global). */
  afiliadoPercentLinha?: string;
}

interface PrecificacaoTiktokSalva {
  id: string;
  nome: string;
  dataIso: string;
  mesReferencia: string;
  nfPercent: string;
  impostoPercent: string;
  afiliadoPercent: string;
  comissaoPercent: string;
  comissaoCap: string;
  tarifaItem: string;
  ptePercent: string;
  pteCap: string;
  participarPte: boolean;
  linhas: LinhaTiktok[];
}

const emptyLinhaTiktok = (): LinhaTiktok => ({
  ...emptyLinha(),
  afiliadoPercentLinha: "",
});

function mapTiktokFromApi(row: PrecificacaoTiktokApiRow): PrecificacaoTiktokSalva {
  const raw = row.linhas;
  const linhasNorm: LinhaTiktok[] = Array.isArray(raw)
    ? (raw as LinhaTiktok[]).map((l, i) => ({
        ...l,
        id: String(l?.id ?? `${row.id}-${i}`),
      }))
    : [];
  return {
    id: String(row.id),
    nome: row.nome,
    dataIso: row.dataIso,
    mesReferencia: row.mesReferencia ?? "",
    nfPercent: row.nfPercent ?? "70",
    impostoPercent: row.impostoPercent ?? "10",
    afiliadoPercent: row.afiliadoPercent ?? "0",
    comissaoPercent: row.comissaoPercent ?? "6",
    comissaoCap: row.comissaoCap ?? "50",
    tarifaItem: row.tarifaItem ?? "4",
    ptePercent: row.ptePercent ?? "6",
    pteCap: row.pteCap ?? "50",
    participarPte: row.participarPte ?? true,
    linhas: linhasNorm,
  };
}

/** Cabeçalho da tabela TikTok (parecido com a Shopee, mas com colunas % Afiliado e TT taxas TikTok). */
function CabecalhoTabelaPrecificacaoTiktok({ repeticao = false }: { repeticao?: boolean }) {
  return (
    <TableRow
      className={cn(
        "border-0 hover:bg-transparent [&_th]:transition-[filter] [&_th]:duration-150 hover:[&_th]:brightness-[0.96]",
        repeticao &&
          "bg-neutral-200/90 shadow-[inset_0_1px_0_0_rgba(0,0,0,0.08)] dark:bg-muted/80 dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]",
      )}
    >
      <TableHead className={`w-[84px] min-w-[84px] max-w-[84px] bg-muted text-center ${thPreco}`}>Ações</TableHead>
      <TableHead className={`w-[176px] min-w-[148px] max-w-[176px] bg-muted text-left ${thPreco}`}>
        Descrição
      </TableHead>
      <TableHead className={`w-[3.5rem] min-w-[3.5rem] bg-muted text-center ${thPreco}`}>Unidade</TableHead>
      <TableHead className={`min-w-[6rem] bg-muted text-center ${thPreco}`}>
        Valor
        <br />
        unitário
      </TableHead>
      <TableHead className={`min-w-[7.5rem] ${XL.ttInsumos} text-center ${thPreco}`}>
        Total
        <br />
        insumos
      </TableHead>
      <TableHead className={`min-w-[6rem] bg-muted text-center ${thPreco}`}>
        Imposto
        <br />
        (R$)
      </TableHead>
      <TableHead className={`min-w-[6.5rem] bg-muted text-center ${thPreco}`}>
        Gasto
        <br />
        total
      </TableHead>
      <TableHead className={`min-w-[7rem] ${XL.vlrBruto} text-center ${thPreco}`}>
        Valor venda
        <br />
        bruto
      </TableHead>
      <TableHead className={`min-w-[5.5rem] bg-muted text-center ${thPreco}`}>
        %<br />Afiliado
      </TableHead>
      <TableHead className={`min-w-[7rem] bg-muted text-center ${thPreco}`}>
        Taxas
        <br />
        TikTok
      </TableHead>
      <TableHead className={`min-w-[7rem] bg-muted text-center ${thPreco}`}>
        Valor venda
        <br />
        líquida
      </TableHead>
      <TableHead className={`min-w-[6.5rem] ${XL.vlrFinalUni} text-center ${thPreco}`}>
        Valor final
        <br />
        unitário
      </TableHead>
      <TableHead className={`min-w-[6rem] ${XL.lucroRs} text-center ${thPreco}`}>
        Lucro
        <br />
        (R$)
      </TableHead>
      <TableHead className={`min-w-[5.5rem] ${XL.lucroPct} text-center ${thPreco}`}>
        Lucro
        <br />
        percentual
      </TableHead>
      <TableHead className={`min-w-[5.5rem] bg-muted text-center font-extrabold ${thPreco}`}>
        Roas
        <br />
        mínimo
      </TableHead>
    </TableRow>
  );
}

function AbaTiktok({ mesReferencia: mesGlobal }: { mesReferencia: string }) {
  const [linhas, setLinhas] = useState<LinhaTiktok[]>([{ ...emptyLinhaTiktok(), id: "1" }]);
  const [mesReferencia, setMesReferencia] = useState<string>(mesGlobal);
  // Sempre que o mês "global" da página mudar, sincroniza (a menos que o usuário já tenha carregado uma salva).
  React.useEffect(() => {
    setMesReferencia(mesGlobal);
  }, [mesGlobal]);

  const [nfPercentGlobal, setNfPercentGlobal] = useState<string>("70");
  const [impostoPercentGlobal, setImpostoPercentGlobal] = useState<string>("10");
  // Configuração de taxas TikTok (default = oficiais do TikTok Shop Brasil 2026).
  const [comissaoPercent, setComissaoPercent] = useState<string>(String(TIKTOK_TAXAS_PADRAO.comissaoPercent * 100));
  const [comissaoCap, setComissaoCap] = useState<string>(String(TIKTOK_TAXAS_PADRAO.comissaoCap));
  const [tarifaItem, setTarifaItem] = useState<string>(String(TIKTOK_TAXAS_PADRAO.tarifaItem));
  const [ptePercent, setPtePercent] = useState<string>(String(TIKTOK_TAXAS_PADRAO.ptePercent * 100));
  const [pteCap, setPteCap] = useState<string>(String(TIKTOK_TAXAS_PADRAO.pteCap));
  const [participarPte, setParticiparPte] = useState<boolean>(TIKTOK_TAXAS_PADRAO.participarPte);
  // % afiliado padrão (cada linha pode sobrescrever).
  const [afiliadoPercentGlobal, setAfiliadoPercentGlobal] = useState<string>("0");

  const [mostrarConfigImposto, setMostrarConfigImposto] = useState(false);
  const [mostrarConfigTaxas, setMostrarConfigTaxas] = useState(false);
  const [mostrarTabelaResumo, setMostrarTabelaResumo] = useState(false);
  const [nomePrecificacao, setNomePrecificacao] = useState<string>("");
  const [precificacoesSalvas, setPrecificacoesSalvas] = useState<PrecificacaoTiktokSalva[]>([]);
  const [idSelecionado, setIdSelecionado] = useState<string>("");
  const [precificacoesCarregando, setPrecificacoesCarregando] = useState(true);
  const [salvandoPrecificacao, setSalvandoPrecificacao] = useState(false);
  const [linhaIdsSubcabecalhoAposCor, setLinhaIdsSubcabecalhoAposCor] = useState<Set<string>>(
    () => new Set(),
  );

  const addLinha = () => setLinhas((prev) => [...prev, emptyLinhaTiktok()]);

  const removeLinha = (id: string) => {
    if (linhas.length <= 1) {
      toast.info("Mantenha ao menos uma linha.");
      return;
    }
    setLinhas((prev) => prev.filter((l) => l.id !== id));
    setLinhaIdsSubcabecalhoAposCor((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const updateLinha = (id: string, field: keyof LinhaTiktok, value: string) => {
    setLinhas((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  };

  const copiarLinha = (linha: LinhaTiktok) => {
    setLinhas((prev) => [...prev, { ...linha, id: String(Date.now()) }]);
  };

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    (async () => {
      setPrecificacoesCarregando(true);
      try {
        const list = (await api.getPrecificacoesTiktok()).map(mapTiktokFromApi);
        if (!cancelled) setPrecificacoesSalvas(list);
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "Erro ao carregar precificações TikTok.");
          setPrecificacoesSalvas([]);
        }
      } finally {
        if (!cancelled) setPrecificacoesCarregando(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const salvarPrecificacao = async () => {
    if (!nomePrecificacao.trim()) {
      toast.error("Informe um nome para a precificação antes de salvar.");
      return;
    }
    setSalvandoPrecificacao(true);
    try {
      await api.savePrecificacaoTiktok({
        nome: nomePrecificacao.trim(),
        mesReferencia,
        nfPercent: nfPercentGlobal,
        impostoPercent: impostoPercentGlobal,
        afiliadoPercent: afiliadoPercentGlobal,
        comissaoPercent,
        comissaoCap,
        tarifaItem,
        ptePercent,
        pteCap,
        participarPte,
        linhas,
      });
      const list = (await api.getPrecificacoesTiktok()).map(mapTiktokFromApi);
      setPrecificacoesSalvas(list);
      toast.success("Precificação TikTok salva no banco de dados.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvandoPrecificacao(false);
    }
  };

  const carregarPrecificacao = (id: string) => {
    const p = precificacoesSalvas.find((x) => x.id === id);
    if (!p) return;
    setIdSelecionado(id);
    setNomePrecificacao(p.nome);
    setMesReferencia(p.mesReferencia || mesGlobal);
    setNfPercentGlobal(p.nfPercent);
    setImpostoPercentGlobal(p.impostoPercent);
    setAfiliadoPercentGlobal(p.afiliadoPercent);
    setComissaoPercent(p.comissaoPercent);
    setComissaoCap(p.comissaoCap);
    setTarifaItem(p.tarifaItem);
    setPtePercent(p.ptePercent);
    setPteCap(p.pteCap);
    setParticiparPte(p.participarPte);
    setLinhas(p.linhas.length ? p.linhas : [{ ...emptyLinhaTiktok(), id: "1" }]);
    setLinhaIdsSubcabecalhoAposCor(new Set());
  };

  const [excluindoPrecificacao, setExcluindoPrecificacao] = useState(false);
  const [confirmExcluirOpen, setConfirmExcluirOpen] = useState(false);
  const precificacaoSelecionadaAlvo = precificacoesSalvas.find((x) => x.id === idSelecionado) || null;

  const solicitarExcluirPrecificacao = () => {
    if (!idSelecionado) {
      toast.info("Selecione uma precificação salva para excluir.");
      return;
    }
    if (!precificacaoSelecionadaAlvo) return;
    setConfirmExcluirOpen(true);
  };

  const excluirPrecificacao = async () => {
    if (!idSelecionado) return;
    setConfirmExcluirOpen(false);
    setExcluindoPrecificacao(true);
    try {
      await api.deletePrecificacaoTiktok(idSelecionado);
      const list = (await api.getPrecificacoesTiktok()).map(mapTiktokFromApi);
      setPrecificacoesSalvas(list);
      setIdSelecionado("");
      setNomePrecificacao("");
      setLinhas([{ ...emptyLinhaTiktok(), id: "1" }]);
      setLinhaIdsSubcabecalhoAposCor(new Set());
      toast.success("Precificação excluída.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir.");
    } finally {
      setExcluindoPrecificacao(false);
    }
  };

  /** Helper: monta o config de taxas TikTok a partir do estado da aba + override da linha. */
  const buildCfg = (afiliadoLinha: string): TiktokTaxasConfig => {
    const afilGlobal = parseNum(afiliadoPercentGlobal) / 100;
    const afilLinhaPct =
      afiliadoLinha && afiliadoLinha.trim() !== "" ? parseNum(afiliadoLinha) / 100 : afilGlobal;
    return {
      comissaoPercent: parseNum(comissaoPercent) / 100,
      comissaoCap: parseNum(comissaoCap),
      tarifaItem: parseNum(tarifaItem),
      ptePercent: parseNum(ptePercent) / 100,
      pteCap: parseNum(pteCap),
      participarPte,
      afiliadoPercent: afilLinhaPct,
    };
  };

  return (
    <>
      {/* Tabela de referência das taxas TikTok (compacta, recolhível) */}
      <Card className="dash-tone-flow rounded-sm border-dashed">
        <CardHeader
          className="py-2 px-3 flex items-center justify-between gap-2 cursor-pointer"
          onClick={() => setMostrarTabelaResumo((v) => !v)}
        >
          <div className="flex items-center gap-2">
            {mostrarTabelaResumo ? (
              <ChevronDown className="size-4 text-[var(--dashboard-flow)]" />
            ) : (
              <ChevronRight className="size-4 text-[var(--dashboard-flow)]" />
            )}
            <CardTitle className="flex items-center gap-2 text-sm dash-title-flow">
              <Music2 className="size-4 text-[var(--dashboard-flow)]" />
              Taxas TikTok Shop 2026
            </CardTitle>
          </div>
          <a
            href="https://seller-br.tiktok.com/university/essay?knowledge_id=3268441302615809&default_language=pt-BR"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] dash-title-flow hover:underline inline-flex items-center gap-1 opacity-90 hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            Ver política <ExternalLink className="size-3" />
          </a>
        </CardHeader>
        {mostrarTabelaResumo && (
          <CardContent className="pt-0 px-2 pb-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Taxa</TableHead>
                  <TableHead className="text-right text-xs">Valor padrão</TableHead>
                  <TableHead className="text-right text-xs">Limite (R$)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="text-xs">Comissão da plataforma</TableCell>
                  <TableCell className="text-right text-xs">6% sobre o pedido</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">R$ 50 / produto</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-xs">Tarifa por item vendido</TableCell>
                  <TableCell className="text-right text-xs">R$ 4 fixo</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">—</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-xs">Programa de Taxas de Envio (PTE)</TableCell>
                  <TableCell className="text-right text-xs">6% sobre o pedido</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">R$ 50 / produto</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-xs">Comissão de afiliado/criador</TableCell>
                  <TableCell className="text-right text-xs">Definida pelo vendedor (8–15% típico)</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">—</TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <p className="mt-2 text-[10px] text-muted-foreground">
              Fonte: Central do Vendedor TikTok Shop &gt; Finanças &gt; Faturas. Taxas vigentes a partir de
              06/02/2026; valores ficam editáveis abaixo caso a plataforma atualize.
            </p>
          </CardContent>
        )}
      </Card>

      {/* Tabela de precificação TikTok */}
      <Card className="overflow-hidden rounded-sm border border-border p-0 shadow-sm">
        <div className={`${XL.tituloBarra} px-4 py-3 text-center sm:text-left`}>
          <h2 className="text-lg font-bold tracking-tight text-primary-foreground">Precificação TikTok Shop</h2>
        </div>
        <div className="flex flex-col gap-2 border-b border-border bg-muted/35 px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-fit text-[11px] border-border bg-background/80"
              onClick={() => setMostrarConfigImposto((v) => !v)}
            >
              Configurar imposto
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-fit text-[11px] border-border bg-background/80"
              onClick={() => setMostrarConfigTaxas((v) => !v)}
            >
              Configurar taxas TikTok
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
              className="h-8 px-3 text-[11px]"
              onClick={() => void salvarPrecificacao()}
              disabled={salvandoPrecificacao}
            >
              {salvandoPrecificacao ? "Salvando..." : "Salvar precificação"}
            </Button>
            <Select
              value={idSelecionado}
              onValueChange={(v) => {
                setIdSelecionado(v);
                carregarPrecificacao(v);
              }}
              disabled={precificacoesCarregando}
            >
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue
                  placeholder={precificacoesCarregando ? "Carregando..." : "Consultar precificação"}
                />
              </SelectTrigger>
              <SelectContent>
                {precificacoesSalvas.length === 0 && (
                  <SelectItem value="__none" disabled>
                    {precificacoesCarregando ? "Carregando..." : "Nenhuma salva"}
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2 text-[11px] text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
              onClick={solicitarExcluirPrecificacao}
              disabled={!idSelecionado || excluindoPrecificacao || precificacoesCarregando}
              title="Excluir precificação selecionada"
            >
              <Trash2 className="size-3.5 mr-1" />
              {excluindoPrecificacao ? "Excluindo..." : "Excluir"}
            </Button>
          </div>
        </div>
        <CardContent className="space-y-2 px-2 pb-3 pt-2 sm:px-3">
          {mostrarConfigImposto && (
            <div className="mb-2 grid gap-2 rounded-sm border bg-muted/40 px-2 py-2 text-[11px] sm:text-xs sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="tk-nfPercent" className="text-[11px]">
                  % do valor na NF
                </Label>
                <Input
                  id="tk-nfPercent"
                  className="h-7 w-16 text-right text-[11px]"
                  inputMode="decimal"
                  value={nfPercentGlobal}
                  onChange={(e) => setNfPercentGlobal(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Label htmlFor="tk-impPercent" className="text-[11px]">
                  % imposto sobre NF
                </Label>
                <Input
                  id="tk-impPercent"
                  className="h-7 w-16 text-right text-[11px]"
                  inputMode="decimal"
                  value={impostoPercentGlobal}
                  onChange={(e) => setImpostoPercentGlobal(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Label htmlFor="tk-afilPadrao" className="text-[11px]">
                  % afiliado padrão
                </Label>
                <Input
                  id="tk-afilPadrao"
                  className="h-7 w-16 text-right text-[11px]"
                  inputMode="decimal"
                  value={afiliadoPercentGlobal}
                  onChange={(e) => setAfiliadoPercentGlobal(e.target.value)}
                />
              </div>
              <p className="col-span-full text-[10px] text-muted-foreground">
                Imposto (R$) = Venda bruta × (% NF / 100) × (% imposto / 100). O % afiliado padrão é
                aplicado em todas as linhas que não tiverem um valor específico.
              </p>
            </div>
          )}
          {mostrarConfigTaxas && (
            <div className="mb-2 grid gap-2 rounded-sm border bg-muted/40 px-2 py-2 text-[11px] sm:text-xs sm:grid-cols-[repeat(3,minmax(0,1fr))]">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="tk-comPercent" className="text-[11px]">
                  % Comissão plataforma
                </Label>
                <Input
                  id="tk-comPercent"
                  className="h-7 w-16 text-right text-[11px]"
                  inputMode="decimal"
                  value={comissaoPercent}
                  onChange={(e) => setComissaoPercent(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Label htmlFor="tk-comCap" className="text-[11px]">
                  Cap comissão (R$)
                </Label>
                <Input
                  id="tk-comCap"
                  className="h-7 w-16 text-right text-[11px]"
                  inputMode="decimal"
                  value={comissaoCap}
                  onChange={(e) => setComissaoCap(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Label htmlFor="tk-tarItem" className="text-[11px]">
                  Tarifa fixa por item (R$)
                </Label>
                <Input
                  id="tk-tarItem"
                  className="h-7 w-16 text-right text-[11px]"
                  inputMode="decimal"
                  value={tarifaItem}
                  onChange={(e) => setTarifaItem(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Label htmlFor="tk-ptePercent" className="text-[11px]">
                  % PTE (envio)
                </Label>
                <Input
                  id="tk-ptePercent"
                  className="h-7 w-16 text-right text-[11px]"
                  inputMode="decimal"
                  value={ptePercent}
                  onChange={(e) => setPtePercent(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Label htmlFor="tk-pteCap" className="text-[11px]">
                  Cap PTE (R$)
                </Label>
                <Input
                  id="tk-pteCap"
                  className="h-7 w-16 text-right text-[11px]"
                  inputMode="decimal"
                  value={pteCap}
                  onChange={(e) => setPteCap(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  id="tk-participarPte"
                  type="checkbox"
                  className="size-3.5 cursor-pointer accent-[var(--primary)]"
                  checked={participarPte}
                  onChange={(e) => setParticiparPte(e.target.checked)}
                />
                <Label htmlFor="tk-participarPte" className="text-[11px] cursor-pointer select-none">
                  Inscrito no Programa de Taxas de Envio (PTE)
                </Label>
              </div>
              <p className="col-span-full text-[10px] text-muted-foreground">
                Padrão TikTok Shop Brasil 2026: comissão 6% (cap R$ 50/produto), tarifa fixa R$ 4 por item,
                PTE 6% (cap R$ 50/produto). Vendedores fora do PTE não pagam a taxa de envio.
              </p>
            </div>
          )}

          <div className="overflow-x-auto rounded border border-border bg-card shadow-sm transition-[box-shadow,border-color] duration-200 hover:border-muted-foreground/30 hover:shadow-md">
            <Table className={TABELA_PRECO_CLASS}>
              <TableHeader>
                <CabecalhoTabelaPrecificacaoTiktok />
              </TableHeader>
              <TableBody>
                {linhas.map((linha, indexLinha) => {
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
                      ? Math.round(vlrBruto * nfPct * impPct * 100) / 100
                      : 0;
                  const gastoTotal =
                    Math.round((vlrUnit * unidade + ttInsumos + impostoValor) * 100) / 100;

                  const cfg = buildCfg(linha.afiliadoPercentLinha ?? "");
                  const taxas = vlrBruto > 0 ? calcularTaxasTiktok(vlrBruto, cfg) : null;
                  const taxasTotal = taxas ? taxas.total : 0;
                  const vlrLiquido = Math.round((vlrBruto - taxasTotal) * 100) / 100;
                  const vlrFinalUni =
                    unidade > 0 ? Math.round((vlrLiquido / unidade) * 100) / 100 : 0;
                  const lucroRs = Math.round((vlrLiquido - gastoTotal) * 100) / 100;
                  const lucroPct = vlrBruto > 0 ? lucroRs / vlrBruto : 0;
                  const roasMinimo =
                    lucroPct > 0 ? Math.round((1 / lucroPct) * 100) / 100 : 0;
                  const repetirCabecalho =
                    linhaIdsSubcabecalhoAposCor.has(linha.id) && indexLinha > 0;
                  const { bordaLinha, tintBranco: tintClass } = estiloMarcaLinha(linha.corLinha);
                  const afilEfetivoPct =
                    linha.afiliadoPercentLinha && linha.afiliadoPercentLinha.trim() !== ""
                      ? parseNum(linha.afiliadoPercentLinha)
                      : parseNum(afiliadoPercentGlobal);

                  return (
                    <React.Fragment key={linha.id}>
                      {repetirCabecalho && <CabecalhoTabelaPrecificacaoTiktok repeticao />}
                      <TableRow className={cn(bordaLinha, LINHA_PRECO_CLASS)}>
                        <CelulaAcoesPrecificacao
                          linha={linha}
                          tintClass={tintClass}
                          onCopiar={() => copiarLinha(linha)}
                          onRemover={() => removeLinha(linha.id)}
                          onDefinirCor={(v) => {
                            updateLinha(linha.id, "corLinha", v);
                            setLinhaIdsSubcabecalhoAposCor((prev) => {
                              const next = new Set(prev);
                              if (normalizarCorLinha(v)) next.add(linha.id);
                              else next.delete(linha.id);
                              return next;
                            });
                          }}
                        />
                        <TableCell
                          className={cn(
                            `${XL.branco} ${XL.cellBorder} align-top w-[176px] min-w-[148px] max-w-[176px] whitespace-normal`,
                            tintClass,
                          )}
                        >
                          <Input
                            className={inpPreco("max-w-full", "text-left")}
                            placeholder="Produto"
                            value={linha.descricao}
                            onChange={(e) => updateLinha(linha.id, "descricao", e.target.value)}
                          />
                        </TableCell>
                        <TableCell
                          className={cn(`min-w-[3.5rem] text-center ${XL.branco} ${XL.cellBorder}`, tintClass)}
                        >
                          <Input
                            className={inpPreco("text-center")}
                            inputMode="numeric"
                            placeholder="1"
                            value={linha.unidade}
                            onChange={(e) => updateLinha(linha.id, "unidade", e.target.value)}
                          />
                        </TableCell>
                        <TableCell
                          className={cn(`min-w-[6rem] text-center ${XL.branco} ${XL.cellBorder}`, tintClass)}
                        >
                          <Input
                            className={inpPreco("text-right")}
                            inputMode="decimal"
                            placeholder="0,00"
                            value={linha.vlrUnitario}
                            onChange={(e) => updateLinha(linha.id, "vlrUnitario", e.target.value)}
                          />
                        </TableCell>
                        <TableCell className={`min-w-[7.5rem] text-right ${XL.ttInsumos} ${XL.cellBorder}`}>
                          <div className="flex min-w-0 items-center justify-end gap-0">
                            <span className={`${XL.cellText} shrink-0 font-medium text-foreground`}>
                              {ttInsumos > 0 ? formatCurrency(ttInsumos) : "—"}
                            </span>
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 shrink-0 text-muted-foreground hover:text-foreground"
                                  title="Editar insumos"
                                >
                                  <Pencil className="size-2.5" />
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
                                    TT insumos:{" "}
                                    <span className="font-medium">{formatCurrency(ttInsumos)}</span>
                                  </p>
                                </div>
                              </DialogContent>
                            </Dialog>
                          </div>
                        </TableCell>
                        <TableCell
                          className={cn(
                            `min-w-[6rem] text-center ${XL.cellText} text-foreground ${XL.branco} ${XL.cellBorder}`,
                            tintClass,
                          )}
                        >
                          {impostoValor > 0 ? formatCurrency(impostoValor) : "—"}
                        </TableCell>
                        <TableCell
                          className={cn(
                            `min-w-[6.5rem] text-center font-medium ${XL.cellText} ${XL.branco} ${XL.cellBorder}`,
                            tintClass,
                          )}
                        >
                          {gastoTotal > 0 ? formatCurrency(gastoTotal) : "—"}
                        </TableCell>
                        <TableCell className={`min-w-[7rem] text-center ${XL.vlrBruto} ${XL.cellBorder}`}>
                          <Input
                            className={inpPreco("text-right")}
                            inputMode="decimal"
                            placeholder="0,00"
                            value={linha.vlrVendaBruto}
                            onChange={(e) => updateLinha(linha.id, "vlrVendaBruto", e.target.value)}
                          />
                        </TableCell>
                        <TableCell
                          className={cn(`min-w-[5.5rem] text-center ${XL.branco} ${XL.cellBorder}`, tintClass)}
                        >
                          <Input
                            className={inpPreco("text-right")}
                            inputMode="decimal"
                            placeholder={afiliadoPercentGlobal || "0"}
                            title={`Vazio = usa o padrão global (${afiliadoPercentGlobal || "0"}%).`}
                            value={linha.afiliadoPercentLinha ?? ""}
                            onChange={(e) => updateLinha(linha.id, "afiliadoPercentLinha", e.target.value)}
                          />
                        </TableCell>
                        <TableCell
                          className={cn(
                            `min-w-[7rem] text-right ${XL.cellText} ${XL.branco} ${XL.cellBorder}`,
                            tintClass,
                          )}
                          title={
                            taxas
                              ? [
                                  `Comissão plataforma: ${formatCurrency(taxas.comissao)}`,
                                  `Tarifa por item: ${formatCurrency(taxas.tarifaItem)}`,
                                  `PTE (envio): ${formatCurrency(taxas.pte)}`,
                                  `Afiliado (${afilEfetivoPct.toFixed(2).replace(".", ",")}%): ${formatCurrency(
                                    taxas.afiliado,
                                  )}`,
                                ].join("\n")
                              : "Informe o valor de venda bruto para calcular as taxas."
                          }
                        >
                          <div className="flex min-w-0 items-center justify-end gap-0 px-1">
                            <span className="shrink-0 font-medium text-foreground">
                              {taxas ? formatCurrency(taxas.total) : "—"}
                            </span>
                            {taxas && (
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 shrink-0 text-muted-foreground hover:text-foreground"
                                    title="Detalhar taxas TikTok"
                                  >
                                    <Pencil className="size-2.5" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-sm">
                                  <DialogHeader>
                                    <DialogTitle>
                                      Taxas TikTok — {linha.descricao || "Produto"}
                                    </DialogTitle>
                                  </DialogHeader>
                                  <div className="mt-2 space-y-1.5 text-sm">
                                    <div className="flex justify-between">
                                      <span>Comissão plataforma ({(cfg.comissaoPercent * 100).toFixed(2).replace(".", ",")}%)</span>
                                      <span className="font-medium">{formatCurrency(taxas.comissao)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Tarifa por item</span>
                                      <span className="font-medium">{formatCurrency(taxas.tarifaItem)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>
                                        PTE — envio ({(cfg.ptePercent * 100).toFixed(2).replace(".", ",")}%)
                                        {!cfg.participarPte && " — não inscrito"}
                                      </span>
                                      <span className="font-medium">{formatCurrency(taxas.pte)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>
                                        Afiliado ({(cfg.afiliadoPercent * 100).toFixed(2).replace(".", ",")}%)
                                      </span>
                                      <span className="font-medium">{formatCurrency(taxas.afiliado)}</span>
                                    </div>
                                    <div className="mt-2 flex justify-between border-t pt-2 text-base">
                                      <span className="font-semibold">Total de taxas</span>
                                      <span className="font-bold">{formatCurrency(taxas.total)}</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      Comissão e PTE têm teto de R$ {cfg.comissaoCap.toFixed(2)} e R$ {cfg.pteCap.toFixed(2)} por
                                      produto. Afiliado só incide quando há venda via campanha de afiliados;
                                      use 0% se este produto não estiver no programa de afiliados.
                                    </p>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            )}
                          </div>
                        </TableCell>
                        <TableCell
                          className={cn(
                            `min-w-[7rem] text-center font-medium ${XL.cellText} ${XL.branco} ${XL.cellBorder}`,
                            tintClass,
                          )}
                        >
                          {vlrBruto > 0 ? formatCurrency(vlrLiquido) : "—"}
                        </TableCell>
                        <TableCell
                          className={`min-w-[6.5rem] text-center ${XL.cellText} text-foreground ${XL.vlrFinalUni} ${XL.cellBorder}`}
                        >
                          {vlrBruto > 0 && unidade > 0 ? formatCurrency(vlrFinalUni) : "—"}
                        </TableCell>
                        <TableCell className={`min-w-[6rem] text-center ${XL.lucroRs} ${XL.cellBorder}`}>
                          <Input
                            className={inpPreco("text-right")}
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
                                const novoBruto = calcularVendaBrutaPorLucroTiktok(alvo, gastoTotal, cfg);
                                if (novoBruto && isFinite(novoBruto)) {
                                  const vbStr = novoBruto.toFixed(2).replace(".", ",");
                                  setLinhas((prev) =>
                                    prev.map((l) =>
                                      l.id === linha.id
                                        ? { ...l, vlrVendaBruto: vbStr, lucroOverride: "" }
                                        : l,
                                    ),
                                  );
                                  return;
                                }
                              }
                              setLinhas((prev) =>
                                prev.map((l) =>
                                  l.id === linha.id ? { ...l, lucroOverride: "" } : l,
                                ),
                              );
                            }}
                          />
                        </TableCell>
                        <TableCell className={`min-w-[5.5rem] text-center ${XL.lucroPct} ${XL.cellBorder}`}>
                          <Input
                            className={inpPreco("text-right")}
                            inputMode="decimal"
                            placeholder="0"
                            value={
                              linha.lucroPercentOverride !== undefined &&
                              linha.lucroPercentOverride !== ""
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
                                const novoBruto = calcularVendaBrutaPorLucroPercentTiktok(
                                  pct,
                                  gastoTotal,
                                  cfg,
                                );
                                if (novoBruto && isFinite(novoBruto)) {
                                  const vbStr = novoBruto.toFixed(2).replace(".", ",");
                                  setLinhas((prev) =>
                                    prev.map((l) =>
                                      l.id === linha.id
                                        ? {
                                            ...l,
                                            vlrVendaBruto: vbStr,
                                            lucroPercentOverride: "",
                                          }
                                        : l,
                                    ),
                                  );
                                  return;
                                }
                              }
                              setLinhas((prev) =>
                                prev.map((l) =>
                                  l.id === linha.id ? { ...l, lucroPercentOverride: "" } : l,
                                ),
                              );
                            }}
                          />
                        </TableCell>
                        <TableCell
                          className={cn(
                            `min-w-[5.5rem] text-center font-bold ${XL.cellText} text-foreground ${XL.branco} ${XL.cellBorder}`,
                            tintClass,
                          )}
                        >
                          {vlrBruto > 0 && lucroPct > 0 ? roasMinimo.toFixed(2) : "—"}
                        </TableCell>
                      </TableRow>
                    </React.Fragment>
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

      <AlertDialog open={confirmExcluirOpen} onOpenChange={setConfirmExcluirOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir precificação?</AlertDialogTitle>
            <AlertDialogDescription>
              {precificacaoSelecionadaAlvo
                ? `Você está prestes a excluir a precificação "${precificacaoSelecionadaAlvo.nome}". Esta ação não pode ser desfeita.`
                : "Esta ação não pode ser desfeita."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindoPrecificacao}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void excluirPrecificacao();
              }}
              disabled={excluindoPrecificacao}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {excluindoPrecificacao ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
