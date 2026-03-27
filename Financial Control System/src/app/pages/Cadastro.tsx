import React, { useState, useEffect } from "react";
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
  const [precoRapidoMaterial, setPrecoRapidoMaterial] = useState<Record<string, string>>({});
  const [savingPrecoMaterialId, setSavingPrecoMaterialId] = useState<string | null>(null);
  const [editingCategoria, setEditingCategoria] = useState<Categoria | null>(null);
  const [editingProduto, setEditingProduto] = useState<Produto | null>(null);
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
  const [calcProdutoSource, setCalcProdutoSource] = useState<'preco_venda' | 'preco_custo' | 'margem' | null>(null);
  const [materialInsumoProduto, setMaterialInsumoProduto] = useState('');
  const [quantidadeInsumoProduto, setQuantidadeInsumoProduto] = useState('');
  const [insumosProduto, setInsumosProduto] = useState<{ material: number; material_nome: string; quantidade: number; preco_unitario_base: number; total_insumo: number }[]>([]);

  // Form states - Materiais
  const [nomeMaterial, setNomeMaterial] = useState('');
  const [categoriaMaterial, setCategoriaMaterial] = useState('');
  const [fornecedorMaterial, setFornecedorMaterial] = useState('');
  const [precoMaterial, setPrecoMaterial] = useState('');

  // Form states - Contas
  const [nomeConta, setNomeConta] = useState('');
  const [saldoConta, setSaldoConta] = useState('');

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
      setMateriais((Array.isArray(materiaisRes) ? materiaisRes : []).map((m: any) => ({
        id: sid(m.id),
        nome: m.nome || "",
        categoria: sid(m.categoria),
        fornecedor: sid(m.fornecedor_padrao),
        precoUnitarioBase: Number(m.precoUnitarioBase ?? m.preco_unitario_base) || 0,
        estoque_atual: Number(m.estoque_atual) || 0,
        createdAt: "",
      })));
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
    const payload = {
      nome: nomeProduto.trim(),
      categoria: Number(categoriaProduto) || undefined,
      preco_venda: preco,
      descricao: "",
      revenda: false,
      fabricado: produtoFabricado,
      fornecedor: fornecedorProduto ? Number(fornecedorProduto) : null,
      preco_custo: !isNaN(custo) && custo >= 0 ? custo : 0,
      mao_obra_unitaria: !isNaN(maoObra) && maoObra >= 0 ? maoObra : 0,
      margem_lucro_percent: !isNaN(margem) ? margem : 0,
      insumos: produtoFabricado
        ? insumosProduto.map((i) => ({ material: i.material, quantidade: i.quantidade }))
        : [],
    };
    try {
      if (editingProduto) {
        await api.updateProduto(editingProduto.id, payload);
        toast.success('Produto atualizado');
        setEditingProduto(null);
      } else {
        await api.createProduto(payload);
        toast.success('Produto cadastrado');
      }
      await loadData();
      resetProdutoForm();
    } catch (err) {
      toast.error('Erro ao salvar produto');
    }
  };

  const handleSubmitFornecedor = async (e: React.FormEvent) => {
    e.preventDefault();
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
      preco = parseFloat(String(precoMaterial).replace(',', '.'));
      if (isNaN(preco) || preco < 0) {
        toast.error('Preço inválido');
        return;
      }
    } else {
      preco = editingMaterial ? Number(editingMaterial.precoUnitarioBase) || 0 : 0;
    }
    const payload: any = {
      nome: nomeMaterial.trim(),
      preco_unitario_base: preco,
      precoUnitarioBase: preco,
    };
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
      toast.error('Erro ao salvar material');
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

  const resetProdutoForm = () => {
    setCategoriaProduto('');
    setNomeProduto('');
    setPrecoInicial('');
    setProdutoFabricado(false);
    setFornecedorProduto('');
    setPrecoCustoProduto('');
    setMaoObraProduto('');
    setMargemLucroProduto('');
    setCalcProdutoSource(null);
    setMaterialInsumoProduto('');
    setQuantidadeInsumoProduto('');
    setInsumosProduto([]);
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
    setCategoriaProduto(produto.categoria);
    setNomeProduto(produto.nome);
    setPrecoInicial(Number(produto.precoInicial).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setProdutoFabricado(Boolean(produto.fabricado));
    setFornecedorProduto(produto.fornecedor || '');
    setPrecoCustoProduto(
      Number(produto.precoCusto ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    );
    setMaoObraProduto(
      Number(produto.maoObraUnitaria ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    );
    setMargemLucroProduto(
      Number(produto.margemLucroPercent ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    );
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

  const fmt2 = (n: number) =>
    Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const custoMateriaisProduto = insumosProduto.reduce((acc, i) => acc + (Number(i.total_insumo) || 0), 0);
  const maoObraNum = parseDecimal(maoObraProduto) ?? 0;
  const custoTotalFabricacao = custoMateriaisProduto + maoObraNum;

  useEffect(() => {
    if (!produtoFabricado) return;
    setCalcProdutoSource('preco_custo');
    setPrecoCustoProduto(fmt2(custoTotalFabricacao));
    const margem = parseDecimal(margemLucroProduto);
    if (margem != null) {
      setPrecoInicial(fmt2(custoTotalFabricacao * (1 + margem / 100)));
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
    setPrecoMaterial(Number(material.precoUnitarioBase).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
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
      toast.success('Produto excluído');
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      const podeInativar = /vendas|inativar/i.test(msg);
      if (podeInativar) {
        try {
          await api.inativarProduto(id);
          toast.success('Produto inativado (removido da lista, dados preservados).');
          await loadData();
        } catch {
          toast.error(msg || 'Erro ao excluir produto');
        }
      } else {
        toast.error(msg || 'Erro ao excluir produto');
      }
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
      maximumFractionDigits: 2,
    }).format(Number(value));
  };

  const categoriasProduto = categorias.filter(c => c.tipo === 'produto');
  const categoriasMaterial = categorias.filter(c => c.tipo === 'material');
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
                          setMargemLucroProduto(fmt2(m));
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
                            setPrecoInicial(fmt2(pv));
                          } else if (venda != null && (calcProdutoSource === 'preco_venda' || calcProdutoSource === 'preco_custo')) {
                            const m = ((venda / custo) - 1) * 100;
                            setMargemLucroProduto(fmt2(m));
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
                          setPrecoInicial(fmt2(pv));
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
                            const precoBase = Number(mat.precoUnitarioBase ?? mat.preco_unitario_base) || 0;
                            const total = precoBase * qtd;
                            setInsumosProduto((prev) => {
                              const idx = prev.findIndex((i) => i.material === Number(mat.id));
                              if (idx >= 0) {
                                const clone = [...prev];
                                clone[idx] = {
                                  ...clone[idx],
                                  quantidade: clone[idx].quantidade + qtd,
                                  total_insumo: (clone[idx].quantidade + qtd) * clone[idx].preco_unitario_base,
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
                            <span>{i.material_nome} ({i.quantidade.toLocaleString('pt-BR')} x {formatCurrency(i.preco_unitario_base)})</span>
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
                        <Input value={fmt2(custoMateriaisProduto)} disabled />
                      </div>
                      <div className="space-y-2">
                        <Label>Custo total (insumos + mão de obra)</Label>
                        <Input value={fmt2(custoTotalFabricacao)} disabled />
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button type="submit">
                    {editingProduto ? 'Atualizar' : 'Cadastrar'}
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

          <div className="space-y-3">
            {produtos.length > 0 ? (
              produtos.map((produto, index) => (
                <motion.div
                  key={produto.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: index * 0.03 }}
                >
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline">{categorias.find(c => sid(c.id) === produto.categoria || c.nome === produto.categoria)?.nome ?? produto.categoria}</Badge>
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
              ))
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Nenhum produto cadastrado
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* CATEGORIAS */}
        <TabsContent value="categorias" className="space-y-6">
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
                  <Button type="submit">
                    {editingFornecedor ? 'Atualizar' : 'Cadastrar'}
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
                        const materiaisDoFornecedor = materiais.filter(
                          (m) => String(m.fornecedor) === String(fornecedor.id)
                        );
                        if (materiaisDoFornecedor.length === 0) return null;
                        return (
                          <div className="border-t mt-4 pt-4">
                            <h4 className="font-medium mb-2 text-sm">Produtos deste fornecedor</h4>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Produto</TableHead>
                                  <TableHead className="text-right w-24">Quantidade</TableHead>
                                  {isChefe && (
                                    <>
                                      <TableHead className="text-right w-28">Preço atual</TableHead>
                                      <TableHead className="w-32">Novo preço</TableHead>
                                      <TableHead className="w-20"></TableHead>
                                    </>
                                  )}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {materiaisDoFornecedor.map((m) => (
                                  <TableRow key={m.id}>
                                    <TableCell className="font-medium">{m.nome}</TableCell>
                                    <TableCell className="text-right">{m.estoque_atual ?? 0}</TableCell>
                                    {isChefe && (
                                      <>
                                        <TableCell className="text-right">
                                          {formatCurrency(Number(m.precoUnitarioBase ?? 0))}
                                        </TableCell>
                                        <TableCell>
                                          <Input
                                            type="text"
                                            inputMode="decimal"
                                            className="h-8 text-sm"
                                            placeholder="0,00"
                                            value={precoRapidoMaterial[m.id] ?? ""}
                                            onChange={(e) => setPrecoRapidoMaterial((prev) => ({ ...prev, [m.id]: e.target.value }))}
                                          />
                                        </TableCell>
                                        <TableCell>
                                          <Button
                                            size="sm"
                                            className="h-8"
                                            disabled={!((precoRapidoMaterial[m.id] ?? "").trim()) || savingPrecoMaterialId === m.id}
                                            onClick={async () => {
                                              const valorEdit = precoRapidoMaterial[m.id] ?? "";
                                              const v = parseFloat(valorEdit.replace(",", "."));
                                              if (isNaN(v) || v < 0) {
                                                toast.error("Preço inválido");
                                                return;
                                              }
                                              setSavingPrecoMaterialId(m.id);
                                              try {
                                                await api.updateMaterial(m.id, { preco_unitario_base: v, precoUnitarioBase: v });
                                                toast.success("Preço atualizado");
                                                setPrecoRapidoMaterial((prev) => ({ ...prev, [m.id]: "" }));
                                                await loadData();
                                              } catch {
                                                toast.error("Erro ao atualizar preço");
                                              } finally {
                                                setSavingPrecoMaterialId(null);
                                              }
                                            }}
                                          >
                                            {savingPrecoMaterialId === m.id ? "..." : "Salvar"}
                                          </Button>
                                        </TableCell>
                                      </>
                                    )}
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
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
                    <div className="space-y-2">
                      <Label htmlFor="precoMaterial">Preço Unitário Base *</Label>
                      <Input
                        id="precoMaterial"
                        type="text"
                        inputMode="decimal"
                        value={precoMaterial}
                        onChange={(e) => setPrecoMaterial(e.target.value)}
                        placeholder="0,00"
                      />
                    </div>
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

          <div className="space-y-3">
            {materiais.length > 0 ? (
              materiais.map((material, index) => (
                <motion.div
                  key={material.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: index * 0.03 }}
                >
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline">{categorias.find(c => sid(c.id) === material.categoria || c.nome === material.categoria)?.nome ?? material.categoria}</Badge>
                            <span className="text-sm text-muted-foreground">Fornecedor: {fornecedores.find(f => String(f.id) === String(material.fornecedor))?.nomeRazaoSocial ?? '—'}</span>
                            <h3 className="font-medium">{material.nome}</h3>
                          </div>
                          {isChefe && (
                            <p className="text-lg font-semibold text-primary">
                              {formatCurrency(material.precoUnitarioBase)}
                            </p>
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
