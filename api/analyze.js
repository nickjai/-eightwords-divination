// Vercel Serverless — AI 分析代理（帶 Supabase 身份驗證 + 通道控制）
// 訪客強制 DeepSeek；VIP/管理員先可用 Kimi。等級由伺服器核實，前端偽造無效。

import { createClient } from "@supabase/supabase-js";

const CHANNELS = {
  free: { url:"https://api.deepseek.com/chat/completions", keyEnv:"DEEPSEEK_API_KEY", model:"deepseek-chat", label:"DeepSeek V3.2" },
  paid: { url:"https://api.moonshot.cn/v1/chat/completions", keyEnv:"KIMI_API_KEY", model:"kimi-k2-0905-preview", label:"Kimi K2.6" }
};

// 速率限制
const bucket = new Map();
function limited(id, ch) {
  const now = Date.now(), limit = ch==="paid"?12:4, win=60000;
  const r = bucket.get(id) || { c:0, t:now+win };
  if (now > r.t) { r.c=0; r.t=now+win; }
  r.c++; bucket.set(id, r);
  if (bucket.size>5000) for (const [k,v] of bucket) if (now>v.t) bucket.delete(k);
  return r.c > limit;
}

function svc() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken:false, persistSession:false }
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin","*");
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

    if (limited(userId, useChannel)) return res.status(429).json({error:"請求太頻密，請稍候"});

    // ── 呼叫上游 ──
    const up = await fetch(cfg.url, {
      method:"POST",
      headers:{ "Content-Type":"application/json", "Authorization":`Bearer ${apiKey}` },
      body: JSON.stringify({ model:cfg.model, max_tokens:4096, temperature:0.7, messages:[{role:"user",content:prompt}] })
    });
    if (!up.ok) {
      const t = await up.text();
      return res.status(502).json({error:`${cfg.label} 服務異常`, detail:t.slice(0,300)});
    }
    const data = await up.json();
    const text = data?.choices?.[0]?.message?.content || "";

    // ── 記錄用量（service key 寫入，繞過 RLS）──
    const today = new Date().toISOString().slice(0,10);
    await sb.from("ai_logs").insert({
      user_id:userId, kind, channel:useChannel, model:cfg.model,
      prompt_chars:prompt.length, result_chars:text.length
    });
    // upsert 每日統計
    const col = useChannel==="paid" ? "paid_count" : "free_count";
    await sb.rpc("increment_usage", { p_user:userId, p_day:today, p_col:col }).then(()=>{}).catch(async()=>{
      // 若冇 rpc，退回手動 upsert
      const { data:ex } = await sb.from("usage_daily").select("*").eq("user_id",userId).eq("day",today).single();
      if (ex) await sb.from("usage_daily").update({ [col]: (ex[col]||0)+1 }).eq("user_id",userId).eq("day",today);
      else await sb.from("usage_daily").insert({ user_id:userId, day:today, [col]:1 });
    });

    return res.status(200).json({ text, model:cfg.label, tier });
  } catch(e) {
    return res.status(500).json({error:"代理錯誤", detail:String(e).slice(0,300)});
  }
}
