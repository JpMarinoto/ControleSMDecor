import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { Checkbox } from "../components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "../components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { UserPlus, Package, Pencil, Trash2, Tag, Truck, TreePine, Building2, Eye } from "lucide-react";
import { toast } from "sonner";
import { motion } from "motion/react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import {
  formatCpfCnpj,
  unformatCpfCnpj,
  formatCep,
  unformatCep,
  fetchCep,
  ESTADOS_BR,
} from "../lib/cadastroUtils";

// Interfaces
interface Cliente {
  id: string;
  nome: string;
  cpfCnpj: string;
  telefone: string;
  endereco: string;
  chavePix?: string;
  logradouro?: string;
  bairro?: string;
  numero?: string;
  pontoReferencia?: string;
  cep?: string;
  cidade?: string;
  estado?: string;
  createdAt: string;
}

interface Categoria {
  id: string;
  nome: string;
  tipo: 'produto' | 'material';
  descricao?: string;
  createdAt: string;
}

interface Produto {
  id: string;
  categoria: string;
  nome: string;
  precoInicial: number; // preco_venda
  fabricado?: boolean;
  fornecedor?: string; // id
  precoCusto?: number;
  maoObraUnitaria?: number;
  margemLucroPercent?: number;
  insumos?: { material: number; material_nome: string; quantidade: number; preco_unitario_base: number; total_insumo: number }[];
  createdAt: string;
}

interface Fornecedor {
  id: string;
  nomeRazaoSocial: string;
  cpfCnpj: string;
  telefone: string;
  endereco: string;
  chavePix?: string;
  logradouro?: string;
  bairro?: string;
  numero?: string;
  pontoReferencia?: string;
  cep?: string;
  cidade?: string;
  estado?: string;
  createdAt: string;
}

interface Material {
  id: string;
  nome: string;
  categoria: string;
  fornecedor: string;
  precoUnitarioBase: number;
  /** Se definido, usado no custo de insumos; compras/estoque usam precoUnitarioBase. */
  precoFabricacao?: number | null;
  estoque_atual?: number;
  createdAt: string;
}

interface ContaBancaria {
  id: string;
  nome: string;
  saldo: number;
  createdAt: string;
}

// Normalizar id para string (API devolve número)
const sid = (x: number | string) => (x != null ? String(x) : "");

const fmtDecimalPt = (n: number) =>
  Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 4 });

const roundDecimalPlaces = (n: number, places: number) => {
  const f = 10 ** places;
  return Math.round((n + Number.EPSILON) * f) / f;
};

function parseDecimalInput(raw: string): number | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  const n = parseFloat(t.replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

function fmtPercentBr(n: number) {
  return roundDecimalPlaces(n, 2).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/** Campos iniciais do diálogo de preços em massa (alinhado à formatação dos handlers onChange). */
function bulkProdPrecosInitialFromReference(p: Produto): { custo: string; venda: string; margem: string } {
  const c = roundDecimalPlaces(Number(p.precoCusto ?? 0), 4);
  const v = roundDecimalPlaces(Number(p.precoInicial), 4);
  const custoStr = fmtDecimalPt(c);
  const vendaStr = fmtDecimalPt(v);
  const margemStr =
    c > 0 ? fmtPercentBr((v / c - 1) * 100) : fmtPercentBr(roundDecimalPlaces(Number(p.margemLucroPercent ?? 0), 2));
  return { custo: custoStr, venda: vendaStr, margem: margemStr };
}

/** Painel do formulário fixo abaixo do header ao editar, para não perder o formulário ao rolar a lista. */
const CADASTRO_FORM_EDIT_SHELL =
  "sticky top-20 z-30 bg-background/95 pb-3 pt-2 -mx-1 px-1 backdrop-blur-sm border-b border-border/80 shadow-sm";

/** Preço unitário do material na composição (fabricação): override opcional ou base. */
function precoUnitarioInsumoMaterial(m: Material): number {
  const fab = m.precoFabricacao;
  if (fab != null && !Number.isNaN(Number(fab))) return Number(fab);
  return Number(m.precoUnitarioBase) || 0;
}

export function Cadastro() {
  // States
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [contas, setContas] = useState<ContaBancaria[]>([]);

  // Editing states
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [verDadosCliente, setVerDadosCliente] = useState<Cliente | null>(null);
  const [verDadosFornecedor, setVerDadosFornecedor] = useState<Fornecedor | null>(null);
  const [editingCategoria, setEditingCategoria] = useState<Categoria | null>(null);
  const [editingProduto, setEditingProduto] = useState<Produto | null>(null);
  const [editingProdutoId, setEditingProdutoId] = useState<string | null>(null);
  const [editingFornecedor, setEditingFornecedor] = useState<Fornecedor | null>(null);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [editingConta, setEditingConta] = useState<ContaBancaria | null>(null);

  // Form states - Clientes
  const [nomeCliente, setNomeCliente] = useState('');
  const [cpfCnpjCliente, setCpfCnpjCliente] = useState('');
  const [telefoneCliente, setTelefoneCliente] = useState('');
  const [chavePixCliente, setChavePixCliente] = useState('');
  const [enderecoCliente, setEnderecoCliente] = useState('');
  const [logradouroCliente, setLogradouroCliente] = useState('');
  const [bairroCliente, setBairroCliente] = useState('');
  const [numeroCliente, setNumeroCliente] = useState('');
  const [pontoRefCliente, setPontoRefCliente] = useState('');
  const [cepCliente, setCepCliente] = useState('');
  const [cidadeCliente, setCidadeCliente] = useState('');
  const [estadoCliente, setEstadoCliente] = useState('');
  const [loadingCepCliente, setLoadingCepCliente] = useState(false);

  // Form states - Fornecedores
  const [nomeFornecedor, setNomeFornecedor] = useState('');
  const [cpfCnpjFornecedor, setCpfCnpjFornecedor] = useState('');
  const [telefoneFornecedor, setTelefoneFornecedor] = useState('');
  const [enderecoFornecedor, setEnderecoFornecedor] = useState('');
  const [chavePixFornecedor, setChavePixFornecedor] = useState('');
  const [logradouroFornecedor, setLogradouroFornecedor] = useState('');
  const [bairroFornecedor, setBairroFornecedor] = useState('');
  const [numeroFornecedor, setNumeroFornecedor] = useState('');
  const [pontoRefFornecedor, setPontoRefFornecedor] = useState('');
  const [cepFornecedor, setCepFornecedor] = useState('');
  const [cidadeFornecedor, setCidadeFornecedor] = useState('');
  const [estadoFornecedor, setEstadoFornecedor] = useState('');
  const [loadingCepFornecedor, setLoadingCepFornecedor] = useState(false);
  const [savingFornecedor, setSavingFornecedor] = useState(false);

  // Form states - Categorias
  const [nomeCategoria, setNomeCategoria] = useState('');
  const [tipoCategoria, setTipoCategoria] = useState<'produto' | 'material'>('produto');
  const [descricaoCategoria, setDescricaoCategoria] = useState('');

  // Form states - Produtos
  const [categoriaProduto, setCategoriaProduto] = useState('');
  const [nomeProduto, setNomeProduto] = useState('');
  const [precoInicial, setPrecoInicial] = useState('');
  const [produtoFabricado, setProdutoFabricado] = useState(false);
  const [fornecedorProduto, setFornecedorProduto] = useState('');
  const [precoCustoProduto, setPrecoCustoProduto] = useState('');
  const [maoObraProduto, setMaoObraProduto] = useState('');
  const [margemLucroProduto, setMargemLucroProduto] = useState('');
  const [savingProduto, setSavingProduto] = useState(false);
  const [calcProdutoSource, setCalcProdutoSource] = useState<'preco_venda' | 'preco_custo' | 'margem' | null>(null);
  const [materialInsumoProduto, setMaterialInsumoProduto] = useState('');
  const [quantidadeInsumoProduto, setQuantidadeInsumoProduto] = useState('');
  const [insumosProduto, setInsumosProduto] = useState<{ material: number; material_nome: string; quantidade: number; preco_unitario_base: number; total_insumo: number }[]>([]);

  // Form states - Materiais
  const [nomeMaterial, setNomeMaterial] = useState('');
  const [categoriaMaterial, setCategoriaMaterial] = useState('');
  const [fornecedorMaterial, setFornecedorMaterial] = useState('');
  const [precoMaterial, setPrecoMaterial] = useState('');
  const [precoMaterialFabricacao, setPrecoMaterialFabricacao] = useState('');

  const [idsProdutosSelecionados, setIdsProdutosSelecionados] = useState<Set<string>>(new Set());
  const [bulkPrecosOpen, setBulkPrecosOpen] = useState(false);
  const [bulkPrecoVenda, setBulkPrecoVenda] = useState('');
  const [bulkPrecoCusto, setBulkPrecoCusto] = useState('');
  const [bulkMargemLucro, setBulkMargemLucro] = useState('');
  const [savingBulkPrecos, setSavingBulkPrecos] = useState(false);

  /** Seleção na aba Fornecedores (preços em massa por vínculo). */
  const [idsFornecTabProdutos, setIdsFornecTabProdutos] = useState<Set<string>>(new Set());
  const [idsFornecTabMateriais, setIdsFornecTabMateriais] = useState<Set<string>>(new Set());
  const [bulkFornecPrecosOpen, setBulkFornecPrecosOpen] = useState(false);
  const [bulkFornecPrecoVenda, setBulkFornecPrecoVenda] = useState("");
  const [bulkFornecPrecoCusto, setBulkFornecPrecoCusto] = useState("");
  const [bulkFornecMargemLucro, setBulkFornecMargemLucro] = useState("");
  const [bulkFornecMatBase, setBulkFornecMatBase] = useState("");
  const [bulkFornecMatFab, setBulkFornecMatFab] = useState("");
  const [bulkFornecLimparFab, setBulkFornecLimparFab] = useState(false);
  const [savingBulkFornec, setSavingBulkFornec] = useState(false);

  // Form states - Contas
  const [nomeConta, setNomeConta] = useState('');
  const [saldoConta, setSaldoConta] = useState('');

  const cadastroClienteFormRef = useRef<HTMLDivElement>(null);
  const cadastroProdutoFormRef = useRef<HTMLDivElement>(null);
  const cadastroCategoriaFormRef = useRef<HTMLDivElement>(null);
  const cadastroFornecedorFormRef = useRef<HTMLDivElement>(null);
  const cadastroMaterialFormRef = useRef<HTMLDivElement>(null);
  const cadastroContaFormRef = useRef<HTMLDivElement>(null);

  const flashCadastroFormShell = (el: HTMLDivElement | null): (() => void) | undefined => {
    if (!el) return undefined;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add("ring-2", "ring-primary", "ring-offset-2", "ring-offset-background", "rounded-xl");
    const id = window.setTimeout(() => {
      el.classList.remove("ring-2", "ring-primary", "ring-offset-2", "ring-offset-background", "rounded-xl");
    }, 1600);
    return () => window.clearTimeout(id);
  };

  useLayoutEffect(() => {
    if (!editingCliente) return;
    return flashCadastroFormShell(cadastroClienteFormRef.current);
  }, [editingCliente?.id]);

  useLayoutEffect(() => {
    if (!editingProduto) return;
    return flashCadastroFormShell(cadastroProdutoFormRef.current);
  }, [editingProduto?.id]);

  useLayoutEffect(() => {
    if (!editingCategoria) return;
    return flashCadastroFormShell(cadastroCategoriaFormRef.current);
  }, [editingCategoria?.id]);

  useLayoutEffect(() => {
    if (!editingFornecedor) return;
    return flashCadastroFormShell(cadastroFornecedorFormRef.current);
  }, [editingFornecedor?.id]);

  useLayoutEffect(() => {
    if (!editingMaterial) return;
    return flashCadastroFormShell(cadastroMaterialFormRef.current);
  }, [editingMaterial?.id]);

  useLayoutEffect(() => {
    if (!editingConta) return;
    return flashCadastroFormShell(cadastroContaFormRef.current);
  }, [editingConta?.id]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [clientesRes, categoriasRes, produtosRes, fornecedoresRes, materiaisRes, contasRes] = await Promise.all([
        api.getClientes().catch(() => []),
        api.getCategorias().catch(() => []),
        api.getProdutos().catch(() => []),
        api.getFornecedores().catch(() => []),
        api.getMateriais().catch(() => []),
        api.getContas().catch(() => []),
      ]);
      setClientes((Array.isArray(clientesRes) ? clientesRes : []).map((c: any) => ({
        id: sid(c.id),
        nome: c.nome || "",
        cpfCnpj: c.cpf || c.cnpj || "",
        telefone: c.telefone || "",
        endereco: c.endereco || "",
        chavePix: c.chave_pix || "",
        logradouro: c.logradouro || "",
        bairro: c.bairro || "",
        numero: c.numero || "",
        pontoReferencia: c.ponto_referencia || "",
        cep: c.cep || "",
        cidade: c.cidade || "",
        estado: c.estado || "",
        createdAt: "",
      })));
      setCategorias((Array.isArray(categoriasRes) ? categoriasRes : []).map((c: any) => ({
        id: sid(c.id),
        nome: c.nome || "",
        tipo: (c.tipo === "material" ? "material" : "produto") as "produto" | "material",
        descricao: c.descricao || "",
        createdAt: "",
      })));
      setProdutos((Array.isArray(produtosRes) ? produtosRes : []).map((p: any) => ({
        id: sid(p.id),
        categoria: sid(p.categoria),
        nome: p.nome || "",
        precoInicial: Number(p.preco_venda) || 0,
        fabricado: Boolean(p.fabricado),
        fornecedor: sid(p.fornecedor),
        precoCusto: Number(p.preco_custo) || 0,
        maoObraUnitaria: Number(p.mao_obra_unitaria) || 0,
        margemLucroPercent: Number(p.margem_lucro_percent) || 0,
        insumos: Array.isArray(p.insumos) ? p.insumos : [],
        createdAt: "",
      })));
      setFornecedores((Array.isArray(fornecedoresRes) ? fornecedoresRes : []).map((f: any) => ({
        id: sid(f.id),
        nomeRazaoSocial: f.nome || "",
        cpfCnpj: f.cpf || f.cnpj || "",
        telefone: f.telefone || "",
        endereco: f.endereco || "",
        chavePix: f.chave_pix || "",
        logradouro: f.logradouro || "",
        bairro: f.bairro || "",
        numero: f.numero || "",
        pontoReferencia: f.ponto_referencia || "",
        cep: f.cep || "",
        cidade: f.cidade || "",
        estado: f.estado || "",
        createdAt: "",
      })));
      setMateriais((Array.isArray(materiaisRes) ? materiaisRes : []).map((m: any) => {
        const pf = m.precoFabricacao ?? m.preco_fabricacao;
        return {
          id: sid(m.id),
          nome: m.nome || "",
          categoria: sid(m.categoria),
          fornecedor: sid(m.fornecedor_padrao),
          precoUnitarioBase: Number(m.precoUnitarioBase ?? m.preco_unitario_base) || 0,
          precoFabricacao: pf != null && pf !== "" ? Number(pf) : null,
          estoque_atual: Number(m.estoque_atual) || 0,
          createdAt: "",
        };
      }));
      setContas((Array.isArray(contasRes) ? contasRes : []).map((c: any) => ({
        id: sid(c.id),
        nome: c.nome || c.nomeConta || "",
        saldo: Number(c.saldo ?? c.saldo_atual) || 0,
        createdAt: "",
      })));
    } catch {
      toast.error("Erro ao carregar dados do servidor");
    }
  };

  const handleSubmitCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nomeCliente.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    const digits = unformatCpfCnpj(cpfCnpjCliente);
    const payload = {
      nome: nomeCliente.trim(),
      cpf: digits.length <= 11 ? (digits.length ? cpfCnpjCliente : "") : "",
      cnpj: digits.length > 11 ? cpfCnpjCliente : "",
      telefone: telefoneCliente,
      chave_pix: chavePixCliente.trim() || null,
      endereco: enderecoCliente || null,
      logradouro: logradouroCliente.trim() || null,
      bairro: bairroCliente.trim() || null,
      numero: numeroCliente.trim() || null,
      ponto_referencia: pontoRefCliente.trim() || null,
      cep: unformatCep(cepCliente) || null,
      cidade: cidadeCliente.trim() || null,
      estado: estadoCliente || null,
    };
    try {
      if (editingCliente) {
        await api.updateCliente(editingCliente.id, payload);
        toast.success('Cliente atualizado');
        setEditingCliente(null);
      } else {
        await api.createCliente(payload);
        toast.success('Cliente cadastrado');
      }
      await loadData();
      resetClienteForm();
    } catch (err) {
      toast.error('Erro ao salvar cliente');
    }
  };

  const handleSubmitCategoria = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nomeCategoria.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    const payload = { nome: nomeCategoria.trim(), tipo: tipoCategoria, descricao: descricaoCategoria };
    try {
      if (editingCategoria) {
        await api.updateCategoria(editingCategoria.id, payload);
        toast.success('Categoria atualizada');
        setEditingCategoria(null);
      } else {
        await api.createCategoria(payload);
        toast.success('Categoria cadastrada');
      }
      await loadData();
      resetCategoriaForm();
    } catch (err) {
      toast.error('Erro ao salvar categoria');
    }
  };

  const handleSubmitProduto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingProduto) return;
    if (!nomeProduto.trim() || !categoriaProduto || !precoInicial) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    const preco = parseFloat(String(precoInicial).replace(',', '.'));
    if (isNaN(preco) || preco < 0) {
      toast.error('Preço inválido');
      return;
    }
    const custo = parseFloat(String(precoCustoProduto || '').replace(',', '.'));
    const maoObra = parseFloat(String(maoObraProduto || '').replace(',', '.'));
    const margem = parseFloat(String(margemLucroProduto || '').replace(',', '.'));
    const q4 = (x: number) => roundDecimalPlaces(x, 4);
    const payload = {
      nome: nomeProduto.trim(),
      categoria: Number(categoriaProduto) || undefined,
      preco_venda: q4(preco),
      descricao: "",
      revenda: false,
      fabricado: produtoFabricado,
      fornecedor: fornecedorProduto ? Number(fornecedorProduto) : null,
      preco_custo: q4(!isNaN(custo) && custo >= 0 ? custo : 0),
      mao_obra_unitaria: q4(!isNaN(maoObra) && maoObra >= 0 ? maoObra : 0),
      margem_lucro_percent: q4(!isNaN(margem) ? margem : 0),
      insumos: produtoFabricado
        ? insumosProduto.map((i) => ({ material: i.material, quantidade: q4(Number(i.quantidade)) }))
        : [],
    };
    try {
      setSavingProduto(true);
      if (editingProdutoId) {
        await api.updateProduto(editingProdutoId, payload);
        toast.success('Produto atualizado');
        setEditingProduto(null);
        setEditingProdutoId(null);
        resetProdutoForm();
      } else {
        await api.createProduto(payload);
        toast.success('Produto cadastrado');
        // UX: ao cadastrar produtos em sequência do mesmo fornecedor, manter o fornecedor selecionado
        resetProdutoForm({ keepFornecedor: true });
      }
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar produto');
    } finally {
      setSavingProduto(false);
    }
  };

  const handleSubmitFornecedor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingFornecedor) return;
    if (!nomeFornecedor.trim()) {
      toast.error('Nome/Razão Social é obrigatório');
      return;
    }
    const digitsF = unformatCpfCnpj(cpfCnpjFornecedor);
    const payload = {
      nome: nomeFornecedor.trim(),
      cpf: digitsF.length <= 11 ? (digitsF.length ? cpfCnpjFornecedor : "") : "",
      cnpj: digitsF.length > 11 ? cpfCnpjFornecedor : "",
      telefone: telefoneFornecedor,
      chave_pix: chavePixFornecedor.trim() || null,
      endereco: enderecoFornecedor || null,
      logradouro: logradouroFornecedor.trim() || null,
      bairro: bairroFornecedor.trim() || null,
      numero: numeroFornecedor.trim() || null,
      ponto_referencia: pontoRefFornecedor.trim() || null,
      cep: unformatCep(cepFornecedor) || null,
      cidade: cidadeFornecedor.trim() || null,
      estado: estadoFornecedor || null,
    };
    try {
      setSavingFornecedor(true);
      if (editingFornecedor) {
        await api.updateFornecedor(editingFornecedor.id, payload);
        toast.success('Fornecedor atualizado');
        setEditingFornecedor(null);
      } else {
        await api.createFornecedor(payload);
        toast.success('Fornecedor cadastrado');
      }
      await loadData();
      resetFornecedorForm();
    } catch (err) {
      toast.error('Erro ao salvar fornecedor');
    } finally {
      setSavingFornecedor(false);
    }
  };

  const handleSubmitMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nomeMaterial.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    let preco: number;
    if (isChefe) {
      if (!precoMaterial) {
        toast.error('Preço é obrigatório');
        return;
      }
      preco = roundDecimalPlaces(parseFloat(String(precoMaterial).replace(',', '.')), 4);
      if (isNaN(preco) || preco < 0) {
        toast.error('Preço inválido');
        return;
      }
    } else {
      preco = editingMaterial ? Number(editingMaterial.precoUnitarioBase) || 0 : 0;
    }
    const payload: Record<string, unknown> = {
      nome: nomeMaterial.trim(),
      preco_unitario_base: preco,
      precoUnitarioBase: preco,
    };
    if (isChefe) {
      const fabRaw = String(precoMaterialFabricacao ?? "").trim();
      if (fabRaw) {
        const pf = roundDecimalPlaces(parseFloat(fabRaw.replace(",", ".")), 4);
        if (Number.isNaN(pf) || pf < 0) {
          toast.error("Preço de fabricação inválido");
          return;
        }
        payload.preco_fabricacao = pf;
        payload.precoFabricacao = pf;
      } else if (editingMaterial) {
        payload.preco_fabricacao = null;
        payload.precoFabricacao = null;
      }
    }
    if (categoriaMaterial) payload.categoria = Number(categoriaMaterial);
    if (fornecedorMaterial) payload.fornecedor_padrao = Number(fornecedorMaterial);
    try {
      if (editingMaterial) {
        await api.updateMaterial(editingMaterial.id, payload);
        toast.success('Material atualizado');
        setEditingMaterial(null);
      } else {
        await api.createMaterial(payload);
        toast.success('Material cadastrado');
      }
      await loadData();
      resetMaterialForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar material');
    }
  };

  const handleSubmitConta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nomeConta.trim()) {
      toast.error('Nome da conta é obrigatório');
      return;
    }
    const saldo = parseFloat(saldoConta);
    if (isNaN(saldo)) {
      toast.error('Saldo inválido');
      return;
    }
    const payload = { nome: nomeConta.trim(), saldo: isNaN(saldo) ? 0 : saldo, saldo_atual: isNaN(saldo) ? 0 : saldo };
    try {
      if (editingConta) {
        await api.updateConta(editingConta.id, payload);
        toast.success('Conta atualizada');
        setEditingConta(null);
      } else {
        await api.createConta(payload);
        toast.success('Conta cadastrada');
      }
      await loadData();
      resetContaForm();
    } catch (err) {
      toast.error('Erro ao salvar conta');
    }
  };

  // Reset forms
  const resetClienteForm = () => {
    setNomeCliente('');
    setCpfCnpjCliente('');
    setTelefoneCliente('');
    setChavePixCliente('');
    setEnderecoCliente('');
    setLogradouroCliente('');
    setBairroCliente('');
    setNumeroCliente('');
    setPontoRefCliente('');
    setCepCliente('');
    setCidadeCliente('');
    setEstadoCliente('');
  };

  const resetCategoriaForm = () => {
    setNomeCategoria('');
    setTipoCategoria('produto');
    setDescricaoCategoria('');
  };

  const resetProdutoForm = (opts?: { keepFornecedor?: boolean }) => {
    setCategoriaProduto('');
    setNomeProduto('');
    setPrecoInicial('');
    setProdutoFabricado(false);
    if (!opts?.keepFornecedor) setFornecedorProduto('');
    setPrecoCustoProduto('');
    setMaoObraProduto('');
    setMargemLucroProduto('');
    setCalcProdutoSource(null);
    setMaterialInsumoProduto('');
    setQuantidadeInsumoProduto('');
    setInsumosProduto([]);
    setEditingProdutoId(null);
  };

  const resetFornecedorForm = () => {
    setNomeFornecedor('');
    setCpfCnpjFornecedor('');
    setTelefoneFornecedor('');
    setEnderecoFornecedor('');
    setChavePixFornecedor('');
    setLogradouroFornecedor('');
    setBairroFornecedor('');
    setNumeroFornecedor('');
    setPontoRefFornecedor('');
    setCepFornecedor('');
    setCidadeFornecedor('');
    setEstadoFornecedor('');
  };

  const resetMaterialForm = () => {
    setNomeMaterial('');
    setCategoriaMaterial('');
    setFornecedorMaterial('');
    setPrecoMaterial('');
    setPrecoMaterialFabricacao('');
  };

  const resetContaForm = () => {
    setNomeConta('');
    setSaldoConta('');
  };

  // Edit handlers
  const handleEditCliente = (cliente: Cliente) => {
    setEditingCliente(cliente);
    setNomeCliente(cliente.nome);
    setCpfCnpjCliente(cliente.cpfCnpj);
    setTelefoneCliente(cliente.telefone);
    setChavePixCliente(cliente.chavePix || "");
    setEnderecoCliente(cliente.endereco || "");
    setLogradouroCliente(cliente.logradouro || "");
    setBairroCliente(cliente.bairro || "");
    setNumeroCliente(cliente.numero || "");
    setPontoRefCliente(cliente.pontoReferencia || "");
    setCepCliente(cliente.cep ? formatCep(cliente.cep) : "");
    setCidadeCliente(cliente.cidade || "");
    setEstadoCliente(cliente.estado || "");
  };

  const handleEditCategoria = (categoria: Categoria) => {
    setEditingCategoria(categoria);
    setNomeCategoria(categoria.nome);
    setTipoCategoria(categoria.tipo);
    setDescricaoCategoria(categoria.descricao || '');
  };

  const handleEditProduto = (produto: Produto) => {
    setEditingProduto(produto);
    setEditingProdutoId(produto.id);
    setCategoriaProduto(produto.categoria);
    setNomeProduto(produto.nome);
    setPrecoInicial(fmtDecimalPt(Number(produto.precoInicial)));
    setProdutoFabricado(Boolean(produto.fabricado));
    setFornecedorProduto(produto.fornecedor || '');
    setPrecoCustoProduto(fmtDecimalPt(Number(produto.precoCusto ?? 0)));
    setMaoObraProduto(fmtDecimalPt(Number(produto.maoObraUnitaria ?? 0)));
    setMargemLucroProduto(fmtDecimalPt(Number(produto.margemLucroPercent ?? 0)));
    setInsumosProduto(
      Array.isArray(produto.insumos)
        ? produto.insumos.map((i) => ({
            material: Number(i.material),
            material_nome: i.material_nome,
            quantidade: Number(i.quantidade) || 0,
            preco_unitario_base: Number(i.preco_unitario_base) || 0,
            total_insumo: Number(i.total_insumo) || 0,
          }))
        : []
    );
    setCalcProdutoSource(null);
  };

  const parseDecimal = (raw: string): number | null => {
    const t = String(raw ?? "").trim();
    if (!t) return null;
    const v = parseFloat(t.replace(",", "."));
    return isNaN(v) ? null : v;
  };

  const custoMateriaisProduto = insumosProduto.reduce((acc, i) => acc + (Number(i.total_insumo) || 0), 0);
  const maoObraNum = parseDecimal(maoObraProduto) ?? 0;
  const custoTotalFabricacao = custoMateriaisProduto + maoObraNum;

  useEffect(() => {
    if (!produtoFabricado) return;
    setCalcProdutoSource('preco_custo');
    setPrecoCustoProduto(fmtDecimalPt(custoTotalFabricacao));
    const margem = parseDecimal(margemLucroProduto);
    if (margem != null) {
      setPrecoInicial(fmtDecimalPt(custoTotalFabricacao * (1 + margem / 100)));
    }
  }, [produtoFabricado, custoTotalFabricacao, margemLucroProduto]);

  const handleEditFornecedor = (fornecedor: Fornecedor) => {
    setEditingFornecedor(fornecedor);
    setNomeFornecedor(fornecedor.nomeRazaoSocial);
    setCpfCnpjFornecedor(fornecedor.cpfCnpj);
    setTelefoneFornecedor(fornecedor.telefone);
    setEnderecoFornecedor(fornecedor.endereco || "");
    setChavePixFornecedor(fornecedor.chavePix || "");
    setLogradouroFornecedor(fornecedor.logradouro || "");
    setBairroFornecedor(fornecedor.bairro || "");
    setNumeroFornecedor(fornecedor.numero || "");
    setPontoRefFornecedor(fornecedor.pontoReferencia || "");
    setCepFornecedor(fornecedor.cep ? formatCep(fornecedor.cep) : "");
    setCidadeFornecedor(fornecedor.cidade || "");
    setEstadoFornecedor(fornecedor.estado || "");
  };

  const handleEditMaterial = (material: Material) => {
    setEditingMaterial(material);
    setNomeMaterial(material.nome);
    setCategoriaMaterial(material.categoria);
    setFornecedorMaterial(material.fornecedor);
    setPrecoMaterial(fmtDecimalPt(Number(material.precoUnitarioBase)));
    const pf = material.precoFabricacao;
    setPrecoMaterialFabricacao(pf != null && !Number.isNaN(Number(pf)) ? fmtDecimalPt(Number(pf)) : "");
  };

  const handleEditConta = (conta: ContaBancaria) => {
    setEditingConta(conta);
    setNomeConta(conta.nome);
    setSaldoConta(conta.saldo.toString());
  };

  const handleCepBlurCliente = async () => {
    const c = unformatCep(cepCliente);
    if (c.length !== 8) return;
    setLoadingCepCliente(true);
    try {
      const data = await fetchCep(cepCliente);
      if (data) {
        if (data.logradouro) setLogradouroCliente(data.logradouro);
        if (data.bairro) setBairroCliente(data.bairro);
        if (data.localidade) setCidadeCliente(data.localidade);
        if (data.uf) setEstadoCliente(data.uf);
        toast.success("Endereço preenchido pelo CEP");
      }
    } catch {
      toast.error("CEP não encontrado");
    } finally {
      setLoadingCepCliente(false);
    }
  };

  const handleCepBlurFornecedor = async () => {
    const c = unformatCep(cepFornecedor);
    if (c.length !== 8) return;
    setLoadingCepFornecedor(true);
    try {
      const data = await fetchCep(cepFornecedor);
      if (data) {
        if (data.logradouro) setLogradouroFornecedor(data.logradouro);
        if (data.bairro) setBairroFornecedor(data.bairro);
        if (data.localidade) setCidadeFornecedor(data.localidade);
        if (data.uf) setEstadoFornecedor(data.uf);
        toast.success("Endereço preenchido pelo CEP");
      }
    } catch {
      toast.error("CEP não encontrado");
    } finally {
      setLoadingCepFornecedor(false);
    }
  };

  const handleDeleteCliente = async (id: string) => {
    if (!isChefe) {
      toast.error('Somente o chefe pode excluir ou inativar clientes.');
      return;
    }
    try {
      await api.deleteCliente(id);
      toast.success('Cliente excluído');
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      const podeInativar = /vendas|pagamentos|inativar/i.test(msg);
      if (podeInativar) {
        try {
          await api.inativarCliente(id);
          toast.success('Cliente inativado (removido da lista, dados preservados).');
          await loadData();
        } catch {
          toast.error(msg || 'Erro ao excluir cliente');
        }
      } else {
        toast.error(msg || 'Erro ao excluir cliente');
      }
    }
  };

  const handleDeleteCategoria = async (id: string) => {
    try {
      await api.deleteCategoria(id);
      toast.success('Categoria excluída');
      await loadData();
    } catch {
      toast.error('Erro ao excluir categoria');
    }
  };

  const handleDeleteProduto = async (id: string) => {
    try {
      await api.deleteProduto(id);
      toast.success('Produto removido do cadastro. Histórico em vendas e ordens foi preservado.');
      await loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao excluir produto');
    }
  };

  const handleDeleteFornecedor = async (id: string) => {
    if (!isChefe) {
      toast.error('Somente o chefe pode excluir ou inativar fornecedores.');
      return;
    }
    try {
      await api.deleteFornecedor(id);
      toast.success('Fornecedor excluído');
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      const podeInativar = /compras|pagamentos|inativar/i.test(msg);
      if (podeInativar) {
        try {
          await api.inativarFornecedor(id);
          toast.success('Fornecedor inativado (removido da lista, dados preservados).');
          await loadData();
        } catch {
          toast.error(msg || 'Erro ao excluir fornecedor');
        }
      } else {
        toast.error(msg || 'Erro ao excluir fornecedor');
      }
    }
  };

  const handleDeleteMaterial = async (id: string) => {
    try {
      await api.deleteMaterial(id);
      toast.success('Material excluído');
      await loadData();
    } catch {
      toast.error('Erro ao excluir material');
    }
  };

  const handleDeleteConta = async (id: string) => {
    try {
      await api.deleteConta(id);
      toast.success('Conta excluída');
      await loadData();
    } catch {
      toast.error('Erro ao excluir conta');
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(Number(value));
  };

  const categoriasProduto = categorias.filter(c => c.tipo === 'produto');
  const categoriasMaterial = categorias.filter(c => c.tipo === 'material');
  const produtosAgrupados = useMemo(() => {
    const catById = new Map<string, { id: string; nome: string }>();
    for (const c of categoriasProduto) catById.set(String(c.id), { id: String(c.id), nome: c.nome || "(Sem nome)" });

    const groups = new Map<string, { categoriaId: string | null; categoriaNome: string; itens: typeof produtos }>();
    for (const p of produtos) {
      const catId = p.categoria ? String(p.categoria) : "";
      const cat = catId ? catById.get(catId) : null;
      const k = cat ? `cat-${cat.id}` : "cat-sem";
      const nome = cat ? cat.nome : "Sem categoria";
      if (!groups.has(k)) groups.set(k, { categoriaId: cat ? cat.id : null, categoriaNome: nome, itens: [] });
      groups.get(k)!.itens.push(p);
    }

    const out = Array.from(groups.values());
    out.sort((a, b) => a.categoriaNome.localeCompare(b.categoriaNome, "pt-BR"));
    out.forEach((g) => g.itens.sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR")));
    return out;
  }, [produtos, categoriasProduto]);

  const materiaisAgrupados = useMemo(() => {
    const catById = new Map<string, { id: string; nome: string }>();
    for (const c of categoriasMaterial) catById.set(String(c.id), { id: String(c.id), nome: c.nome || "(Sem nome)" });

    const groups = new Map<string, { categoriaId: string | null; categoriaNome: string; itens: typeof materiais }>();
    for (const m of materiais) {
      const catId = m.categoria ? String(m.categoria) : "";
      const cat = catId ? catById.get(catId) : null;
      const k = cat ? `cat-${cat.id}` : "cat-sem";
      const nome = cat ? cat.nome : "Sem categoria";
      if (!groups.has(k)) groups.set(k, { categoriaId: cat ? cat.id : null, categoriaNome: nome, itens: [] });
      groups.get(k)!.itens.push(m);
    }

    const out = Array.from(groups.values());
    out.sort((a, b) => a.categoriaNome.localeCompare(b.categoriaNome, "pt-BR"));
    out.forEach((g) => g.itens.sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR")));
    return out;
  }, [materiais, categoriasMaterial]);

  const handleBulkProdCustoChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setBulkPrecoCusto(val);
    const c = parseDecimalInput(val);
    const m = parseDecimalInput(bulkMargemLucro);
    const v = parseDecimalInput(bulkPrecoVenda);
    if (c != null && c > 0 && m != null) {
      setBulkPrecoVenda(fmtDecimalPt(roundDecimalPlaces(c * (1 + m / 100), 4)));
    } else if (c != null && c > 0 && v != null) {
      setBulkMargemLucro(fmtPercentBr((v / c - 1) * 100));
    }
  }, [bulkMargemLucro, bulkPrecoVenda]);

  const handleBulkProdVendaChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setBulkPrecoVenda(val);
    const c = parseDecimalInput(bulkPrecoCusto);
    const v = parseDecimalInput(val);
    if (c != null && c > 0 && v != null) {
      setBulkMargemLucro(fmtPercentBr((v / c - 1) * 100));
    }
  }, [bulkPrecoCusto]);

  const handleBulkProdMargemChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setBulkMargemLucro(val);
    const c = parseDecimalInput(bulkPrecoCusto);
    const m = parseDecimalInput(val);
    if (c != null && c > 0 && m != null) {
      setBulkPrecoVenda(fmtDecimalPt(roundDecimalPlaces(c * (1 + m / 100), 4)));
    }
  }, [bulkPrecoCusto]);

  const handleBulkFornecCustoChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setBulkFornecPrecoCusto(val);
    const c = parseDecimalInput(val);
    const m = parseDecimalInput(bulkFornecMargemLucro);
    const v = parseDecimalInput(bulkFornecPrecoVenda);
    if (c != null && c > 0 && m != null) {
      setBulkFornecPrecoVenda(fmtDecimalPt(roundDecimalPlaces(c * (1 + m / 100), 4)));
    } else if (c != null && c > 0 && v != null) {
      setBulkFornecMargemLucro(fmtPercentBr((v / c - 1) * 100));
    }
  }, [bulkFornecMargemLucro, bulkFornecPrecoVenda]);

  const handleBulkFornecVendaChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setBulkFornecPrecoVenda(val);
    const c = parseDecimalInput(bulkFornecPrecoCusto);
    const v = parseDecimalInput(val);
    if (c != null && c > 0 && v != null) {
      setBulkFornecMargemLucro(fmtPercentBr((v / c - 1) * 100));
    }
  }, [bulkFornecPrecoCusto]);

  const handleBulkFornecMargemChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setBulkFornecMargemLucro(val);
    const c = parseDecimalInput(bulkFornecPrecoCusto);
    const m = parseDecimalInput(val);
    if (c != null && c > 0 && m != null) {
      setBulkFornecPrecoVenda(fmtDecimalPt(roundDecimalPlaces(c * (1 + m / 100), 4)));
    }
  }, [bulkFornecPrecoCusto]);

  const { user } = useAuth();
  const isChefe = user?.is_chefe === true;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Cadastros</h1>
        <p className="text-muted-foreground">Gerencie todos os cadastros do sistema</p>
      </div>

      <Tabs defaultValue="clientes" className="space-y-6">
        <TabsList className={`grid w-full ${isChefe ? "grid-cols-6" : "grid-cols-5"}`}>
          <TabsTrigger value="clientes">Clientes</TabsTrigger>
          <TabsTrigger value="produtos">Produtos</TabsTrigger>
          <TabsTrigger value="categorias">Categorias</TabsTrigger>
          <TabsTrigger value="fornecedores">Fornecedores</TabsTrigger>
          <TabsTrigger value="materiais">Materiais</TabsTrigger>
          {isChefe && <TabsTrigger value="contas">Contas</TabsTrigger>}
        </TabsList>

        {/* CLIENTES */}
        <TabsContent value="clientes" className="space-y-6">
          <div
            ref={cadastroClienteFormRef}
            className={`scroll-mt-24 ${editingCliente ? CADASTRO_FORM_EDIT_SHELL : ""}`}
          >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="size-5" />
                {editingCliente ? 'Editar Cliente' : 'Novo Cliente'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmitCliente} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="nomeCliente">Nome *</Label>
                    <Input
                      id="nomeCliente"
                      value={nomeCliente}
                      onChange={(e) => setNomeCliente(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cpfCnpjCliente">CPF/CNPJ</Label>
                    <Input
                      id="cpfCnpjCliente"
                      value={cpfCnpjCliente}
                      onChange={(e) => setCpfCnpjCliente(formatCpfCnpj(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="telefoneCliente">Telefone</Label>
                    <Input
                      id="telefoneCliente"
                      value={telefoneCliente}
                      onChange={(e) => setTelefoneCliente(e.target.value)}
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="chavePixCliente">Chave PIX</Label>
                    <Input
                      id="chavePixCliente"
                      value={chavePixCliente}
                      onChange={(e) => setChavePixCliente(e.target.value)}
                      placeholder="E-mail, telefone, CPF/CNPJ ou chave aleatória"
                    />
                  </div>
                </div>
                <div className="border-t pt-4 space-y-4">
                  <h4 className="text-sm font-medium">Endereço</h4>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="cepCliente">CEP</Label>
                      <Input
                        id="cepCliente"
                        value={cepCliente}
                        onChange={(e) => setCepCliente(formatCep(e.target.value))}
                        onBlur={handleCepBlurCliente}
                        placeholder="00000-000"
                        maxLength={9}
                      />
                      {loadingCepCliente && <span className="text-xs text-muted-foreground">Buscando...</span>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="logradouroCliente">Rua</Label>
                      <Input
                        id="logradouroCliente"
                        value={logradouroCliente}
                        onChange={(e) => setLogradouroCliente(e.target.value)}
                        placeholder="Rua, avenida"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bairroCliente">Bairro</Label>
                      <Input
                        id="bairroCliente"
                        value={bairroCliente}
                        onChange={(e) => setBairroCliente(e.target.value)}
                        placeholder="Bairro"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="numeroCliente">Número</Label>
                      <Input
                        id="numeroCliente"
                        value={numeroCliente}
                        onChange={(e) => setNumeroCliente(e.target.value)}
                        placeholder="Nº"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="pontoRefCliente">Ponto de referência</Label>
                      <Input
                        id="pontoRefCliente"
                        value={pontoRefCliente}
                        onChange={(e) => setPontoRefCliente(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cidadeCliente">Cidade</Label>
                      <Input
                        id="cidadeCliente"
                        value={cidadeCliente}
                        onChange={(e) => setCidadeCliente(e.target.value)}
                        placeholder="Cidade"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="estadoCliente">Estado</Label>
                      <Select value={estadoCliente || ""} onValueChange={setEstadoCliente}>
                        <SelectTrigger id="estadoCliente">
                          <SelectValue placeholder="UF" />
                        </SelectTrigger>
                        <SelectContent>
                          {ESTADOS_BR.map((e) => (
                            <SelectItem key={e.uf} value={e.uf}>
                              {e.uf} - {e.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit">
                    {editingCliente ? 'Atualizar' : 'Cadastrar'}
                  </Button>
                  {editingCliente && (
                    <Button type="button" variant="outline" onClick={() => {
                      setEditingCliente(null);
                      resetClienteForm();
                    }}>
                      Cancelar
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
          </div>

          <div className="space-y-3">
            {clientes.length > 0 ? (
              clientes.map((cliente, index) => (
                <motion.div
                  key={cliente.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: index * 0.03 }}
                >
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h3 className="font-medium mb-2">{cliente.nome}</h3>
                          <div className="grid gap-1 text-sm text-muted-foreground">
                            {cliente.cpfCnpj && <p>📄 {cliente.cpfCnpj}</p>}
                            {cliente.telefone && <p>📞 {cliente.telefone}</p>}
                            {cliente.chavePix && <p>💳 PIX: {cliente.chavePix}</p>}
                            {(cliente.logradouro || cliente.cep) && (
                              <p>📍 {[cliente.logradouro, cliente.numero, cliente.bairro].filter(Boolean).join(", ")}
                                {cliente.cep && ` — ${cliente.cep}`}
                                {cliente.cidade && cliente.estado && ` — ${cliente.cidade}/${cliente.estado}`}
                              </p>
                            )}
                            {!cliente.logradouro && !cliente.cep && cliente.endereco && <p>📍 {cliente.endereco}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="icon" onClick={() => setVerDadosCliente(cliente)} title="Ver dados">
                            <Eye className="size-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleEditCliente(cliente)}>
                            <Pencil className="size-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <Trash2 className="size-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tem certeza que deseja excluir este cliente?
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteCliente(cliente.id)}>
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Nenhum cliente cadastrado
                </CardContent>
              </Card>
            )}
          </div>

          <Dialog open={!!verDadosCliente} onOpenChange={(open) => !open && setVerDadosCliente(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Dados do cliente</DialogTitle>
              </DialogHeader>
              {verDadosCliente && (
                <div className="space-y-3 text-sm">
                  <p><span className="font-medium">Nome:</span> {verDadosCliente.nome}</p>
                  <p><span className="font-medium">CPF/CNPJ:</span> {verDadosCliente.cpfCnpj || '—'}</p>
                  <p><span className="font-medium">Telefone:</span> {verDadosCliente.telefone || '—'}</p>
                  <p><span className="font-medium">PIX:</span> {verDadosCliente.chavePix || '—'}</p>
                  {verDadosCliente.endereco && (
                    <p><span className="font-medium">Endereço:</span> {verDadosCliente.endereco}</p>
                  )}
                </div>
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* PRODUTOS */}
        <TabsContent value="produtos" className="space-y-6">
          <div
            ref={cadastroProdutoFormRef}
            className={`scroll-mt-24 ${
              editingProduto
                ? `${CADASTRO_FORM_EDIT_SHELL} max-h-[min(88vh,calc(100dvh-5rem))] overflow-y-auto`
                : ""
            }`}
          >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="size-5" />
                {editingProduto ? 'Editar Produto' : 'Novo Produto'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmitProduto} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="categoriaProduto">Categoria *</Label>
                    <Select value={categoriaProduto} onValueChange={setCategoriaProduto}>
                      <SelectTrigger id="categoriaProduto">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {categoriasProduto.length > 0 ? (
                          categoriasProduto.map((cat) => (
                            <SelectItem key={cat.id} value={String(cat.id)}>
                              {cat.nome || "(Sem nome)"}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="none" disabled>
                            Cadastre uma categoria primeiro
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nomeProduto">Nome *</Label>
                    <Input
                      id="nomeProduto"
                      value={nomeProduto}
                      onChange={(e) => setNomeProduto(e.target.value)}
                      placeholder="Nome do produto"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="precoInicial">Preço de Venda *</Label>
                    <Input
                      id="precoInicial"
                      type="text"
                      inputMode="decimal"
                      value={precoInicial}
                      onChange={(e) => {
                        setCalcProdutoSource('preco_venda');
                        setPrecoInicial(e.target.value);
                        const venda = parseDecimal(e.target.value);
                        const custo = parseDecimal(precoCustoProduto);
                        if (venda != null && custo != null && custo > 0) {
                          const m = ((venda / custo) - 1) * 100;
                          setMargemLucroProduto(fmtDecimalPt(m));
                        }
                      }}
                      placeholder="0,00"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Checkbox
                    id="produtoFabricado"
                    checked={produtoFabricado}
                    onCheckedChange={(v) => {
                      const checked = v === true;
                      setProdutoFabricado(checked);
                    }}
                  />
                  <Label htmlFor="produtoFabricado" className="cursor-pointer">
                    Produto fabricado (composição por materiais)
                  </Label>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="fornecedorProduto">Fornecedor</Label>
                    <Select value={fornecedorProduto || undefined} onValueChange={setFornecedorProduto}>
                      <SelectTrigger id="fornecedorProduto">
                        <SelectValue placeholder="Selecione (opcional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {fornecedores.length > 0 ? (
                          fornecedores.map((f) => (
                            <SelectItem key={f.id} value={String(f.id)}>
                              {f.nomeRazaoSocial || "(Sem nome)"}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="none" disabled>
                            Cadastre um fornecedor primeiro
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    {fornecedorProduto && (
                      <Button type="button" size="sm" variant="ghost" className="px-0 h-auto" onClick={() => setFornecedorProduto('')}>
                        Limpar fornecedor
                      </Button>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="precoCustoProduto">Preço de Custo (R$)</Label>
                    <Input
                      id="precoCustoProduto"
                      type="text"
                      inputMode="decimal"
                      value={precoCustoProduto}
                      disabled={produtoFabricado}
                      onChange={(e) => {
                        if (produtoFabricado) return;
                        setCalcProdutoSource('preco_custo');
                        setPrecoCustoProduto(e.target.value);
                        const custo = parseDecimal(e.target.value);
                        const margem = parseDecimal(margemLucroProduto);
                        const venda = parseDecimal(precoInicial);
                        if (custo != null && custo > 0) {
                          if (margem != null && (calcProdutoSource === 'margem' || calcProdutoSource === 'preco_custo')) {
                            const pv = custo * (1 + margem / 100);
                            setPrecoInicial(fmtDecimalPt(pv));
                          } else if (venda != null && (calcProdutoSource === 'preco_venda' || calcProdutoSource === 'preco_custo')) {
                            const m = ((venda / custo) - 1) * 100;
                            setMargemLucroProduto(fmtDecimalPt(m));
                          }
                        }
                      }}
                      placeholder="0,00"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="margemLucroProduto">% de Lucro</Label>
                    <Input
                      id="margemLucroProduto"
                      type="text"
                      inputMode="decimal"
                      value={margemLucroProduto}
                      onChange={(e) => {
                        setCalcProdutoSource('margem');
                        setMargemLucroProduto(e.target.value);
                        const custo = parseDecimal(precoCustoProduto);
                        const margem = parseDecimal(e.target.value);
                        if (custo != null && custo > 0 && margem != null) {
                          const pv = custo * (1 + margem / 100);
                          setPrecoInicial(fmtDecimalPt(pv));
                        }
                      }}
                      placeholder="0,00"
                    />
                  </div>
                </div>

                {produtoFabricado && (
                  <div className="space-y-3 border rounded-md p-3">
                    <h4 className="text-sm font-medium">Insumos do produto</h4>
                    <div className="grid gap-4 md:grid-cols-4">
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="materialInsumoProduto">Material</Label>
                        <Select value={materialInsumoProduto} onValueChange={setMaterialInsumoProduto}>
                          <SelectTrigger id="materialInsumoProduto">
                            <SelectValue placeholder="Selecione o material" />
                          </SelectTrigger>
                          <SelectContent>
                            {materiais.map((m) => (
                              <SelectItem key={m.id} value={String(m.id)}>
                                {m.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="quantidadeInsumoProduto">Quantidade</Label>
                        <Input
                          id="quantidadeInsumoProduto"
                          type="text"
                          inputMode="decimal"
                          value={quantidadeInsumoProduto}
                          onChange={(e) => setQuantidadeInsumoProduto(e.target.value)}
                          placeholder="0,000"
                        />
                      </div>
                      <div className="flex items-end">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            const mat = materiais.find((m) => String(m.id) === String(materialInsumoProduto));
                            const qtd = parseDecimal(quantidadeInsumoProduto);
                            if (!mat || qtd == null || qtd <= 0) {
                              toast.error("Selecione material e quantidade válida");
                              return;
                            }
                            const precoBase = precoUnitarioInsumoMaterial(mat);
                            const total = precoBase * qtd;
                            setInsumosProduto((prev) => {
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
                              return [...prev, { material: Number(mat.id), material_nome: mat.nome, quantidade: qtd, preco_unitario_base: precoBase, total_insumo: total }];
                            });
                            setMaterialInsumoProduto('');
                            setQuantidadeInsumoProduto('');
                          }}
                        >
                          Adicionar
                        </Button>
                      </div>
                    </div>

                    {insumosProduto.length > 0 && (
                      <div className="space-y-2">
                        {insumosProduto.map((i) => (
                          <div key={i.material} className="flex items-center justify-between text-sm border-b pb-1">
                            <span>{i.material_nome} ({i.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 4 })} x {formatCurrency(i.preco_unitario_base)})</span>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{formatCurrency(i.total_insumo)}</span>
                              <Button type="button" size="sm" variant="ghost" onClick={() => setInsumosProduto((prev) => prev.filter((x) => x.material !== i.material))}>Remover</Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="maoObraProduto">Mão de obra por peça</Label>
                        <Input
                          id="maoObraProduto"
                          type="text"
                          inputMode="decimal"
                          value={maoObraProduto}
                          onChange={(e) => setMaoObraProduto(e.target.value)}
                          placeholder="0,00"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Custo materiais</Label>
                        <Input value={fmtDecimalPt(custoMateriaisProduto)} disabled />
                      </div>
                      <div className="space-y-2">
                        <Label>Custo total (insumos + mão de obra)</Label>
                        <Input value={fmtDecimalPt(custoTotalFabricacao)} disabled />
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button type="submit" disabled={savingProduto}>
                    {savingProduto ? 'Salvando...' : (editingProduto ? 'Atualizar' : 'Cadastrar')}
                  </Button>
                  {editingProduto && (
                    <Button type="button" variant="outline" onClick={() => {
                      setEditingProduto(null);
                      resetProdutoForm();
                    }}>
                      Cancelar
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
          </div>

          {isChefe && produtos.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2">
              <span className="text-sm text-muted-foreground tabular-nums">
                {idsProdutosSelecionados.size} produto(s) selecionado(s)
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={idsProdutosSelecionados.size === 0}
                onClick={() => {
                  const ref = produtos.find((p) => idsProdutosSelecionados.has(p.id));
                  if (ref) {
                    const init = bulkProdPrecosInitialFromReference(ref);
                    setBulkPrecoCusto(init.custo);
                    setBulkPrecoVenda(init.venda);
                    setBulkMargemLucro(init.margem);
                  } else {
                    setBulkPrecoCusto("");
                    setBulkPrecoVenda("");
                    setBulkMargemLucro("");
                  }
                  setBulkPrecosOpen(true);
                }}
              >
                Atualizar preços em massa
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIdsProdutosSelecionados(new Set())}
              >
                Limpar seleção
              </Button>
            </div>
          )}

          <div className="space-y-3">
            {produtos.length > 0 ? (
              produtosAgrupados.map((grupo, gi) => (
                <div key={grupo.categoriaId ?? `sem-${gi}`} className="space-y-2">
                  <div className="rounded-lg border bg-muted/30 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-5 w-1.5 rounded-full bg-primary/70 shrink-0" />
                        <div className="font-semibold truncate">{grupo.categoriaNome}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isChefe && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => {
                              const ids = new Set(grupo.itens.map((p) => p.id));
                              setIdsProdutosSelecionados((prev) => {
                                const allSel = grupo.itens.every((p) => prev.has(p.id));
                                const next = new Set(prev);
                                if (allSel) {
                                  ids.forEach((id) => next.delete(id));
                                } else {
                                  ids.forEach((id) => next.add(id));
                                }
                                return next;
                              });
                            }}
                          >
                            {grupo.itens.every((p) => idsProdutosSelecionados.has(p.id)) ? "Desmarcar grupo" : "Selecionar grupo"}
                          </Button>
                        )}
                        <Badge variant="outline" className="tabular-nums shrink-0">
                          {grupo.itens.length}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {grupo.itens.map((produto, index) => (
                      <motion.div
                        key={produto.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.15, delay: index * 0.01 }}
                      >
                        <Card>
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between gap-2">
                              {isChefe && (
                                <div className="pt-1 shrink-0">
                                  <Checkbox
                                    checked={idsProdutosSelecionados.has(produto.id)}
                                    onCheckedChange={(v) => {
                                      setIdsProdutosSelecionados((prev) => {
                                        const next = new Set(prev);
                                        if (v === true) next.add(produto.id);
                                        else next.delete(produto.id);
                                        return next;
                                      });
                                    }}
                                    aria-label={`Selecionar ${produto.nome}`}
                                  />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2">
                                  {produto.fabricado && <Badge variant="secondary">Fabricado</Badge>}
                                  <h3 className="font-medium">{produto.nome}</h3>
                                </div>
                                {produto.fornecedor && (
                                  <p className="text-sm text-muted-foreground">
                                    Fornecedor: {fornecedores.find((f) => String(f.id) === String(produto.fornecedor))?.nomeRazaoSocial ?? "—"}
                                  </p>
                                )}
                                <p className="text-lg font-semibold text-primary">
                                  {formatCurrency(produto.precoInicial)}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button variant="ghost" size="icon" onClick={() => handleEditProduto(produto)}>
                                  <Pencil className="size-4" />
                                </Button>
                                {isChefe && (
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button variant="ghost" size="icon">
                                        <Trash2 className="size-4 text-destructive" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Tem certeza que deseja excluir este produto?
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleDeleteProduto(produto.id)}>
                                          Excluir
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Nenhum produto cadastrado
                </CardContent>
              </Card>
            )}
          </div>

          <Dialog
            open={bulkPrecosOpen}
            onOpenChange={(open) => {
              setBulkPrecosOpen(open);
              if (!open) {
                setBulkPrecoVenda("");
                setBulkPrecoCusto("");
                setBulkMargemLucro("");
              }
            }}
          >
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Atualizar preços em massa</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                {idsProdutosSelecionados.size} produto(s) selecionado(s). Os campos começam com os valores do primeiro
                produto na lista entre os selecionados; ao aplicar, todos recebem o que estiver no formulário. Alterar
                venda atualiza a %; alterar % atualiza a venda (com custo maior que zero).
              </p>
              <div className="space-y-2">
                <Label htmlFor="bulkPrecoCusto">Preço de custo</Label>
                <Input
                  id="bulkPrecoCusto"
                  type="text"
                  inputMode="decimal"
                  className="tabular-nums"
                  value={bulkPrecoCusto}
                  onChange={handleBulkProdCustoChange}
                  placeholder="Manter atual"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bulkPrecoVenda">Preço de venda</Label>
                <Input
                  id="bulkPrecoVenda"
                  type="text"
                  inputMode="decimal"
                  className="tabular-nums"
                  value={bulkPrecoVenda}
                  onChange={handleBulkProdVendaChange}
                  placeholder="Manter atual"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bulkMargemLucro">Percentual sobre o custo (%)</Label>
                <Input
                  id="bulkMargemLucro"
                  type="text"
                  inputMode="decimal"
                  className="tabular-nums"
                  value={bulkMargemLucro}
                  onChange={handleBulkProdMargemChange}
                  placeholder="Ex.: 30"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setBulkPrecosOpen(false)} disabled={savingBulkPrecos}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  disabled={savingBulkPrecos}
                  onClick={async () => {
                    const rawV = bulkPrecoVenda.trim();
                    const rawC = bulkPrecoCusto.trim();
                    const rawM = bulkMargemLucro.trim();
                    let preco_venda: number | undefined;
                    let preco_custo: number | undefined;
                    let margem_lucro_percent: number | undefined;
                    if (rawC) {
                      const c = roundDecimalPlaces(parseFloat(rawC.replace(",", ".")), 4);
                      if (Number.isNaN(c) || c < 0) {
                        toast.error("Preço de custo inválido");
                        return;
                      }
                      preco_custo = c;
                    }
                    if (rawV) {
                      const v = roundDecimalPlaces(parseFloat(rawV.replace(",", ".")), 4);
                      if (Number.isNaN(v) || v < 0) {
                        toast.error("Preço de venda inválido");
                        return;
                      }
                      preco_venda = v;
                    }
                    if (rawM) {
                      const m = roundDecimalPlaces(parseFloat(rawM.replace(",", ".")), 4);
                      if (Number.isNaN(m)) {
                        toast.error("Percentual inválido");
                        return;
                      }
                      margem_lucro_percent = m;
                    }
                    if (preco_venda === undefined && preco_custo === undefined && margem_lucro_percent === undefined) {
                      toast.error("Informe pelo menos custo, venda ou %");
                      return;
                    }
                    try {
                      setSavingBulkPrecos(true);
                      const res =
                        preco_custo !== undefined && preco_venda !== undefined
                          ? await api.bulkUpdateProdutosPrecos({
                              ids: [...idsProdutosSelecionados],
                              preco_custo,
                              preco_venda,
                              margem_lucro_percent: null,
                            })
                          : preco_custo !== undefined && margem_lucro_percent !== undefined
                            ? await api.bulkUpdateProdutosPrecos({
                                ids: [...idsProdutosSelecionados],
                                preco_custo,
                                preco_venda: null,
                                margem_lucro_percent,
                              })
                            : await api.bulkUpdateProdutosPrecos({
                                ids: [...idsProdutosSelecionados],
                                preco_custo: preco_custo ?? null,
                                preco_venda: preco_venda ?? null,
                                margem_lucro_percent: margem_lucro_percent ?? null,
                              });
                      if (res.failed > 0) {
                        toast.warning(`Atualizados ${res.ok}; ${res.failed} com erro.`);
                      } else {
                        toast.success(`${res.ok} produto(s) atualizado(s).`);
                      }
                      setBulkPrecosOpen(false);
                      setBulkPrecoVenda("");
                      setBulkPrecoCusto("");
                      setBulkMargemLucro("");
                      setIdsProdutosSelecionados(new Set());
                      await loadData();
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Erro ao atualizar preços");
                    } finally {
                      setSavingBulkPrecos(false);
                    }
                  }}
                >
                  {savingBulkPrecos ? "Aplicando…" : "Aplicar"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* CATEGORIAS */}
        <TabsContent value="categorias" className="space-y-6">
          <div
            ref={cadastroCategoriaFormRef}
            className={`scroll-mt-24 ${editingCategoria ? CADASTRO_FORM_EDIT_SHELL : ""}`}
          >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="size-5" />
                {editingCategoria ? 'Editar Categoria' : 'Nova Categoria'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmitCategoria} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="nomeCategoria">Nome *</Label>
                    <Input
                      id="nomeCategoria"
                      value={nomeCategoria}
                      onChange={(e) => setNomeCategoria(e.target.value)}
                      placeholder="Nome da categoria"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tipoCategoria">Tipo de Categoria *</Label>
                    <Select value={tipoCategoria} onValueChange={(v) => setTipoCategoria(v as 'produto' | 'material')}>
                      <SelectTrigger id="tipoCategoria">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="produto">Produto</SelectItem>
                        <SelectItem value="material">Material</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="descricaoCategoria">Descrição (Opcional)</Label>
                    <Textarea
                      id="descricaoCategoria"
                      value={descricaoCategoria}
                      onChange={(e) => setDescricaoCategoria(e.target.value)}
                      placeholder="Descrição da categoria"
                      rows={3}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit">
                    {editingCategoria ? 'Atualizar' : 'Cadastrar'}
                  </Button>
                  {editingCategoria && (
                    <Button type="button" variant="outline" onClick={() => {
                      setEditingCategoria(null);
                      resetCategoriaForm();
                    }}>
                      Cancelar
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
          </div>

          <div className="space-y-3">
            {categorias.length > 0 ? (
              categorias.map((categoria, index) => (
                <motion.div
                  key={categoria.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: index * 0.03 }}
                >
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium">{categoria.nome}</h3>
                            <Badge>{categoria.tipo === 'produto' ? 'Produto' : 'Material'}</Badge>
                          </div>
                          {categoria.descricao && (
                            <p className="text-sm text-muted-foreground">{categoria.descricao}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleEditCategoria(categoria)}>
                            <Pencil className="size-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <Trash2 className="size-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tem certeza que deseja excluir esta categoria?
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteCategoria(categoria.id)}>
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Nenhuma categoria cadastrada
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* FORNECEDORES */}
        <TabsContent value="fornecedores" className="space-y-6">
          <div
            ref={cadastroFornecedorFormRef}
            className={`scroll-mt-24 ${editingFornecedor ? CADASTRO_FORM_EDIT_SHELL : ""}`}
          >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="size-5" />
                {editingFornecedor ? 'Editar Fornecedor' : 'Novo Fornecedor'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmitFornecedor} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="nomeFornecedor">Nome/Razão Social *</Label>
                    <Input
                      id="nomeFornecedor"
                      value={nomeFornecedor}
                      onChange={(e) => setNomeFornecedor(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cpfCnpjFornecedor">CPF/CNPJ</Label>
                    <Input
                      id="cpfCnpjFornecedor"
                      value={cpfCnpjFornecedor}
                      onChange={(e) => setCpfCnpjFornecedor(formatCpfCnpj(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="telefoneFornecedor">Telefone</Label>
                    <Input
                      id="telefoneFornecedor"
                      value={telefoneFornecedor}
                      onChange={(e) => setTelefoneFornecedor(e.target.value)}
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="chavePixFornecedor">Chave PIX</Label>
                    <Input
                      id="chavePixFornecedor"
                      value={chavePixFornecedor}
                      onChange={(e) => setChavePixFornecedor(e.target.value)}
                      placeholder="E-mail, telefone, CPF/CNPJ ou chave aleatória"
                    />
                  </div>
                </div>
                <div className="border-t pt-4 space-y-4">
                  <h4 className="text-sm font-medium">Endereço</h4>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="cepFornecedor">CEP</Label>
                      <Input
                        id="cepFornecedor"
                        value={cepFornecedor}
                        onChange={(e) => setCepFornecedor(formatCep(e.target.value))}
                        onBlur={handleCepBlurFornecedor}
                        placeholder="00000-000"
                        maxLength={9}
                      />
                      {loadingCepFornecedor && <span className="text-xs text-muted-foreground">Buscando...</span>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="logradouroFornecedor">Rua</Label>
                      <Input
                        id="logradouroFornecedor"
                        value={logradouroFornecedor}
                        onChange={(e) => setLogradouroFornecedor(e.target.value)}
                        placeholder="Rua, avenida"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bairroFornecedor">Bairro</Label>
                      <Input
                        id="bairroFornecedor"
                        value={bairroFornecedor}
                        onChange={(e) => setBairroFornecedor(e.target.value)}
                        placeholder="Bairro"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="numeroFornecedor">Número</Label>
                      <Input
                        id="numeroFornecedor"
                        value={numeroFornecedor}
                        onChange={(e) => setNumeroFornecedor(e.target.value)}
                        placeholder="Nº"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="pontoRefFornecedor">Ponto de referência</Label>
                      <Input
                        id="pontoRefFornecedor"
                        value={pontoRefFornecedor}
                        onChange={(e) => setPontoRefFornecedor(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cidadeFornecedor">Cidade</Label>
                      <Input
                        id="cidadeFornecedor"
                        value={cidadeFornecedor}
                        onChange={(e) => setCidadeFornecedor(e.target.value)}
                        placeholder="Cidade"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="estadoFornecedor">Estado</Label>
                      <Select value={estadoFornecedor || ""} onValueChange={setEstadoFornecedor}>
                        <SelectTrigger id="estadoFornecedor">
                          <SelectValue placeholder="UF" />
                        </SelectTrigger>
                        <SelectContent>
                          {ESTADOS_BR.map((e) => (
                            <SelectItem key={e.uf} value={e.uf}>
                              {e.uf} - {e.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={savingFornecedor}>
                    {savingFornecedor ? 'Salvando...' : (editingFornecedor ? 'Atualizar' : 'Cadastrar')}
                  </Button>
                  {editingFornecedor && (
                    <Button type="button" variant="outline" onClick={() => {
                      setEditingFornecedor(null);
                      resetFornecedorForm();
                    }}>
                      Cancelar
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
          </div>

          {isChefe &&
            (idsFornecTabProdutos.size > 0 || idsFornecTabMateriais.size > 0) && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2">
                <span className="text-sm text-muted-foreground tabular-nums">
                  {idsFornecTabProdutos.size} produto(s) · {idsFornecTabMateriais.size} material(is)
                </span>
                <Button type="button" variant="secondary" size="sm" onClick={() => setBulkFornecPrecosOpen(true)}>
                  Atualizar preços em massa
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIdsFornecTabProdutos(new Set());
                    setIdsFornecTabMateriais(new Set());
                  }}
                >
                  Limpar seleção
                </Button>
              </div>
            )}

          <div className="space-y-3">
            {fornecedores.length > 0 ? (
              fornecedores.map((fornecedor, index) => (
                <motion.div
                  key={fornecedor.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: index * 0.03 }}
                >
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h3 className="font-medium mb-2">{fornecedor.nomeRazaoSocial}</h3>
                          <div className="grid gap-1 text-sm text-muted-foreground">
                            {fornecedor.cpfCnpj && <p>📄 {fornecedor.cpfCnpj}</p>}
                            {fornecedor.telefone && <p>📞 {fornecedor.telefone}</p>}
                            {fornecedor.chavePix && <p>💳 PIX: {fornecedor.chavePix}</p>}
                            {(fornecedor.logradouro || fornecedor.cep) && (
                              <p>📍 {[fornecedor.logradouro, fornecedor.numero, fornecedor.bairro].filter(Boolean).join(", ")}
                                {fornecedor.cep && ` — ${fornecedor.cep}`}
                                {fornecedor.cidade && fornecedor.estado && ` — ${fornecedor.cidade}/${fornecedor.estado}`}
                              </p>
                            )}
                            {!fornecedor.logradouro && !fornecedor.cep && fornecedor.endereco && <p>📍 {fornecedor.endereco}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="icon" onClick={() => setVerDadosFornecedor(fornecedor)} title="Ver dados">
                            <Eye className="size-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleEditFornecedor(fornecedor)}>
                            <Pencil className="size-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <Trash2 className="size-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tem certeza que deseja excluir este fornecedor?
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteFornecedor(fornecedor.id)}>
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                      {(() => {
                        const produtosDoFornecedor = produtos.filter(
                          (p) => String(p.fornecedor) === String(fornecedor.id)
                        );
                        const materiaisDoFornecedor = materiais.filter(
                          (m) => String(m.fornecedor) === String(fornecedor.id)
                        );
                        if (produtosDoFornecedor.length === 0 && materiaisDoFornecedor.length === 0) return null;
                        return (
                          <div className="border-t mt-4 pt-4">
                            {produtosDoFornecedor.length > 0 && (
                              <div className="space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <h4 className="font-medium text-sm">Produtos deste fornecedor</h4>
                                  {isChefe && (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs"
                                      onClick={() => {
                                        const pids = produtosDoFornecedor.map((p) => p.id);
                                        setIdsFornecTabProdutos((prev) => {
                                          const allOn =
                                            pids.length > 0 && pids.every((id) => prev.has(id));
                                          const next = new Set(prev);
                                          if (allOn) pids.forEach((id) => next.delete(id));
                                          else pids.forEach((id) => next.add(id));
                                          return next;
                                        });
                                      }}
                                    >
                                      {produtosDoFornecedor.every((p) => idsFornecTabProdutos.has(p.id))
                                        ? "Desmarcar produtos"
                                        : "Selecionar produtos"}
                                    </Button>
                                  )}
                                </div>
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      {isChefe && <TableHead className="w-10" />}
                                      <TableHead>Produto</TableHead>
                                      <TableHead className="text-right w-32">Preço venda</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {produtosDoFornecedor.map((p) => (
                                      <TableRow key={p.id}>
                                        {isChefe && (
                                          <TableCell className="w-10">
                                            <Checkbox
                                              checked={idsFornecTabProdutos.has(p.id)}
                                              onCheckedChange={(v) => {
                                                setIdsFornecTabProdutos((prev) => {
                                                  const next = new Set(prev);
                                                  if (v === true) next.add(p.id);
                                                  else next.delete(p.id);
                                                  return next;
                                                });
                                              }}
                                              aria-label={`Selecionar produto ${p.nome}`}
                                            />
                                          </TableCell>
                                        )}
                                        <TableCell className="font-medium">{p.nome}</TableCell>
                                        <TableCell className="text-right tabular-nums">
                                          {formatCurrency(Number(p.precoInicial ?? 0))}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            )}

                            {materiaisDoFornecedor.length > 0 && (
                              <div className={produtosDoFornecedor.length > 0 ? "mt-4 space-y-2" : "space-y-2"}>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <h4 className="font-medium text-sm">Materiais deste fornecedor</h4>
                                  {isChefe && (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs"
                                      onClick={() => {
                                        const mids = materiaisDoFornecedor.map((m) => m.id);
                                        setIdsFornecTabMateriais((prev) => {
                                          const allOn =
                                            mids.length > 0 && mids.every((id) => prev.has(id));
                                          const next = new Set(prev);
                                          if (allOn) mids.forEach((id) => next.delete(id));
                                          else mids.forEach((id) => next.add(id));
                                          return next;
                                        });
                                      }}
                                    >
                                      {materiaisDoFornecedor.every((m) => idsFornecTabMateriais.has(m.id))
                                        ? "Desmarcar materiais"
                                        : "Selecionar materiais"}
                                    </Button>
                                  )}
                                </div>
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      {isChefe && <TableHead className="w-10" />}
                                      <TableHead>Material</TableHead>
                                      {isChefe && <TableHead className="text-right w-32">Preço base</TableHead>}
                                      <TableHead className="text-right w-24">Estoque</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {materiaisDoFornecedor.map((m) => (
                                      <TableRow key={m.id}>
                                        {isChefe && (
                                          <TableCell className="w-10">
                                            <Checkbox
                                              checked={idsFornecTabMateriais.has(m.id)}
                                              onCheckedChange={(v) => {
                                                setIdsFornecTabMateriais((prev) => {
                                                  const next = new Set(prev);
                                                  if (v === true) next.add(m.id);
                                                  else next.delete(m.id);
                                                  return next;
                                                });
                                              }}
                                              aria-label={`Selecionar material ${m.nome}`}
                                            />
                                          </TableCell>
                                        )}
                                        <TableCell className="font-medium">{m.nome}</TableCell>
                                        {isChefe && (
                                          <TableCell className="text-right tabular-nums">
                                            {formatCurrency(Number(m.precoUnitarioBase ?? 0))}
                                          </TableCell>
                                        )}
                                        <TableCell className="text-right tabular-nums">{Number(m.estoque_atual ?? 0)}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>
                </motion.div>
              ))
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Nenhum fornecedor cadastrado
                </CardContent>
              </Card>
            )}
          </div>

          <Dialog
            open={bulkFornecPrecosOpen}
            onOpenChange={(open) => {
              setBulkFornecPrecosOpen(open);
              if (!open) {
                setBulkFornecPrecoVenda("");
                setBulkFornecPrecoCusto("");
                setBulkFornecMargemLucro("");
                setBulkFornecMatBase("");
                setBulkFornecMatFab("");
                setBulkFornecLimparFab(false);
              }
            }}
          >
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Preços em massa (fornecedores)</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                {idsFornecTabProdutos.size} produto(s) e {idsFornecTabMateriais.size} material(is) selecionados.
                Preencha só o que quiser alterar.
              </p>
              {idsFornecTabProdutos.size > 0 && (
                <div className="space-y-3 rounded-md border p-3">
                  <p className="text-sm font-medium">Produtos selecionados</p>
                  <p className="text-xs text-muted-foreground">
                    Alterar venda atualiza a %; alterar % atualiza a venda (com custo maior que zero).
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="bulkFornecPrecoCusto">Preço de custo</Label>
                    <Input
                      id="bulkFornecPrecoCusto"
                      type="text"
                      inputMode="decimal"
                      className="tabular-nums"
                      value={bulkFornecPrecoCusto}
                      onChange={handleBulkFornecCustoChange}
                      placeholder="Manter atual"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bulkFornecPrecoVenda">Preço de venda</Label>
                    <Input
                      id="bulkFornecPrecoVenda"
                      type="text"
                      inputMode="decimal"
                      className="tabular-nums"
                      value={bulkFornecPrecoVenda}
                      onChange={handleBulkFornecVendaChange}
                      placeholder="Manter atual"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bulkFornecMargemLucro">Percentual sobre o custo (%)</Label>
                    <Input
                      id="bulkFornecMargemLucro"
                      type="text"
                      inputMode="decimal"
                      className="tabular-nums"
                      value={bulkFornecMargemLucro}
                      onChange={handleBulkFornecMargemChange}
                      placeholder="Ex.: 30"
                    />
                  </div>
                </div>
              )}
              {idsFornecTabMateriais.size > 0 && (
                <div className="space-y-3 rounded-md border p-3">
                  <p className="text-sm font-medium">Materiais selecionados</p>
                  <div className="space-y-2">
                    <Label htmlFor="bulkFornecMatBase">Preço base (compra/estoque)</Label>
                    <Input
                      id="bulkFornecMatBase"
                      type="text"
                      inputMode="decimal"
                      value={bulkFornecMatBase}
                      onChange={(e) => setBulkFornecMatBase(e.target.value)}
                      placeholder="Manter atual"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bulkFornecMatFab">Preço fabricação (insumos)</Label>
                    <Input
                      id="bulkFornecMatFab"
                      type="text"
                      inputMode="decimal"
                      value={bulkFornecMatFab}
                      onChange={(e) => {
                        setBulkFornecMatFab(e.target.value);
                        if (e.target.value.trim()) setBulkFornecLimparFab(false);
                      }}
                      placeholder="Manter atual"
                      disabled={bulkFornecLimparFab}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="bulkFornecLimparFab"
                      checked={bulkFornecLimparFab}
                      onCheckedChange={(v) => {
                        const on = v === true;
                        setBulkFornecLimparFab(on);
                        if (on) setBulkFornecMatFab("");
                      }}
                    />
                    <Label htmlFor="bulkFornecLimparFab" className="text-sm font-normal cursor-pointer">
                      Remover preço de fabricação (voltar a usar o preço base nos insumos)
                    </Label>
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setBulkFornecPrecosOpen(false)}
                  disabled={savingBulkFornec}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  disabled={savingBulkFornec}
                  onClick={async () => {
                    const nP = idsFornecTabProdutos.size;
                    const nM = idsFornecTabMateriais.size;
                    const rawV = bulkFornecPrecoVenda.trim();
                    const rawC = bulkFornecPrecoCusto.trim();
                    const rawFM = bulkFornecMargemLucro.trim();
                    const rawMB = bulkFornecMatBase.trim();
                    const rawMF = bulkFornecMatFab.trim();
                    const wantProd = nP > 0 && (rawV !== "" || rawC !== "" || rawFM !== "");
                    const wantMat =
                      nM > 0 && (rawMB !== "" || rawMF !== "" || bulkFornecLimparFab);
                    if (!wantProd && !wantMat) {
                      toast.error(
                        "Preencha pelo menos um preço conforme o que selecionou (produtos e/ou materiais)."
                      );
                      return;
                    }
                    if (nP > 0 && !wantProd && nM === 0) {
                      toast.error("Você selecionou produtos: informe custo, venda e/ou %.");
                      return;
                    }
                    if (nM > 0 && !wantMat && nP === 0) {
                      toast.error(
                        "Você selecionou materiais: informe preço base e/ou fabricação, ou marque remover fabricação."
                      );
                      return;
                    }
                    let preco_venda: number | undefined;
                    let preco_custo: number | undefined;
                    let margem_lucro_percent: number | undefined;
                    if (wantProd) {
                      if (rawC) {
                        const c = roundDecimalPlaces(parseFloat(rawC.replace(",", ".")), 4);
                        if (Number.isNaN(c) || c < 0) {
                          toast.error("Preço de custo inválido");
                          return;
                        }
                        preco_custo = c;
                      }
                      if (rawV) {
                        const v = roundDecimalPlaces(parseFloat(rawV.replace(",", ".")), 4);
                        if (Number.isNaN(v) || v < 0) {
                          toast.error("Preço de venda inválido");
                          return;
                        }
                        preco_venda = v;
                      }
                      if (rawFM) {
                        const m = roundDecimalPlaces(parseFloat(rawFM.replace(",", ".")), 4);
                        if (Number.isNaN(m)) {
                          toast.error("Percentual inválido");
                          return;
                        }
                        margem_lucro_percent = m;
                      }
                    }
                    let preco_unitario_base: number | undefined;
                    let preco_fabricacao: number | null | undefined;
                    if (wantMat) {
                      if (rawMB) {
                        const b = roundDecimalPlaces(parseFloat(rawMB.replace(",", ".")), 4);
                        if (Number.isNaN(b) || b < 0) {
                          toast.error("Preço base do material inválido");
                          return;
                        }
                        preco_unitario_base = b;
                      }
                      if (bulkFornecLimparFab) preco_fabricacao = null;
                      else if (rawMF) {
                        const f = roundDecimalPlaces(parseFloat(rawMF.replace(",", ".")), 4);
                        if (Number.isNaN(f) || f < 0) {
                          toast.error("Preço de fabricação inválido");
                          return;
                        }
                        preco_fabricacao = f;
                      }
                    }
                    try {
                      setSavingBulkFornec(true);
                      const parts: string[] = [];
                      if (wantProd) {
                        const res =
                          preco_custo !== undefined && preco_venda !== undefined
                            ? await api.bulkUpdateProdutosPrecos({
                                ids: [...idsFornecTabProdutos],
                                preco_custo,
                                preco_venda,
                                margem_lucro_percent: null,
                              })
                            : preco_custo !== undefined && margem_lucro_percent !== undefined
                              ? await api.bulkUpdateProdutosPrecos({
                                  ids: [...idsFornecTabProdutos],
                                  preco_custo,
                                  preco_venda: null,
                                  margem_lucro_percent,
                                })
                              : await api.bulkUpdateProdutosPrecos({
                                  ids: [...idsFornecTabProdutos],
                                  preco_custo: preco_custo ?? null,
                                  preco_venda: preco_venda ?? null,
                                  margem_lucro_percent: margem_lucro_percent ?? null,
                                });
                        parts.push(`${res.ok} produto(s)`);
                        if (res.failed > 0) toast.warning(`${res.failed} produto(s) com erro.`);
                      }
                      if (wantMat) {
                        const matPayload: {
                          ids: string[];
                          preco_unitario_base?: number;
                          preco_fabricacao?: number | null;
                        } = { ids: [...idsFornecTabMateriais] };
                        if (preco_unitario_base !== undefined)
                          matPayload.preco_unitario_base = preco_unitario_base;
                        if (preco_fabricacao !== undefined) matPayload.preco_fabricacao = preco_fabricacao;
                        const res = await api.bulkUpdateMateriaisPrecos(matPayload);
                        parts.push(`${res.ok} material(is)`);
                        if (res.failed > 0) toast.warning(`${res.failed} material(is) com erro.`);
                      }
                      toast.success(`Atualizado: ${parts.join(" · ")}.`);
                      setBulkFornecPrecosOpen(false);
                      setBulkFornecPrecoVenda("");
                      setBulkFornecPrecoCusto("");
                      setBulkFornecMargemLucro("");
                      setBulkFornecMatBase("");
                      setBulkFornecMatFab("");
                      setBulkFornecLimparFab(false);
                      setIdsFornecTabProdutos(new Set());
                      setIdsFornecTabMateriais(new Set());
                      await loadData();
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Erro ao atualizar preços");
                    } finally {
                      setSavingBulkFornec(false);
                    }
                  }}
                >
                  {savingBulkFornec ? "Aplicando…" : "Aplicar"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={!!verDadosFornecedor} onOpenChange={(open) => !open && setVerDadosFornecedor(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Dados do fornecedor</DialogTitle>
              </DialogHeader>
              {verDadosFornecedor && (
                <div className="space-y-3 text-sm">
                  <p><span className="font-medium">Nome/Razão Social:</span> {verDadosFornecedor.nomeRazaoSocial}</p>
                  <p><span className="font-medium">CPF/CNPJ:</span> {verDadosFornecedor.cpfCnpj || '—'}</p>
                  <p><span className="font-medium">Telefone:</span> {verDadosFornecedor.telefone || '—'}</p>
                  <p><span className="font-medium">Chave PIX:</span> {verDadosFornecedor.chavePix || '—'}</p>
                  {(verDadosFornecedor.logradouro || verDadosFornecedor.cep) && (
                    <p><span className="font-medium">Endereço:</span> {[verDadosFornecedor.logradouro, verDadosFornecedor.numero, verDadosFornecedor.bairro].filter(Boolean).join(", ")}
                      {verDadosFornecedor.cep && ` — ${verDadosFornecedor.cep}`}
                      {verDadosFornecedor.cidade && verDadosFornecedor.estado && ` — ${verDadosFornecedor.cidade}/${verDadosFornecedor.estado}`}
                    </p>
                  )}
                  {!verDadosFornecedor.logradouro && !verDadosFornecedor.cep && verDadosFornecedor.endereco && (
                    <p><span className="font-medium">Endereço:</span> {verDadosFornecedor.endereco}</p>
                  )}
                </div>
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* MATERIAIS */}
        <TabsContent value="materiais" className="space-y-6">
          <div
            ref={cadastroMaterialFormRef}
            className={`scroll-mt-24 ${editingMaterial ? CADASTRO_FORM_EDIT_SHELL : ""}`}
          >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TreePine className="size-5" />
                {editingMaterial ? 'Editar Material' : 'Novo Material'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmitMaterial} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="nomeMaterial">Nome do Material *</Label>
                    <Input
                      id="nomeMaterial"
                      value={nomeMaterial}
                      onChange={(e) => setNomeMaterial(e.target.value)}
                      placeholder="Nome do material"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="categoriaMaterial">Categoria *</Label>
                    <Select value={categoriaMaterial} onValueChange={setCategoriaMaterial}>
                      <SelectTrigger id="categoriaMaterial">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {categoriasMaterial.length > 0 ? (
                          categoriasMaterial.map((cat) => (
                            <SelectItem key={cat.id} value={String(cat.id)}>
                              {cat.nome || "(Sem nome)"}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="none" disabled>
                            Cadastre uma categoria de material
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fornecedorMaterial">Fornecedor *</Label>
                    <Select value={fornecedorMaterial} onValueChange={setFornecedorMaterial}>
                      <SelectTrigger id="fornecedorMaterial">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {fornecedores.length > 0 ? (
                          fornecedores.map((fornecedor) => (
                            <SelectItem key={fornecedor.id} value={String(fornecedor.id)}>
                              {fornecedor.nomeRazaoSocial || "(Sem nome)"}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="none" disabled>
                            Cadastre um fornecedor primeiro
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  {isChefe && (
                    <>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="precoMaterial">Preço base (compra e estoque) *</Label>
                        <Input
                          id="precoMaterial"
                          type="text"
                          inputMode="decimal"
                          value={precoMaterial}
                          onChange={(e) => setPrecoMaterial(e.target.value)}
                          placeholder="0,0000"
                        />
                        <p className="text-xs text-muted-foreground">Usado em compras e valorização de estoque; não altera histórico de notas já lançadas.</p>
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="precoMaterialFabricacao">Preço na fabricação (insumos)</Label>
                        <Input
                          id="precoMaterialFabricacao"
                          type="text"
                          inputMode="decimal"
                          value={precoMaterialFabricacao}
                          onChange={(e) => setPrecoMaterialFabricacao(e.target.value)}
                          placeholder="Opcional — vazio usa o preço base"
                        />
                        <p className="text-xs text-muted-foreground">Só para custo de materiais nos produtos fabricados. Deixe vazio para usar o preço base.</p>
                      </div>
                    </>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button type="submit">
                    {editingMaterial ? 'Atualizar' : 'Cadastrar'}
                  </Button>
                  {editingMaterial && (
                    <Button type="button" variant="outline" onClick={() => {
                      setEditingMaterial(null);
                      resetMaterialForm();
                    }}>
                      Cancelar
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
          </div>

          <div className="space-y-3">
            {materiais.length > 0 ? (
              materiaisAgrupados.map((grupo, gi) => (
                <div key={grupo.categoriaId ?? `sem-${gi}`} className="space-y-2">
                  <div className="rounded-lg border bg-muted/30 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-5 w-1.5 rounded-full bg-primary/70 shrink-0" />
                        <div className="font-semibold truncate">{grupo.categoriaNome}</div>
                      </div>
                      <Badge variant="outline" className="tabular-nums shrink-0">
                        {grupo.itens.length}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {grupo.itens.map((material, index) => (
                      <motion.div
                        key={material.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.15, delay: index * 0.01 }}
                      >
                        <Card>
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-sm text-muted-foreground">
                                    Fornecedor: {fornecedores.find(f => String(f.id) === String(material.fornecedor))?.nomeRazaoSocial ?? '—'}
                                  </span>
                                  <h3 className="font-medium">{material.nome}</h3>
                                </div>
                                {isChefe && (
                                  <div className="space-y-0.5">
                                    <p className="text-sm text-muted-foreground">
                                      Base (compra/estoque):{" "}
                                      <span className="font-medium text-foreground">{formatCurrency(material.precoUnitarioBase)}</span>
                                    </p>
                                    <p className="text-lg font-semibold text-primary">
                                      Fabricação (insumos):{" "}
                                      {material.precoFabricacao != null && !Number.isNaN(Number(material.precoFabricacao))
                                        ? formatCurrency(Number(material.precoFabricacao))
                                        : formatCurrency(material.precoUnitarioBase)}
                                    </p>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <Button variant="ghost" size="icon" onClick={() => handleEditMaterial(material)}>
                                  <Pencil className="size-4" />
                                </Button>
                                {isChefe && (
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button variant="ghost" size="icon">
                                        <Trash2 className="size-4 text-destructive" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Tem certeza que deseja excluir este material?
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleDeleteMaterial(material.id)}>
                                          Excluir
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Nenhum material cadastrado
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* CONTAS BANCÁRIAS - apenas chefe */}
        {isChefe && (
        <TabsContent value="contas" className="space-y-6">
          <div
            ref={cadastroContaFormRef}
            className={`scroll-mt-24 ${editingConta ? CADASTRO_FORM_EDIT_SHELL : ""}`}
          >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="size-5" />
                {editingConta ? 'Editar Conta' : 'Nova Conta Bancária'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmitConta} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="nomeConta">Nome da Conta *</Label>
                    <Input
                      id="nomeConta"
                      value={nomeConta}
                      onChange={(e) => setNomeConta(e.target.value)}
                      placeholder="Ex: Banco do Brasil - CC"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="saldoConta">Saldo *</Label>
                    <Input
                      id="saldoConta"
                      type="number"
                      step="0.01"
                      value={saldoConta}
                      onChange={(e) => setSaldoConta(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit">
                    {editingConta ? 'Atualizar' : 'Cadastrar'}
                  </Button>
                  {editingConta && (
                    <Button type="button" variant="outline" onClick={() => {
                      setEditingConta(null);
                      resetContaForm();
                    }}>
                      Cancelar
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
          </div>

          <div className="space-y-3">
            {contas.length > 0 ? (
              contas.map((conta, index) => (
                <motion.div
                  key={conta.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: index * 0.03 }}
                >
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h3 className="font-medium mb-2">{conta.nome}</h3>
                          <p className={`text-xl font-semibold ${conta.saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(conta.saldo)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleEditConta(conta)}>
                            <Pencil className="size-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <Trash2 className="size-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tem certeza que deseja excluir esta conta bancária?
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteConta(conta.id)}>
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Nenhuma conta cadastrada
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
