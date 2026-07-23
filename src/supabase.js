import { createClient } from "@supabase/supabase-js";

const configuredUrl = import.meta.env.VITE_SUPABASE_URL;
const url = import.meta.env.DEV
  ? `${window.location.origin}/bridge`
  : configuredUrl;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// The embedded browser can block local fetch calls. Use same-origin XHR in dev.
async function devXhrFetch(input, init = {}) {
  const request = input instanceof Request ? input : null;
  const requestHeaders = new Headers(request?.headers);
  new Headers(init.headers).forEach((value, name) => requestHeaders.set(name, value));

  let body = init.body;
  if (body === undefined && request && !['GET', 'HEAD'].includes(request.method)) {
    body = await request.arrayBuffer();
  }



  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(init.method || request?.method || 'GET', request?.url || String(input), true);

    xhr.withCredentials = (init.credentials || request?.credentials) === 'include';
    requestHeaders.forEach((value, name) => {
      if (name === 'apikey') return;
      xhr.setRequestHeader(name === 'authorization' ? 'x-local-token' : name, value);
    });

    xhr.onload = () => {


      const responseHeaders = new Headers();
      xhr.getAllResponseHeaders().trim().split(/[\r\n]+/).filter(Boolean).forEach((line) => {
        const separator = line.indexOf(':');
        if (separator > 0) responseHeaders.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
      });
      resolve(new Response(xhr.responseText, {
        status: xhr.status,
        statusText: xhr.statusText,
        headers: responseHeaders,
      }));
    };
    xhr.onerror = () => reject(new TypeError(`Local login request failed (${xhr.status || 0})`));
    xhr.onabort = () => reject(new DOMException('Request aborted', 'AbortError'));

    if (init.signal) {
      if (init.signal.aborted) xhr.abort();
      else init.signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }

    xhr.send(body ?? null);
  });
}


// 用嚟喺 App.jsx 判斷 .env 有冇填齊
export const isSupabaseConfigured = Boolean(configuredUrl && anonKey);

const clientOptions = {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "eightwords-auth",
  },
  ...(import.meta.env.DEV ? { global: { fetch: devXhrFetch } } : {}),
};

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, clientOptions)
  : null;

// ── 匿名/訪客登入（帶 hCaptcha token）──
export async function signInGuest(captchaToken) {
  if (!supabase) throw new Error("Supabase 未設定");
  const { data, error } = await supabase.auth.signInAnonymously(
    captchaToken ? { options: { captchaToken } } : undefined
  );
  if (error) throw error;
  return data.user;
}

export async function signUpWithEmail(email, password, captchaToken) {
  if (!supabase) throw new Error("Supabase 未設定");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      captchaToken,
      emailRedirectTo: window.location.origin,
    },
  });
  if (error) throw error;
  return data;
}

export async function signInWithEmail(email, password, captchaToken) {
  if (!supabase) throw new Error("Supabase 未設定");
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: { captchaToken },
  });
  if (error) throw error;
  return data;
}

export async function sendPasswordReset(email, captchaToken) {
  if (!supabase) throw new Error("Supabase 未設定");
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
    captchaToken,
  });
  if (error) throw error;
}

export async function updatePassword(password) {
  if (!supabase) throw new Error("Supabase 未設定");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// ── 取得目前 session token（畀後端代理用）──
export async function getToken() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

// ── 讀取/更新個人檔案 ──
export async function getProfile() {
  if (!supabase) return null;
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return null;
  // 新匿名用戶可能未有 profile row，用 maybeSingle 避免 0 rows 報錯
  const { data, error } = await supabase.from("profiles")
    .select("*").eq("id", u.user.id).maybeSingle();
  if (error) throw error;
  return data;
}
export async function saveProfile(fields) {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) throw new Error("未登入");
  const { error } = await supabase.from("profiles")
    .upsert(
      { id: u.user.id, ...fields, updated_at: new Date().toISOString() },
      { onConflict: "id" }
    );
  if (error) throw error;
}

// ── 帳戶身份（guest / vip / admin）──
export async function ensureAccount() {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("ensure_my_account");
  if (error) throw error;
  return data;
}

export async function getAccount() {
  if (!supabase) return null;
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return null;
  const { data, error } = await supabase.from("accounts")
    .select("*").eq("id", u.user.id).maybeSingle();
  if (error) throw error;
  return data;
}

// ── 命盤儲存（雲端）──
const CHART_TABLES = {
  bazi: "bazi_charts",
  liuren: "liuren_charts",
  qimen: "qimen_charts",
};

function chartTable(kind) {
  const table = CHART_TABLES[kind];
  if (!table) throw new Error("不支援的存盤類型");
  return table;
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildChartRow(kind, userId, title, data, aiText) {
  const base = {
    user_id: userId,
    title,
    data,
    ai_text: aiText || null,
  };

  if (kind === "bazi") {
    const pillars = String(data.gz || "").split(/\s+/);
    return {
      ...base,
      name: data.name || title || null,
      birth_year: numberOrNull(data.birthY ?? data.date?.split("-")[0]),
      birth_month: numberOrNull(data.birthM ?? data.date?.split("-")[1]),
      birth_day: numberOrNull(data.birthD ?? data.date?.split("-")[2]),
      birth_hour: numberOrNull(data.birthH ?? data.time?.split(":")[0]),
      birth_minute: numberOrNull(data.birthMi ?? data.time?.split(":")[1]),
      gender: ["男", "女"].includes(data.gender) ? data.gender : null,
      longitude: numberOrNull(data.lng),
      year_pillar: pillars[0] || null,
      month_pillar: pillars[1] || null,
      day_pillar: pillars[2] || null,
      hour_pillar: pillars[3] || null,
    };
  }

  if (kind === "liuren") {
    return {
      ...base,
      question: data.question || null,
      cast_at: data.dateISO || new Date().toISOString(),
      day_ganzhi: data.dayGz || null,
      hour_ganzhi: data.shiGz || null,
      san_chuan: data.sanChuan || null,
      method: data.method || null,
    };
  }

  const juMatch = String(data.juDesc || "").match(/\d+/);
  return {
    ...base,
    question: data.question || null,
    cast_at: data.dateISO || new Date().toISOString(),
    true_solar: data.trueSolar !== false,
    longitude: numberOrNull(data.lng),
    dun: String(data.juDesc || "").slice(0, 1) || null,
    ju: juMatch ? Number(juMatch[0]) : null,
    yuan: data.yuan || null,
    solar_term: data.jq || null,
    day_ganzhi: data.dayGz || null,
    hour_ganzhi: data.shiGz || null,
  };
}

export async function saveChartCloud(kind, title, data, aiText) {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) throw new Error("未登入");
  const { data: row, error } = await supabase.from(chartTable(kind))
    .insert(buildChartRow(kind, u.user.id, title, data, aiText))
    .select().single();
  if (error) throw error;
  return chartRowToSavedItem(row);
}
export async function listChartsCloud(kind) {
  if (!supabase) return [];
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return [];
  const { data, error } = await supabase.from(chartTable(kind))
    .select("*").eq("user_id", u.user.id)
    .order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  return (data || []).map(chartRowToSavedItem);
}
export async function deleteChartCloud(kind, id) {
  if (!supabase) throw new Error("Supabase 未設定");
  const { error } = await supabase.from(chartTable(kind)).delete().eq("id", id);
  if (error) throw error;
}

function chartRowToSavedItem(row) {
  const stored = row?.data && typeof row.data === "object" ? row.data : {};
  return {
    ...stored,
    id: row.id,
    aiText: row.ai_text ?? stored.aiText ?? "",
    created: stored.created || new Date(row.created_at).toLocaleDateString("zh-TW"),
  };
}

// ── 我的用量 ──
export async function myUsage() {
  const { data } = await supabase.from("usage_daily").select("*").order("day", { ascending: false }).limit(30);
  return data || [];
}










