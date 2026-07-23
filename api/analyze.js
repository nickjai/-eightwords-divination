// Vercel Serverless — AI 分析代理（帶 Supabase 身份驗證 + 通道控制）
// 訪客強制 DeepSeek；VIP/管理員先可用 Kimi。等級由伺服器核實，前端偽造無效。

import { createClient } from "@supabase/supabase-js";

const CHANNELS = {
  free: { url:"https://api.deepseek.com/chat/completions", keyEnv:"DEEPSEEK_API_KEY", model:"deepseek-chat", label:"DeepSeek V3.2" },
  paid: { url:"https://api.moonshot.cn/v1/chat/completions", keyEnv:"KIMI_API_KEY", model:"kimi-k2-0905-preview", label:"Kimi K2.6" }
};

// 速率限制（serverless 安全：用 DB 近 60 秒 count，唔靠 in-memory）
async function limited(sb, id, ch) {
  const limit = ch==="paid"?12:4, win=60000;
  const since = new Date(Date.now()-win).toISOString();
  const { count, error } = await sb
    .from("ai_logs")
    .select("*", { count:"exact", head:true })
    .eq("user_id", id)
    .gte("created_at", since);
  if (error) return false; // 查詢失敗就放行（fail-open），唔阻正常用戶
  return (count || 0) >= limit;
}

// 香港日期（YYYY-MM-DD），避免 UTC 令半夜用量算錯日
function hkDay(d = new Date()) {
  return new Date(d.getTime() + 8*3600*1000).toISOString().slice(0,10);
}

function svc() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken:false, persistSession:false }
  });
}

export default async function handler(req, res) {
  // 預設保持相容（*）；喺 Vercel 設 ALLOWED_ORIGIN（例如 https://你的網域）即自動收緊
  const allowOrigin = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  if (allowOrigin !== "*") res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods","POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type, Authorization");
  if (req.method==="OPTIONS") return res.status(200).end();
  if (req.method!=="POST") return res.status(405).json({error:"只接受 POST"});

  try {
    const { prompt, channel="free", kind="bazi" } = req.body || {};
    if (!prompt || typeof prompt!=="string") return res.status(400).json({error:"缺少 prompt"});
    if (prompt.length>8000) return res.status(400).json({error:"prompt 過長"});

    // ── 驗證登入 token ──
    const authz = req.headers.authorization || "";
    const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
    if (!token) return res.status(401).json({error:"未登入"});

    const sb = svc();
    const { data:userData, error:uErr } = await sb.auth.getUser(token);
    if (uErr || !userData?.user) return res.status(401).json({error:"登入無效，請重新登入"});
    const userId = userData.user.id;

    // ── 查用戶等級 ──
    const { data:profile } = await sb.from("profiles").select("tier").eq("id", userId).single();
    const tier = profile?.tier || "guest";

    // ── 通道權限控制（伺服器強制）──
    let useChannel = channel;
    if (channel==="paid" && tier==="guest") {
      // 訪客唔可以用付費通道 → 拒絕（唔靜靜降級，畀前端知道）
      return res.status(403).json({error:"付費通道僅限 VIP，訪客請用平價通道"});
    }
    if (tier==="guest") useChannel = "free"; // 訪客一律 free

    const cfg = CHANNELS[useChannel] || CHANNELS.free;
    const apiKey = process.env[cfg.keyEnv];
    if (!apiKey) return res.status(500).json({error:`伺服器未設定 ${cfg.keyEnv}`});

    if (await limited(sb, userId, useChannel)) return res.status(429).json({error:"請求太頻密，請稍候"});

    // ── 呼叫上游 ──
    const up = await fetch(cfg.url, {
      method:"POST",
      headers:{ "Content-Type":"application/json", "Authorization":`Bearer ${apiKey}` },
      body: JSON.stringify({ model:cfg.model, max_tokens:8000, temperature:0.7, messages:[{role:"user",content:prompt}] })
    });
    if (!up.ok) {
      const t = await up.text();
      return res.status(502).json({error:`${cfg.label} 服務異常`, detail:t.slice(0,300)});
    }
    const data = await up.json();
    const text = data?.choices?.[0]?.message?.content || "";

    // ── 記錄用量（service key 寫入，繞過 RLS）──
    const today = hkDay();
    await sb.from("ai_logs").insert({
      user_id:userId, kind, channel:useChannel, model:cfg.model,
      prompt_chars:prompt.length, result_chars:text.length
    });
    // upsert 每日統計
    const col = useChannel==="paid" ? "paid_count" : "free_count";
    // Supabase 唔會 reject，要睇回傳 error 先判斷 RPC 係咪失敗
    const { error:rpcErr } = await sb.rpc("increment_usage", { p_user:userId, p_day:today, p_col:col });
    if (rpcErr) {
      // 若冇 rpc（或執行失敗），退回手動 upsert
      const { data:ex } = await sb.from("usage_daily").select("*").eq("user_id",userId).eq("day",today).maybeSingle();
      if (ex) await sb.from("usage_daily").update({ [col]: (ex[col]||0)+1 }).eq("user_id",userId).eq("day",today);
      else await sb.from("usage_daily").insert({ user_id:userId, day:today, [col]:1 });
    }

    return res.status(200).json({ text, model:cfg.label, tier });
  } catch(e) {
    return res.status(500).json({error:"代理錯誤", detail:String(e).slice(0,300)});
  }
}
