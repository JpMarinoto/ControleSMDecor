/**
 * Comissão Shopee Brasil 2026 (a partir de 01/03/2026).
 * Fonte: https://seller.shopee.com.br/edu/article/26839/Comissao-para-vendedores-CNPJ-e-CPF-em-2026
 * Ref: https://ecommguia.com.br/nova-politica-de-comissao-da-shopee-2026/
 */

export type FaixaShopee = {
  descricao: string;
  min: number;
  max: number; // use Infinity para "acima de"
  percentual: number; // 0.20 = 20%
  fixo: number;   // R$ por item
  subsidioPix?: number; // 0.05 = 5%, 0.08 = 8%
};

/** Faixas de comissão para vendedores CNPJ (Shopee 2026). */
export const SHOPEE_FAIXAS_CNPJ: FaixaShopee[] = [
  { descricao: "Até R$ 79,99", min: 0, max: 79.99, percentual: 0.20, fixo: 4 },
  { descricao: "R$ 80 a R$ 99,99", min: 80, max: 99.99, percentual: 0.14, fixo: 16, subsidioPix: 0.05 },
  { descricao: "R$ 100 a R$ 199,99", min: 100, max: 199.99, percentual: 0.14, fixo: 20, subsidioPix: 0.05 },
  { descricao: "R$ 200 a R$ 499,99", min: 200, max: 499.99, percentual: 0.14, fixo: 26, subsidioPix: 0.05 },
  { descricao: "Acima de R$ 500", min: 500, max: Infinity, percentual: 0.14, fixo: 26, subsidioPix: 0.08 },
];

/** Taxa adicional por item para vendedores CPF com mais de 450 pedidos em 90 dias. */
export const SHOPEE_TAXA_ADICIONAL_CPF = 3;

/** Taxa adicional opcional Campanhas de Destaque (%). */
export const SHOPEE_TAXA_CAMPANHA_DESTAQUE = 0.025;

/**
 * Calcula a comissão Shopee (em R$) para um preço de venda.
 * @param precoVenda Preço do item na Shopee (R$)
 * @param cpfAltoVolume Se true, aplica taxa adicional R$ 3 (vendedor CPF > 450 pedidos/90 dias)
 * @param campanhaDestaque Se true, aplica +2,5%
 */
export function calcularComissaoShopee(
  precoVenda: number,
  cpfAltoVolume: boolean = false,
  campanhaDestaque: boolean = false
): number {
  if (precoVenda <= 0) return 0;
  const faixa = SHOPEE_FAIXAS_CNPJ.find((f) => precoVenda >= f.min && precoVenda <= f.max);
  if (!faixa) return 0;
  // Regra ajustada: a taxa percentual incide sobre (preço - fixo)
  // Ex.: 131,99 -> 131,99 - 20 - 14% de (131,99 - 20)
  const base = Math.max(0, precoVenda - faixa.fixo);
  let comissao = faixa.fixo + base * faixa.percentual;
  if (cpfAltoVolume) comissao += SHOPEE_TAXA_ADICIONAL_CPF;
  if (campanhaDestaque) comissao += precoVenda * SHOPEE_TAXA_CAMPANHA_DESTAQUE;
  return Math.round(comissao * 100) / 100;
}

/**
 * Retorna a faixa aplicável ao preço (para exibição).
 */
export function obterFaixaShopee(precoVenda: number): FaixaShopee | undefined {
  return SHOPEE_FAIXAS_CNPJ.find((f) => precoVenda >= f.min && precoVenda <= f.max);
}
