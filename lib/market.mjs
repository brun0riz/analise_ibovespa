export const HISTORY_START = "1994-12-01";
export const TIME_ZONE = "America/Sao_Paulo";

export function saoPauloDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = type => parts.find(p => p.type === type).value;
  return get("year") + "-" + get("month") + "-" + get("day");
}

export function normalizeYahoo(payload, today = saoPauloDate()) {
  const chart = payload?.chart;
  if (chart?.error) throw new Error(chart.error.description || "Falha na fonte de dados.");
  const result = chart?.result?.[0];
  if (!result?.timestamp || !result.indicators?.quote?.[0]) throw new Error("Resposta sem série histórica.");
  if (result.meta?.dataGranularity && result.meta.dataGranularity !== "1d") throw new Error("A fonte não retornou a frequência diária solicitada.");
  const quote = result.indicators.quote[0];
  const rows = new Map();
  const optionalNumber = value => typeof value === "number" && Number.isFinite(value) ? value : null;
  result.timestamp.forEach((timestamp, i) => {
    if (!Number.isFinite(timestamp)) return;
    const date = saoPauloDate(new Date(timestamp * 1000));
    const close = quote.close?.[i];
    // Only completed prior calendar days. This intentionally omits today's live bar.
    if (date < HISTORY_START || date >= today || typeof close !== "number" || !Number.isFinite(close) || close <= 0) return;
    rows.set(date, { date, close, open: optionalNumber(quote.open?.[i]), high: optionalNumber(quote.high?.[i]), low: optionalNumber(quote.low?.[i]), volume: optionalNumber(quote.volume?.[i]) });
  });
  const points = [...rows.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (points.length < 2) throw new Error("Histórico diário insuficiente.");
  return points;
}

export function validCache(value) {
  return value?.version === 1 && typeof value.fetchedAt === "string" && Number.isFinite(Date.parse(value.fetchedAt)) &&
    Array.isArray(value.points) && value.points.length >= 2 &&
    value.points.every((p, i) => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && Number.isFinite(p.close) && p.close > 0 && (!i || p.date > value.points[i - 1].date));
}

export async function fetchHistory({ fetcher = fetch, now = new Date() } = {}) {
  const query = new URLSearchParams({
    period1: String(Math.floor(Date.parse(HISTORY_START + "T00:00:00Z") / 1000)),
    period2: String(Math.floor(now.getTime() / 1000)),
    interval: "1d", events: "history",
  });
  const errors = [];
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      const response = await fetcher("https://" + host + "/v8/finance/chart/%5EBVSP?" + query, {
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
        signal: AbortSignal.timeout(18000),
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const points = normalizeYahoo(await response.json(), saoPauloDate(now));
      return { version: 1, fetchedAt: now.toISOString(), source: "Yahoo Finance · ^BVSP", sourceUrl: "https://finance.yahoo.com/quote/%5EBVSP/history/", frequency: "daily", currency: "BRL", points };
    } catch (error) { errors.push(host + ": " + error.message); }
  }
  throw new Error("Fonte temporariamente indisponível. " + errors.join(" / "));
}
