import React, { useCallback, useEffect, useState, type FormEvent } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { StatCard } from "../components/StatCard";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
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
import {
  Store,
  TrendingUp,
  Package,
  Percent,
  PiggyBank,
  Link2,
  RefreshCw,
  CalendarDays,
  ShoppingBag,
  AlertCircle,
  ExternalLink,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import { formatCurrencyBrl } from "../lib/format";
import { api } from "../lib/api";
import type { ShopeeIntegracaoStatus, ShopeeLoja, ShopeePeriodoLucro, ShopeeResumoLucro } from "../lib/shopeeApi";
import { SHOPEE_LOJA_VAZIA, resumoLucroPlaceholder } from "../lib/shopeeApi";
import { toast } from "sonner";

const PERIODOS: { id: ShopeePeriodoLucro; label: string }[] = [
  { id: "dia", label: "Hoje" },
  { id: "mes", label: "Este mês" },
];

function lojaParaForm(loja: ShopeeLoja) {
  return {
    nome: loja.nome,
    partner_id: loja.partner_id,
    partner_key: "",
    shop_id: loja.shop_id,
    redirect_url: loja.redirect_url,
  };
}

export function ShopeeLojaPanel() {
  const [status, setStatus] = useState<ShopeeIntegracaoStatus | null>(null);
  const [lojas, setLojas] = useState<ShopeeLoja[]>([]);
  const [lojaSelecionadaId, setLojaSelecionadaId] = useState<number | null>(null);
  const [resumo, setResumo] = useState<ShopeeResumoLucro | null>(null);
  const [periodo, setPeriodo] = useState<ShopeePeriodoLucro>("dia");
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingResumo, setLoadingResumo] = useState(true);

  const [lojaDialogOpen, setLojaDialogOpen] = useState(false);
  const [lojaForm, setLojaForm] = useState(SHOPEE_LOJA_VAZIA);
  const [editandoLoja, setEditandoLoja] = useState<ShopeeLoja | null>(null);
  const [salvandoLoja, setSalvandoLoja] = useState(false);
  const [excluirLoja, setExcluirLoja] = useState<ShopeeLoja | null>(null);
  const [excluindoLoja, setExcluindoLoja] = useState(false);

  const carregar = useCallback(async () => {
    setLoadingStatus(true);
    setLoadingResumo(true);
    try {
      const [st, lista] = await Promise.all([
        api.getShopeeIntegracaoStatus(),
        api.getShopeeLojas(),
      ]);
      setStatus(st);
      setLojas(lista);
      setLojaSelecionadaId((atual) => {
        if (atual && lista.some((l) => l.id === atual)) return atual;
        return lista[0]?.id ?? null;
      });
      const rs = await api.getShopeeResumoLucro(periodo);
      setResumo(rs);
    } catch {
      setStatus({
        conectado: false,
        modo: "desenvolvimento",
        mensagem: "Não foi possível contactar o servidor.",
        proximos_passos: ["Verifique se o backend está em execução."],
      });
      setLojas([]);
      setResumo(resumoLucroPlaceholder(periodo));
      toast.error("Erro ao carregar dados da Shopee");
    } finally {
      setLoadingStatus(false);
      setLoadingResumo(false);
    }
  }, [periodo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const abrirNovaLoja = () => {
    setEditandoLoja(null);
    setLojaForm(SHOPEE_LOJA_VAZIA);
    setLojaDialogOpen(true);
  };

  const abrirEditarLoja = (loja: ShopeeLoja) => {
    setEditandoLoja(loja);
    setLojaForm(lojaParaForm(loja));
    setLojaDialogOpen(true);
  };

  const handleSalvarLoja = async (e: FormEvent) => {
    e.preventDefault();
    const nome = lojaForm.nome.trim();
    if (!nome) {
      toast.error("Informe o nome da loja");
      return;
    }
    const body = {
      nome,
      partner_id: lojaForm.partner_id.trim(),
      shop_id: lojaForm.shop_id.trim(),
      redirect_url: lojaForm.redirect_url.trim(),
      ...(lojaForm.partner_key.trim() ? { partner_key: lojaForm.partner_key.trim() } : {}),
    };
    try {
      setSalvandoLoja(true);
      if (editandoLoja) {
        await api.updateShopeeLoja(editandoLoja.id, body);
        toast.success("Loja atualizada");
      } else {
        await api.createShopeeLoja(body);
        toast.success("Loja adicionada");
      }
      setLojaDialogOpen(false);
      setEditandoLoja(null);
      setLojaForm(SHOPEE_LOJA_VAZIA);
      await carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao guardar loja");
    } finally {
      setSalvandoLoja(false);
    }
  };

  const handleExcluirLoja = async () => {
    if (!excluirLoja) return;
    try {
      setExcluindoLoja(true);
      await api.deleteShopeeLoja(excluirLoja.id);
      toast.success("Loja removida");
      setExcluirLoja(null);
      await carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir loja");
    } finally {
      setExcluindoLoja(false);
    }
  };

  const handleConectarShopee = (loja: ShopeeLoja) => {
    if (!loja.partner_id || !loja.partner_key_definida || !loja.shop_id) {
      toast.error("Complete Partner ID, Partner Key e Shop ID antes de autorizar.");
      return;
    }
    toast.info(`Fluxo OAuth da loja "${loja.nome}" será implementado em breve.`);
  };

  const lojaSelecionada = lojas.find((l) => l.id === lojaSelecionadaId) ?? null;
  const resumoAtual = resumo ?? resumoLucroPlaceholder(periodo);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2 min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold flex items-center gap-2">
              <Store className="size-6 text-orange-500" />
              Shopee
            </h2>
            {loadingStatus ? (
              <Badge variant="secondary">A carregar…</Badge>
            ) : status?.conectado ? (
              <Badge className="bg-emerald-600 hover:bg-emerald-600">
                {status.lojas_conectadas ?? 0} loja(s) configurada(s)
              </Badge>
            ) : (
              <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">
                {lojas.length > 0 ? "Credenciais incompletas" : "Nenhuma loja"}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground max-w-2xl">
            Gerencie várias lojas Shopee e acompanhe lucro diário e mensal por loja.
          </p>
          {lojas.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Label htmlFor="shopee-loja-ativa" className="text-sm text-muted-foreground shrink-0">
                Loja ativa:
              </Label>
              <Select
                value={lojaSelecionadaId != null ? String(lojaSelecionadaId) : undefined}
                onValueChange={(v) => setLojaSelecionadaId(Number(v))}
              >
                <SelectTrigger id="shopee-loja-ativa" className="w-[min(100%,280px)]">
                  <SelectValue placeholder="Selecione a loja" />
                </SelectTrigger>
                <SelectContent>
                  {lojas.map((loja) => (
                    <SelectItem key={loja.id} value={String(loja.id)}>
                      {loja.nome}
                      {loja.conectado ? " ✓" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {lojaSelecionada && (
                <span className="text-xs text-muted-foreground">
                  Shop ID: {lojaSelecionada.shop_id || "—"}
                </span>
              )}
            </div>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={carregar} disabled={loadingStatus || loadingResumo}>
          <RefreshCw className={`size-4 mr-2 ${loadingResumo ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {!loadingStatus && status && (
        <Card className={status.conectado ? "border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20" : "border-amber-200 bg-amber-50/50 dark:bg-amber-950/20"}>
          <CardContent className="pt-6 flex gap-3">
            <AlertCircle className={`size-5 shrink-0 mt-0.5 ${status.conectado ? "text-emerald-600" : "text-amber-600"}`} />
            <div className="space-y-1 text-sm">
              <p className="font-medium text-foreground">{status.mensagem}</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                {status.proximos_passos.map((passo) => (
                  <li key={passo}>{passo}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="visao-geral" className="w-full">
        <TabsList className="flex w-full flex-wrap gap-1 h-auto p-1 justify-start max-w-2xl">
          <TabsTrigger value="visao-geral" className="gap-1.5 text-xs sm:text-sm">
            <TrendingUp className="size-4 shrink-0" />
            Visão geral
          </TabsTrigger>
          <TabsTrigger value="pedidos" className="gap-1.5 text-xs sm:text-sm">
            <ShoppingBag className="size-4 shrink-0" />
            Pedidos
          </TabsTrigger>
          <TabsTrigger value="configuracao" className="gap-1.5 text-xs sm:text-sm">
            <Link2 className="size-4 shrink-0" />
            Conexão API
          </TabsTrigger>
        </TabsList>

        <TabsContent value="visao-geral" className="mt-6 space-y-6">
          {!lojaSelecionada && !loadingStatus && (
            <Card className="border-dashed">
              <CardContent className="pt-6 text-sm text-muted-foreground">
                Cadastre ao menos uma loja na aba <strong>Conexão API</strong> para acompanhar os indicadores.
              </CardContent>
            </Card>
          )}

          {lojaSelecionada && (
            <>
              <p className="text-sm font-medium text-foreground">
                Indicadores: {lojaSelecionada.nome}
              </p>
              <div className="flex flex-wrap gap-2">
                {PERIODOS.map((p) => (
                  <Button
                    key={p.id}
                    variant={periodo === p.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPeriodo(p.id)}
                  >
                    <CalendarDays className="size-4 mr-1.5" />
                    {p.label}
                  </Button>
                ))}
                {resumoAtual.fonte === "placeholder" && (
                  <Badge variant="secondary" className="self-center ml-1">
                    Dados simulados
                  </Badge>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Período:{" "}
                {resumoAtual.data_inicio === resumoAtual.data_fim
                  ? new Date(resumoAtual.data_inicio + "T12:00:00").toLocaleDateString("pt-BR")
                  : `${new Date(resumoAtual.data_inicio + "T12:00:00").toLocaleDateString("pt-BR")} — ${new Date(resumoAtual.data_fim + "T12:00:00").toLocaleDateString("pt-BR")}`}
              </p>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  title="Lucro líquido"
                  value={loadingResumo ? "…" : formatCurrencyBrl(resumoAtual.lucro_liquido)}
                  icon={PiggyBank}
                  iconColor="bg-emerald-500/10 text-emerald-600"
                />
                <StatCard
                  title="Receita bruta"
                  value={loadingResumo ? "…" : formatCurrencyBrl(resumoAtual.receita_bruta)}
                  icon={TrendingUp}
                  iconColor="bg-blue-500/10 text-blue-600"
                />
                <StatCard
                  title="Comissão Shopee"
                  value={loadingResumo ? "…" : formatCurrencyBrl(resumoAtual.comissao_shopee)}
                  icon={Percent}
                  iconColor="bg-orange-500/10 text-orange-600"
                />
                <StatCard
                  title="Pedidos"
                  value={loadingResumo ? "…" : String(resumoAtual.pedidos)}
                  icon={Package}
                  iconColor="bg-violet-500/10 text-violet-600"
                />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Composição do lucro</CardTitle>
                  <CardDescription>
                    Após conectar a API, os valores virão dos pedidos concluídos e das taxas reais da Shopee.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Indicador</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell>Receita bruta (vendas)</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrencyBrl(resumoAtual.receita_bruta)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>(−) Comissão e taxas Shopee</TableCell>
                        <TableCell className="text-right tabular-nums text-red-600">
                          − {formatCurrencyBrl(resumoAtual.comissao_shopee + resumoAtual.taxas_logistica)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>(−) Custo dos produtos</TableCell>
                        <TableCell className="text-right tabular-nums text-red-600">
                          − {formatCurrencyBrl(resumoAtual.custo_produtos)}
                        </TableCell>
                      </TableRow>
                      <TableRow className="font-medium">
                        <TableCell>= Lucro líquido</TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-600">
                          {formatCurrencyBrl(resumoAtual.lucro_liquido)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="text-muted-foreground">Itens vendidos</TableCell>
                        <TableCell className="text-right tabular-nums">{resumoAtual.itens_vendidos}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="pedidos" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Pedidos{lojaSelecionada ? ` — ${lojaSelecionada.nome}` : ""}
              </CardTitle>
              <CardDescription>
                Lista sincronizada via API Shopee (endpoint <code className="text-xs">get_order_list</code>).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
                <ShoppingBag className="size-10 mx-auto mb-3 opacity-40" />
                <p className="font-medium text-foreground">Nenhum pedido sincronizado</p>
                <p className="text-sm mt-1 max-w-md mx-auto">
                  Cadastre e configure as lojas na aba <strong>Conexão API</strong> para importar pedidos.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="configuracao" className="mt-6 space-y-6">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Lojas Shopee</CardTitle>
                <CardDescription>
                  Cadastre cada loja com Partner ID, Partner Key e Shop ID. As chaves ficam guardadas no servidor.
                </CardDescription>
              </div>
              <Button size="sm" onClick={abrirNovaLoja}>
                <Plus className="size-4 mr-1.5" />
                Adicionar loja
              </Button>
            </CardHeader>
            <CardContent>
              {lojas.length === 0 ? (
                <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
                  <Store className="size-10 mx-auto mb-3 opacity-40" />
                  <p className="font-medium text-foreground">Nenhuma loja cadastrada</p>
                  <p className="text-sm mt-1 mb-4">Clique em Adicionar loja para preencher os dados da Open Platform.</p>
                  <Button variant="secondary" onClick={abrirNovaLoja}>
                    <Plus className="size-4 mr-1.5" />
                    Adicionar loja
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Loja</TableHead>
                      <TableHead>Partner ID</TableHead>
                      <TableHead>Shop ID</TableHead>
                      <TableHead>Chave</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lojas.map((loja) => (
                      <TableRow key={loja.id}>
                        <TableCell className="font-medium">{loja.nome}</TableCell>
                        <TableCell className="font-mono text-xs">{loja.partner_id || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{loja.shop_id || "—"}</TableCell>
                        <TableCell>
                          {loja.partner_key_definida ? (
                            <Badge variant="secondary">Definida</Badge>
                          ) : (
                            <Badge variant="outline" className="text-amber-700">Pendente</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {loja.conectado ? (
                            <Badge className="bg-emerald-600 hover:bg-emerald-600">Pronta</Badge>
                          ) : (
                            <Badge variant="outline">Incompleta</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title="Editar"
                              onClick={() => abrirEditarLoja(loja)}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title="Autorizar OAuth"
                              onClick={() => handleConectarShopee(loja)}
                            >
                              <Link2 className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title="Excluir"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setExcluirLoja(loja)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Shopee Open Platform</CardTitle>
              <CardDescription>
                Crie um app parceiro em open.shopee.com e use os mesmos dados em cada loja que autorizar.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button type="button" variant="outline" asChild>
                <a href="https://open.shopee.com/" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4 mr-2" />
                  Abrir Open Platform
                </a>
              </Button>
            </CardContent>
          </Card>

        </TabsContent>
      </Tabs>

      <Dialog open={lojaDialogOpen} onOpenChange={setLojaDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editandoLoja ? "Editar loja" : "Adicionar loja"}</DialogTitle>
            <DialogDescription>
              Preencha os dados da loja na Shopee Open Platform. A Partner Key não é exibida depois de salva.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSalvarLoja} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="loja-nome">Nome da loja *</Label>
              <Input
                id="loja-nome"
                value={lojaForm.nome}
                onChange={(e) => setLojaForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder="Ex.: SM Decor Principal"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loja-partner-id">Partner ID</Label>
              <Input
                id="loja-partner-id"
                value={lojaForm.partner_id}
                onChange={(e) => setLojaForm((f) => ({ ...f, partner_id: e.target.value }))}
                placeholder="ID do app na Open Platform"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loja-partner-key">Partner Key</Label>
              <Input
                id="loja-partner-key"
                type="password"
                value={lojaForm.partner_key}
                onChange={(e) => setLojaForm((f) => ({ ...f, partner_key: e.target.value }))}
                placeholder={
                  editandoLoja?.partner_key_definida
                    ? "Deixe em branco para manter a chave atual"
                    : "Chave secreta do app"
                }
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loja-shop-id">Shop ID</Label>
              <Input
                id="loja-shop-id"
                value={lojaForm.shop_id}
                onChange={(e) => setLojaForm((f) => ({ ...f, shop_id: e.target.value }))}
                placeholder="ID da loja após autorização OAuth"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loja-redirect">Redirect URL (OAuth)</Label>
              <Input
                id="loja-redirect"
                value={lojaForm.redirect_url}
                onChange={(e) => setLojaForm((f) => ({ ...f, redirect_url: e.target.value }))}
                placeholder="https://seu-dominio.com/api/shopee/callback/"
                autoComplete="off"
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setLojaDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={salvandoLoja}>
                {salvandoLoja ? "A guardar…" : editandoLoja ? "Guardar alterações" : "Adicionar loja"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!excluirLoja} onOpenChange={(open) => !open && setExcluirLoja(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir loja?</AlertDialogTitle>
            <AlertDialogDescription>
              A loja <strong>{excluirLoja?.nome}</strong> será removida. As credenciais guardadas no servidor serão apagadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindoLoja}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleExcluirLoja();
              }}
              disabled={excluindoLoja}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {excluindoLoja ? "A excluir…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
