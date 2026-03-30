import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
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
import { TrendingUp, Plus, Trash2, Copy, Eye, Pencil, Check, X, Printer, Calendar, Hash, Package, Ban } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { formatDateOnly, parseDateOnlyToTime, getTodayLocalISO } from "../lib/format";
import { useAuth } from "../contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { empresa, empresaEnderecoLinha, empresaDocumento } from "../data/empresa";
import { SimpleConfirmDialog, ConfirmacaoComSenhaDialog } from "../components/ConfirmacaoDialog";

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
  data_lancamento?: string;
  cancelada?: boolean;
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
  const [data, setData] = useState(getTodayLocalISO());
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editQtd, setEditQtd] = useState("");
  const [editPreco, setEditPreco] = useState("");
  const [editingVendaItemId, setEditingVendaItemId] = useState<number | null>(null);
  const [editVendaQtd, setEditVendaQtd] = useState("");
  const [editVendaPreco, setEditVendaPreco] = useState("");
  const [savingVendaItem, setSavingVendaItem] = useState(false);
  const [searchCliente, setSearchCliente] = useState("");
  const [searchItem, setSearchItem] = useState("");
  const [searchData, setSearchData] = useState("");
  const [copiarConfirmOpen, setCopiarConfirmOpen] = useState(false);
  const [simpleConfirm, setSimpleConfirm] = useState<{
    title: string;
    description: string;
    confirmLabel?: string;
    onConfirm: () => void;
  } | null>(null);
  const [excluirVendaOpen, setExcluirVendaOpen] = useState(false);
  const [editDetailDataVenda, setEditDetailDataVenda] = useState("");
  const { user } = useAuth();
  const isChefe = user?.is_chefe === true;

  useEffect(() => {
    if (detailVenda?.data) setEditDetailDataVenda(String(detailVenda.data).slice(0, 10));
  }, [detailVenda?.id, detailVenda?.data]);

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
              data_lancamento: v.data_lancamento || "",
              cancelada: v.cancelada === true,
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
      const raw = d as Record<string, unknown> | null;
      setDetailVenda(
        raw && typeof raw === "object"
          ? { ...d, cancelada: raw.cancelada === true }
          : d
      );
      setAddItemProdutoId("");
      setAddItemQuantidade("1");
       setAddItemPreco("");
    } catch {
      toast.error("Erro ao carregar detalhe da venda");
    }
  };

  const salvarDataVendaNoDetalhe = () => {
    if (!detailVenda || detailVenda.cancelada) return;
    const trimmed = (editDetailDataVenda || "").trim().slice(0, 10);
    if (trimmed.length < 10) {
      toast.error("Informe a data da venda");
      return;
    }
    if (trimmed === String(detailVenda.data || "").slice(0, 10)) {
      toast.info("Data já é esta.");
      return;
    }
    setSimpleConfirm({
      title: "Alterar data da venda",
      description:
        "A data da operação será atualizada. A data de lançamento (quando foi salvo no sistema) não muda.",
      confirmLabel: "Confirmar",
      onConfirm: () => {
        void (async () => {
          try {
            const raw = await api.patchVenda(String(detailVenda.id), { data: trimmed });
            const u = raw as Record<string, unknown>;
            const next: Venda =
              raw && typeof raw === "object"
                ? {
                    ...(raw as unknown as Venda),
                    cancelada: u.cancelada === true,
                    clienteNome: (u.clienteNome as string) || detailVenda.clienteNome,
                    data: (u.data as string) || trimmed,
                    data_lancamento: (u.data_lancamento as string) || detailVenda.data_lancamento,
                    itens: (u.itens as ItemVenda[]) || detailVenda.itens,
                  }
                : detailVenda;
            setDetailVenda(next);
            setVendas((prev) =>
              prev.map((x) =>
                String(x.id) === String(detailVenda.id)
                  ? { ...x, data: next.data || trimmed, data_lancamento: next.data_lancamento }
                  : x
              )
            );
            toast.success("Data da venda atualizada");
            setSimpleConfirm(null);
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Erro ao atualizar data";
            toast.error(msg);
            setSimpleConfirm(null);
          }
        })();
      },
    });
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

  const iniciarEdicaoItemVenda = (item: any) => {
    setEditingVendaItemId(item.id);
    setEditVendaQtd(String(item.quantidade ?? ""));
    setEditVendaPreco(String(item.preco_unitario ?? ""));
  };

  const cancelarEdicaoItemVenda = () => {
    setEditingVendaItemId(null);
    setEditVendaQtd("");
    setEditVendaPreco("");
  };

  const salvarEdicaoItemVenda = () => {
    if (!detailVenda || detailVenda.cancelada) {
      toast.error(detailVenda?.cancelada ? "Esta venda está cancelada." : "");
      return;
    }
    if (!editingVendaItemId) return;
    const qtd = parseInt(editVendaQtd, 10);
    const preco = parseFloat(editVendaPreco.replace(",", "."));
    if (isNaN(qtd) || qtd <= 0) {
      toast.error("Quantidade inválida");
      return;
    }
    if (isNaN(preco) || preco < 0) {
      toast.error("Preço inválido");
      return;
    }
    const vendaId = String(detailVenda.id);
    const itemPk = editingVendaItemId;
    setSimpleConfirm({
      title: "Salvar alterações no item",
      description: "Confirma atualizar quantidade e preço deste item na venda?",
      confirmLabel: "Salvar",
      onConfirm: () => {
        void (async () => {
          setSavingVendaItem(true);
          try {
            const updated = await api.updateItemVenda(vendaId, itemPk, {
              quantidade: qtd,
              preco_unitario: preco,
            });
            setDetailVenda(updated);
            await loadData();
            toast.success("Item atualizado");
            cancelarEdicaoItemVenda();
          } catch (e: any) {
            toast.error(e?.message || "Erro ao atualizar item");
          } finally {
            setSavingVendaItem(false);
          }
        })();
      },
    });
  };

  const imprimirVenda = (venda: Venda) => {
    const dataFormatada = formatDateOnly(venda.data);
    const usuarioNome =
      (user as any)?.first_name ||
      (user as any)?.username ||
      (user as any)?.email ||
      "";
    const toNum = (v: unknown): number => {
      if (typeof v === "number") return isNaN(v) ? 0 : v;
      if (typeof v === "string") {
        const n = Number(v.replace(",", "."));
        return isNaN(n) ? 0 : n;
      }
      if (v == null) return 0;
      const n = Number(v as any);
      return isNaN(n) ? 0 : n;
    };
    const clienteInfo = clientes.find((c: any) => c.id === venda.cliente);
    const clienteDoc = clienteInfo?.cpf || clienteInfo?.cnpj || "";
    const clienteTelefone = clienteInfo?.telefone || "";
    const itens = Array.isArray(venda.itens) ? venda.itens : [];
    const totalCalculadoVenda = itens.reduce((s, i) => {
      const totalItem =
        toNum((i as any).total_item) ||
        toNum((i as any).total) ||
        toNum((i as any).preco_unitario) * toNum((i as any).quantidade);
      return s + totalItem;
    }, 0);
    const totalVenda = toNum((venda as any).total) > 0 ? toNum((venda as any).total) : totalCalculadoVenda;

    const itensRows = itens
      .map((i) => {
        const precoUnit =
          toNum((i as any).preco_unitario) || toNum((i as any).precoUnitario) || 0;
        const qtd = toNum((i as any).quantidade);
        const totalItem =
          toNum((i as any).total_item) || toNum((i as any).total) || (precoUnit * qtd);
        if (isChefe) {
          // Chefe vê quantidade, valor unitário e total
          return `<tr>
            <td>${i.produto_nome || `Produto #${i.produto}`}</td>
            <td class="num">${qtd}</td>
            <td class="num">${formatCurrency(precoUnit)}</td>
            <td class="num">${formatCurrency(totalItem)}</td>
          </tr>`;
        }
        // Funcionário vê apenas produto e quantidade
        return `<tr>
          <td>${i.produto_nome || `Produto #${i.produto}`}</td>
          <td class="num">${qtd}</td>
        </tr>`;
      })
      .join("");
    const numeroVenda = venda.id != null ? String(venda.id) : "";
    const conteudoVia = (viaLabel: string) => `
      <div class="doc">
        <div class="via">${viaLabel}</div>
        ${getEmpresaHeaderHtml()}
        <div class="doc-title">
          <h1>VENDA</h1>
          <div class="sub">Nº ${numeroVenda || "-"} — ${dataFormatada}</div>
        </div>

        <div class="info">
          <div><strong>Cliente:</strong> ${venda.clienteNome}</div>
          ${clienteDoc ? `<div><strong>Doc:</strong> ${clienteDoc}</div>` : ""}
          ${clienteTelefone ? `<div><strong>Telefone:</strong> ${clienteTelefone}</div>` : ""}
          <div><strong>Lançado por:</strong> ${usuarioNome || "-"}</div>
        </div>

        <div class="tabela-itens">
          <table>
            <thead>
              ${
                isChefe
                  ? `<tr>
                       <th style="width: 46%;">Produto</th>
                       <th class="num" style="width: 18%;">Qtd</th>
                       <th class="num" style="width: 18%;">Vlr unitário</th>
                       <th class="num" style="width: 18%;">Total</th>
                     </tr>`
                  : `<tr>
                       <th style="width: 70%;">Produto</th>
                       <th class="num" style="width: 30%;">Qtd</th>
                     </tr>`
              }
            </thead>
            <tbody>
              ${itensRows}
            </tbody>
          </table>
          ${isChefe ? `<div class="total-venda"><strong>Total da venda: ${formatCurrency(totalVenda)}</strong></div>` : ""}
        </div>

        <div class="assinatura">
          <div class="assinatura-linha"></div>
          <div class="assinatura-texto">Assinatura do cliente</div>
        </div>
      </div>
    `;

    const html = `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><title></title>
    <style>
      @page { size: A4; margin: 0; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body { font-family: 'Segoe UI', system-ui, sans-serif; font-size: 11.5px; color: #111827; line-height: 1.25; background: #ffffff; }
      .folha { position: relative; width: 210mm; height: 297mm; margin: 0 auto; }
      .folha::after {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        top: 50%;
        border-top: 2px dashed #cbd5e1;
        transform: translateY(-1px);
      }
      .folha::before {
        content: "corte aqui";
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #ffffff;
        padding: 0 8px;
        font-size: 10px;
        color: #94a3b8;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .grid { display: grid; grid-template-rows: 1fr 1fr; height: 100%; }
      .via-bloco { height: 148.5mm; padding: 7mm; }
      .doc { width: 100%; height: 100%; background: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; padding: 10px 10px 8px; display: flex; flex-direction: column; }
      .via { font-size: 10.5px; color: #6b7280; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 4px; }
      .os-header{display:flex;gap:8px;align-items:center;margin-bottom:6px}
      .os-logo img{max-height:38px;max-width:38px;object-fit:contain}
      .empresa-block { font-size: 10px; }
      .empresa-nome { font-size: 11px; font-weight: 700; color: #111827; letter-spacing: 0.01em; line-height: 1.15; }
      .empresa-fantasia { font-size: 10px; color: #4b5563; margin-top: 1px; }
      .empresa-docs { font-size: 9.5px; color: #6b7280; margin-top: 2px; }
      .empresa-docs span + span::before { content: " | "; }
      .empresa-endereco { font-size: 9.5px; color: #6b7280; margin-top: 1px; }
      .empresa-contato { font-size: 9.5px; color: #6b7280; margin-top: 1px; }
      .doc-title { text-align: right; margin-bottom: 6px; }
      .doc-title h1 { margin: 0; font-size: 12px; letter-spacing: 0.14em; color: #111827; }
      .doc-title .sub { font-size: 9.5px; color: #6b7280; margin-top: 2px; }
      .info {
        background: #ffffff;
        border-radius: 8px;
        padding: 8px 10px;
        margin-bottom: 10px;
        font-size: 11px;
        border: 1px solid #e5e7eb;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 4px 10px;
      }
      .info strong { font-weight: 600; color: #374151; }
      .tabela-itens table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 10px; border-radius: 6px; overflow: hidden; }
      .tabela-itens th, .tabela-itens td { border: 1px solid #e5e7eb; padding: 5px 6px; text-align: left; }
      .tabela-itens th { background: #f3f4f6; font-weight: 700; color: #374151; }
      .tabela-itens .num { text-align: right; white-space: nowrap; }
      .total-venda { display:flex; justify-content:flex-end; margin-top:6px; font-size:11px; }
      .assinatura { margin-top: auto; padding-top: 8px; text-align: center; }
      .assinatura-linha { width: 55%; max-width: 220px; margin: 0 auto 4px; border-bottom: 2px solid #4b5563; height: 18px; }
      .assinatura-texto { font-size: 9.5px; color: #6b7280; }
      @media print {
        /* Força layout em P&B (sem fundos) */
        * { -webkit-print-color-adjust: economy; print-color-adjust: economy; }
        body { background: #ffffff !important; color: #000 !important; }
        .doc { border-color: #000 !important; }
        .info { border-color: #000 !important; }
        .tabela-itens th, .tabela-itens td { border-color: #000 !important; }
        .tabela-itens th { background: #fff !important; color: #000 !important; }
        .empresa-fantasia, .empresa-docs, .empresa-endereco, .empresa-contato, .doc-title .sub, .via, .assinatura-texto { color: #000 !important; }
        .folha::after { border-top-color: #000 !important; }
        .folha::before { color: #000 !important; }
      }
    </style>
  </head>
  <body>
    <div class="folha">
      <div class="grid">
        <div class="via-bloco">${conteudoVia("Via do cliente")}</div>
        <div class="via-bloco">${conteudoVia("Via da empresa")}</div>
      </div>
    </div>
  </body>
</html>`;
    const janela = window.open("", "_blank");
    if (!janela) {
      toast.error("Permita pop-ups para imprimir.");
      return;
    }
    try {
      janela.document.title = "";
    } catch {}
    janela.document.write(html);
    janela.document.close();
    janela.focus();
    setTimeout(() => janela.print(), 300);
  };

  const handleAddItemToVenda = async () => {
    if (!detailVenda || detailVenda.cancelada) {
      toast.error(detailVenda?.cancelada ? "Esta venda está cancelada." : "Abra uma venda válida");
      return;
    }
    if (!addItemProdutoId || !addItemQuantidade) {
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

    const vendaId = String(detailVenda.id);
    const produtoNum = Number(addItemProdutoId);
    setSimpleConfirm({
      title: "Adicionar item à venda",
      description: "Confirma incluir este produto na venda atual?",
      onConfirm: () => {
        void (async () => {
          setDetailAdding(true);
          try {
            const updated = await api.addItemVenda(vendaId, {
              produto: produtoNum,
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
        })();
      },
    });
  };

  const handleRemoveItem = (itemId: number) => {
    if (!detailVenda || detailVenda.cancelada) {
      toast.error(detailVenda?.cancelada ? "Esta venda está cancelada." : "");
      return;
    }
    const vendaId = String(detailVenda.id);
    setSimpleConfirm({
      title: "Remover item",
      description: "Confirma remover este item da venda? Esta alteração não pode ser desfeita pelo sistema.",
      confirmLabel: "Remover",
      onConfirm: () => {
        void (async () => {
          try {
            await api.removeItemVenda(vendaId, itemId);
            const updated = await api.getVendaDetalhe(vendaId);
            setDetailVenda(updated);
            await loadData();
            toast.success("Item removido");
          } catch {
            toast.error("Erro ao remover item");
          }
        })();
      },
    });
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

    const dataVenda = (data || "").trim().slice(0, 10);
    if (dataVenda.length < 10) {
      toast.error("Informe a data da venda");
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

    setSimpleConfirm({
      title: "Registrar venda",
      description: "Confirma registrar esta venda com os itens e valores indicados?",
      confirmLabel: "Registrar venda",
      onConfirm: () => {
        void (async () => {
          try {
            await api.createVenda({
              cliente: Number(clienteId),
              itens: itensPayload,
              data: dataVenda,
              data_venda: dataVenda,
              forma_pagamento: formaPagamento || undefined,
            });
            toast.success("Venda registrada com sucesso");
            await loadData();
            resetForm();
          } catch {
            toast.error("Erro ao registrar venda");
          }
        })();
      },
    });
  };


  const resetForm = () => {
    setClienteId("");
    setProdutoId("");
    setPrecoUnitario("");
    setQuantidade("");
    setFormaPagamento("");
    setData(getTodayLocalISO());
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
                          <TableCell className="font-medium">
                            <span className="inline-flex items-center gap-1.5">
                              {venda.cancelada ? (
                                <Ban className="size-3.5 shrink-0 text-destructive" aria-hidden title="Venda cancelada" />
                              ) : null}
                              <span className={venda.cancelada ? "text-muted-foreground" : undefined}>{venda.clienteNome}</span>
                            </span>
                          </TableCell>
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
                            <span className="relative inline-flex">
                              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openDetail(venda); }} title="Ver detalhes">
                                <Eye className="size-4" />
                              </Button>
                              {venda.cancelada ? (
                                <span
                                  className="pointer-events-none absolute -right-0.5 -top-0.5 size-2 rounded-full bg-destructive ring-2 ring-background"
                                  title="Cancelada"
                                  aria-hidden
                                />
                              ) : null}
                            </span>
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
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          {detailVenda && (
            <>
              <DialogHeader className="shrink-0 space-y-4 border-b bg-gradient-to-br from-muted/80 to-muted/30 px-6 pb-5 pt-6 text-left sm:pr-12">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Detalhe da venda
                </p>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <DialogTitle className="flex items-center gap-2 text-xl font-semibold leading-tight sm:text-2xl">
                      {detailVenda.cancelada ? (
                        <Ban className="size-5 shrink-0 text-destructive" aria-hidden title="Venda cancelada" />
                      ) : null}
                      {detailVenda.clienteNome}
                    </DialogTitle>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5" title="Data da operação de venda">
                        <Calendar className="size-3.5 shrink-0" />
                        {formatDateOnly(detailVenda.data)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Hash className="size-3.5 shrink-0" />
                        Nº {detailVenda.id}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {detailVenda.cancelada ? (
                      <Badge variant="destructive">Cancelada</Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100">
                        Ativa
                      </Badge>
                    )}
                    <Badge variant="outline" className="font-normal">
                      <Package className="size-3" />
                      {(detailVenda.itens || []).length} item(ns)
                    </Badge>
                  </div>
                </div>
              </DialogHeader>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <div className="mb-4 space-y-3 rounded-xl border bg-muted/20 p-4">
                  <div className="grid gap-0.5 text-sm">
                    <span className="text-muted-foreground">Data de lançamento (registro no sistema)</span>
                    <span className="font-medium tabular-nums">
                      {detailVenda.data_lancamento ? formatDateOnly(detailVenda.data_lancamento) : "—"}
                    </span>
                  </div>
                  {!detailVenda.cancelada && (
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                      <div className="space-y-1.5 min-w-[180px]">
                        <Label htmlFor="detalhe-data-venda">Data da venda (operação)</Label>
                        <Input
                          id="detalhe-data-venda"
                          name="venda-operacao-data-uid"
                          type="date"
                          autoComplete="off"
                          value={editDetailDataVenda}
                          onChange={(e) => setEditDetailDataVenda(e.target.value.slice(0, 10))}
                        />
                      </div>
                      <Button type="button" variant="secondary" onClick={() => salvarDataVendaNoDetalhe()}>
                        Guardar data
                      </Button>
                    </div>
                  )}
                </div>
                <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                  <Table>
                <TableHeader>
                  <TableRow className="border-b bg-muted/50 hover:bg-muted/50">
                    <TableHead className="font-semibold">Produto</TableHead>
                    <TableHead className="text-right font-semibold">Qtd</TableHead>
                    {isChefe && <TableHead className="text-right font-semibold">Preço un.</TableHead>}
                    {isChefe && <TableHead className="text-right font-semibold">Total</TableHead>}
                    <TableHead className="w-[52px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(detailVenda.itens || []).map((item) => (
                    <TableRow key={item.id} className="border-border/60">
                      <TableCell className="font-medium">{item.produto_nome || `#${item.produto}`}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {isChefe && editingVendaItemId === item.id ? (
                          <Input
                            type="number"
                            min={1}
                            className="h-8 w-20 ml-auto text-right"
                            value={editVendaQtd}
                            onChange={(e) => setEditVendaQtd(e.target.value)}
                          />
                        ) : (
                          item.quantidade
                        )}
                      </TableCell>
                      {isChefe && (
                        <TableCell className="text-right">
                          {editingVendaItemId === item.id ? (
                            <Input
                              type="text"
                              inputMode="decimal"
                              className="h-8 w-24 ml-auto text-right"
                              value={editVendaPreco}
                              onChange={(e) => setEditVendaPreco(e.target.value)}
                            />
                          ) : (
                            formatCurrency(item.preco_unitario)
                          )}
                        </TableCell>
                      )}
                      {isChefe && (
                        <TableCell className="text-right">{formatCurrency(item.quantidade * item.preco_unitario)}</TableCell>
                      )}
                      <TableCell>
                        {isChefe ? (
                          <div className="flex items-center justify-end gap-1">
                            {editingVendaItemId === item.id ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={salvarEdicaoItemVenda}
                                  disabled={savingVendaItem}
                                  title="Salvar"
                                >
                                  <Check className="size-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={cancelarEdicaoItemVenda}
                                  disabled={savingVendaItem}
                                  title="Cancelar"
                                >
                                  <X className="size-4" />
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => iniciarEdicaoItemVenda(item)}
                                title="Editar item"
                                disabled={!!detailVenda.cancelada}
                              >
                                <Pencil className="size-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveItem(item.id)}
                              className="text-destructive"
                              title="Remover item"
                              disabled={savingVendaItem || !!detailVenda.cancelada}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveItem(item.id)}
                            className="text-destructive"
                            title="Remover item"
                            disabled={!!detailVenda.cancelada}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
                </div>

              {isChefe && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3.5">
                  <span className="text-sm font-medium text-muted-foreground">Total da venda</span>
                  <span className="text-xl font-bold tabular-nums tracking-tight text-foreground">
                    {formatCurrency(detailVenda.total)}
                  </span>
                </div>
              )}

              <div className="mt-5 rounded-xl border bg-card p-4 shadow-sm space-y-3">
                <Label className="text-sm font-semibold">Adicionar produto à mesma venda</Label>
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
                  <Button onClick={() => void handleAddItemToVenda()} disabled={detailAdding || detailVenda.cancelada}>
                    {detailAdding ? "..." : "Adicionar"}
                  </Button>
                </div>
              </div>
              </div>

              <DialogFooter className="shrink-0 gap-2 border-t bg-muted/30 px-6 py-4 sm:flex sm:flex-row sm:flex-wrap sm:justify-end">
                <Button variant="outline" onClick={() => detailVenda && imprimirVenda(detailVenda)} title="Imprimir esta venda para o cliente pagar">
                  <Printer className="size-4 mr-2" />
                  Imprimir venda
                </Button>
                {!detailVenda.cancelada && (
                  <Button
                    variant="destructive"
                    onClick={() => setExcluirVendaOpen(true)}
                    title="Cancelar esta venda (exige senha)"
                  >
                    <Trash2 className="size-4 mr-2" />
                    Excluir venda
                  </Button>
                )}
                <Button variant="outline" onClick={() => setCopiarConfirmOpen(true)} disabled={!!detailVenda.cancelada}>
                  <Copy className="size-4 mr-2" />
                  Copiar venda
                </Button>
                <Button variant="default" onClick={() => setDetailVenda(null)}>
                  Fechar
                </Button>
              </DialogFooter>
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
            </>
          )}
        </DialogContent>
      </Dialog>

      {simpleConfirm ? (
        <SimpleConfirmDialog
          open
          onOpenChange={(o) => {
            if (!o) setSimpleConfirm(null);
          }}
          title={simpleConfirm.title}
          description={simpleConfirm.description}
          confirmLabel={simpleConfirm.confirmLabel}
          onConfirm={simpleConfirm.onConfirm}
        />
      ) : null}

      <ConfirmacaoComSenhaDialog
        open={excluirVendaOpen}
        onOpenChange={setExcluirVendaOpen}
        title="Excluir venda"
        description="A venda será cancelada e deixará de contar no saldo do cliente (fica no histórico como cancelada). Digite sua senha para confirmar."
        confirmLabel="Confirmar exclusão"
        onVerified={async () => {
          if (!detailVenda) return;
          await api.deleteVenda(String(detailVenda.id));
          toast.success("Venda cancelada");
          await loadData();
          setDetailVenda(null);
        }}
      />
    </div>
  );
}
