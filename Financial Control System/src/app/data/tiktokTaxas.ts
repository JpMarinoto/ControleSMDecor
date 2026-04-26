/**
 * Taxas do TikTok Shop Brasil (vigentes a partir de 06/02/2026).
 *
 * Fontes:
 *  - https://seller-br.tiktok.com/university/essay?knowledge_id=3268441302615809 (Termos de Serviço — efetivo 06/02/2026)
 *  - https://seller-br.tiktok.com/university/essay?knowledge_id=5665577566734097 (Programa de Taxas de Envio — PTE)
 *  - Central do Vendedor TikTok Shop > Finanças > Faturas
 *
 * Estrutura de custos por pedido entregue:
 *  1) Tarifa de Comissão da Plataforma: 6% sobre o valor do pedido (incluindo impostos),
 *     limitada a R$ 50 por produto.
 *  2) Tarifa fixa por item vendido: R$ 4 por item (incluindo impostos).
 *  3) Taxa de serviço do Programa de Taxas de Envio (PTE): 6% do valor de venda do pedido,
 *     antes de subsídios, limitada a R$ 50 por produto. Aplicável apenas a participantes do PTE.
 *  4) Comissão de afiliado/criador: definida pelo vendedor (geralmente 8–15%) — só incide
 *     em pedidos vinda da campanha de afiliados.
 *
 * Diferente da Shopee, no TikTok Shop a comissão e o PTE têm teto absoluto em R$ 50, então
 * usamos uma função partida (linear até o teto, fixa depois).
 */

export interface TiktokTaxasConfig {
  /** % comissão da plataforma (0.06 = 6%). */
  comissaoPercent: number;
  /** Teto da comissão da plataforma em R$ por produto (50). */
  comissaoCap: number;
  /** Tarifa fixa por item vendido (R$). */
  tarifaItem: number;
  /** % de serviço do Programa de Taxas de Envio (0.06 = 6%). */
  ptePercent: number;
  /** Teto do PTE em R$ por produto (50). */
  pteCap: number;
  /** Se o vendedor está inscrito no Programa de Taxas de Envio. */
  participarPte: boolean;
  /** % paga ao afiliado/criador sobre o valor do pedido (0.10 = 10%). */
  afiliadoPercent: number;
}

/** Configuração padrão com as taxas oficiais publicadas pelo TikTok Shop Brasil. */
export const TIKTOK_TAXAS_PADRAO: TiktokTaxasConfig = {
  comissaoPercent: 0.06,
  comissaoCap: 50,
  tarifaItem: 4,
  ptePercent: 0.06,
  pteCap: 50,
  participarPte: true,
  afiliadoPercent: 0,
};

export interface TiktokTaxasDetalhe {
  comissao: number;
  tarifaItem: number;
  pte: number;
  afiliado: number;
  total: number;
}

/** Calcula todas as taxas (em R$) que o TikTok Shop cobra sobre um pedido. */
export function calcularTaxasTiktok(
  precoVenda: number,
  cfg: TiktokTaxasConfig,
): TiktokTaxasDetalhe {
  if (precoVenda <= 0) {
    return { comissao: 0, tarifaItem: 0, pte: 0, afiliado: 0, total: 0 };
  }
  const comissao = Math.min(precoVenda * cfg.comissaoPercent, cfg.comissaoCap);
  const pte = cfg.participarPte ? Math.min(precoVenda * cfg.ptePercent, cfg.pteCap) : 0;
  const afiliado = precoVenda * cfg.afiliadoPercent;
  const tarifaItem = cfg.tarifaItem;
  const total = comissao + tarifaItem + pte + afiliado;
  return {
    comissao: round2(comissao),
    tarifaItem: round2(tarifaItem),
    pte: round2(pte),
    afiliado: round2(afiliado),
    total: round2(total),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Dado um lucro alvo em R$ e o gasto total, encontra o preço de venda bruto que produz esse
 * lucro respeitando os tetos de comissão e PTE.
 *
 * Equação abaixo do teto (vb < limiteCap):
 *   vb - vb*comPct - tarifa - (pte? vb*ptePct : 0) - vb*afilPct - gasto = lucro
 *   vb = (lucro + tarifa + gasto) / (1 - comPct - (pte? ptePct : 0) - afilPct)
 *
 * Equação acima do teto (vb >= limiteCap):
 *   vb - capCom - tarifa - (pte? capPte : 0) - vb*afilPct - gasto = lucro
 *   vb = (lucro + capCom + tarifa + (pte? capPte : 0) + gasto) / (1 - afilPct)
 *
 * O "limiteCap" considerado é o menor preço onde *qualquer* taxa percentual atinge o teto.
 */
export function calcularVendaBrutaPorLucroTiktok(
  lucroTarget: number,
  gastoTotal: number,
  cfg: TiktokTaxasConfig,
): number | null {
  if (lucroTarget <= 0) return null;
  const { comissaoPercent, comissaoCap, tarifaItem, ptePercent, pteCap, participarPte, afiliadoPercent } = cfg;

  const limCom = comissaoPercent > 0 ? comissaoCap / comissaoPercent : Infinity;
  const limPte = participarPte && ptePercent > 0 ? pteCap / ptePercent : Infinity;
  const limiteCap = Math.min(limCom, limPte);

  // Tentativa 1: ambos abaixo do teto
  {
    const denom = 1 - comissaoPercent - (participarPte ? ptePercent : 0) - afiliadoPercent;
    if (denom > 0) {
      const vb = (lucroTarget + tarifaItem + gastoTotal) / denom;
      if (vb < limiteCap || !isFinite(limiteCap)) return round2(vb);
    }
  }
  // Tentativa 2: ambos no teto (caso comum quando os tetos ocorrem no mesmo ponto)
  {
    const denom = 1 - afiliadoPercent;
    if (denom > 0) {
      const fixo = comissaoCap + tarifaItem + (participarPte ? pteCap : 0);
      const vb = (lucroTarget + fixo + gastoTotal) / denom;
      if (vb >= limiteCap) return round2(vb);
    }
  }
  return null;
}

/**
 * Dado um % de lucro alvo (lucro/vlrBruto) e o gasto total, encontra o preço de venda bruto
 * respeitando os tetos.
 */
export function calcularVendaBrutaPorLucroPercentTiktok(
  lucroPctTarget: number,
  gastoTotal: number,
  cfg: TiktokTaxasConfig,
): number | null {
  if (lucroPctTarget <= 0) return null;
  const { comissaoPercent, comissaoCap, tarifaItem, ptePercent, pteCap, participarPte, afiliadoPercent } = cfg;

  const limCom = comissaoPercent > 0 ? comissaoCap / comissaoPercent : Infinity;
  const limPte = participarPte && ptePercent > 0 ? pteCap / ptePercent : Infinity;
  const limiteCap = Math.min(limCom, limPte);

  {
    const denom = 1 - comissaoPercent - (participarPte ? ptePercent : 0) - afiliadoPercent - lucroPctTarget;
    if (denom > 0) {
      const vb = (tarifaItem + gastoTotal) / denom;
      if (vb < limiteCap || !isFinite(limiteCap)) return round2(vb);
    }
  }
  {
    const denom = 1 - afiliadoPercent - lucroPctTarget;
    if (denom > 0) {
      const fixo = comissaoCap + tarifaItem + (participarPte ? pteCap : 0);
      const vb = (fixo + gastoTotal) / denom;
      if (vb >= limiteCap) return round2(vb);
    }
  }
  return null;
}
