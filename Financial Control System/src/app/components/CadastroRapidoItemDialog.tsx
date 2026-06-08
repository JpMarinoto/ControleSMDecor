import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Checkbox } from "./ui/checkbox";
import { api } from "../lib/api";
import { formatCurrencyBrl } from "../lib/format";
import { toast } from "sonner";

export type CadastroRapidoModo = "produto-venda" | "produto-compra" | "material-compra";

type Categoria = { id: number | string; nome?: string; tipo?: string };
type Fornecedor = { id: number | string; nome?: string; nomeRazaoSocial?: string };
type Material = {
  id: number | string;
  nome?: string;
  precoUnitarioBase?: number;
  preco_unitario_base?: number;
  precoFabricacao?: number | null;
  preco_fabricacao?: number | null;
};

type InsumoForm = {
  material: number;
  material_nome: string;
  quantidade: number;
  preco_unitario_base: number;
  total_insumo: number;
};

type CalcProdutoSource = "preco_venda" | "preco_custo" | "margem" | null;

function q4(n: number) {
  return Math.round(n * 10000) / 10000;
}

const fmtDecimalPt = (n: number) =>
  Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 4 });

const fmtPercentBr = (n: number) =>
  q4(n).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function parseDecimal(raw: string): number | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  const v = parseFloat(t.replace(",", "."));
  return Number.isNaN(v) ? null : v;
}

function precoUnitarioInsumoMaterial(m: Material): number {
  const fab = m.precoFabricacao ?? m.preco_fabricacao;
  if (fab != null && !Number.isNaN(Number(fab))) return Number(fab);
  return Number(m.precoUnitarioBase ?? m.preco_unitario_base) || 0;
}

const TITULOS: Record<CadastroRapidoModo, string> = {
  "produto-venda": "Cadastrar produto",
  "produto-compra": "Cadastrar produto (revenda)",
  "material-compra": "Cadastrar material",
};

type Props = {
  modo: CadastroRapidoModo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (item: Record<string, unknown>) => void;
  fornecedorId?: string;
  isChefe?: boolean;
};

export function CadastroRapidoItemDialog({
  modo,
  open,
  onOpenChange,
  onCreated,
  fornecedorId,
  isChefe = true,
}: Props) {
  const isProduto = modo === "produto-venda" || modo === "produto-compra";
  const isCompraRevenda = modo === "produto-compra";

  const [nome, setNome] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [precoVenda, setPrecoVenda] = useState("");
  const [precoCusto, setPrecoCusto] = useState("");
  const [margemLucro, setMargemLucro] = useState("");
  const [calcSource, setCalcSource] = useState<CalcProdutoSource>(null);
  const [produtoFabricado, setProdutoFabricado] = useState(false);
  const [fornecedorProduto, setFornecedorProduto] = useState("");
  const [maoObra, setMaoObra] = useState("");
  const [materialInsumo, setMaterialInsumo] = useState("");
  const [quantidadeInsumo, setQuantidadeInsumo] = useState("");
  const [insumos, setInsumos] = useState<InsumoForm[]>([]);
  const [precoFabricacao, setPrecoFabricacao] = useState("");

  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [saving, setSaving] = useState(false);

  const custoMateriais = useMemo(
    () => insumos.reduce((acc, i) => acc + (Number(i.total_insumo) || 0), 0),
    [insumos],
  );
  const maoObraNum = parseDecimal(maoObra) ?? 0;
  const custoTotalFabricacao = custoMateriais + maoObraNum;

  const resetForm = () => {
    setNome("");
    setCategoriaId("");
    setPrecoVenda("");
    setPrecoCusto("");
    setMargemLucro("");
    setCalcSource(null);
    setProdutoFabricado(false);
    setFornecedorProduto("");
    setMaoObra("");
    setMaterialInsumo("");
    setQuantidadeInsumo("");
    setInsumos([]);
    setPrecoFabricacao("");
  };

  useEffect(() => {
    if (!open) {
      resetForm();
      return;
    }
    if (fornecedorId) {
      if (isProduto) setFornecedorProduto(fornecedorId);
      else setFornecedorProduto(fornecedorId);
    }
    const tipoCat = isProduto ? "produto" : "material";
    Promise.all([
      api.getCategorias().catch(() => []),
      api.getFornecedores().catch(() => []),
      isProduto ? api.getMateriais().catch(() => []) : Promise.resolve([]),
    ]).then(([cats, forns, mats]) => {
      setCategorias(
        (Array.isArray(cats) ? cats : []).filter((c: Categoria) => c.tipo === tipoCat),
      );
      setFornecedores(Array.isArray(forns) ? forns : []);
      setMateriais(Array.isArray(mats) ? mats : []);
    });
  }, [open, isProduto, fornecedorId]);

  useEffect(() => {
    if (!produtoFabricado) return;
    setCalcSource("preco_custo");
    setPrecoCusto(fmtDecimalPt(custoTotalFabricacao));
    const margem = parseDecimal(margemLucro);
    if (margem != null) {
      setPrecoVenda(fmtDecimalPt(custoTotalFabricacao * (1 + margem / 100)));
    }
  }, [produtoFabricado, custoTotalFabricacao, margemLucro]);

  const adicionarInsumo = () => {
    const mat = materiais.find((m) => String(m.id) === String(materialInsumo));
    const qtd = parseDecimal(quantidadeInsumo);
    if (!mat || qtd == null || qtd <= 0) {
      toast.error("Selecione material e quantidade válida");
      return;
    }
    const precoBase = precoUnitarioInsumoMaterial(mat);
    const total = precoBase * qtd;
    setInsumos((prev) => {
      const idx = prev.findIndex((i) => i.material === Number(mat.id));
      if (idx >= 0) {
        const clone = [...prev];
        const newQtd = clone[idx].quantidade + qtd;
        clone[idx] = {
          ...clone[idx],
          quantidade: newQtd,
          preco_unitario_base: precoBase,
          total_insumo: newQtd * precoBase,
        };
        return clone;
      }
      return [
        ...prev,
        {
          material: Number(mat.id),
          material_nome: String(mat.nome ?? ""),
          quantidade: qtd,
          preco_unitario_base: precoBase,
          total_insumo: total,
        },
      ];
    });
    setMaterialInsumo("");
    setQuantidadeInsumo("");
  };

  const handleSubmitProduto = async () => {
    if (!nome.trim() || !categoriaId || !precoVenda.trim()) {
      toast.error("Preencha categoria, nome e preço de venda");
      return;
    }
    const venda = parseDecimal(precoVenda);
    if (venda == null || venda < 0) {
      toast.error("Preço de venda inválido");
      return;
    }
    const custo = parseDecimal(precoCusto);
    const margem = parseDecimal(margemLucro);
    const mao = parseDecimal(maoObra);

    const payload = {
      nome: nome.trim(),
      categoria: Number(categoriaId),
      preco_venda: q4(venda),
      descricao: "",
      revenda: isCompraRevenda,
      fabricado: produtoFabricado,
      fornecedor: fornecedorProduto ? Number(fornecedorProduto) : null,
      preco_custo: q4(custo != null && custo >= 0 ? custo : 0),
      mao_obra_unitaria: q4(mao != null && mao >= 0 ? mao : 0),
      margem_lucro_percent: q4(margem != null ? margem : 0),
      insumos: produtoFabricado
        ? insumos.map((i) => ({ material: i.material, quantidade: q4(Number(i.quantidade)) }))
        : [],
    };

    setSaving(true);
    try {
      const created = (await api.createProduto(payload)) as Record<string, unknown>;
      toast.success("Produto cadastrado");
      onCreated(created);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao cadastrar produto");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitMaterial = async () => {
    if (!nome.trim()) {
      toast.error("Informe o nome do material");
      return;
    }
    if (!categoriaId) {
      toast.error("Selecione a categoria");
      return;
    }
    if (!fornecedorProduto) {
      toast.error("Selecione o fornecedor");
      return;
    }

    let preco = 0;
    if (isChefe) {
      if (!precoVenda.trim()) {
        toast.error("Informe o preço base");
        return;
      }
      preco = parseDecimal(precoVenda) ?? NaN;
      if (Number.isNaN(preco) || preco < 0) {
        toast.error("Preço base inválido");
        return;
      }
    }

    const payload: Record<string, unknown> = {
      nome: nome.trim(),
      categoria: Number(categoriaId),
      fornecedor_padrao: Number(fornecedorProduto),
      preco_unitario_base: q4(preco),
      precoUnitarioBase: q4(preco),
    };

    if (isChefe) {
      const fabRaw = precoFabricacao.trim();
      if (fabRaw) {
        const pf = parseDecimal(fabRaw);
        if (pf == null || pf < 0) {
          toast.error("Preço de fabricação inválido");
          return;
        }
        payload.preco_fabricacao = q4(pf);
        payload.precoFabricacao = q4(pf);
      }
    }

    setSaving(true);
    try {
      const created = (await api.createMaterial(payload)) as Record<string, unknown>;
      toast.success("Material cadastrado");
      onCreated(created);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao cadastrar material");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isProduto) void handleSubmitProduto();
    else void handleSubmitMaterial();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92vh,900px)] w-[min(96vw,42rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>{TITULOS[modo]}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
            {isProduto ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="cr-categoria">Categoria *</Label>
                    {categorias.length > 0 ? (
                      <Select value={categoriaId} onValueChange={setCategoriaId}>
                        <SelectTrigger id="cr-categoria">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {categorias.map((c) => (
                            <SelectItem key={String(c.id)} value={String(c.id)}>
                              {c.nome ?? `Categoria #${c.id}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-sm text-muted-foreground">Cadastre uma categoria de produto primeiro.</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cr-nome-produto">Nome *</Label>
                    <Input
                      id="cr-nome-produto"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Nome do produto"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="cr-preco-venda">Preço de venda *</Label>
                    <Input
                      id="cr-preco-venda"
                      type="text"
                      inputMode="decimal"
                      value={precoVenda}
                      onChange={(e) => {
                        setCalcSource("preco_venda");
                        setPrecoVenda(e.target.value);
                        const venda = parseDecimal(e.target.value);
                        const custo = parseDecimal(precoCusto);
                        if (venda != null && custo != null && custo > 0) {
                          setMargemLucro(fmtPercentBr((venda / custo - 1) * 100));
                        }
                      }}
                      placeholder="0,00"
                    />
                  </div>
                </div>

                {!isCompraRevenda && (
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="cr-fabricado"
                      checked={produtoFabricado}
                      onCheckedChange={(v) => setProdutoFabricado(v === true)}
                    />
                    <Label htmlFor="cr-fabricado" className="cursor-pointer font-normal">
                      Produto fabricado (composição por materiais)
                    </Label>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="cr-fornecedor-produto">Fornecedor</Label>
                    <Select
                      value={fornecedorProduto || undefined}
                      onValueChange={setFornecedorProduto}
                      disabled={isCompraRevenda && !!fornecedorId}
                    >
                      <SelectTrigger id="cr-fornecedor-produto">
                        <SelectValue placeholder="Selecione (opcional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {fornecedores.map((f) => (
                          <SelectItem key={String(f.id)} value={String(f.id)}>
                            {f.nome ?? f.nomeRazaoSocial ?? `Fornecedor #${f.id}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fornecedorProduto && !isCompraRevenda && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-auto px-0"
                        onClick={() => setFornecedorProduto("")}
                      >
                        Limpar fornecedor
                      </Button>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cr-preco-custo">Preço de custo (R$)</Label>
                    <Input
                      id="cr-preco-custo"
                      type="text"
                      inputMode="decimal"
                      value={precoCusto}
                      disabled={produtoFabricado}
                      onChange={(e) => {
                        if (produtoFabricado) return;
                        setCalcSource("preco_custo");
                        setPrecoCusto(e.target.value);
                        const custo = parseDecimal(e.target.value);
                        const margem = parseDecimal(margemLucro);
                        const venda = parseDecimal(precoVenda);
                        if (custo != null && custo > 0) {
                          if (margem != null && (calcSource === "margem" || calcSource === "preco_custo")) {
                            setPrecoVenda(fmtDecimalPt(custo * (1 + margem / 100)));
                          } else if (venda != null && (calcSource === "preco_venda" || calcSource === "preco_custo")) {
                            setMargemLucro(fmtPercentBr((venda / custo - 1) * 100));
                          }
                        }
                      }}
                      placeholder="0,00"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="cr-margem">% de lucro</Label>
                    <Input
                      id="cr-margem"
                      type="text"
                      inputMode="decimal"
                      value={margemLucro}
                      onChange={(e) => {
                        setCalcSource("margem");
                        setMargemLucro(e.target.value);
                        const custo = parseDecimal(precoCusto);
                        const margem = parseDecimal(e.target.value);
                        if (custo != null && custo > 0 && margem != null) {
                          setPrecoVenda(fmtDecimalPt(custo * (1 + margem / 100)));
                        }
                      }}
                      placeholder="0,00"
                    />
                  </div>
                </div>

                {produtoFabricado && (
                  <div className="space-y-3 rounded-md border p-3">
                    <h4 className="text-sm font-medium">Insumos do produto</h4>
                    <div className="grid gap-3 sm:grid-cols-4">
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="cr-insumo-mat">Material</Label>
                        <Select value={materialInsumo} onValueChange={setMaterialInsumo}>
                          <SelectTrigger id="cr-insumo-mat">
                            <SelectValue placeholder="Selecione o material" />
                          </SelectTrigger>
                          <SelectContent>
                            {materiais.map((m) => (
                              <SelectItem key={String(m.id)} value={String(m.id)}>
                                {m.nome ?? `Material #${m.id}`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cr-insumo-qtd">Quantidade</Label>
                        <Input
                          id="cr-insumo-qtd"
                          type="text"
                          inputMode="decimal"
                          value={quantidadeInsumo}
                          onChange={(e) => setQuantidadeInsumo(e.target.value)}
                          placeholder="0,000"
                        />
                      </div>
                      <div className="flex items-end">
                        <Button type="button" variant="outline" className="w-full" onClick={adicionarInsumo}>
                          Adicionar
                        </Button>
                      </div>
                    </div>
                    {insumos.length > 0 && (
                      <div className="space-y-2">
                        {insumos.map((i) => (
                          <div
                            key={i.material}
                            className="flex items-center justify-between gap-2 border-b pb-1 text-sm"
                          >
                            <span>
                              {i.material_nome} ({i.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}{" "}
                              × {formatCurrencyBrl(i.preco_unitario_base)})
                            </span>
                            <div className="flex shrink-0 items-center gap-2">
                              <span className="font-medium">{formatCurrencyBrl(i.total_insumo)}</span>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => setInsumos((prev) => prev.filter((x) => x.material !== i.material))}
                              >
                                Remover
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="cr-mao-obra">Mão de obra por peça</Label>
                        <Input
                          id="cr-mao-obra"
                          type="text"
                          inputMode="decimal"
                          value={maoObra}
                          onChange={(e) => setMaoObra(e.target.value)}
                          placeholder="0,00"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Custo materiais</Label>
                        <Input value={fmtDecimalPt(custoMateriais)} disabled />
                      </div>
                      <div className="space-y-2">
                        <Label>Custo total</Label>
                        <Input value={fmtDecimalPt(custoTotalFabricacao)} disabled />
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="cr-nome-material">Nome do material *</Label>
                    <Input
                      id="cr-nome-material"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Nome do material"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cr-categoria-mat">Categoria *</Label>
                    {categorias.length > 0 ? (
                      <Select value={categoriaId} onValueChange={setCategoriaId}>
                        <SelectTrigger id="cr-categoria-mat">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {categorias.map((c) => (
                            <SelectItem key={String(c.id)} value={String(c.id)}>
                              {c.nome ?? `Categoria #${c.id}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-sm text-muted-foreground">Cadastre uma categoria de material primeiro.</p>
                    )}
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="cr-fornecedor-mat">Fornecedor *</Label>
                    <Select value={fornecedorProduto} onValueChange={setFornecedorProduto}>
                      <SelectTrigger id="cr-fornecedor-mat">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {fornecedores.map((f) => (
                          <SelectItem key={String(f.id)} value={String(f.id)}>
                            {f.nome ?? f.nomeRazaoSocial ?? `Fornecedor #${f.id}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {isChefe && (
                    <>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="cr-preco-base">Preço base (compra e estoque) *</Label>
                        <Input
                          id="cr-preco-base"
                          type="text"
                          inputMode="decimal"
                          value={precoVenda}
                          onChange={(e) => setPrecoVenda(e.target.value)}
                          placeholder="0,0000"
                        />
                        <p className="text-xs text-muted-foreground">
                          Usado em compras e valorização de estoque.
                        </p>
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="cr-preco-fab-mat">Preço na fabricação (insumos)</Label>
                        <Input
                          id="cr-preco-fab-mat"
                          type="text"
                          inputMode="decimal"
                          value={precoFabricacao}
                          onChange={(e) => setPrecoFabricacao(e.target.value)}
                          placeholder="Opcional — vazio usa o preço base"
                        />
                        <p className="text-xs text-muted-foreground">
                          Só para custo de materiais nos produtos fabricados.
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
          <DialogFooter className="shrink-0 border-t px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || categorias.length === 0}>
              {saving ? "Salvando…" : "Cadastrar e usar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
