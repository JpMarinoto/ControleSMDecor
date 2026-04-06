import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { ShoppingCart, Plus, Trash2, Eye, Copy, Pencil, Check, X, Printer, Calendar, Hash, Package, Ban } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { formatDateOnly, parseDateOnlyToTime, parseLancamentoToTime, getTodayLocalISO } from "../lib/format";
import { useAuth } from "../contexts/AuthContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { empresa, empresaEnderecoLinha, empresaDocumento } from "../data/empresa";
import { SimpleConfirmDialog, ConfirmacaoComSenhaDialog } from "../components/ConfirmacaoDialog";
import { DocumentPrintPreview } from "../components/DocumentPrintPreview";

interface ItemCompra {
  id: number;
  tipo?: "material" | "produto";
  material?: number;
  material_nome?: string;
  produto?: number;
  produto_nome?: string;
  quantidade: number;
  preco_no_dia: number;
  total: number;
}

interface OrdemCompra {
  id: string | number;
  fornecedor: string;
  fornecedor_id?: number;
  data: string;
  data_lancamento?: string;
  cancelada?: boolean;
  itens: ItemCompra[];
  total: number;
}

function sortOrdemCompraRecentFirst(a: OrdemCompra, b: OrdemCompra): number {
  const t =
    parseLancamentoToTime(b.data_lancamento, b.data) - parseLancamentoToTime(a.data_lancamento, a.data);
  if (t !== 0) return t;
  const na = Number(a.id);
  const nb = Number(b.id);
  if (!isNaN(na) && !isNaN(nb)) return nb - na;
  return String(b.id).localeCompare(String(a.id));
}

interface NovoItemCompraForm {
  id: string;
  materialId: string;
  quantidade: string;
  precoUnitario: string;
}

/** Inclui na compra se o fornecedor do produto coincide com o da ordem ou ainda não foi definido (não mistura produto de outro fornecedor). */
function produtoDisponivelParaFornecedor(p: any, fid: string) {
  const pf = p.fornecedor;
  if (pf == null || pf === "" || String(pf) === "null" || String(pf) === "undefined") return true;
  return String(pf) === String(fid);
}

/** Mesma regra da API: compra como item pronto se não é fabricado e (revenda ou tem fornecedor no cadastro). */
function produtoElegivelCompraPronta(p: any) {
  if (p.fabricado) return false;
  if (p.revenda) return true;
  const fid = p.fornecedor;
  return fid != null && fid !== "" && String(fid) !== "null" && String(fid) !== "undefined";
}

/**
 * Quantidade inteira na compra: parseInt("2999.999…", 10) vira 2999 (input number / float em texto).
 * Aceita milhar pt-BR (ex.: 30.000).
 */
function parseQtdInteira(raw: string | number): number | null {
  if (raw === "" || raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    const r = Math.round(raw);
    return r > 0 ? r : null;
  }
  const s = String(raw).trim().replace(/\s/g, "");
  if (!s) return null;
  const milharOpcDecimal = /^(\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/;
  const norm = milharOpcDecimal.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(",", ".");
  const n = parseFloat(norm);
  if (!Number.isFinite(n) || n <= 0) return null;
  const r = Math.round(n);
  return r > 0 ? r : null;
}

export function Compra() {
  const [ordens, setOrdens] = useState<OrdemCompra[]>([]);
  const [materiais, setMateriais] = useState<any[]>([]);
  const [produtosRevenda, setProdutosRevenda] = useState<any[]>([]);
  const [fornecedores, setFornecedores] = useState<any[]>([]);
  
  const [materialId, setMaterialId] = useState('');
  const [produtoId, setProdutoId] = useState('');
  const [fornecedorId, setFornecedorId] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [precoUnitario, setPrecoUnitario] = useState('');
  const [data, setData] = useState(getTodayLocalISO());
  const [tipoItem, setTipoItem] = useState<"material" | "produto">("material");

  const [itensForm, setItensForm] = useState<NovoItemCompraForm[]>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editQtd, setEditQtd] = useState("");
  const [editPreco, setEditPreco] = useState("");
  const [searchFornecedor, setSearchFornecedor] = useState("");
  const [searchData, setSearchData] = useState("");
  const [searchProduto, setSearchProduto] = useState("");
  const [editingItem, setEditingItem] = useState<ItemCompra & { ordemId: string | number } | null>(null);
  const [editCompraQtd, setEditCompraQtd] = useState("");
  const [editCompraPreco, setEditCompraPreco] = useState("");
  const [detailCompra, setDetailCompra] = useState<OrdemCompra | null>(null);
  const [simpleConfirm, setSimpleConfirm] = useState<{
    title: string;
    description: string;
    confirmLabel?: string;
    onConfirm: () => void;
  } | null>(null);
  const [excluirCompraOpen, setExcluirCompraOpen] = useState(false);
  const [excluirItemCompraId, setExcluirItemCompraId] = useState<string | number | null>(null);
  const [printPreview, setPrintPreview] = useState<{
    html: string;
    titulo: string;
    downloadBaseName: string;
  } | null>(null);
  const [editDetailDataCompra, setEditDetailDataCompra] = useState("");
  const { user } = useAuth();
  const isChefe = user?.is_chefe === true;

  useEffect(() => {
    if (detailCompra?.data) setEditDetailDataCompra(String(detailCompra.data).slice(0, 10));
  }, [detailCompra?.id, detailCompra?.data]);

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

  useEffect(() => {
    if (!fornecedorId || !materialId) return;
    const mat = materiais.find((m: any) => String(m.id) === materialId);
    if (mat && (String(mat.fornecedor_padrao ?? mat.fornecedor_padrao_id) === String(fornecedorId))) {
      const preco = mat.precoUnitarioBase ?? mat.preco_unitario_base;
      if (preco != null) setPrecoUnitario(String(preco));
    }
  }, [fornecedorId, materialId, materiais]);

  // Ao trocar o fornecedor, limpar material selecionado se não estiver vinculado a ele
  useEffect(() => {
    if (!fornecedorId) {
      setMaterialId("");
      return;
    }
    const vinculados = materiais.filter(
      (m: any) => String(m.fornecedor_padrao ?? m.fornecedor_padrao_id) === String(fornecedorId)
    );
    const pertence = vinculados.some((m: any) => String(m.id) === materialId);
    if (materialId && !pertence) setMaterialId("");
  }, [fornecedorId, materiais]);

  useEffect(() => {
    if (!fornecedorId || !produtoId) return;
    const p = produtosRevenda.find((x: any) => String(x.id) === produtoId);
    if (p && !produtoDisponivelParaFornecedor(p, fornecedorId)) setProdutoId("");
  }, [fornecedorId, produtoId, produtosRevenda]);

  const loadData = async () => {
    try {
      const [ordensRes, materiaisRes, produtosRes, fornRes] = await Promise.all([
        api.getCompras().catch(() => []),
        api.getMateriais().catch(() => []),
        api.getProdutos().catch(() => []),
        api.getFornecedores().catch(() => []),
      ]);
      setOrdens(
        Array.isArray(ordensRes)
          ? ordensRes.map((o: any) => ({
              id: o.id,
              fornecedor: o.fornecedor || "",
              fornecedor_id: o.fornecedor_id,
              data: o.data || "",
              data_lancamento: o.data_lancamento || "",
              cancelada: o.cancelada === true,
              itens: (o.itens || []).map((i: any) => ({
                id: i.id,
                tipo: (i.tipo === "produto" ? "produto" : "material") as "material" | "produto",
                material: i.material,
                material_nome: i.material_nome || "",
                produto: i.produto,
                produto_nome: i.produto_nome || "",
                quantidade: parseQtdInteira(i.quantidade) ?? 0,
                preco_no_dia: Number(i.preco_no_dia) || 0,
                total: Number(i.total) || 0,
              })),
              total: Number(o.total) || 0,
            }))
          : []
      );
      setMateriais(Array.isArray(materiaisRes) ? materiaisRes : []);
      const allProds = Array.isArray(produtosRes) ? produtosRes : [];
      setProdutosRevenda(allProds.filter((p: any) => produtoElegivelCompraPronta(p)));
      setFornecedores(Array.isArray(fornRes) ? fornRes : []);
    } catch {
      toast.error("Erro ao carregar dados");
    }
  };

  const openDetail = async (ordem: OrdemCompra) => {
    const idStr = String(ordem.id);
    if (idStr.startsWith("item-")) {
      setDetailCompra(ordem);
      return;
    }
    try {
      const d = await api.getCompraDetalhe(idStr);
      setDetailCompra(d);
    } catch {
      toast.error("Erro ao carregar detalhe da compra");
    }
  };

  const salvarDataCompraNoDetalhe = () => {
    if (!detailCompra || !/^\d+$/.test(String(detailCompra.id))) return;
    if (detailCompra.cancelada) {
      toast.error("Esta ordem está cancelada.");
      return;
    }
    const trimmed = (editDetailDataCompra || "").trim().slice(0, 10);
    if (trimmed.length < 10) {
      toast.error("Informe a data da compra");
      return;
    }
    if (trimmed === String(detailCompra.data || "").slice(0, 10)) {
      toast.info("Data já é esta.");
      return;
    }
    setSimpleConfirm({
      title: "Alterar data da compra",
      description:
        "A data da operação será atualizada nesta ordem e em todos os itens. A data de lançamento não muda.",
      confirmLabel: "Confirmar",
      onConfirm: () => {
        void (async () => {
          try {
            const idStr = String(detailCompra.id);
            const raw = await api.patchCompraOrdemData(idStr, { data: trimmed });
            const r = raw as Record<string, unknown>;
            const next: OrdemCompra =
              raw && typeof raw === "object"
                ? {
                    id: r.id as string | number,
                    fornecedor: (r.fornecedor as string) || detailCompra.fornecedor,
                    fornecedor_id: (r.fornecedor_id as number) ?? detailCompra.fornecedor_id,
                    data: (r.data as string) || trimmed,
                    data_lancamento: (r.data_lancamento as string) || detailCompra.data_lancamento,
                    cancelada: (r.cancelada as boolean) === true,
                    itens: (r.itens as ItemCompra[]) || detailCompra.itens,
                    total: Number(r.total) || detailCompra.total,
                  }
                : detailCompra;
            setDetailCompra(next);
            setOrdens((prev) =>
              prev.map((x) =>
                String(x.id) === idStr
                  ? { ...x, data: next.data || trimmed, data_lancamento: next.data_lancamento, cancelada: next.cancelada }
                  : x
              )
            );
            toast.success("Data da compra atualizada");
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

  const handleCopiarOrdem = () => {
    if (!detailCompra) return;
    if (detailCompra.cancelada) {
      toast.error("Não é possível copiar uma ordem cancelada.");
      return;
    }
    const idCopia = String(detailCompra.id);
    setSimpleConfirm({
      title: "Copiar ordem de compra",
      description: "Será criada uma nova ordem com os mesmos itens e fornecedor. Confirma?",
      confirmLabel: "Copiar",
      onConfirm: () => {
        void (async () => {
          try {
            await api.copiarCompra(idCopia);
            toast.success("Ordem copiada com sucesso");
            await loadData();
            setDetailCompra(null);
          } catch {
            toast.error("Erro ao copiar ordem");
          }
        })();
      },
    });
  };

  const handleDeleteCompra = async (id: string | number, motivo: string) => {
    try {
      await api.deleteCompra(String(id), motivo);
      toast.success("Item excluído");
      await loadData();
      setDetailCompra(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir");
    }
  };

  const copiarItemNaLista = (id: string) => {
    const item = itensForm.find((i) => i.id === id);
    if (!item) return;
    setItensForm((prev) => [...prev, { ...item, id: `${Date.now()}-${prev.length}` }]);
    toast.success("Item duplicado na lista");
  };

  const iniciarEdicaoItem = (item: NovoItemCompraForm) => {
    setEditingItemId(item.id);
    setEditQtd(item.quantidade);
    setEditPreco(item.precoUnitario);
  };

  const salvarEdicaoItem = () => {
    if (!editingItemId) return;
    const qtd = parseQtdInteira(editQtd);
    if (qtd === null) {
      toast.error("Quantidade deve ser válida");
      return;
    }
    if (isChefe) {
      const preco = parseFloat(editPreco.replace(",", "."));
      if (isNaN(preco) || preco < 0) {
        toast.error("Preço deve ser válido");
        return;
      }
    }
    setItensForm((prev) =>
      prev.map((i) =>
        i.id === editingItemId
          ? { ...i, quantidade: String(qtd), ...(isChefe ? { precoUnitario: editPreco } : {}) }
          : i
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

  const abrirEditarItem = (item: ItemCompra, ordemId: string | number) => {
    setEditingItem({ ...item, ordemId });
    setEditCompraQtd(String(item.quantidade));
    setEditCompraPreco(String(item.preco_no_dia));
  };

  const salvarEdicaoItemCompra = () => {
    if (!editingItem) return;
    const qtd = parseQtdInteira(editCompraQtd);
    if (qtd === null) {
      toast.error("Quantidade deve ser válida");
      return;
    }
    const preco = isChefe ? parseFloat(editCompraPreco.replace(",", ".")) : editingItem.preco_no_dia;
    if (isChefe && (isNaN(preco) || preco < 0)) {
      toast.error("Preço deve ser válido");
      return;
    }
    const itemId = String(editingItem.id);
    const ordemIdRef = editingItem.ordemId;
    const detId = detailCompra ? String(detailCompra.id) : null;
    setSimpleConfirm({
      title: "Salvar alterações na compra",
      description: "Confirma atualizar quantidade e preço deste item?",
      confirmLabel: "Salvar",
      onConfirm: () => {
        void (async () => {
          try {
            await api.updateCompra(itemId, { quantidade: qtd, preco_no_dia: preco });
            toast.success("Item atualizado");
            await loadData();
            setEditingItem(null);
            if (detId && detId === String(ordemIdRef)) {
              const d = await api.getCompraDetalhe(String(ordemIdRef));
              setDetailCompra(d);
            }
          } catch {
            toast.error("Erro ao atualizar item");
          }
        })();
      },
    });
  };

  const imprimirCompra = (ordem: OrdemCompra) => {
    const dataFormatada = formatDateOnly(ordem.data);
    const mostrarValores = isChefe; // chefe vê valores, funcionário não
    const usuarioNome =
      (user as any)?.first_name ||
      (user as any)?.username ||
      (user as any)?.email ||
      "";

    const itensRows = (ordem.itens || [])
      .map((i) => {
        if (mostrarValores) {
          return `<tr>
            <td>${getItemNome(i)}</td>
            <td class="num">${i.quantidade}</td>
            <td class="num">${formatCurrency(i.preco_no_dia)}</td>
            <td class="num">${formatCurrency(i.total)}</td>
          </tr>`;
        }
        return `<tr>
          <td>${getItemNome(i)}</td>
          <td class="num">${i.quantidade}</td>
          <td class="num">-</td>
          <td class="num">-</td>
        </tr>`;
      })
      .join("");

    const hojeStr = new Date().toLocaleString("pt-BR");

    const html = `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><title>Ordem de compra – ${ordem.fornecedor}</title>
    <style>
      @page { size: A4; margin: 15mm; }
      body { font-family: 'Segoe UI', system-ui, sans-serif; font-size: 12px; color: #1a1a1a; line-height: 1.45; max-width: 210mm; margin: 0 auto; padding: 16px; background: #f3f4f6; }
      .doc { background: #ffffff; border-radius: 10px; border: 1px solid #e2e8f0; padding: 18px 20px 20px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); }
      .os-header{display:flex;gap:8px;align-items:center;margin-bottom:6px}
      .os-logo img{max-height:56px;max-width:56px;object-fit:contain}
      .empresa-block { font-size: 0.7rem; }
      .empresa-nome { font-size: 0.85rem; font-weight: 600; color: #111827; letter-spacing: 0.02em; line-height: 1.3; }
      .empresa-fantasia { font-size: 0.7rem; color: #4b5563; margin-top: 2px; }
      .empresa-docs { font-size: 0.65rem; color: #6b7280; margin-top: 4px; }
      .empresa-docs span + span::before { content: " | "; }
      .empresa-endereco { font-size: 0.65rem; color: #6b7280; margin-top: 2px; }
      .empresa-contato { font-size: 0.65rem; color: #6b7280; margin-top: 2px; }
      .doc-title { text-align: right; margin-bottom: 10px; }
      .doc-title h1 { margin: 0; font-size: 16px; letter-spacing: 0.16em; color: #111827; }
      .doc-title .sub { font-size: 11px; color: #6b7280; margin-top: 4px; }
      .info {
        background: #f9fafb;
        border-radius: 10px;
        padding: 12px 14px;
        margin-bottom: 18px;
        font-size: 12px;
        border: 1px solid #e5e7eb;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px 14px;
      }
      .info strong { font-weight: 600; color: #374151; }
      .resumo-box {
        background: linear-gradient(135deg, #fefce8 0%, #fef3c7 100%);
        border: 1px solid #facc15;
        border-radius: 10px;
        padding: 10px 12px;
        margin-bottom: 16px;
        font-size: 12px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
      }
      .resumo-box .label { font-weight: 600; color: #854d0e; }
      .resumo-box .valor { font-weight: 700; font-size: 14px; color: #b45309; }
      .tabela-itens table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 11px; border-radius: 6px; overflow: hidden; }
      .tabela-itens th, .tabela-itens td { border: 1px solid #e5e7eb; padding: 7px 8px; text-align: left; }
      .tabela-itens th { background: #f3f4f6; font-weight: 600; color: #374151; }
      .tabela-itens .num { text-align: right; white-space: nowrap; }
      .muted { color: #6b7280; font-size: 11px; margin-top: 18px; display: flex; justify-content: space-between; gap: 8px; }
      .assinatura { margin-top: 28px; text-align: center; }
      .assinatura-linha { width: 60%; max-width: 240px; margin: 0 auto 6px; border-bottom: 2px solid #4b5563; height: 28px; }
      .assinatura-texto { font-size: 11px; color: #6b7280; }
      @media print {
        body { background: #ffffff; padding: 0; }
        .doc { box-shadow: none; border-radius: 0; border: none; }
      }
    </style>
  </head>
  <body>
    <div class="doc">
      ${getEmpresaHeaderHtml()}
      <div class="doc-title">
        <h1>ORDEM DE COMPRA</h1>
        <div class="sub">Nº ${ordem.id} — ${dataFormatada}</div>
      </div>

      <div class="info">
        <div><strong>Fornecedor:</strong> ${ordem.fornecedor}</div>
        <div><strong>Data da ordem:</strong> ${dataFormatada}</div>
        <div><strong>Lançado por:</strong> ${usuarioNome || "-"}</div>
      </div>

      ${
        mostrarValores
          ? `<div class="resumo-box">
              <div class="label">Total da ordem</div>
              <div class="valor">${formatCurrency(ordem.total)}</div>
            </div>`
          : ""
      }

      <div class="tabela-itens">
        <table>
          <thead>
            <tr>
              <th style="width: 46%;">Material</th>
              <th class="num" style="width: 14%;">Qtd</th>
              <th class="num" style="width: 20%;">V. unitário</th>
              <th class="num" style="width: 20%;">Total item</th>
            </tr>
          </thead>
          <tbody>
            ${itensRows}
          </tbody>
        </table>
      </div>

      <div class="assinatura">
        <div class="assinatura-linha"></div>
        <div class="assinatura-texto">Assinatura / Conferência</div>
      </div>

      <div class="muted">
        <span>Documento gerado para controle interno de compras.</span>
        <span>Impresso em ${hojeStr}</span>
      </div>
    </div>
  </body>
</html>`;
    const tituloPrev = `Ordem #${ordem.id} — ${ordem.fornecedor || ""}`.trim();
    void api
      .registrarImpressao({
        tipo: "compra",
        titulo: tituloPrev,
        html,
        meta: { ordem_id: ordem.id },
      })
      .catch(() => {});
    setPrintPreview({
      html,
      titulo: tituloPrev,
      downloadBaseName: `ordem-compra-${ordem.id}`,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!fornecedorId) {
      toast.error('Selecione o fornecedor');
      return;
    }

    if (itensForm.length === 0) {
      toast.error('Adicione pelo menos um item na compra');
      return;
    }

    const dataCompra = (data || "").trim().slice(0, 10);
    if (dataCompra.length < 10) {
      toast.error("Informe a data da compra");
      return;
    }

    const itensPayload = itensForm
      .filter((item) => {
        const qtd = parseQtdInteira(item.quantidade);
        const preco = parseFloat(item.precoUnitario.replace(',', '.'));
        return item.materialId && qtd !== null && qtd > 0 && !isNaN(preco) && preco > 0;
      })
      .map((item) => ({
        ...(item.materialId.startsWith("prod:") ? { tipo: "produto", produto: Number(item.materialId.replace("prod:", "")) } : { tipo: "material", material: Number(item.materialId.replace("mat:", "")) }),
        quantidade: parseQtdInteira(item.quantidade) as number,
        preco_no_dia: parseFloat(item.precoUnitario.replace(',', '.')),
      }));
    if (itensPayload.length === 0) {
      toast.error("Adicione itens válidos (material, quantidade e preço)");
      return;
    }
    const fornId = Number(fornecedorId);
    setSimpleConfirm({
      title: "Registrar compra",
      description: "Confirma registrar esta ordem de compra com os itens indicados?",
      confirmLabel: "Registrar",
      onConfirm: () => {
        void (async () => {
          try {
            await api.createCompra({
              fornecedor_id: fornId,
              itens: itensPayload,
              data: dataCompra,
              data_compra: dataCompra,
            });
            toast.success("Compra registrada com sucesso");
            await loadData();
            resetForm();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Erro ao registrar compra");
          }
        })();
      },
    });
  };

  const resetForm = () => {
    setMaterialId('');
    setProdutoId('');
    setFornecedorId('');
    setQuantidade('');
    setPrecoUnitario('');
    setData(getTodayLocalISO());
    setItensForm([]);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const getItemNome = (i: ItemCompra) =>
    i.produto_nome || i.material_nome || (i.produto ? `#${i.produto}` : `#${i.material}`);

  const totalCompras = ordens.reduce((sum, o) => sum + o.total, 0);

  const ordensFiltradas = ordens.filter((o) => {
    if (searchFornecedor.trim() && !(o.fornecedor || "").toLowerCase().includes(searchFornecedor.trim().toLowerCase()))
      return false;
    if (searchData) {
      const oData = o.data ? o.data.slice(0, 10) : "";
      if (oData !== searchData) return false;
    }
    if (searchProduto.trim()) {
      const termo = searchProduto.trim().toLowerCase();
      const temMatch = (o.itens || []).some((i) => getItemNome(i).toLowerCase().includes(termo));
      if (!temMatch) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Compras</h1>
          <p className="text-muted-foreground">Registre compras e consulte o histórico</p>
        </div>
        {isChefe && ordens.length > 0 && (
          <Card className="px-6 py-3">
            <p className="text-sm text-muted-foreground">Total em Compras</p>
            <p className="text-2xl font-semibold text-red-600">{formatCurrency(totalCompras)}</p>
          </Card>
        )}
      </div>

      <Tabs defaultValue="nova" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="nova">Nova compra</TabsTrigger>
          <TabsTrigger value="historico">Histórico de compras</TabsTrigger>
        </TabsList>

        <TabsContent value="nova" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="size-5" />
                Nova Compra
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Selecione o fornecedor e adicione os itens. Materiais só aparecem se estiverem vinculados a esse fornecedor no cadastro. Em produtos, aparecem itens de revenda ou produtos não fabricados com fornecedor cadastrado (mesmo fornecedor da compra, ou fornecedor do produto em branco).
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="fornecedorId">Fornecedor *</Label>
                    {fornecedores.length > 0 ? (
                      <Select value={fornecedorId} onValueChange={setFornecedorId}>
                        <SelectTrigger id="fornecedorId">
                          <SelectValue placeholder="Selecione o fornecedor" />
                        </SelectTrigger>
                        <SelectContent>
                          {fornecedores.map((f: any) => (
                            <SelectItem key={f.id} value={String(f.id)}>
                              {f.nome ?? f.nomeRazaoSocial}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-sm text-muted-foreground">Cadastre fornecedores na aba Cadastro.</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="materialId">Material para adicionar *</Label>
                    {!fornecedorId ? (
                      <p className="text-sm text-muted-foreground py-2">Selecione o fornecedor para ver os materiais vinculados.</p>
                    ) : (() => {
                      const materiaisDoFornecedor = materiais.filter(
                        (m: any) => String(m.fornecedor_padrao ?? m.fornecedor_padrao_id) === String(fornecedorId)
                      );
                      const produtosLista = produtosRevenda
                        .filter((p: any) => produtoDisponivelParaFornecedor(p, fornecedorId))
                        .sort((a: any, b: any) =>
                          String(a.nome ?? "").localeCompare(String(b.nome ?? ""), "pt-BR")
                        );

                      return (
                        <div className="space-y-2">
                          <Label>Tipo de item</Label>
                          <Select value={tipoItem} onValueChange={(v) => setTipoItem(v as "material" | "produto")}>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="material">Material</SelectItem>
                              <SelectItem value="produto">Produto (revenda)</SelectItem>
                            </SelectContent>
                          </Select>

                          {tipoItem === "material" ? (
                            materiaisDoFornecedor.length > 0 ? (
                              <Select value={materialId} onValueChange={setMaterialId}>
                                <SelectTrigger id="materialId">
                                  <SelectValue placeholder="Selecione o material" />
                                </SelectTrigger>
                                <SelectContent>
                                  {materiaisDoFornecedor.map((m: any) => (
                                    <SelectItem key={m.id} value={String(m.id)}>
                                      {m.nome}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <p className="text-sm text-muted-foreground py-2">
                                Nenhum material vinculado a este fornecedor. Vincule na aba Cadastro (materiais).
                              </p>
                            )
                          ) : produtosLista.length > 0 ? (
                            <Select value={produtoId} onValueChange={setProdutoId}>
                              <SelectTrigger id="produtoId">
                                <SelectValue placeholder="Selecione o produto de revenda" />
                              </SelectTrigger>
                              <SelectContent>
                                {produtosLista.map((p: any) => (
                                  <SelectItem key={p.id} value={String(p.id)}>
                                    {p.nome}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <p className="text-sm text-muted-foreground py-2">
                              Nenhum produto disponível para este fornecedor. No cadastro, marque revenda ou defina o
                              fornecedor do produto (e não marque como fabricado).
                            </p>
                          )}
                        </div>
                      );
                    })()}
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
                  max={999999999}
                  step={1}
                />
              </div>

              {isChefe && (
                <div className="space-y-2">
                  <Label htmlFor="precoUnitario">Preço Unitário *</Label>
                  <Input
                    id="precoUnitario"
                    type="number"
                    step="0.01"
                    value={precoUnitario}
                    onChange={(e) => setPrecoUnitario(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              )}

              {isChefe && quantidade && precoUnitario && (
                <div className="space-y-2">
                  <Label>Total deste item</Label>
                  <div className="h-10 px-3 py-2 border rounded-md bg-muted flex items-center">
                    <span className="text-lg font-semibold">
                      {formatCurrency(parseFloat(quantidade) * parseFloat(precoUnitario))}
                    </span>
                  </div>
                </div>
              )}

              <div className="space-y-2 md:col-span-2">
                <Label>Itens desta compra</Label>
                <p className="text-xs text-muted-foreground">
                  Use <span className="inline-flex items-center gap-0.5"><Copy className="size-3" /> Copiar</span> no item para duplicar na lista e alterar só a quantidade.
                </p>
                <div className="flex flex-wrap gap-2 items-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (!fornecedorId) {
                        toast.error('Selecione o fornecedor primeiro');
                        return;
                      }
                      const selectedId = tipoItem === "produto" ? produtoId : materialId;
                      if (!selectedId || !quantidade) {
                        toast.error(`Selecione ${tipoItem === "produto" ? "produto" : "material"} e quantidade`);
                        return;
                      }
                      const qtd = parseQtdInteira(quantidade);
                      if (qtd === null) {
                        toast.error('Quantidade inválida');
                        return;
                      }
                      const precoBase =
                        tipoItem === "produto"
                          ? (produtosRevenda.find((p: any) => String(p.id) === selectedId)?.preco_custo ?? 0)
                          : (materiais.find((m: any) => String(m.id) === selectedId)?.precoUnitarioBase ??
                             materiais.find((m: any) => String(m.id) === selectedId)?.preco_unitario_base ??
                             0);
                      const precoParaItem = isChefe
                        ? (parseFloat(String(precoUnitario).replace(',', '.')) || precoBase)
                        : Number(precoBase);
                      if (isChefe && (isNaN(precoParaItem) || precoParaItem <= 0)) {
                        toast.error('Informe o preço unitário');
                        return;
                      }
                      if (!isChefe && (!precoParaItem || precoParaItem <= 0)) {
                        toast.error('Material sem preço base. Peça ao chefe para cadastrar.');
                        return;
                      }
                      setItensForm((prev) => [
                        ...prev,
                        {
                          id: `${Date.now()}-${prev.length}`,
                          materialId: tipoItem === "produto" ? `prod:${selectedId}` : `mat:${selectedId}`,
                          quantidade: String(qtd),
                          precoUnitario: String(precoParaItem),
                        },
                      ]);
                      setMaterialId('');
                      setProdutoId('');
                      setQuantidade('');
                      setPrecoUnitario('');
                    }}
                  >
                    <Plus className="size-4 mr-2" />
                    Adicionar item à lista
                  </Button>
                </div>
                {itensForm.length > 0 ? (
                  <Table className="table-fixed">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[min(200px,40%)]">Item</TableHead>
                        <TableHead className="w-20 text-right">Qtd</TableHead>
                        {isChefe && <TableHead className="w-28 text-right">Preço un.</TableHead>}
                        {isChefe && <TableHead className="w-28 text-right">Total</TableHead>}
                        <TableHead className="w-[120px] text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itensForm.map((item) => {
                        const isProd = item.materialId.startsWith("prod:");
                        const refId = item.materialId.replace("prod:", "").replace("mat:", "");
                        const label = isProd
                          ? (produtosRevenda.find((p: any) => String(p.id) === refId)?.nome ?? `Produto #${refId}`)
                          : (materiais.find((m: any) => String(m.id) === refId)?.nome ?? `Material #${refId}`);
                        const qtdItem = parseQtdInteira(item.quantidade) ?? 0;
                        const precoItem = parseFloat(item.precoUnitario.replace(',', '.') || '0');
                        const isEditing = editingItemId === item.id;
                        return (
                          <TableRow key={item.id} className={isEditing ? "bg-primary/5 border-l-2 border-l-primary" : ""}>
                            <TableCell className="align-middle truncate">{label}</TableCell>
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
                                {isChefe && (
                                  <TableCell className="text-right align-middle py-2">
                                    <Input
                                      type="text"
                                      inputMode="decimal"
                                      className="h-8 w-full min-w-0 max-w-24 text-right text-sm tabular-nums ml-auto block"
                                      value={editPreco}
                                      onChange={(e) => setEditPreco(e.target.value)}
                                      placeholder="0,00"
                                    />
                                  </TableCell>
                                )}
                                {isChefe && <TableCell className="align-middle" />}
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
                                <TableCell className="text-right align-middle">{item.quantidade}</TableCell>
                                {isChefe && <TableCell className="text-right align-middle">{formatCurrency(precoItem || 0)}</TableCell>}
                                {isChefe && (
                                  <TableCell className="text-right align-middle">
                                    {formatCurrency(!isNaN(qtdItem * precoItem) ? qtdItem * precoItem : 0)}
                                  </TableCell>
                                )}
                                <TableCell className="text-right align-middle">
                                  <div className="flex items-center justify-end gap-0.5">
                                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => iniciarEdicaoItem(item)} title="Editar">
                                      <Pencil className="size-4" />
                                    </Button>
                                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => copiarItemNaLista(item.id)} title="Copiar item (mesmo material, altere a quantidade)">
                                      <Copy className="size-4" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                      onClick={() => setItensForm((prev) => prev.filter((i) => i.id !== item.id))}
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
                    Nenhum item adicionado ainda. Selecione o fornecedor, o material e a quantidade
                    {isChefe ? " e o preço" : ""} e clique em &quot;Adicionar material à lista&quot;.
                  </p>
                )}
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

            <Button type="submit">
              <Plus className="size-4 mr-2" />
              Registrar compra
            </Button>
          </form>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="historico" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Histórico de compras</CardTitle>
              <p className="text-sm text-muted-foreground">Filtre por fornecedor, data ou produto. Clique para ver detalhes, editar, copiar ou excluir.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="searchFornecedor">Fornecedor</Label>
                  <Input
                    id="searchFornecedor"
                    placeholder="Nome do fornecedor"
                    value={searchFornecedor}
                    onChange={(e) => setSearchFornecedor(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="searchProduto">Produto / Material</Label>
                  <Input
                    id="searchProduto"
                    placeholder="Nome do item"
                    value={searchProduto}
                    onChange={(e) => setSearchProduto(e.target.value)}
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
              {ordensFiltradas.length > 0 ? (
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[min(180px,30%)]">Fornecedor</TableHead>
                      <TableHead className="w-24">Data</TableHead>
                      <TableHead>Itens</TableHead>
                      {isChefe && <TableHead className="w-28 text-right">Total</TableHead>}
                      <TableHead className="w-[140px] text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...ordensFiltradas]
                      .sort(sortOrdemCompraRecentFirst)
                      .map((ordem) => (
                        <TableRow
                          key={ordem.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => openDetail(ordem)}
                        >
                          <TableCell className="font-medium truncate">
                            <span className="inline-flex items-center gap-1.5">
                              {ordem.cancelada && /^\d+$/.test(String(ordem.id)) ? (
                                <Ban className="size-3.5 shrink-0 text-destructive" title="Ordem cancelada" aria-hidden />
                              ) : null}
                              <span className={ordem.cancelada ? "text-muted-foreground" : undefined}>{ordem.fornecedor}</span>
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground whitespace-nowrap">
                            {formatDateOnly(ordem.data)}
                          </TableCell>
                          <TableCell className="truncate">
                            {ordem.itens?.length === 1
                              ? getItemNome(ordem.itens[0])
                              : `${ordem.itens?.length ?? 0} itens`}
                          </TableCell>
                          {isChefe && (
                            <TableCell className="text-right font-medium text-red-600">
                              {formatCurrency(ordem.total)}
                            </TableCell>
                          )}
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-0.5">
                              <span className="relative inline-flex">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDetail(ordem)} title="Ver detalhes">
                                  <Eye className="size-4" />
                                </Button>
                                {ordem.cancelada && /^\d+$/.test(String(ordem.id)) ? (
                                  <span
                                    className="pointer-events-none absolute -right-0.5 -top-0.5 size-2 rounded-full bg-destructive ring-2 ring-background"
                                    title="Cancelada"
                                    aria-hidden
                                  />
                                ) : null}
                              </span>
                              {isChefe && (
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => imprimirCompra(ordem)} title="Imprimir">
                                  <Printer className="size-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="py-8 text-center text-muted-foreground">
                  {ordens.length === 0 ? "Nenhuma compra registrada" : "Nenhuma compra encontrada com os filtros informados."}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!detailCompra} onOpenChange={(open) => !open && setDetailCompra(null)}>
        <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden gap-0 p-0 sm:max-w-2xl">
          {detailCompra && (
            <>
              <DialogHeader className="shrink-0 space-y-4 border-b bg-gradient-to-br from-muted/80 to-muted/30 px-6 pb-5 pt-6 text-left sm:pr-12">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Detalhe da ordem de compra
                </p>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <DialogTitle className="flex items-center gap-2 text-xl font-semibold leading-tight sm:text-2xl">
                      {detailCompra.cancelada ? (
                        <Ban className="size-5 shrink-0 text-destructive" title="Ordem cancelada" aria-hidden />
                      ) : null}
                      {detailCompra.fornecedor}
                    </DialogTitle>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5" title="Data da operação de compra">
                        <Calendar className="size-3.5 shrink-0" />
                        {formatDateOnly(detailCompra.data)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Hash className="size-3.5 shrink-0" />
                        {/^\d+$/.test(String(detailCompra.id)) ? `Nº ${detailCompra.id}` : `Rascunho (${detailCompra.id})`}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {detailCompra.cancelada ? (
                      <Badge variant="destructive">Cancelada</Badge>
                    ) : (
                      <Badge variant="secondary" className="font-normal bg-sky-100 text-sky-950 dark:bg-sky-950/50 dark:text-sky-100">
                        Ativa
                      </Badge>
                    )}
                    <Badge variant="outline" className="font-normal">
                      <Package className="size-3" />
                      {(detailCompra.itens || []).length} item(ns)
                    </Badge>
                  </div>
                </div>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <div className="mb-4 space-y-3 rounded-xl border bg-muted/20 p-4">
                  <div className="grid gap-0.5 text-sm">
                    <span className="text-muted-foreground">Data de lançamento (registro no sistema)</span>
                    <span className="font-medium tabular-nums">
                      {detailCompra.data_lancamento ? formatDateOnly(detailCompra.data_lancamento) : "—"}
                    </span>
                  </div>
                  {/^\d+$/.test(String(detailCompra.id)) && !detailCompra.cancelada && (
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                      <div className="space-y-1.5 min-w-[180px]">
                        <Label htmlFor="detalhe-data-compra">Data da compra (operação)</Label>
                        <Input
                          id="detalhe-data-compra"
                          name="compra-operacao-data-uid"
                          type="date"
                          autoComplete="off"
                          value={editDetailDataCompra}
                          onChange={(e) => setEditDetailDataCompra(e.target.value.slice(0, 10))}
                        />
                      </div>
                      <Button type="button" variant="secondary" onClick={() => salvarDataCompraNoDetalhe()}>
                        Guardar data
                      </Button>
                    </div>
                  )}
                </div>
                <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                  <Table>
                  <TableHeader>
                    <TableRow className="border-b bg-muted/50 hover:bg-muted/50">
                      <TableHead className="font-semibold">Item</TableHead>
                      <TableHead className="w-20 text-right font-semibold">Qtd</TableHead>
                      {isChefe && <TableHead className="w-28 text-right font-semibold">Preço un.</TableHead>}
                      {isChefe && <TableHead className="w-28 text-right font-semibold">Total</TableHead>}
                      <TableHead className="w-[100px] text-right font-semibold">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(detailCompra.itens || []).map((item) => (
                      <TableRow key={item.id} className="border-border/60">
                        <TableCell className="font-medium">{getItemNome(item)}</TableCell>
                        <TableCell className="text-right tabular-nums">{item.quantidade}</TableCell>
                        {isChefe && <TableCell className="text-right">{formatCurrency(item.preco_no_dia)}</TableCell>}
                        {isChefe && (
                          <TableCell className="text-right text-red-600">{formatCurrency(item.total)}</TableCell>
                        )}
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              disabled={!!detailCompra.cancelada}
                              onClick={() => abrirEditarItem(item, detailCompra.id)}
                              title={detailCompra.cancelada ? "Ordem cancelada" : "Editar"}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              title="Excluir"
                              disabled={!!detailCompra.cancelada}
                              onClick={() => setExcluirItemCompraId(item.id)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
                {isChefe && (detailCompra.itens?.length ?? 0) > 0 && (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3.5">
                    <span className="text-sm font-medium text-muted-foreground">Total da ordem</span>
                    <span className="text-xl font-bold tabular-nums tracking-tight text-foreground">
                      {formatCurrency(detailCompra.total)}
                    </span>
                  </div>
                )}
              </div>
              <DialogFooter className="shrink-0 flex-wrap gap-2 border-t bg-muted/30 px-6 py-4 sm:justify-end">
                {isChefe && (
                  <>
                    <Button variant="outline" onClick={() => detailCompra && imprimirCompra(detailCompra)}>
                      <Printer className="size-4 mr-2" />
                      Imprimir
                    </Button>
                    <Button variant="outline" onClick={handleCopiarOrdem} disabled={!!detailCompra.cancelada} title={detailCompra.cancelada ? "Ordem cancelada" : undefined}>
                      <Copy className="size-4 mr-2" />
                      Copiar ordem
                    </Button>
                  </>
                )}
                {detailCompra && /^\d+$/.test(String(detailCompra.id)) && !detailCompra.cancelada && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setExcluirCompraOpen(true)}
                    title="Cancelar esta ordem (exige senha)"
                  >
                    <Trash2 className="size-4 mr-2" />
                    Excluir ordem
                  </Button>
                )}
                <Button variant="default" onClick={() => setDetailCompra(null)}>
                  Fechar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar item da compra</DialogTitle>
          </DialogHeader>
          {editingItem && (
            <>
              <p className="text-sm text-muted-foreground">
                {getItemNome(editingItem)}
              </p>
              <div className="grid gap-4 py-2">
                <div className="space-y-2">
                  <Label>Quantidade</Label>
                  <Input
                    type="number"
                    min={1}
                    value={editCompraQtd}
                    onChange={(e) => setEditCompraQtd(e.target.value)}
                  />
                </div>
                {isChefe && (
                  <div className="space-y-2">
                    <Label>Preço unitário</Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={editCompraPreco}
                      onChange={(e) => setEditCompraPreco(e.target.value)}
                      placeholder="0,00"
                    />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button onClick={salvarEdicaoItemCompra}>Salvar</Button>
                <Button variant="outline" onClick={() => setEditingItem(null)}>Cancelar</Button>
              </DialogFooter>
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
        open={excluirCompraOpen}
        onOpenChange={setExcluirCompraOpen}
        title="Cancelar ordem de compra"
        description="A ordem ficará no histórico como cancelada e deixará de contar no saldo do fornecedor (os itens não são apagados). Informe o motivo e confirme com sua senha."
        confirmLabel="Confirmar cancelamento"
        requireMotivo
        onVerified={async ({ motivo }) => {
          if (!detailCompra || !/^\d+$/.test(String(detailCompra.id))) return;
          const idStr = String(detailCompra.id);
          await api.deleteCompra(idStr, motivo);
          toast.success("Ordem cancelada");
          await loadData();
          try {
            const refreshed = await api.getCompraDetalhe(idStr);
            setDetailCompra(
              refreshed && typeof refreshed === "object"
                ? { ...(refreshed as OrdemCompra), cancelada: (refreshed as OrdemCompra).cancelada === true }
                : { ...detailCompra, cancelada: true }
            );
          } catch {
            setDetailCompra({ ...detailCompra, cancelada: true });
          }
        }}
      />

      <ConfirmacaoComSenhaDialog
        open={excluirItemCompraId != null}
        onOpenChange={(o) => {
          if (!o) setExcluirItemCompraId(null);
        }}
        title="Excluir item da ordem"
        description="O valor deixará de contar nas compras do fornecedor. Informe o motivo e confirme com sua senha."
        confirmLabel="Confirmar exclusão"
        requireMotivo
        onVerified={async ({ motivo }) => {
          if (excluirItemCompraId == null) return;
          const idDel = excluirItemCompraId;
          setExcluirItemCompraId(null);
          await handleDeleteCompra(idDel, motivo);
        }}
      />

      <DocumentPrintPreview
        open={printPreview != null}
        onOpenChange={(o) => {
          if (!o) setPrintPreview(null);
        }}
        html={printPreview?.html ?? ""}
        titulo={printPreview?.titulo ?? ""}
        downloadBaseName={printPreview?.downloadBaseName}
      />
    </div>
  );
}
