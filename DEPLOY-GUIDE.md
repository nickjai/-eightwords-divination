# 卦來卦去 — 部署指南（含 Supabase）

## 一、建立 Supabase 資料庫（免費）

1. 去 https://supabase.com 註冊登入 → New Project
2. 揀個 region（建議 Singapore/Tokyo，近香港快啲），設個 database password
3. 建好後去 **SQL Editor** → New query → 貼上 `supabase/schema.sql` 全部內容 → Run
4. 去 **Authentication → Providers** → 開啟 **Anonymous sign-ins**（訪客登入必須）
5. 去 **Settings → API** 抄低三樣：
   - `Project URL`（例 https://xxxx.supabase.co）
   - `anon public` key（前端用，可公開）
   - `service_role` key（後端用，**機密**，唔好曝露）

---

## 二、準備 AI API Key

### DeepSeek（平價通道，訪客用）
- https://platform.deepseek.com → API keys → 建立，充值 US$5
### Kimi（付費通道，VIP 用）
- https://platform.moonshot.cn → API Keys → 建立，充值 ¥50

---

## 三、部署到 Vercel

1. 將成個資料夾上傳 GitHub（**唔好上傳 .env**）
2. https://vercel.com → Add New Project → Import 你個 repo
3. Framework 自動偵測 Vite → Deploy

---

## 四、設定環境變數（關鍵）

Vercel → Project → Settings → Environment Variables，加 6 條：

| 變數名 | 值 | 用途 |
|--------|-----|------|
| `DEEPSEEK_API_KEY` | sk-... | 後端・平價通道 |
| `KIMI_API_KEY` | sk-... | 後端・付費通道 |
| `SUPABASE_URL` | https://xxx.supabase.co | 後端 |
| `SUPABASE_SERVICE_KEY` | service_role key | 後端（機密）|
| `VITE_SUPABASE_URL` | https://xxx.supabase.co | 前端 |
| `VITE_SUPABASE_ANON_KEY` | anon public key | 前端 |

儲存後去 Deployments → 最新一個 → Redeploy 令變數生效。

---

## 五、設定你自己做管理員

1. 打開你個網址，會要求填出生資料（你自己都要註冊一次）
2. 填完後去 Supabase → SQL Editor 執行（換返你註冊嗰個匿名 user）：

因為訪客係匿名登入冇 email，最簡單做法：
- 去 Supabase → Table Editor → `profiles` 表
- 搵返你自己嗰行（通常係最新建立嗰個）
- 將 `tier` 由 `guest` 改做 `admin`
- 儲存

之後重新整理網頁，頂部會出現「後台」按鈕。

---

## 六、日常管理

- **後台**：睇所有用戶八字資料、用量、開/關 VIP
- **開通 VIP**：後台用戶列表撳「開通VIP」，該用戶即可用 Kimi 付費通道
- **訪客**：一律用 DeepSeek 免費通道

---

## 身份與通道規則（已內建）

| 等級 | 通道 | 速率上限 |
|------|------|----------|
| 訪客 guest | DeepSeek（免費）| 4 次/分鐘 |
| VIP | Kimi（付費）| 12 次/分鐘 |
| 管理員 | 兩者皆可 + 後台 | — |

⚠️ 通道權限由**伺服器核實用戶等級**，前端偽造無效，訪客偷唔到付費通道。

---

## 資料私隱說明
- 訪客出生資料存喺 Supabase，管理員後台可見（客戶管理用途）
- 每個用戶只睇到自己嘅命盤（Row Level Security 保護）
- API key 全部存伺服器環境變數，網頁前端絕對睇唔到

## 費用
- DeepSeek ≈ HK$0.008/次，Kimi ≈ HK$0.06/次
- Supabase 免費 tier：500MB 資料庫、50000 月活躍用戶，個人用綽綽有餘
- Vercel 免費 Hobby plan 足夠
