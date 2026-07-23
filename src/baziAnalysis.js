export const BAZI_AI_LIMIT = 20;

function normalized(value) {
  return value == null ? "" : String(value).trim();
}

export function baziAnalysisKey(chart) {
  const year = normalized(chart.birthY ?? chart.date?.split("-")[0]);
  const month = normalized(chart.birthM ?? chart.date?.split("-")[1]);
  const day = normalized(chart.birthD ?? chart.date?.split("-")[2]);
  if (!year || !month || !day) return "";

  const unknownTime = chart.unknownTime === true;
  const hour = unknownTime ? "unknown" : normalized(chart.birthH ?? chart.time?.split(":")[0]);
  const minute = unknownTime ? "unknown" : normalized(chart.birthMi ?? chart.time?.split(":")[1]);

  return [
    year,
    month,
    day,
    hour,
    minute,
    normalized(chart.gender),
    normalized(chart.lng),
    chart.trueSolar === true ? "solar" : "input",
  ].join("|");
}

export function mergeSavedChart(charts, saved, limit = 50) {
  return [saved, ...charts.filter(chart => chart.id !== saved.id)].slice(0, limit);
}
