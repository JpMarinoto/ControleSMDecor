import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
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
import { TrendingUp, Plus, Trash2, Copy, Eye, Pencil, Check, X, Printer } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { formatDateOnly, parseDateOnlyToTime } from "../lib/format";
import { useAuth } from "../contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { empresa, empresaEnderecoLinha, empresaDocumento } from "../data/empresa";

interface ItemVenda {
  id: number;
  produto: number;
  produto_nome?: string;
  quantidade: number;
  preco_unitario: number;
}

interface NovoItemVendaForm {
  id: string;
  produtoId: string;
  quantidade: string;
  precoUnitario: string;
}

interface Venda {
  id: string | number;
  cliente: number;
  clienteNome: string;
  total: number;
  data: string;
  itens?: ItemVenda[];
}

export function Venda() {
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [produtos, setProdutos] = useState<any[]>([]);
  const [detailVenda, setDetailVenda] = useState<Venda | null>(null);
  const [detailAdding, setDetailAdding] = useState(false);
  const [addItemProdutoId, setAddItemProdutoId] = useState("");
  const [addItemQuantidade, setAddItemQuantidade] = useState("1");
  const [addItemPreco, setAddItemPreco] = useState("");

  const [itensForm, setItensForm] = useState<NovoItemVendaForm[]>([]);

  const [clienteId, setClienteId] = useState("");
  const [produtoId, setProdutoId] = useState("");
  const [precoUnitario, setPrecoUnitario] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [data, setData] = useState(new Date().toISOString().split("T")[0]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editQtd, setEditQtd] = useState("");
  const [editPreco, setEditPreco] = useState("");
  const [searchCliente, setSearchCliente] = useState("");
  const [searchItem, setSearchItem] = useState("");
  const [searchData, setSearchData] = useState("");
  const [copiarConfirmOpen, setCopiarConfirmOpen] = useState(false);
  const { user } = useAuth();
  const isChefe = user?.is_chefe === true;

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

  useEffect(() => {
    loadData();
  }, []);

  // Cada cliente tem seu preço: buscar último preço cobrado para este cliente neste produto
  useEffect(() => {
    if (!clienteId || !produtoId) {
      const prod = produtos.find((p: any) => String(p.id) === produtoId);
      setPrecoUnitario(prod ? String(prod.preco_venda ?? prod.precoInicial ?? "") : "");
      return;
    }
    api.getUltimoPrecoClienteProduto(clienteId, produtoId).then((preco) => {
      if (preco != null) setPrecoUnitario(String(preco));
      else {
        const prod = produtos.find((p: any) => String(p.id) === produtoId);
        setPrecoUnitario(prod ? String(prod.preco_venda ?? prod.precoInicial ?? "") : "");
      }
    });
  }, [clienteId, produtoId, produtos]);

  const loadData = async () => {
    try {
      const [vendasRes, clientesRes, produtosRes] = await Promise.all([
        api.getVendas().catch(() => []),
        api.getClientes().catch(() => []),
        api.getProdutos().catch(() => []),
      ]);
      setVendas(
        Array.isArray(vendasRes)
          ? vendasRes.map((v: any) => ({
              id: v.id,
              cliente: v.cliente,
              clienteNome: v.clienteNome || "",
              total: Number(v.total) || 0,
              data: v.data || "",
              itens: v.itens || [],
            }))
          : []
      );
      setClientes(Array.isArray(clientesRes) ? clientesRes : []);
      setProdutos(Array.isArray(produtosRes) ? produtosRes : []);
    } catch {
      toast.error("Erro ao carregar dados");
    }
  };

  const openDetail = async (v: Venda) => {
    try {
      const d = await api.getVendaDetalhe(String(v.id));
      setDetailVenda(d);
      setAddItemProdutoId("");
      setAddItemQuantidade("1");
       setAddItemPreco("");
    } catch {
      toast.error("Erro ao carregar detalhe da venda");
    }
  };

  const handleCopiarVenda = async () => {
    if (!detailVenda) return;
    setCopiarConfirmOpen(false);
    try {
      await api.copiarVenda(String(detailVenda.id));
      toast.success("Venda copiada com sucesso");
      await loadData();
      setDetailVenda(null);
    } catch {
      toast.error("Erro ao copiar venda");
    }
  };

  const copiarItemNaLista = (id: string) => {
    const item = itensForm.find((i) => i.id === id);
    if (!item) return;
    setItensForm((prev) => [...prev, { ...item, id: `${Date.now()}-${prev.length}` }]);
    toast.success("Item duplicado na lista");
  };

  const iniciarEdicaoItem = (item: NovoItemVendaForm) => {
    setEditingItemId(item.id);
    setEditQtd(item.quantidade);
    setEditPreco(item.precoUnitario);
  };

  const salvarEdicaoItem = () => {
    if (!editingItemId) return;
    const qtd = parseFloat(editQtd.replace(",", "."));
    if (isNaN(qtd) || qtd <= 0) {
      toast.error("Quantidade deve ser válida");
      return;
    }
    setItensForm((prev) =>
      prev.map((i) =>
        i.id === editingItemId ? { ...i, quantidade: editQtd } : i
      )
    );
    setEditingItemId(null);
    setEditQtd("");
    setEditPreco("");
    toast.success("Item atualizado");
  };

  const cancelarEdicaoItem = () => {
    setEditingItemId(null);
    setEditQtd("");
    setEditPreco("");
  };

  const imprimirVenda = (venda: Venda) => {
    const dataFormatada = formatDateOnly(venda.data);
    const usuarioNome =
      (user as any)?.first_name ||
      (user as any)?.username ||
      (user as any)?.email ||
      "";
    const clienteInfo = clientes.find((c: any) => c.id === venda.cliente);
    const clienteDoc = clienteInfo?.cpf || clienteInfo?.cnpj || "";
    const clienteTelefone = clienteInfo?.telefone || "";
    const itensRows = (venda.itens || [])
      .map(
        (i) =>
          `<tr><td>${i.produto_nome || `Produto #${i.produto}`}</td><td class="text-right">${i.quantidade}</td></tr>`
      )
      .join("");
    const numeroVenda = venda.id != null ? String(venda.id) : "";
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Venda ${numeroVenda ? "nº " + numeroVenda : ""} – ${venda.clienteNome}</title>
<style>
  @page{size:105mm 148mm;margin:6mm}
  @media print{body,.pagina{width:93mm!important;max-width:93mm!important;min-height:136mm}}
  body{font-family:system-ui,sans-serif;padding:8px;margin:0 auto;width:93mm;max-width:93mm;box-sizing:border-box}
  .pagina{width:93mm;max-width:93mm}
  *{box-sizing:border-box}
  h1{font-size:1rem;margin:0 0 4px 0}
  .meta{color:#555;font-size:0.7rem;margin-bottom:8px;line-height:1.3}
  table{width:100%;border-collapse:collapse;margin-top:6px;font-size:0.75rem}
  th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}
  th{background:#f5f5f5}
  .text-right{text-align:right}
  .footer{font-size:0.6rem;color:#888;margin-top:8px}
  .os-header{display:flex;gap:8px;align-items:center;margin-bottom:6px}
  .os-logo img{max-height:56px;max-width:56px;object-fit:contain}
  .empresa-block{font-size:0.7rem}
  .empresa-nome{font-weight:600;font-size:0.85rem}
  .empresa-fantasia{font-size:0.7rem;color:#555}
  .empresa-docs span + span{margin-left:6px}
  .empresa-endereco,.empresa-contato{font-size:0.65rem;color:#555}
  .assinatura{margin-top:16px;width:100%;border-bottom:1px solid #333;height:2.2em}
</style></head>
<body>
<div class="pagina">
${getEmpresaHeaderHtml()}
<h1>Venda${numeroVenda ? " nº " + numeroVenda : ""}</h1>
<p class="meta">
  <strong>Cliente:</strong> ${venda.clienteNome}<br/>
  ${clienteDoc ? `<strong>Doc:</strong> ${clienteDoc} ` : ""}<br/>
  ${clienteTelefone ? `<strong>Tel:</strong> ${clienteTelefone} ` : ""}<br/>
  <strong>Data:</strong> ${dataFormatada}<br/>
  <strong>Lançado por:</strong> ${usuarioNome || "-"}
</p>
<table>
  <thead>
    <tr><th>Produto</th><th class="text-right">Qtd</th></tr>
  </thead>
  <tbody>${itensRows}</tbody>
</table>
<div class="assinatura" title="Assinatura do cliente"></div>
<p class="footer">Impresso em ${new Date().toLocaleString("pt-BR")}</p>
</div>
</body></html>`;
    const janela = window.open("", "_blank");
    if (!janela) {
      toast.error("Permita pop-ups para imprimir.");
      return;
    }
    janela.document.write(html);
    janela.document.close();
    janela.focus();
    setTimeout(() => janela.print(), 300);
  };

  const handleAddItemToVenda = async () => {
    if (!detailVenda || !addItemProdutoId || !addItemQuantidade) {
      toast.error("Selecione produto e quantidade");
      return;
    }
    const qtd = parseInt(addItemQuantidade, 10);
    if (isNaN(qtd) || qtd <= 0) {
      toast.error("Quantidade inválida");
      return;
    }

    let precoNumber: number;
    if (isChefe) {
      precoNumber = parseFloat(addItemPreco.replace(",", "."));
      if (isNaN(precoNumber) || precoNumber <= 0) {
        toast.error("Informe o preço unitário do produto");
        return;
      }
    } else {
      try {
        const preco = await api.getUltimoPrecoClienteProduto(String(detailVenda.cliente), addItemProdutoId);
        if (preco == null || preco <= 0) {
          const prod = produtos.find((p: any) => String(p.id) === addItemProdutoId);
          precoNumber = Number(prod?.preco_venda ?? prod?.precoInicial ?? 0) || 0;
        } else {
          precoNumber = preco;
        }
        if (precoNumber <= 0) {
          toast.error("Preço não disponível para este produto. Peça ao chefe para definir.");
          return;
        }
      } catch {
        toast.error("Erro ao obter preço do produto");
        return;
      }
    }
    setDetailAdding(true);
    try {
      const updated = await api.addItemVenda(String(detailVenda.id), {
        produto: Number(addItemProdutoId),
        quantidade: qtd,
        preco_unitario: precoNumber,
      });
      setDetailVenda(updated);
      await loadData();
      setAddItemProdutoId("");
      setAddItemQuantidade("1");
      setAddItemPreco("");
      toast.success("Item adicionado");
    } catch {
      toast.error("Erro ao adicionar item");
    } finally {
      setDetailAdding(false);
    }
  };

  const handleRemoveItem = async (itemId: number) => {
    if (!detailVenda) return;
    try {
      await api.removeItemVenda(String(detailVenda.id), itemId);
      const updated = await api.getVendaDetalhe(String(detailVenda.id));
      setDetailVenda(updated);
      await loadData();
      toast.success("Item removido");
    } catch {
      toast.error("Erro ao remover item");
    }
  };

  const produtoSelecionado = produtos.find((p: any) => String(p.id) === produtoId);
  const precoNum = precoUnitario
    ? parseFloat(precoUnitario.replace(",", "."))
    : (produtoSelecionado?.preco_venda ?? produtoSelecionado?.precoInicial ?? 0);

  const adicionarItemNaLista = async () => {
    if (!produtoId || !quantidade) {
      toast.error("Selecione o produto e a quantidade");
      return;
    }

    const qtd = parseInt(quantidade, 10);
    if (isNaN(qtd) || qtd <= 0) {
      toast.error("Quantidade inválida");
      return;
    }

    let precoParaItem = precoNum;
    if (isNaN(precoParaItem) || precoParaItem <= 0) {
      if (isChefe) {
        toast.error("Informe o preço unitário para este cliente");
        return;
      }
      // Funcionário deixou em branco: usar valor definido pelo chefe (API)
      if (!clienteId) {
        toast.error("Selecione o cliente para usar o valor automático.");
        return;
      }
      try {
        const precoApi = await api.getUltimoPrecoClienteProduto(clienteId, produtoId);
        if (precoApi != null && precoApi > 0) {
          precoParaItem = precoApi;
        } else {
          const prod = produtos.find((p: any) => String(p.id) === produtoId);
          precoParaItem = Number(prod?.preco_venda ?? prod?.precoInicial ?? 0) || 0;
        }
        if (precoParaItem <= 0) {
          toast.error("Preço não definido para este cliente/produto. Peça ao chefe ou informe o valor.");
          return;
        }
      } catch {
        toast.error("Erro ao obter preço. Tente informar o valor ou peça ao chefe.");
        return;
      }
    }

    setItensForm((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${prev.length}`,
        produtoId,
        quantidade,
        precoUnitario: String(precoParaItem),
      },
    ]);

    setProdutoId("");
    setPrecoUnitario("");
    setQuantidade("");
  };

  const removerItemDaLista = (id: string) => {
    setItensForm((prev) => prev.filter((item) => item.id !== id));
  };

  const totalItensForm = itensForm.reduce((acc, item) => {
    const qtd = parseFloat(item.quantidade.replace(",", "."));
    const preco = parseFloat(item.precoUnitario.replace(",", "."));
    if (isNaN(qtd) || isNaN(preco)) return acc;
    return acc + qtd * preco;
  }, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!clienteId || !formaPagamento) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    if (itensForm.length === 0) {
      toast.error("Adicione pelo menos um produto na venda");
      return;
    }

    const itensPayload = itensForm.map((item) => {
      const prod = produtos.find((p: any) => String(p.id) === item.produtoId);
      const preco = item.precoUnitario
        ? parseFloat(item.precoUnitario.replace(",", "."))
        : (prod?.preco_venda ?? prod?.precoInicial ?? 0);

      const qtd = parseInt(item.quantidade, 10);

      return {
        produto: Number(item.produtoId),
        quantidade: qtd,
        preco_unitario: preco,
      };
    });

    try {
      await api.createVenda({
        cliente: Number(clienteId),
        itens: itensPayload,
        forma_pagamento: formaPagamento || undefined,
      });
      toast.success("Venda registrada com sucesso");
      await loadData();
      resetForm();
    } catch {
      toast.error("Erro ao registrar venda");
    }
  };


  const resetForm = () => {
    setClienteId("");
    setProdutoId("");
    setPrecoUnitario("");
    setQuantidade("");
    setFormaPagamento("");
    setData(new Date().toISOString().split("T")[0]);
    setItensForm([]);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const totalVendas = vendas.reduce((sum, v) => sum + v.total, 0);

  const vendasFiltradas = vendas.filter((v) => {
    if (searchCliente.trim() && !(v.clienteNome || "").toLowerCase().includes(searchCliente.trim().toLowerCase()))
      return false;
    if (searchData) {
      const vData = v.data ? v.data.slice(0, 10) : "";
      if (vData !== searchData) return false;
    }
    if (searchItem.trim()) {
      const termo = searchItem.trim().toLowerCase();
      const temItem = (v.itens || []).some(
        (i) => (i.produto_nome || "").toLowerCase().includes(termo) || String(i.produto).includes(termo)
      );
      if (!temItem) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Vendas</h1>
          <p className="text-muted-foreground">Registre vendas e consulte o histórico</p>
        </div>
        {isChefe && vendas.length > 0 && (
          <Card className="px-6 py-3">
            <p className="text-sm text-muted-foreground">Total em Vendas</p>
            <p className="text-2xl font-semibold text-green-600">{formatCurrency(totalVendas)}</p>
          </Card>
        )}
      </div>

      <Tabs defaultValue="nova" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="nova">Nova venda</TabsTrigger>
          <TabsTrigger value="historico">Histórico de vendas</TabsTrigger>
        </TabsList>

        <TabsContent value="nova" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="size-5" />
                Nova Venda
              </CardTitle>
              <p className="text-sm text-muted-foreground">Selecione o cliente, adicione os produtos, escolha a forma de pagamento e registre.</p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="clienteId">Cliente *</Label>
                {clientes.length > 0 ? (
                  <Select value={clienteId} onValueChange={setClienteId}>
                    <SelectTrigger id="clienteId">
                      <SelectValue placeholder="Selecione o cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {clientes.map((cliente: any) => (
                        <SelectItem key={cliente.id} value={String(cliente.id)}>
                          {cliente.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm text-muted-foreground">Cadastre clientes na aba Cadastro.</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="produtoId">Produto para adicionar *</Label>
                <Select value={produtoId} onValueChange={setProdutoId}>
                  <SelectTrigger id="produtoId">
                    <SelectValue placeholder="Selecione um produto" />
                  </SelectTrigger>
                  <SelectContent>
                    {                    produtos.length > 0 ? (
                      produtos.map((produto: any) => (
                        <SelectItem key={produto.id} value={String(produto.id)}>
                          {produto.nome}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="none" disabled>
                        Nenhum produto cadastrado
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="quantidade">Quantidade *</Label>
                <Input
                  id="quantidade"
                  type="number"
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                  placeholder="0"
                  min={1}
                />
                {produtoSelecionado && (
                  <p className="text-xs text-muted-foreground">
                    Estoque disponível: {produtoSelecionado.estoque ?? 0} unidades
                  </p>
                )}
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Itens desta venda</Label>
                <p className="text-xs text-muted-foreground">
                  Use <span className="inline-flex items-center gap-0.5"><Copy className="size-3" /> Copiar</span> no item para duplicar na lista e alterar só a quantidade.
                </p>
                <div className="flex flex-wrap gap-2 items-end">
                  <Button type="button" variant="outline" onClick={adicionarItemNaLista} disabled={!produtoId}>
                    <Plus className="size-4 mr-2" />
                    Adicionar produto à lista
                  </Button>
                </div>
                {itensForm.length > 0 ? (
                  <Table className="table-fixed">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[min(200px,40%)]">Produto</TableHead>
                        <TableHead className="w-20 text-right">Qtd</TableHead>
                        <TableHead className="w-[120px] text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itensForm.map((item) => {
                        const produto = produtos.find((p: any) => String(p.id) === item.produtoId);
                        const isEditing = editingItemId === item.id;
                        return (
                          <TableRow key={item.id} className={isEditing ? "bg-primary/5 border-l-2 border-l-primary" : ""}>
                            <TableCell className="align-middle truncate">{produto ? produto.nome : `#${item.produtoId}`}</TableCell>
                            {isEditing ? (
                              <>
                                <TableCell className="text-right align-middle py-2">
                                  <Input
                                    type="text"
                                    inputMode="numeric"
                                    className="h-8 w-full min-w-0 max-w-16 text-right text-sm tabular-nums ml-auto block"
                                    value={editQtd}
                                    onChange={(e) => setEditQtd(e.target.value)}
                                    placeholder="Qtd"
                                  />
                                </TableCell>
                                <TableCell className="text-right align-middle py-2">
                                  <div className="flex items-center justify-end gap-0.5">
                                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-green-600 hover:bg-green-500/10 hover:text-green-700" onClick={salvarEdicaoItem} title="Salvar">
                                      <Check className="size-4" />
                                    </Button>
                                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 hover:bg-destructive/10 hover:text-destructive" onClick={cancelarEdicaoItem} title="Cancelar">
                                      <X className="size-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </>
                            ) : (
                              <>
                                <TableCell className="text-right">{item.quantidade}</TableCell>
                                <TableCell className="text-right align-middle">
                                  <div className="flex items-center justify-end gap-0.5">
                                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => iniciarEdicaoItem(item)} title="Editar">
                                      <Pencil className="size-4" />
                                    </Button>
                                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => copiarItemNaLista(item.id)} title="Copiar item (mesmo produto, altere a quantidade)">
                                      <Copy className="size-4" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                      onClick={() => removerItemDaLista(item.id)}
                                      title="Excluir"
                                    >
                                      <Trash2 className="size-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Nenhum item adicionado ainda. Selecione o produto e a quantidade e clique em
                    &quot;Adicionar produto à lista&quot;.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="formaPagamento">Forma de Pagamento *</Label>
                <Select value={formaPagamento} onValueChange={setFormaPagamento}>
                  <SelectTrigger id="formaPagamento">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="PIX">PIX</SelectItem>
                    <SelectItem value="A prazo">A prazo</SelectItem>
                    <SelectItem value="Cartão de Débito">Cartão de Débito</SelectItem>
                    <SelectItem value="Cartão de Crédito">Cartão de Crédito</SelectItem>
                    <SelectItem value="Transferência">Transferência</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="data">Data *</Label>
                <Input
                  id="data"
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                />
              </div>
            </div>

            <Button type="submit" disabled={produtos.length === 0}>
              <Plus className="size-4 mr-2" />
              Registrar venda
            </Button>
          </form>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="historico" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Histórico de vendas</CardTitle>
              <p className="text-sm text-muted-foreground">Pesquise por cliente, item ou data. Clique em uma venda para ver detalhes ou copiar.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="searchCliente">Cliente</Label>
                  <Input
                    id="searchCliente"
                    placeholder="Nome do cliente"
                    value={searchCliente}
                    onChange={(e) => setSearchCliente(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="searchItem">Item / Produto</Label>
                  <Input
                    id="searchItem"
                    placeholder="Nome do produto"
                    value={searchItem}
                    onChange={(e) => setSearchItem(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="searchData">Data</Label>
                  <Input
                    id="searchData"
                    type="date"
                    value={searchData}
                    onChange={(e) => setSearchData(e.target.value)}
                  />
                </div>
              </div>
              {vendasFiltradas.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Itens (quantidade × produto)</TableHead>
                      {isChefe && <TableHead className="text-right">Total</TableHead>}
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...vendasFiltradas]
                      .sort((a, b) => parseDateOnlyToTime(b.data) - parseDateOnlyToTime(a.data))
                      .map((venda) => (
                        <TableRow
                          key={venda.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => openDetail(venda)}
                        >
                          <TableCell className="font-medium">{venda.clienteNome}</TableCell>
                          <TableCell className="text-muted-foreground whitespace-nowrap">
                            {formatDateOnly(venda.data)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {venda.itens && venda.itens.length > 0
                              ? venda.itens
                                  .map((i) => `${i.quantidade}× ${i.produto_nome || `Produto #${i.produto}`}`)
                                  .join(", ")
                              : "—"}
                          </TableCell>
                          {isChefe && (
                            <TableCell className="text-right font-medium text-green-600">
                              {formatCurrency(venda.total)}
                            </TableCell>
                          )}
                          <TableCell>
                            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openDetail(venda); }} title="Ver detalhes">
                              <Eye className="size-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="py-8 text-center text-muted-foreground">
                  {vendas.length === 0 ? "Nenhuma venda registrada" : "Nenhuma venda encontrada com os filtros informados."}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!detailVenda} onOpenChange={(open) => !open && setDetailVenda(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Venda – {detailVenda?.clienteNome} – {formatDateOnly(detailVenda?.data)}</DialogTitle>
          </DialogHeader>
          {detailVenda && (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    {isChefe && <TableHead className="text-right">Preço un.</TableHead>}
                    {isChefe && <TableHead className="text-right">Total</TableHead>}
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(detailVenda.itens || []).map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.produto_nome || `#${item.produto}`}</TableCell>
                      <TableCell className="text-right">{item.quantidade}</TableCell>
                      {isChefe && <TableCell className="text-right">{formatCurrency(item.preco_unitario)}</TableCell>}
                      {isChefe && (
                        <TableCell className="text-right">{formatCurrency(item.quantidade * item.preco_unitario)}</TableCell>
                      )}
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveItem(item.id)}
                          className="text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {isChefe && (
                <p className="text-right font-semibold">Total da venda: {formatCurrency(detailVenda.total)}</p>
              )}

              <div className="border-t pt-4 space-y-2">
                <Label>Adicionar produto à mesma venda</Label>
                <div className="flex gap-2 flex-wrap items-center">
                  <Select value={addItemProdutoId} onValueChange={setAddItemProdutoId}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Produto" />
                    </SelectTrigger>
                    <SelectContent>
                      {produtos.map((p: any) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.nome}
                          {isChefe && ` – ${formatCurrency(Number(p.preco_venda ?? p.precoInicial ?? 0))}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={1}
                    className="w-20"
                    value={addItemQuantidade}
                    onChange={(e) => setAddItemQuantidade(e.target.value)}
                  />
                  {isChefe && (
                    <Input
                      type="text"
                      inputMode="decimal"
                      className="w-24"
                      placeholder="Preço un."
                      value={addItemPreco}
                      onChange={(e) => setAddItemPreco(e.target.value)}
                    />
                  )}
                  <Button onClick={handleAddItemToVenda} disabled={detailAdding}>
                    {detailAdding ? "..." : "Adicionar"}
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => detailVenda && imprimirVenda(detailVenda)} title="Imprimir esta venda para o cliente pagar">
                  <Printer className="size-4 mr-2" />
                  Imprimir venda
                </Button>
                <AlertDialog open={copiarConfirmOpen} onOpenChange={setCopiarConfirmOpen}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Copiar venda</AlertDialogTitle>
                      <AlertDialogDescription>
                        Uma nova venda será criada com o mesmo cliente e os mesmos itens. Deseja continuar?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleCopiarVenda}>
                        Copiar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button variant="outline" onClick={() => setCopiarConfirmOpen(true)}>
                  <Copy className="size-4 mr-2" />
                  Copiar venda
                </Button>
                <Button variant="outline" onClick={() => setDetailVenda(null)}>Fechar</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
