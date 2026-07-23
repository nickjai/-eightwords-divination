import { BAZI_AI_LIMIT } from "./baziAnalysis.js";

const LOCAL_UAT_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "lvh.me"]);
const CHARTS_KEY = "eightwords-local-uat-charts";
const USAGE_KEY = "eightwords-local-uat-ai-usage";

export function shouldUseLocalUatMode({ dev, preview, hostname }) {
  const enabled = dev === true || preview === true || preview === "true";
  return enabled && LOCAL_UAT_HOSTS.has(String(hostname || "").toLowerCase());
}

export const LOCAL_UAT_MODE = shouldUseLocalUatMode({
  dev: import.meta.env?.DEV,
  preview: typeof __LOCAL_UAT_PREVIEW__ !== "undefined" && __LOCAL_UAT_PREVIEW__ === true,
  hostname: typeof window === "undefined" ? "" : window.location.hostname,
});

export const LOCAL_UAT_SESSION = {
  user: {
    id: "local-uat-user",
    email: "uat@local.test",
    is_anonymous: false,
  },
};

export const LOCAL_UAT_PROFILE = {
  id: "local-uat-user",
  display_name: "UAT 測試帳戶",
  birth_year: 1990,
  birth_month: 1,
  birth_day: 1,
  birth_hour: 12,
  birth_minute: 0,
  gender: "男",
  longitude: 114.17,
};

export const LOCAL_UAT_ACCOUNT = {
  user_id: "local-uat-user",
  account_type: "admin",
};

function readJson(key, fallback) {
  try {
    return JSON.parse(window.localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function listUatCharts(kind) {
  return readJson(CHARTS_KEY, []).filter((chart) => chart.kind === kind);
}

export function saveUatChart(kind, title, data, aiText) {
  const charts = readJson(CHARTS_KEY, []);
  const now = new Date().toISOString();
  const saved = {
    ...data,
    id: `uat-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    kind,
    title,
    aiText: aiText || "",
    created_at: now,
    updated_at: now,
  };
  writeJson(CHARTS_KEY, [saved, ...charts].slice(0, 50));
  return saved;
}

export function updateUatChart(kind, id, title, data, aiText) {
  const charts = readJson(CHARTS_KEY, []);
  const saved = {
    ...data,
    id,
    kind,
    title,
    aiText: aiText || "",
    updated_at: new Date().toISOString(),
  };
  writeJson(CHARTS_KEY, charts.map((chart) => chart.id === id ? { ...chart, ...saved } : chart));
  return saved;
}

export function deleteUatChart(id) {
  writeJson(CHARTS_KEY, readJson(CHARTS_KEY, []).filter((chart) => chart.id !== id));
}

export function getUatAiUsage(kind) {
  return Number(readJson(USAGE_KEY, {})[kind] || 0);
}

export function analyzeUatBazi() {
  const usage = readJson(USAGE_KEY, {});
  const used = Number(usage.bazi || 0);
  if (used >= BAZI_AI_LIMIT) {
    throw new Error(`八字 AI 分析已達每個帳戶 ${BAZI_AI_LIMIT} 次上限`);
  }
  writeJson(USAGE_KEY, { ...usage, bazi: used + 1 });
  return [
    "【本機 UAT 模擬分析】",
    "",
    "這段文字用來測試 AI 分析完成、自動保存、重新開啟命盤及 20 次限制的流程。",
    "正式部署後會使用真正的 DeepSeek／Kimi 回覆。",
  ].join("\n");
}
