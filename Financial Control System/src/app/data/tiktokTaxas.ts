/**
 * Taxas do TikTok Shop Brasil.
 *
 * Vigente a partir de 15/07/2026:
 *  - Item abaixo de R$ 50: comissão 10% + tarifa fixa R$ 4 por item
 *  - Item de R$ 50 ou mais: comissão 6% + tarifa fixa R$ 6 por item
 *  - PTE (Programa de Taxas de Envio): 6% (cap R$ 50/produto) — sem alteração
 *  - Comissão de afiliado: definida pelo vendedor
 *
 * Fontes:
 *  - Valor Econômico / TikTok Shop Academy (reajuste jul/2026)
 *  - https://seller-br.tiktok.com/university/essay?knowledge_id=3268441302615809
 *  - https://seller-br.tiktok.com/university/essay?knowledge_id=5665577566734097 (PTE)
 *
 * A base de comissão, tarifa por item e PTE é o preço do item após descontos do seller.
 * Comissão e PTE têm teto absoluto de R$ 50 por produto.
 */

export type FaixaTiktok = {
  descricao: string;
  min: number;
  max: number;
  comissaoPercent: number;
  tarifaItem: number;
};

/** Faixas oficiais vigentes a partir de 15/07/2026. */
export const TIKTOK_FAIXAS_2026: FaixaTiktok[] = [
  {
    descricao: "Abaixo de R$ 50",
    min: 0,
    max: 49.99,
    comissaoPercent: 0.1,
    tarifaItem: 4,
  },
  {
    descricao: "R$ 50 ou mais",
    min: 50,
    max: Infinity,
    comissaoPercent: 0.06,
    tarifaItem: 6,
  },
];

export interface TiktokTaxasConfig {
  /** Override manual — só usado com modoManual=true. */
  comissaoPercent?: number;
  /** Teto da comissão da plataforma em R$ por produto (50). */
  comissaoCap: number;
  /** Override manual — só usado com modoManual=true. */
  tarifaItem?: number;
  /** % de serviço do Programa de Taxas de Envio (0.06 = 6%). */
  ptePercent: number;
  /** Teto do PTE em R$ por produto (50). */
  pteCap: number;
  /** Se o vendedor está inscrito no Programa de Taxas de Envio. */
  participarPte: boolean;
  /** % paga ao afiliado/criador sobre o valor do pedido (0.10 = 10%). */
  afiliadoPercent: number;
  /** Se true, ignora faixas oficiais e usa comissaoPercent/tarifaItem do cfg. */
  modoManual?: boolean;
}

/** Configuração padrão (faixas automáticas + PTE). */
export const TIKTOK_TAXAS_PADRAO: TiktokTaxasConfig = {
  comissaoCap: 50,
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
  faixa?: FaixaTiktok;
}

export function obterFaixaTiktok(precoVenda: number): FaixaTiktok | undefined {
  return TIKTOK_FAIXAS_2026.find((f) => precoVenda >= f.min && precoVenda <= f.max);
}

function resolveComissaoETarifa(
  precoVenda: number,
  cfg: TiktokTaxasConfig,
): { comissaoPercent: number; tarifaItem: number; faixa?: FaixaTiktok } {
  if (cfg.modoManual && cfg.comissaoPercent != null && cfg.tarifaItem != null) {
    return { comissaoPercent: cfg.comissaoPercent, tarifaItem: cfg.tarifaItem };
  }
  const faixa = obterFaixaTiktok(precoVenda);
  if (!faixa) {
    return { comissaoPercent: 0.06, tarifaItem: 4 };
  }
  return {
    comissaoPercent: faixa.comissaoPercent,
    tarifaItem: faixa.tarifaItem,
    faixa,
  };
}

/** Calcula todas as taxas (em R$) que o TikTok Shop cobra sobre um pedido. */
export function calcularTaxasTiktok(
  precoVenda: number,
  cfg: TiktokTaxasConfig,
): TiktokTaxasDetalhe {
  if (precoVenda <= 0) {
    return { comissao: 0, tarifaItem: 0, pte: 0, afiliado: 0, total: 0 };
  }
  const { comissaoPercent, tarifaItem, faixa } = resolveComissaoETarifa(precoVenda, cfg);
  const comissao = Math.min(precoVenda * comissaoPercent, cfg.comissaoCap);
  const pte = cfg.participarPte ? Math.min(precoVenda * cfg.ptePercent, cfg.pteCap) : 0;
  const afiliado = precoVenda * cfg.afiliadoPercent;
  const total = comissao + tarifaItem + pte + afiliado;
  return {
    comissao: round2(comissao),
    tarifaItem: round2(tarifaItem),
    pte: round2(pte),
    afiliado: round2(afiliado),
    total: round2(total),
    faixa,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function cfgComFaixa(cfg: TiktokTaxasConfig, faixa: FaixaTiktok): TiktokTaxasConfig {
  return {
    ...cfg,
    modoManual: true,
    comissaoPercent: faixa.comissaoPercent,
    tarifaItem: faixa.tarifaItem,
  };
}

function calcularVendaBrutaPorLucroTiktokFlat(
  lucroTarget: number,
  gastoTotal: number,
  cfg: TiktokTaxasConfig,
): number | null {
  if (lucroTarget <= 0) return null;
  const comissaoPercent = cfg.comissaoPercent ?? 0;
  const tarifaItem = cfg.tarifaItem ?? 0;
  const { comissaoCap, ptePercent, pteCap, participarPte, afiliadoPercent } = cfg;

  const limCom = comissaoPercent > 0 ? comissaoCap / comissaoPercent : Infinity;
  const limPte = participarPte && ptePercent > 0 ? pteCap / ptePercent : Infinity;
  const limiteCap = Math.min(limCom, limPte);

  {
    const denom = 1 - comissaoPercent - (participarPte ? ptePercent : 0) - afiliadoPercent;
    if (denom > 0) {
      const vb = (lucroTarget + tarifaItem + gastoTotal) / denom;
      if (vb < limiteCap || !isFinite(limiteCap)) return round2(vb);
    }
  }
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

function calcularVendaBrutaPorLucroPercentTiktokFlat(
  lucroPctTarget: number,
  gastoTotal: number,
  cfg: TiktokTaxasConfig,
): number | null {
  if (lucroPctTarget <= 0) return null;
  const comissaoPercent = cfg.comissaoPercent ?? 0;
  const tarifaItem = cfg.tarifaItem ?? 0;
  const { comissaoCap, ptePercent, pteCap, participarPte, afiliadoPercent } = cfg;

  const limCom = comissaoPercent > 0 ? comissaoCap / comissaoPercent : Infinity;
  const limPte = participarPte && ptePercent > 0 ? pteCap / ptePercent : Infinity;
  const limiteCap = Math.min(limCom, limPte);

  {
    const denom =
      1 - comissaoPercent - (participarPte ? ptePercent : 0) - afiliadoPercent - lucroPctTarget;
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

/** Dado lucro alvo (R$), encontra venda bruta respeitando faixas e tetos. */
export function calcularVendaBrutaPorLucroTiktok(
  lucroTarget: number,
  gastoTotal: number,
  cfg: TiktokTaxasConfig,
): number | null {
  if (cfg.modoManual) {
    return calcularVendaBrutaPorLucroTiktokFlat(lucroTarget, gastoTotal, cfg);
  }
  for (const faixa of TIKTOK_FAIXAS_2026) {
    const vb = calcularVendaBrutaPorLucroTiktokFlat(
      lucroTarget,
      gastoTotal,
      cfgComFaixa(cfg, faixa),
    );
    if (vb != null && vb >= faixa.min && vb <= faixa.max) return vb;
  }
  return null;
}

/** Dado lucro % alvo (sobre venda bruta), encontra venda bruta respeitando faixas e tetos. */
export function calcularVendaBrutaPorLucroPercentTiktok(
  lucroPctTarget: number,
  gastoTotal: number,
  cfg: TiktokTaxasConfig,
): number | null {
  if (cfg.modoManual) {
    return calcularVendaBrutaPorLucroPercentTiktokFlat(lucroPctTarget, gastoTotal, cfg);
  }
  for (const faixa of TIKTOK_FAIXAS_2026) {
    const vb = calcularVendaBrutaPorLucroPercentTiktokFlat(
      lucroPctTarget,
      gastoTotal,
      cfgComFaixa(cfg, faixa),
    );
    if (vb != null && vb >= faixa.min && vb <= faixa.max) return vb;
  }
  return null;
}
