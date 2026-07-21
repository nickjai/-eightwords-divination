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
  const { data, error } = await supabase.from("profiles").select("*").maybeSingle();
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

// ── 命盤儲存（雲端）──
export async function saveChartCloud(kind, title, data, aiText) {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) throw new Error("未登入");
  const { data: row, error } = await supabase.from("charts")
    .insert({ user_id: u.user.id, kind, title, data, ai_text: aiText || null })
    .select().single();
  if (error) throw error;
  return chartRowToSavedItem(row);
}
export async function listChartsCloud(kind) {
  if (!supabase) return [];
  let q = supabase.from("charts").select("*").order("created_at", { ascending: false }).limit(50);
  if (kind) q = q.eq("kind", kind);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(chartRowToSavedItem);
}
export async function deleteChartCloud(id) {
  if (!supabase) throw new Error("Supabase 未設定");
  const { error } = await supabase.from("charts").delete().eq("id", id);
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










