export const DAY = 86400000;
export function stamp(date) { return Date.parse(date + "T12:00:00Z"); }
export function daysBetween(a, b) { return (stamp(b) - stamp(a)) / DAY; }
export function previousDate(date) { return new Date(stamp(date) - DAY).toISOString().slice(0, 10); }
export function ownerAt(mandates, date) { return mandates.find(m => date >= m.start && date < m.end); }

export function metrics(points, base) {
  if (!points.length || !base || !(base.close > 0)) return null;
  const last = points.at(-1);
  const total = (last.close / base.close - 1) * 100;
  const years = daysBetween(base.date, last.date) / 365.2425;
  const annualized = years > 0 ? (Math.pow(last.close / base.close, 1 / years) - 1) * 100 : null;
  let peak = base.close;
  let drawdown = 0;
  let previous = base.close;
  const returns = [];
  let bestDay = null;
  let worstDay = null;
  for (const point of points) {
    peak = Math.max(peak, point.close);
    drawdown = Math.min(drawdown, (point.close / peak - 1) * 100);
    const daily = (point.close / previous - 1) * 100;
    returns.push(Math.log(point.close / previous));
    if (!bestDay || daily > bestDay.value) bestDay = { date: point.date, value: daily };
    if (!worstDay || daily < worstDay.value) worstDay = { date: point.date, value: daily };
    previous = point.close;
  }
  const average = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.length > 1 ? returns.reduce((sum, r) => sum + (r - average) ** 2, 0) / (returns.length - 1) : null;
  return { total, annualized, drawdown, volatility: variance === null ? null : Math.sqrt(variance * 252) * 100,
    high: Math.max(...points.map(p => p.close)), low: Math.min(...points.map(p => p.close)), sessions: points.length, first: points[0], last, base, bestDay, worstDay };
}

export function analyzeMandates(points, mandates, today) {
  const lastDate = points.at(-1)?.date;
  return mandates.filter(m => m.start <= today).map(m => {
    const observations = points.filter(p => p.date >= m.start && p.date < m.end);
    const base = points.findLast(p => p.date < m.start);
    const hasBase = Boolean(base) && daysBetween(base.date, m.start) <= 10;
    // A gap of more than 10 calendar days at either boundary signals incomplete coverage.
    const startCovered = hasBase && observations.length > 0 && daysBetween(m.start, observations[0].date) <= 10;
    const ended = m.end <= today;
    const endCovered = !ended || Boolean(observations.length && daysBetween(observations.at(-1).date, m.end) <= 10);
    const hasGap = observations.some((p, i) => i > 0 && daysBetween(observations[i - 1].date, p.date) > 10);
    const complete = startCovered && endCovered && !hasGap;
    const partial = !ended;
    const status = !observations.length ? "Sem dados" : !complete ? "Cobertura incompleta" : partial ? "Parcial" : "Concluído";
    return { ...m, observations, base, complete, partial, status, outdated: Boolean(partial && lastDate && daysBetween(lastDate, today) > 5),
      stats: complete ? metrics(observations, base) : null };
  });
}

export function normalizeMandate(mandate) {
  if (!mandate.stats) return [];
  return [{ day: 0, date: mandate.start, value: 100 }, ...mandate.observations.map(p => ({
    day: daysBetween(mandate.start, p.date) + 1, date: p.date, value: p.close / mandate.base.close * 100,
  }))];
}

export function sample(points, max = 1500) {
  if (points.length <= max) return points;
  const result = [points[0]];
  const stride = Math.ceil((points.length - 2) / Math.max(1, Math.floor((max - 2) / 2)));
  for (let i = 1; i < points.length - 1; i += stride) {
    const bucket = points.slice(i, Math.min(i + stride, points.length - 1));
    const min = bucket.reduce((a, b) => b.close < a.close ? b : a);
    const maxPoint = bucket.reduce((a, b) => b.close > a.close ? b : a);
    if (min === maxPoint) result.push(min);
    else result.push(...(min.date < maxPoint.date ? [min, maxPoint] : [maxPoint, min]));
  }
  result.push(points.at(-1));
  return result;
}
