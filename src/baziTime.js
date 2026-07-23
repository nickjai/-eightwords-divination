const MINUTE_MS = 60 * 1000;

export function equationOfTimeMinutes(year, month, day) {
  const current = Date.UTC(year, month - 1, day);
  const start = Date.UTC(year, 0, 0);
  const dayOfYear = Math.floor((current - start) / 86400000);
  const b = 2 * Math.PI * (dayOfYear - 81) / 364;
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
}

export function resolveBaziClock(year, month, day, hour, minute = 0, longitude = 120, useTrueSolar = false) {
  const values = [year, month, day, hour, minute, longitude].map(Number);
  if (!values.every(Number.isFinite)) return null;

  const [y, m, d, h, mi, lng] = values;
  const longitudeCorrection = (lng - 120) * 4;
  const equationCorrection = equationOfTimeMinutes(y, m, d);
  const correctionMinutes = useTrueSolar ? longitudeCorrection + equationCorrection : 0;
  const adjusted = new Date(Date.UTC(y, m - 1, d, h, mi) + correctionMinutes * MINUTE_MS);

  return {
    year: adjusted.getUTCFullYear(),
    month: adjusted.getUTCMonth() + 1,
    day: adjusted.getUTCDate(),
    hour: adjusted.getUTCHours(),
    minute: adjusted.getUTCMinutes(),
    correctionMinutes,
    longitudeCorrection,
    equationCorrection,
  };
}

export function formatBaziClock(clock) {
  if (!clock) return "";
  return `${clock.year}-${String(clock.month).padStart(2, "0")}-${String(clock.day).padStart(2, "0")} ${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}`;
}
