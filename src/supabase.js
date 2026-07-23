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

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, import.meta.env.DEV ? { global: { fetch: devXhrFetch } } : undefined)
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

// ── 取得目前 session token（畀後端代理用）──
export async function getToken() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

// ── 讀取/更新個人檔案 ──
export async function getProfile() {
  // 新匿名用戶可能未有 profile row，用 maybeSingle 避免 0 rows 報錯
  const { data } = await supabase.from("profiles").select("*").maybeSingle();
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
  return row;
}
export async function listChartsCloud(kind) {
  let q = supabase.from("charts").select("*").order("created_at", { ascending: false });
  if (kind) q = q.eq("kind", kind);
  const { data } = await q;
  return data || [];
}
export async function deleteChartCloud(id) {
  await supabase.from("charts").delete().eq("id", id);
}

// ── 我的用量 ──
export async function myUsage() {
  const { data } = await supabase.from("usage_daily").select("*").order("day", { ascending: false }).limit(30);
  return data || [];
}










