/**
 * Formata strings de data da API (YYYY-MM-DD ou YYYY-MM-DDTHH:MM:SS) como data local.
 * Evita o bug: new Date("YYYY-MM-DD") é interpretado como UTC meia-noite, gerando dia anterior em fusos como Brasil.
 */
export function formatDateOnly(dateStr: string | null | undefined): string {
  const s = (dateStr ?? "").trim().slice(0, 10);
  if (!s || s.length < 10) return "-";
  const [y, m, d] = s.split("-").map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return s;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("pt-BR");
}

/** Retorna timestamp para ordenação; usa dados locais para não deslocar. */
export function parseDateOnlyToTime(dateStr: string | null | undefined): number {
  const s = (dateStr ?? "").trim().slice(0, 10);
  if (!s || s.length < 10) return 0;
  const [y, m, d] = s.split("-").map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return 0;
  return new Date(y, m - 1, d).getTime();
}

/** Ordenação do mais recente no sistema: ISO completo em data_lancamento, senão só a data. */
export function parseLancamentoToTime(
  dataLancamento: string | null | undefined,
  dataOperacao: string | null | undefined
): number {
  const dl = (dataLancamento ?? "").trim();
  if (dl.length > 10) {
    const t = Date.parse(dl);
    if (!isNaN(t)) return t;
  }
  return parseDateOnlyToTime(dataOperacao ?? dataLancamento);
}

/** Data de hoje no fuso do usuário, no formato YYYY-MM-DD (para enviar à API ao registrar pagamento). */
export function getTodayLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
