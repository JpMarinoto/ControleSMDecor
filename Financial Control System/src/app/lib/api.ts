// Autenticação por Token: o login devolve um token; guardamos em sessionStorage e enviamos em Authorization em todos os pedidos.
const API_BASE_URL = typeof window !== 'undefined' ? '/api' : (import.meta.env.VITE_API_URL || '/api');

const AUTH_TOKEN_KEY = 'authToken';

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  if (typeof window !== 'undefined') sessionStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  if (typeof window !== 'undefined') sessionStorage.removeItem(AUTH_TOKEN_KEY);
}

function authHeaders(): Record<string, string> {
  const t = getAuthToken();
  return t ? { Authorization: `Token ${t}` } : {};
}

function messageFromApiError(data: unknown): string {
  if (data == null) return '';
  if (typeof data === 'string') return data;
  if (typeof data !== 'object') return String(data);
  const o = data as Record<string, unknown>;
  if (typeof o.detail === 'string') return o.detail;
  if (typeof o.error === 'string') return o.error;
  const parts: string[] = [];
  for (const [, val] of Object.entries(o)) {
    if (Array.isArray(val) && val.length > 0) {
      const first = val[0];
      if (typeof first === 'string') parts.push(first);
    } else if (typeof val === 'string') parts.push(val);
  }
  return parts.join(' ') || '';
}

async function readJsonOrThrow(response: Response): Promise<unknown> {
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    throw new Error(messageFromApiError(body) || `Erro HTTP ${response.status}`);
  }
  return body;
}

export interface EstoqueItem {
  id: number;
  nome: string;
  estoque_atual: number;
  preco_unitario_base: number;
  total: number;
  categoria_id?: number | null;
  categoria_nome?: string | null;
  alterado_hoje?: boolean;
}

/** Resposta da API `/relatorio-lucros-vendas/` (margem por vendas no período). */
export interface RelatorioLucrosVendas {
  data_inicio: string;
  data_fim: string;
  receita_total: number;
  custo_total: number;
  lucro_total: number;
  por_cliente: { cliente_id: number; cliente_nome: string; receita: number; custo: number; lucro: number }[];
  por_produto: {
    produto_id: number;
    produto_nome: string;
    quantidade: number;
    receita: number;
    custo: number;
    lucro: number;
  }[];
}

/** Resposta da API `/relatorio-compras-periodo/` (compras por material/produto no intervalo). */
export interface RelatorioComprasPeriodo {
  data_inicio: string;
  data_fim: string;
  materiais: { material_id: number; nome: string; quantidade: number; total_gasto: number }[];
  produtos: { produto_id: number; nome: string; quantidade: number; total_gasto: number }[];
}

/** Resposta da API `/precificacoes/shopee/` (precificação salva no SQLite). */
export interface PrecificacaoShopeeApiRow {
  id: number;
  nome: string;
  dataIso: string;
  mesReferencia: string;
  nfPercent: string;
  impostoPercent: string;
  linhas: unknown[];
}

export const api = {
  // Auth
  authLogin: async (username: string, password: string) => {
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/auth/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ username, password }),
      });
    } catch {
      throw new Error('Não foi possível conectar. Verifique a internet e tente novamente.');
    }
    let data: { error?: string; [k: string]: unknown } = {};
    let bodyText = '';
    try {
      bodyText = await response.text();
      if (bodyText) data = JSON.parse(bodyText) as typeof data;
    } catch {
      // body não é JSON
    }
    if (!response.ok) {
      const serverMsg = typeof data?.error === 'string' ? data.error : '';
      if (response.status === 401) throw new Error('Usuário ou senha incorretos.');
      if (response.status === 403) throw new Error('Acesso negado. Tente novamente.');
      if (response.status === 400) throw new Error(serverMsg || 'Dados inválidos.');
      throw new Error(serverMsg || 'Não foi possível entrar. Tente novamente.');
    }
    const token = data && typeof data === 'object' && data !== null && 'token' in data ? (data as { token: string }).token : null;
    if (token) setAuthToken(token);
    return data;
  },
  authLogout: async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/logout/`, {
        method: 'POST',
        headers: { ...authHeaders() },
      });
      await res.text();
    } finally {
      clearAuthToken();
    }
  },

  authVerifyPassword: async (password: string) => {
    const response = await fetch(`${API_BASE_URL}/auth/verify-password/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ password }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(messageFromApiError(body) || 'Senha incorreta');
    }
    return body;
  },

  authMe: async () => {
    const response = await fetch(`${API_BASE_URL}/auth/me/`, { headers: authHeaders() });
    if (!response.ok) return null;
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      return null;
    }
    return data && typeof data === "object" && data !== null && "id" in data ? data : null;
  },

  /** Atualizar próprio perfil: nome de exibição e/ou senha (qualquer usuário logado). */
  updateMe: async (data: { nome_exibicao?: string; senha_atual?: string; nova_senha?: string }) => {
    const response = await fetch(`${API_BASE_URL}/auth/me/`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(data),
    });
    const text = await response.text();
    let body: { error?: string; field?: string; [k: string]: unknown } = {};
    try {
      if (text) body = JSON.parse(text) as typeof body;
    } catch {
      // ignore
    }
    if (!response.ok) {
      const msg = body?.error || text || `Erro ${response.status}`;
      throw new Error(msg);
    }
    return body && typeof body === "object" && "id" in body ? body : null;
  },

  // Usuários (apenas chefe)
  getUsuarios: async () => {
    const response = await fetch(`${API_BASE_URL}/usuarios/`, { headers: authHeaders() });
    if (!response.ok) {
      let body: { error?: string; detail?: string; hint?: string } = {};
      try {
        const text = await response.text();
        if (text) body = JSON.parse(text) as typeof body;
      } catch {
        // ignorar
      }
      const msg = body?.error || `Erro ${response.status}`;
      const hint = body?.hint ? ` — ${body.hint}` : "";
      const detail = body?.detail ? ` [${body.detail}]` : "";
      throw new Error(`${msg}${detail}${hint}`);
    }
    return response.json();
  },
  createUsuario: async (data: { username: string; password: string; nome_exibicao?: string; role?: string }) => {
    const response = await fetch(`${API_BASE_URL}/usuarios/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
    let out: { username?: string[]; password?: string[]; error?: string; [k: string]: unknown } = {};
    let bodyText = '';
    try {
      bodyText = await response.text();
      if (bodyText) out = JSON.parse(bodyText) as typeof out;
    } catch {
      // body não é JSON (ex.: página HTML de erro)
    }
    if (!response.ok) {
      const serverMsg =
        (typeof out?.error === 'string' && out.error) ||
        (Array.isArray(out?.username) && out.username[0]) ||
        (Array.isArray(out?.password) && out.password[0]) ||
        '';
      const hint = typeof (out as { hint?: string })?.hint === 'string' ? ` — ${(out as { hint: string }).hint}` : '';
      const detail = typeof (out as { detail?: string })?.detail === 'string' ? ` [${(out as { detail: string }).detail}]` : '';
      const byStatus: Record<number, string> = {
        400: 'Dados inválidos.',
        403: 'Sem permissão para criar usuários.',
        404: 'Serviço de usuários não encontrado. Verifique se o backend está a correr.',
        500: 'Erro interno no servidor ao criar usuário.',
      };
      const fallback = byStatus[response.status] || `Erro ao criar usuário (${response.status}).`;
      throw new Error(serverMsg ? `${serverMsg}${detail}${hint}` : fallback);
    }
    return out;
  },
  updateUsuario: async (id: number, data: { nome_exibicao?: string; role?: string; password?: string }) => {
    const response = await fetch(`${API_BASE_URL}/usuarios/${id}/`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      let err: { error?: string; hint?: string; detail?: string } = {};
      try {
        const text = await response.text();
        if (text) err = JSON.parse(text) as typeof err;
      } catch {
        // ignorar
      }
      const msg = err?.error || `Erro ${response.status} ao atualizar usuário`;
      const hint = err?.hint ? ` — ${err.hint}` : '';
      const detail = err?.detail ? ` [${err.detail}]` : '';
      throw new Error(`${msg}${detail}${hint}`);
    }
    return response.json();
  },
  deleteUsuario: async (id: number) => {
    const response = await fetch(`${API_BASE_URL}/usuarios/${id}/`, { method: 'DELETE', headers: authHeaders() });
    if (!response.ok) {
      let err: { error?: string; hint?: string; detail?: string } = {};
      try {
        const text = await response.text();
        if (text) err = JSON.parse(text) as typeof err;
      } catch {
        // ignorar
      }
      const msg = err?.error || `Erro ${response.status} ao desativar usuário`;
      const hint = err?.hint ? ` — ${err.hint}` : '';
      const detail = err?.detail ? ` [${err.detail}]` : '';
      throw new Error(`${msg}${detail}${hint}`);
    }
  },

  // Clientes
  getClientes: async (params?: { data_inicio?: string; data_fim?: string }) => {
    const sp = new URLSearchParams();
    if (params?.data_inicio) sp.set('data_inicio', params.data_inicio);
    if (params?.data_fim) sp.set('data_fim', params.data_fim);
    const qs = sp.toString();
    const url = qs ? `${API_BASE_URL}/clientes/?${qs}` : `${API_BASE_URL}/clientes/`;
    const response = await fetch(url, { headers: authHeaders() });
    return response.json();
  },
  
  createCliente: async (data: any) => {
    const response = await fetch(`${API_BASE_URL}/clientes/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
    return response.json();
  },
  
  updateCliente: async (id: string, data: any) => {
    const response = await fetch(`${API_BASE_URL}/clientes/${id}/`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
    return response.json();
  },
  
  deleteCliente: async (id: string) => {
    const res = await fetch(`${API_BASE_URL}/clientes/${id}/`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string; code?: string; hint?: string };
      throw new Error(body.error || body.hint || 'Erro ao excluir');
    }
  },

  inativarCliente: async (id: string) => {
    const res = await fetch(`${API_BASE_URL}/clientes/${id}/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ ativo: false }),
    });
    if (!res.ok) throw new Error('Erro ao inativar');
    return res.json();
  },

  // Produtos
  getProdutos: async (params?: { incluir_inativos?: boolean }) => {
    const sp = new URLSearchParams();
    if (params?.incluir_inativos) sp.set("incluir_inativos", "1");
    const qs = sp.toString();
    const url = qs ? `${API_BASE_URL}/produtos/?${qs}` : `${API_BASE_URL}/produtos/`;
    const response = await fetch(url, { headers: authHeaders() });
    return response.json();
  },
  
  createProduto: async (data: any) => {
    const response = await fetch(`${API_BASE_URL}/produtos/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
    return readJsonOrThrow(response);
  },
  
  updateProduto: async (id: string, data: any) => {
    const response = await fetch(`${API_BASE_URL}/produtos/${id}/`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
    return readJsonOrThrow(response);
  },
  
  deleteProduto: async (id: string) => {
    const res = await fetch(`${API_BASE_URL}/produtos/${id}/`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string; code?: string; hint?: string };
      throw new Error(body.error || body.hint || 'Erro ao excluir');
    }
  },

  inativarProduto: async (id: string) => {
    const res = await fetch(`${API_BASE_URL}/produtos/${id}/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ ativo: false }),
    });
    if (!res.ok) throw new Error('Erro ao inativar');
    return res.json();
  },

  /**
   * Apenas chefe. Pelo menos um de: preco_venda, preco_custo, margem_lucro_percent.
   * Com margem_lucro_percent: venda = custo × (1 + margem/100) por produto (custo em massa ou atual).
   * Sem margem no body: preco_venda e preco_custo atualizam e a margem cadastral é recalculada no servidor quando fizer sentido.
   */
  bulkUpdateProdutosPrecos: async (body: {
    ids: (string | number)[];
    preco_venda?: number | null;
    preco_custo?: number | null;
    margem_lucro_percent?: number | null;
  }) => {
    const payload: Record<string, unknown> = { ids: body.ids };
    if (body.preco_venda != null) payload.preco_venda = body.preco_venda;
    if (body.preco_custo != null) payload.preco_custo = body.preco_custo;
    if (body.margem_lucro_percent != null) payload.margem_lucro_percent = body.margem_lucro_percent;
    const response = await fetch(`${API_BASE_URL}/produtos/bulk-precos/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload),
    });
    return readJsonOrThrow(response) as Promise<{ ok: number; failed: number; errors: { id: number; error: string }[] }>;
  },

  /** Apenas chefe. Envie preco_unitario_base e/ou preco_fabricacao (null zera o override de fabricação). */
  bulkUpdateMateriaisPrecos: async (body: {
    ids: (string | number)[];
    preco_unitario_base?: number;
    preco_fabricacao?: number | null;
  }) => {
    const payload: Record<string, unknown> = { ids: body.ids };
    if ('preco_unitario_base' in body) payload.preco_unitario_base = body.preco_unitario_base;
    if ('preco_fabricacao' in body) payload.preco_fabricacao = body.preco_fabricacao;
    const response = await fetch(`${API_BASE_URL}/materiais/bulk-precos/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload),
    });
    return readJsonOrThrow(response) as Promise<{ ok: number; failed: number; errors: { id: number; error: string }[] }>;
  },

  // Vendas (backend retorna todas por padrão)
  getVendas: async () => {
    const response = await fetch(`${API_BASE_URL}/vendas/`, { headers: authHeaders() });
    if (!response.ok) return [];
    const data = await response.json().catch(() => null);
    return Array.isArray(data) ? data : [];
  },

  getRelatorioLucrosVendas: async (params: { data_inicio: string; data_fim: string; cliente_id?: string }) => {
    const sp = new URLSearchParams();
    sp.set('data_inicio', params.data_inicio);
    sp.set('data_fim', params.data_fim);
    if (params.cliente_id && params.cliente_id !== 'all') sp.set('cliente_id', params.cliente_id);
    const response = await fetch(`${API_BASE_URL}/relatorio-lucros-vendas/?${sp.toString()}`, {
      headers: authHeaders(),
    });
    return readJsonOrThrow(response) as Promise<RelatorioLucrosVendas>;
  },

  getRelatorioComprasPeriodo: async (params: { data_inicio: string; data_fim: string }) => {
    const sp = new URLSearchParams();
    sp.set('data_inicio', params.data_inicio);
    sp.set('data_fim', params.data_fim);
    const response = await fetch(`${API_BASE_URL}/relatorio-compras-periodo/?${sp.toString()}`, {
      headers: authHeaders(),
    });
    return readJsonOrThrow(response) as Promise<RelatorioComprasPeriodo>;
  },

  getVendaDetalhe: async (id: string) => {
    const response = await fetch(`${API_BASE_URL}/vendas/${id}/`, { headers: authHeaders() });
    return response.json();
  },

  patchVenda: async (
    id: string,
    body: { data?: string; data_venda?: string; marcada_paga?: boolean }
  ) => {
    const response = await fetch(`${API_BASE_URL}/vendas/${id}/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
    });
    return readJsonOrThrow(response);
  },

  deleteVenda: async (id: string, motivo: string) => {
    const response = await fetch(`${API_BASE_URL}/vendas/${id}/`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ motivo }),
    });
    if (response.status === 204) return;
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(messageFromApiError(body) || `HTTP ${response.status}`);
    }
  },

  addItemVenda: async (vendaId: string, data: { produto: number; quantidade: number; preco_unitario?: number }) => {
    const response = await fetch(`${API_BASE_URL}/vendas/${vendaId}/add_item/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  removeItemVenda: async (vendaId: string, itemId: number) => {
    await fetch(`${API_BASE_URL}/vendas/${vendaId}/itens/${itemId}/`, { method: 'DELETE', headers: authHeaders() });
  },

  updateItemVenda: async (vendaId: string, itemId: number, data: { quantidade?: number; preco_unitario?: number }) => {
    const response = await fetch(`${API_BASE_URL}/vendas/${vendaId}/itens/${itemId}/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
    const bodyText = await response.text();
    let bodyJson: any = null;
    try {
      bodyJson = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      bodyJson = null;
    }
    if (!response.ok) {
      const msg =
        (bodyJson && (bodyJson.error || bodyJson.detail)) ||
        (bodyJson && bodyJson.quantidade && bodyJson.quantidade[0]) ||
        (bodyJson && bodyJson.preco_unitario && bodyJson.preco_unitario[0]) ||
        `HTTP ${response.status}`;
      throw new Error(String(msg));
    }
    return bodyJson;
  },

  copiarVenda: async (vendaId: string) => {
    const response = await fetch(`${API_BASE_URL}/vendas/${vendaId}/copiar/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
    });
    return response.json();
  },

  getUltimoPrecoClienteProduto: async (clienteId: string, produtoId: string) => {
    const response = await fetch(
      `${API_BASE_URL}/ultimo-preco-cliente-produto/?cliente_id=${clienteId}&produto_id=${produtoId}`,
      { headers: authHeaders() }
    );
    const data = await response.json();
    return data?.preco ?? null;
  },

  createVenda: async (payload: Record<string, unknown>) => {
    const response = await fetch(`${API_BASE_URL}/vendas/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload),
    });
    return readJsonOrThrow(response);
  },

  // Compras
  getCompras: async () => {
    const response = await fetch(`${API_BASE_URL}/compras/`, { headers: authHeaders() });
    if (!response.ok) return [];
    const data = await response.json().catch(() => null);
    return Array.isArray(data) ? data : [];
  },
  
  getCompraDetalhe: async (id: string) => {
    const response = await fetch(`${API_BASE_URL}/compras/${id}/`, { headers: authHeaders() });
    return response.json();
  },

  patchCompraOrdemData: async (
    id: string,
    body: { data?: string; data_compra?: string; password: string; observacao: string }
  ) => {
    const response = await fetch(`${API_BASE_URL}/compras/${id}/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
    });
    return readJsonOrThrow(response);
  },

  addCompraItem: async (
    ordemId: string,
    data: {
      tipo: 'material' | 'produto';
      material?: number;
      produto?: number;
      quantidade: number;
      preco_no_dia: number;
      password: string;
      observacao: string;
    }
  ) => {
    const response = await fetch(`${API_BASE_URL}/compras/${ordemId}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
    return readJsonOrThrow(response);
  },

  updateCompra: async (
    id: string,
    data: {
      quantidade?: number;
      preco_no_dia?: number;
      material?: number;
      fornecedor?: number;
      produto?: number;
      password: string;
      observacao: string;
    }
  ) => {
    const response = await fetch(`${API_BASE_URL}/compras/${id}/`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
    return readJsonOrThrow(response);
  },

  deleteCompra: async (id: string, payload: { password: string; observacao: string }) => {
    const response = await fetch(`${API_BASE_URL}/compras/${id}/`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ motivo: payload.observacao, observacao: payload.observacao, password: payload.password }),
    });
    if (response.status === 204) return;
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(messageFromApiError(body) || `HTTP ${response.status}`);
    }
  },

  copiarCompra: async (compraId: string) => {
    const response = await fetch(`${API_BASE_URL}/compras/${compraId}/copiar/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
    });
    return response.json();
  },

  createCompra: async (data: any) => {
    const response = await fetch(`${API_BASE_URL}/compras/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
    const body = await response.json();
    if (!response.ok) {
      const msg = body?.fornecedor_id?.[0] ?? body?.detail ?? (typeof body === 'object' ? undefined : String(body));
      throw new Error(msg || 'Erro ao criar compra');
    }
    return body;
  },

  // Transações
  getTransactions: async () => {
    const response = await fetch(`${API_BASE_URL}/transacoes/`, { headers: authHeaders() });
    return response.json();
  },
  
  createTransaction: async (data: any) => {
    const response = await fetch(`${API_BASE_URL}/transacoes/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  // Fornecedores (backend retorna todos por padrão)
  getFornecedores: async () => {
    const response = await fetch(`${API_BASE_URL}/fornecedores/`, { headers: authHeaders() });
    if (!response.ok) return [];
    const data = await response.json().catch(() => null);
    return Array.isArray(data) ? data : [];
  },
  
  createFornecedor: async (data: any) => {
    const response = await fetch(`${API_BASE_URL}/fornecedores/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  updateFornecedor: async (id: string, data: any) => {
    const response = await fetch(`${API_BASE_URL}/fornecedores/${id}/`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  deleteFornecedor: async (id: string) => {
    const res = await fetch(`${API_BASE_URL}/fornecedores/${id}/`, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string; code?: string; hint?: string };
      throw new Error(body.error || body.hint || 'Erro ao excluir');
    }
  },

  inativarFornecedor: async (id: string) => {
    const res = await fetch(`${API_BASE_URL}/fornecedores/${id}/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ ativo: false }),
    });
    if (!res.ok) throw new Error('Erro ao inativar');
    return res.json();
  },

  // Materiais
  getMateriais: async () => {
    const response = await fetch(`${API_BASE_URL}/materiais/`, { headers: authHeaders() });
    return response.json();
  },
  
  createMaterial: async (data: any) => {
    const response = await fetch(`${API_BASE_URL}/materiais/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
    return readJsonOrThrow(response);
  },

  updateMaterial: async (id: string, data: any) => {
    const response = await fetch(`${API_BASE_URL}/materiais/${id}/`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
    return readJsonOrThrow(response);
  },

  deleteMaterial: async (id: string) => {
    await fetch(`${API_BASE_URL}/materiais/${id}/`, { method: 'DELETE', headers: authHeaders() });
  },

  // Categorias
  getCategorias: async () => {
    const response = await fetch(`${API_BASE_URL}/categorias/`, { headers: authHeaders() });
    return response.json();
  },
  
  createCategoria: async (data: any) => {
    const response = await fetch(`${API_BASE_URL}/categorias/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  updateCategoria: async (id: string, data: any) => {
    const response = await fetch(`${API_BASE_URL}/categorias/${id}/`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  deleteCategoria: async (id: string) => {
    await fetch(`${API_BASE_URL}/categorias/${id}/`, { method: 'DELETE', headers: authHeaders() });
  },

  // Contas Bancárias
  getContas: async () => {
    const response = await fetch(`${API_BASE_URL}/contas/`, { headers: authHeaders() });
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data?.detail === 'string' ? data.detail : 'Erro ao carregar contas');
    return data;
  },
  
  createConta: async (data: any) => {
    const response = await fetch(`${API_BASE_URL}/contas/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  updateConta: async (id: string, data: any) => {
    const response = await fetch(`${API_BASE_URL}/contas/${id}/`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  deleteConta: async (id: string) => {
    await fetch(`${API_BASE_URL}/contas/${id}/`, { method: 'DELETE', headers: authHeaders() });
  },

  // Logs
  getLogs: async () => {
    const response = await fetch(`${API_BASE_URL}/logs/`, { headers: authHeaders() });
    return response.json();
  },

  // Dívidas gerais
  getDividasGerais: async () => {
    const response = await fetch(`${API_BASE_URL}/dividas-gerais/`, { headers: authHeaders() });
    return response.json();
  },
  createDividaGeral: async (data: { nome: string; valor: number }) => {
    const response = await fetch(`${API_BASE_URL}/dividas-gerais/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
    return response.json();
  },
  updateDividaGeral: async (id: string, data: { nome?: string; valor?: number }) => {
    const response = await fetch(`${API_BASE_URL}/dividas-gerais/${id}/`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
    return response.json();
  },
  deleteDividaGeral: async (id: string) => {
    await fetch(`${API_BASE_URL}/dividas-gerais/${id}/`, { method: 'DELETE', headers: authHeaders() });
  },

  // Funcionários
  getFuncionarios: async () => {
    const response = await fetch(`${API_BASE_URL}/funcionarios/`, { headers: authHeaders() });
    if (!response.ok) return [];
    const data = await response.json().catch(() => []);
    return Array.isArray(data) ? data : [];
  },
  createFuncionario: async (data: { nome: string; salario?: number; observacao?: string }) => {
    const response = await fetch(`${API_BASE_URL}/funcionarios/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
    return response.json();
  },
  getFuncionarioDetalhe: async (id: string) => {
    const response = await fetch(`${API_BASE_URL}/funcionarios/${id}/`, { headers: authHeaders() });
    if (!response.ok) throw new Error('Funcionário não encontrado');
    return response.json();
  },
  updateFuncionario: async (id: string, data: { nome?: string; salario?: number; observacao?: string; ativo?: boolean }) => {
    const response = await fetch(`${API_BASE_URL}/funcionarios/${id}/`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
    return response.json();
  },
  deleteFuncionario: async (id: string) => {
    await fetch(`${API_BASE_URL}/funcionarios/${id}/`, { method: 'DELETE', headers: authHeaders() });
  },
  addFuncionarioHoraExtra: async (id: string, data: { quantidade_horas?: number; valor_hora?: number; valor_total?: number; data_referencia?: string; observacao?: string }) => {
    const response = await fetch(`${API_BASE_URL}/funcionarios/${id}/horas-extras/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
    return response.json();
  },
  removeFuncionarioHoraExtra: async (id: string, heId: number) => {
    await fetch(`${API_BASE_URL}/funcionarios/${id}/horas-extras/${heId}/`, { method: 'DELETE', headers: authHeaders() });
  },
  addFuncionarioPagamento: async (id: string, data: { valor: number; data_pagamento?: string; observacao?: string }) => {
    const response = await fetch(`${API_BASE_URL}/funcionarios/${id}/pagamentos/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  // Outros a receber
  getOutrosAReceber: async () => {
    const response = await fetch(`${API_BASE_URL}/outros-a-receber/`, { headers: authHeaders() });
    return response.json();
  },
  createOutrosAReceber: async (data: { descricao: string; valor: number; data_prevista?: string }) => {
    const response = await fetch(`${API_BASE_URL}/outros-a-receber/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
    return response.json();
  },
  updateOutrosAReceber: async (id: string, data: { descricao?: string; valor?: number; data_prevista?: string }) => {
    const response = await fetch(`${API_BASE_URL}/outros-a-receber/${id}/`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
    return response.json();
  },
  deleteOutrosAReceber: async (id: string) => {
    await fetch(`${API_BASE_URL}/outros-a-receber/${id}/`, { method: 'DELETE', headers: authHeaders() });
  },

  // Saídas (movimentações)
  getSaidas: async () => {
    const response = await fetch(`${API_BASE_URL}/saidas/`, { headers: authHeaders() });
    return response.json();
  },
  createSaida: async (data: { descricao: string; valor: number }) => {
    const response = await fetch(`${API_BASE_URL}/saidas/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  // Estoque
  getEstoque: async (): Promise<{ materiais: EstoqueItem[]; produtos: EstoqueItem[] }> => {
    const response = await fetch(`${API_BASE_URL}/estoque/`, { headers: authHeaders() });
    const data = await response.json();
    if (data && typeof data === 'object' && 'materiais' in data && 'produtos' in data) {
      return { materiais: data.materiais ?? [], produtos: data.produtos ?? [] };
    }
    return { materiais: Array.isArray(data) ? data : [], produtos: [] };
  },
  getEstoqueUltimaAtualizacao: async (): Promise<{
    last_update: null | { kind: 'material' | 'produto'; data: string | null; item_nome: string; detalhe: string; observacao?: string };
  }> => {
    const response = await fetch(`${API_BASE_URL}/estoque/ultima-atualizacao/`, { headers: authHeaders() });
    const data = await response.json().catch(() => ({ last_update: null }));
    return data && typeof data === 'object' && 'last_update' in data ? (data as any) : { last_update: null };
  },
  ajusteEstoque: async (data: {
    material_id: number;
    tipo?: 'entrada' | 'saida';
    quantidade?: number;
    quantidade_nova?: number;
    observacao?: string;
  }) => {
    const response = await fetch(`${API_BASE_URL}/estoque/ajuste/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
    return response.json();
  },
  ajusteEstoqueProduto: async (data: {
    produto_id: number;
    quantidade_nova: number;
    observacao?: string;
  }) => {
    const response = await fetch(`${API_BASE_URL}/estoque/ajuste-produto/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  // Caixa (pagamento cliente/fornecedor)
  caixaPagamento: async (data: { tipo: 'cliente' | 'fornecedor'; valor: number; metodo: string; data?: string; observacao?: string; cliente_id?: number; fornecedor_id?: number; conta_id?: number }) => {
    const response = await fetch(`${API_BASE_URL}/caixa/pagamento/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  getCaixaHistorico: async (limit?: number) => {
    const url = limit != null ? `${API_BASE_URL}/caixa/historico/?limit=${limit}` : `${API_BASE_URL}/caixa/historico/`;
    const response = await fetch(url, { headers: authHeaders() });
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return { items: [] };
    }
    try {
      const data = await response.json();
      return data && typeof data === 'object' && Array.isArray(data.items) ? data : { items: [] };
    } catch {
      return { items: [] };
    }
  },

  // Conta: movimentos e atualizar saldo
  getContaMovimentos: async (contaId: string) => {
    const response = await fetch(`${API_BASE_URL}/contas/${contaId}/movimentos/`, { headers: authHeaders() });
    return response.json();
  },
  createContaMovimento: async (contaId: string, data: { tipo: 'entrada' | 'saida'; descricao: string; valor: number }) => {
    const response = await fetch(`${API_BASE_URL}/contas/${contaId}/movimentos/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
    return response.json();
  },
  atualizarSaldoConta: async (contaId: string, saldo: number) => {
    const response = await fetch(`${API_BASE_URL}/contas/${contaId}/atualizar-saldo/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ saldo }),
    });
    return response.json();
  },

  // Cliente detalhe
  getClienteDetalhe: async (id: string) => {
    const response = await fetch(`${API_BASE_URL}/clientes/${id}/detalhe/`, { headers: authHeaders() });
    return response.json();
  },

  /** Preços específicos por produto para um cliente (chefe). */
  getClientePrecosProdutos: async (clienteId: string) => {
    const response = await fetch(`${API_BASE_URL}/clientes/${clienteId}/precos-produtos/`, { headers: authHeaders() });
    if (!response.ok) throw new Error("Erro ao carregar preços");
    return response.json();
  },
  setClientePrecoProduto: async (clienteId: string, data: { produto_id: number; preco: number }) => {
    const url = `${API_BASE_URL}/clientes/${clienteId}/precos-produtos/`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(data),
    });
    const bodyText = await response.text();
    let bodyJson: unknown = null;
    try {
      bodyJson = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      bodyJson = bodyText;
    }
    if (!response.ok) {
      const err = bodyJson as Record<string, unknown> | null;
      const partes: string[] = [
        `HTTP ${response.status} ${response.statusText}`,
        `URL: ${url}`,
        `Enviado: produto_id=${data.produto_id}, preco=${data.preco}`,
      ];
      if (err && typeof err === "object") {
        const msg =
          (Array.isArray(err.preco) && err.preco[0]) ||
          (Array.isArray(err.produto_id) && err.produto_id[0]) ||
          (typeof err.error === "string" && err.error) ||
          (typeof err.detail === "string" && err.detail);
        if (msg) partes.push(`Servidor: ${msg}`);
        partes.push(`Resposta: ${JSON.stringify(err)}`);
      } else if (bodyText) {
        partes.push(`Resposta: ${bodyText}`);
      }
      throw new Error(partes.join(" | "));
    }
    return (bodyJson ?? {}) as { id: number; produto_id: number; produto_nome: string; preco: number };
  },
  /** Vários preços específicos de uma vez (chefe). */
  setClientePrecoProdutosBulk: async (
    clienteId: string,
    updates: { produto_id: number; preco: number }[]
  ): Promise<{
    ok: number;
    failed: number;
    saved: { id: number; produto_id: number; produto_nome: string; preco: number; created?: boolean }[];
    errors: { index?: number; produto_id?: number; error: string }[];
  }> => {
    const url = `${API_BASE_URL}/clientes/${clienteId}/precos-produtos/`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ updates }),
    });
    const bodyText = await response.text();
    let bodyJson: Record<string, unknown> | null = null;
    try {
      bodyJson = bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : null;
    } catch {
      bodyJson = null;
    }
    if (!response.ok) {
      const msg =
        (bodyJson && typeof bodyJson.error === "string" && bodyJson.error) ||
        `HTTP ${response.status}`;
      throw new Error(msg);
    }
    const saved = Array.isArray(bodyJson?.saved) ? bodyJson.saved : [];
    const errors = Array.isArray(bodyJson?.errors) ? bodyJson.errors : [];
    return {
      ok: typeof bodyJson?.ok === "number" ? bodyJson.ok : saved.length,
      failed: typeof bodyJson?.failed === "number" ? bodyJson.failed : errors.length,
      saved: saved as { id: number; produto_id: number; produto_nome: string; preco: number; created?: boolean }[],
      errors: errors as { index?: number; produto_id?: number; error: string }[],
    };
  },
  deleteClientePrecoProduto: async (clienteId: string, produtoId: number) => {
    const response = await fetch(
      `${API_BASE_URL}/clientes/${clienteId}/precos-produtos/?produto_id=${produtoId}`,
      { method: "DELETE", headers: authHeaders() }
    );
    if (!response.ok && response.status !== 404) throw new Error("Erro ao remover preço");
  },

  // Fornecedor detalhe e materiais do fornecedor
  getFornecedorDetalhe: async (id: string) => {
    const response = await fetch(`${API_BASE_URL}/fornecedores/${id}/detalhe/`, { headers: authHeaders() });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
    }
    let text = await response.text();
    // Fallback: backend pode enviar Infinity/-Infinity/NaN (inválido em JSON); corrige antes do parse
    text = text.replace(/:\s*Infinity\b/g, ':0').replace(/:\s*-Infinity\b/g, ':0').replace(/:\s*NaN\b/g, ':0');
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Resposta inválida (JSON) do servidor");
    }
  },

  /** Só chefe. Body: { marcada_paga, ordem_id? } ou { marcada_paga, linha_id?: "mat-1"|"prod-2" } */
  patchFornecedorCompraMarcacaoPaga: async (
    fornecedorId: string,
    body: { marcada_paga: boolean; ordem_id?: number; linha_id?: string }
  ) => {
    const response = await fetch(`${API_BASE_URL}/fornecedores/${fornecedorId}/compra-marcacao-paga/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
    });
    return readJsonOrThrow(response);
  },

  getFornecedorMateriais: async (id: string): Promise<{ id: number; nome: string; preco_unitario_base: number }[]> => {
    const response = await fetch(`${API_BASE_URL}/fornecedores/${id}/materiais/`, { headers: authHeaders() });
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  },
  getFornecedorProdutos: async (
    id: string
  ): Promise<{ id: number; nome: string; preco_venda: number; estoque_atual: number; ativo: boolean }[]> => {
    const response = await fetch(`${API_BASE_URL}/fornecedores/${id}/produtos/`, { headers: authHeaders() });
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  },
  pagarFornecedor: async (id: string, valor: number) => {
    const response = await fetch(`${API_BASE_URL}/fornecedores/${id}/detalhe/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ valor }),
    });
    return response.json();
  },

  /** Editar pagamento de cliente (chefe). Metodo: Pix, Dinheiro, Cartão crédito, Cartão débito, Cheque */
  updatePagamentoCliente: async (
    pagamentoId: number | string,
    body: { valor?: number; metodo?: string; data?: string; conta_id?: number | null; observacao?: string }
  ) => {
    const response = await fetch(`${API_BASE_URL}/pagamentos/cliente/${pagamentoId}/`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (!response.ok) {
      const err = data as Record<string, unknown>;
      const msg =
        (typeof err?.error === "string" && err.error) ||
        (Array.isArray(err?.valor) && String(err.valor[0])) ||
        `HTTP ${response.status}`;
      throw new Error(msg);
    }
    return data as Record<string, unknown>;
  },

  deletePagamentoCliente: async (pagamentoId: number | string, motivo: string) => {
    const response = await fetch(`${API_BASE_URL}/pagamentos/cliente/${pagamentoId}/`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ motivo }),
    });
    if (!response.ok && response.status !== 204) {
      const text = await response.text();
      let msg = text;
      try {
        const j = JSON.parse(text) as unknown;
        msg = messageFromApiError(j) || text;
      } catch {
        /* usar texto cru */
      }
      throw new Error(msg || `HTTP ${response.status}`);
    }
  },

  updatePagamentoFornecedor: async (
    pagamentoId: number | string,
    body: { valor?: number; metodo?: string; data?: string; conta_id?: number | null; observacao?: string }
  ) => {
    const response = await fetch(`${API_BASE_URL}/pagamentos/fornecedor/${pagamentoId}/`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (!response.ok) {
      const err = data as Record<string, unknown>;
      const msg =
        (typeof err?.error === "string" && err.error) ||
        (Array.isArray(err?.valor) && String(err.valor[0])) ||
        `HTTP ${response.status}`;
      throw new Error(msg);
    }
    return data as Record<string, unknown>;
  },

  deletePagamentoFornecedor: async (pagamentoId: number | string, motivo: string) => {
    const response = await fetch(`${API_BASE_URL}/pagamentos/fornecedor/${pagamentoId}/`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ motivo }),
    });
    if (!response.ok && response.status !== 204) {
      const text = await response.text();
      let msg = text;
      try {
        const j = JSON.parse(text) as unknown;
        msg = messageFromApiError(j) || text;
      } catch {
        /* usar texto cru */
      }
      throw new Error(msg || `HTTP ${response.status}`);
    }
  },

  registrarImpressao: async (body: {
    tipo: string;
    titulo?: string;
    html: string;
    meta?: Record<string, unknown>;
  }) => {
    const response = await fetch(`${API_BASE_URL}/impressoes/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    return readJsonOrThrow(response);
  },

  getPrecificacoesShopee: async (): Promise<PrecificacaoShopeeApiRow[]> => {
    const response = await fetch(`${API_BASE_URL}/precificacoes/shopee/`, {
      headers: authHeaders(),
    });
    const data = await readJsonOrThrow(response);
    return Array.isArray(data) ? (data as PrecificacaoShopeeApiRow[]) : [];
  },

  savePrecificacaoShopee: async (body: {
    nome: string;
    mesReferencia: string;
    nfPercent: string;
    impostoPercent: string;
    linhas: unknown[];
  }) => {
    const response = await fetch(`${API_BASE_URL}/precificacoes/shopee/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    return readJsonOrThrow(response) as Promise<PrecificacaoShopeeApiRow>;
  },
};
