/**
 * Tipos e helpers para integração com a Shopee Open Platform.
 * Documentação: https://open.shopee.com/documents
 */

export type ShopeePeriodoLucro = "dia" | "mes" | "intervalo";

export interface ShopeeIntegracaoStatus {
  conectado: boolean;
  modo: "desenvolvimento" | "producao";
  mensagem: string;
  shop_id?: string | null;
  lojas?: ShopeeLoja[];
  total_lojas?: number;
  lojas_conectadas?: number;
  proximos_passos: string[];
}

export interface ShopeeLoja {
  id: number;
  nome: string;
  partner_id: string;
  partner_key_definida: boolean;
  shop_id: string;
  redirect_url: string;
  conectado: boolean;
  criado_em?: string | null;
  atualizado_em?: string | null;
}

export interface ShopeeLojaForm {
  nome: string;
  partner_id: string;
  partner_key: string;
  shop_id: string;
  redirect_url: string;
}

export const SHOPEE_LOJA_VAZIA: ShopeeLojaForm = {
  nome: "",
  partner_id: "",
  partner_key: "",
  shop_id: "",
  redirect_url: "",
};

export interface ShopeeResumoLucro {
  periodo: ShopeePeriodoLucro;
  data_inicio: string;
  data_fim: string;
  receita_bruta: number;
  comissao_shopee: number;
  taxas_logistica: number;
  custo_produtos: number;
  lucro_liquido: number;
  pedidos: number;
  itens_vendidos: number;
  fonte: "api" | "placeholder";
}

export interface ShopeeCredenciaisForm {
  partner_id: string;
  partner_key: string;
  shop_id: string;
  redirect_url: string;
}

export const SHOPEE_CREDENCIAIS_VAZIAS: ShopeeCredenciaisForm = {
  partner_id: "",
  partner_key: "",
  shop_id: "",
  redirect_url: "",
};

/** Placeholder até a API Shopee estar conectada. */
export function resumoLucroPlaceholder(periodo: ShopeePeriodoLucro): ShopeeResumoLucro {
  const hoje = new Date();
  const y = hoje.getFullYear();
  const m = String(hoje.getMonth() + 1).padStart(2, "0");
  const d = String(hoje.getDate()).padStart(2, "0");
  const hojeIso = `${y}-${m}-${d}`;

  if (periodo === "mes") {
    const ultimoDia = new Date(y, hoje.getMonth() + 1, 0).getDate();
    return {
      periodo,
      data_inicio: `${y}-${m}-01`,
      data_fim: `${y}-${m}-${String(ultimoDia).padStart(2, "0")}`,
      receita_bruta: 0,
      comissao_shopee: 0,
      taxas_logistica: 0,
      custo_produtos: 0,
      lucro_liquido: 0,
      pedidos: 0,
      itens_vendidos: 0,
      fonte: "placeholder",
    };
  }

  return {
    periodo: "dia",
    data_inicio: hojeIso,
    data_fim: hojeIso,
    receita_bruta: 0,
    comissao_shopee: 0,
    taxas_logistica: 0,
    custo_produtos: 0,
    lucro_liquido: 0,
    pedidos: 0,
    itens_vendidos: 0,
    fonte: "placeholder",
  };
}
