import React, { useEffect, useState, useMemo, type FormEvent } from "react";
import { api } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Package, Archive, FolderOpen, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { motion } from "motion/react";
import { useAuth } from "../contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";

interface ItemEstoque {
  id: number;
  nome: string;
  estoque_atual: number;
  preco_unitario_base: number;
  total: number;
  categoria_id?: number | null;
  categoria_nome?: string | null;
  alterado_hoje?: boolean;
}

function totalEstoqueItem(item: Pick<ItemEstoque, "estoque_atual" | "preco_unitario_base">): number {
  return (Number(item.estoque_atual) || 0) * (Number(item.preco_unitario_base) || 0);
}

export function Estoque() {
  const { user } = useAuth();
  const isChefe = user?.is_chefe === true;

  const [produtos, setProdutos] = useState<ItemEstoque[]>([]);
  const [loading, setLoading] = useState(true);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<null | {
    kind: string;
    data: string | null;
    item_nome: string;
    detalhe: string;
    observacao?: string;
  }>(null);
  const [open, setOpen] = useState(false);
  const [modoAjuste, setModoAjuste] = useState<"entrada_saida" | "valor_fixo">("valor_fixo");
  const [produtoId, setProdutoId] = useState("");
  const [tipo, setTipo] = useState<"entrada" | "saida">("entrada");
  const [quantidade, setQuantidade] = useState("");
  const [quantidadeNova, setQuantidadeNova] = useState("");
  const [observacao, setObservacao] = useState("");

  const [contagem, setContagem] = useState<Record<number, string>>({});
  const [aplicandoContagem, setAplicandoContagem] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    api.getEstoque()
      .then((data) => {
        const list = Array.isArray(data.produtos) ? data.produtos : [];
        setProdutos(list);
      })
      .catch(() => setProdutos([]))
      .finally(() => setLoading(false));
    api.getEstoqueUltimaAtualizacao()
      .then((res) => setUltimaAtualizacao(res.last_update))
      .catch(() => setUltimaAtualizacao(null));
  };

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!produtoId) {
      toast.error("Selecione o produto.");
      return;
    }
    const produtoIdNum = parseInt(produtoId, 10);
    try {
      if (modoAjuste === "valor_fixo") {
        const nova = parseInt(quantidadeNova, 10);
        if (isNaN(nova) || nova < 0) {
          toast.error("Informe a quantidade atual (número >= 0).");
          return;
        }
        const res = await api.ajusteEstoque({
          produto_id: produtoIdNum,
          quantidade_nova: nova,
          observacao: observacao.trim() || undefined,
        } as any);
        if (res.error) {
          toast.error(res.error || "Erro no ajuste");
          return;
        }
        toast.success("Quantidade atual definida");
      } else {
        if (!isChefe) {
          toast.error("Apenas o chefe pode fazer entrada/saída.");
          return;
        }
        const qty = parseInt(quantidade, 10);
        if (isNaN(qty) || qty <= 0) {
          toast.error("Informe quantidade positiva.");
          return;
        }
        const res = await api.ajusteEstoque({
          produto_id: produtoIdNum,
          tipo,
          quantidade: qty,
          observacao: observacao.trim() || undefined,
        } as any);
        if (res.error) {
          toast.error(res.error || "Erro no ajuste");
          return;
        }
        toast.success("Ajuste realizado");
      }
      setProdutoId("");
      setQuantidade("");
      setQuantidadeNova("");
      setObservacao("");
      setOpen(false);
      load();
    } catch {
      toast.error("Erro ao ajustar estoque");
    }
  };

  const aplicarContagem = async (id: number) => {
    const valor = contagem[id];
    const nova = valor === "" ? null : parseInt(String(valor).trim(), 10);
    if (nova === null || isNaN(nova) || nova < 0) {
      toast.error("Informe a quantidade contada (número >= 0).");
      return;
    }
    setAplicandoContagem(id);
    try {
      const res = await api.ajusteEstoque({
        produto_id: id,
        quantidade_nova: nova,
        observacao: "Contagem pelo funcionário",
      } as any);
      if (res.error) {
        toast.error(res.error || "Erro no ajuste");
        return;
      }
      toast.success("Contagem aplicada ao sistema");
      setProdutos((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                estoque_atual: nova,
                total: totalEstoqueItem({ estoque_atual: nova, preco_unitario_base: p.preco_unitario_base }),
                alterado_hoje: true,
              }
            : p
        )
      );
      setContagem((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      load();
    } catch {
      toast.error("Erro ao aplicar contagem");
    } finally {
      setAplicandoContagem(null);
    }
  };

  const somaTotal = produtos.reduce((s, i) => s + totalEstoqueItem(i), 0);

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

  const porCategoria = useMemo(() => {
    const map = new Map<string, ItemEstoque[]>();
    for (const item of produtos) {
      const key = item.categoria_nome ?? "Sem categoria";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [produtos]);

  const colCount = isChefe ? 4 : 2;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Estoque</h1>
          <p className="text-muted-foreground">
            {isChefe ? "Produtos, valores e ajustes" : "Contagem e ajustes por categoria (sem valores)"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Última atualização:{" "}
            {ultimaAtualizacao?.data ? (
              <>
                <span className="font-medium text-foreground">
                  {new Date(ultimaAtualizacao.data).toLocaleString("pt-BR")}
                </span>
                {" — "}
                <span className="font-medium text-foreground">{ultimaAtualizacao.item_nome}</span>
                {" — "}
                {ultimaAtualizacao.detalhe}
                {ultimaAtualizacao.observacao ? ` — ${ultimaAtualizacao.observacao}` : ""}
              </>
            ) : (
              "—"
            )}
          </p>
        </div>
        {isChefe && produtos.length > 0 && (
          <Card className="px-6 py-3">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Package className="size-4" /> Total estoque
            </p>
            <p className="text-2xl font-semibold">{formatCurrency(somaTotal)}</p>
          </Card>
        )}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Archive className="size-4 mr-2" />
              Ajuste de estoque
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ajuste de estoque</DialogTitle>
              <DialogDescription>
                {isChefe ? "Entrada, saída ou definir quantidade atual" : "Definir quantidade atual (contagem)"}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Produto</Label>
                <Select value={produtoId} onValueChange={setProdutoId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {produtos.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.nome} (atual: {p.estoque_atual})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Tabs value={modoAjuste} onValueChange={(v) => setModoAjuste(v as "entrada_saida" | "valor_fixo")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="entrada_saida" disabled={!isChefe}>
                    Entrada / Saída
                  </TabsTrigger>
                  <TabsTrigger value="valor_fixo">Definir quantidade atual</TabsTrigger>
                </TabsList>
                <TabsContent value="entrada_saida" className="space-y-4 pt-2">
                  <div>
                    <Label>Tipo</Label>
                    <Select value={tipo} onValueChange={(v) => setTipo(v as "entrada" | "saida")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="entrada">Entrada</SelectItem>
                        <SelectItem value="saida">Saída</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Quantidade</Label>
                    <Input
                      type="number"
                      min={1}
                      value={quantidade}
                      onChange={(e) => setQuantidade(e.target.value)}
                    />
                  </div>
                </TabsContent>
                <TabsContent value="valor_fixo" className="space-y-4 pt-2">
                  <div>
                    <Label>Quantidade atual (ex: contou 325 unidades)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={quantidadeNova}
                      onChange={(e) => setQuantidadeNova(e.target.value)}
                      placeholder={produtoId ? String(produtos.find((p) => String(p.id) === produtoId)?.estoque_atual ?? "") : "0"}
                    />
                  </div>
                </TabsContent>
              </Tabs>
              <div>
                <Label>Observação (opcional)</Label>
                <Input
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Ex: Contagem inventário"
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">Aplicar</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Tabs defaultValue="lista" className="space-y-4">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="lista" className="flex items-center gap-2">
              <Package className="size-4" />
              Lista geral
            </TabsTrigger>
            <TabsTrigger value="categorias" className="flex items-center gap-2">
              <FolderOpen className="size-4" />
              Por categoria
            </TabsTrigger>
          </TabsList>

          <TabsContent value="lista" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="size-5" />
                  Produtos em estoque
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-amber-600" />
                  Itens alterados hoje são destacados.
                </p>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-muted-foreground">Carregando...</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        {isChefe && <TableHead className="text-right">Custo unit.</TableHead>}
                        {isChefe && <TableHead className="text-right">Total (custo)</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {produtos.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={colCount} className="text-center text-muted-foreground">
                            Nenhum produto
                          </TableCell>
                        </TableRow>
                      ) : (
                        produtos.map((item) => (
                          <TableRow
                            key={item.id}
                            className={item.alterado_hoje ? "bg-amber-50 dark:bg-amber-950/20" : ""}
                          >
                            <TableCell className="font-medium">
                              <span className="flex items-center gap-2">
                                {item.nome}
                                {item.alterado_hoje && (
                                  <Sparkles className="size-4 text-amber-600 shrink-0" aria-label="Alterado hoje" />
                                )}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">{item.estoque_atual}</TableCell>
                            {isChefe && (
                              <TableCell className="text-right text-muted-foreground">
                                {formatCurrency(item.preco_unitario_base)}
                              </TableCell>
                            )}
                            {isChefe && (
                              <TableCell className="text-right">{formatCurrency(totalEstoqueItem(item))}</TableCell>
                            )}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="categorias" className="space-y-6">
            <p className="text-sm text-muted-foreground">
              Conte o estoque por categoria e informe a quantidade contada.
            </p>
            {loading ? (
              <p className="text-muted-foreground">Carregando...</p>
            ) : porCategoria.length === 0 ? (
              <p className="text-muted-foreground">Nenhum produto cadastrado.</p>
            ) : (
              porCategoria.map(([categoriaNome, itensCat]) => (
                <Card key={categoriaNome}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FolderOpen className="size-5" />
                      {categoriaNome}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Produto</TableHead>
                          <TableHead className="text-right w-24">Qtd no sistema</TableHead>
                          <TableHead className="text-right w-36">Qtd contada</TableHead>
                          <TableHead className="w-28"></TableHead>
                          {isChefe && (
                            <>
                              <TableHead className="text-right">Custo unit.</TableHead>
                              <TableHead className="text-right">Total (custo)</TableHead>
                            </>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itensCat.map((item) => (
                          <TableRow key={item.id} className={item.alterado_hoje ? "bg-amber-50 dark:bg-amber-950/20" : ""}>
                            <TableCell className="font-medium">
                              <span className="flex items-center gap-2">
                                {item.nome}
                                {item.alterado_hoje && (
                                  <Sparkles className="size-4 text-amber-600 shrink-0" aria-label="Alterado hoje" />
                                )}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">{item.estoque_atual}</TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                min={0}
                                className="h-9 w-full max-w-28 text-right"
                                placeholder="Contou"
                                value={contagem[item.id] ?? ""}
                                onChange={(e) =>
                                  setContagem((prev) => ({ ...prev, [item.id]: e.target.value }))
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={aplicandoContagem === item.id}
                                onClick={() => aplicarContagem(item.id)}
                              >
                                {aplicandoContagem === item.id ? "..." : "Atualizar"}
                              </Button>
                            </TableCell>
                            {isChefe && (
                              <>
                                <TableCell className="text-right text-muted-foreground">
                                  {formatCurrency(item.preco_unitario_base)}
                                </TableCell>
                                <TableCell className="text-right">{formatCurrency(totalEstoqueItem(item))}</TableCell>
                              </>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}
