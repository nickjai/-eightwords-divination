-- ═══════════════════════════════════════════════════════
-- 卦來卦去 — Supabase 資料庫 Schema
-- 喺 Supabase Dashboard → SQL Editor 貼上執行
-- ═══════════════════════════════════════════════════════

-- ── 1. 用戶檔案 profiles ──
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  -- 個人八字資料（註冊時填一次）
  birth_year int,
  birth_month int,
  birth_day int,
  birth_hour int,
  birth_minute int default 0,
  gender text check (gender in ('男','女')),
  longitude numeric default 114.17,
  -- 身份等級
  tier text not null default 'guest' check (tier in ('guest','vip','admin')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── 2. 儲存盤面 charts（三術通用）──
create table if not exists charts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('bazi','liuren','qimen')),
  title text,
  -- 盤面資料（JSON：輸入參數 + 計算結果摘要）
  data jsonb not null,
  ai_text text,
  created_at timestamptz default now()
);
create index if not exists idx_charts_user on charts(user_id, kind, created_at desc);

-- ── 3. AI 分析記錄 ai_logs ──
create table if not exists ai_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  channel text not null,        -- free / paid
  model text,
  prompt_chars int,
  result_chars int,
  created_at timestamptz default now()
);
create index if not exists idx_ailogs_user on ai_logs(user_id, created_at desc);
create index if not exists idx_ailogs_day on ai_logs(created_at);

-- ── 4. 每日用量統計（快速查詢用）──
create table if not exists usage_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  free_count int default 0,
  paid_count int default 0,
  primary key (user_id, day)
);

-- ═══════════════════════════════════════════════════════
-- Row Level Security（RLS）— 用戶只存取自己資料
-- ═══════════════════════════════════════════════════════
alter table profiles enable row level security;
alter table charts enable row level security;
alter table ai_logs enable row level security;
alter table usage_daily enable row level security;

-- profiles：自己讀寫自己
create policy "profiles_self_select" on profiles for select using (auth.uid() = id);
create policy "profiles_self_insert" on profiles for insert with check (auth.uid() = id);
create policy "profiles_self_update" on profiles for update using (auth.uid() = id);

-- charts：自己讀寫自己
create policy "charts_self_all" on charts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ai_logs：自己只可讀（寫入由後端 service key 做）
create policy "ailogs_self_select" on ai_logs for select using (auth.uid() = user_id);

-- usage_daily：自己只可讀
create policy "usage_self_select" on usage_daily for select using (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════
-- 管理員函數（判斷是否 admin）
-- ═══════════════════════════════════════════════════════
create or replace function is_admin() returns boolean as $$
  select exists(select 1 from profiles where id = auth.uid() and tier = 'admin');
$$ language sql security definer stable;

-- 管理員可睇全部 profiles / charts / logs
create policy "admin_all_profiles" on profiles for select using (is_admin());
create policy "admin_all_charts" on charts for select using (is_admin());
create policy "admin_all_ailogs" on ai_logs for select using (is_admin());
create policy "admin_all_usage" on usage_daily for select using (is_admin());
create policy "admin_update_profiles" on profiles for update using (is_admin());

-- ═══════════════════════════════════════════════════════
-- 自動建 profile：新用戶註冊時觸發
-- ═══════════════════════════════════════════════════════
create or replace function handle_new_user() returns trigger as $$
begin
  insert into profiles (id, tier) values (new.id, 'guest')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;

-- ═══════════════════════════════════════════════════════
-- 設定管理員（部署後執行一次，換成你的 email）
-- 註冊登入後，喺 SQL Editor 執行：
--   update profiles set tier='admin'
--   where id = (select id from auth.users where email='你的email');
-- ═══════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════
-- 用量遞增函數（原子操作，後端呼叫）
-- ═══════════════════════════════════════════════════════
create or replace function increment_usage(p_user uuid, p_day date, p_col text)
returns void as $$
begin
  insert into usage_daily(user_id, day, free_count, paid_count)
    values (p_user, p_day, case when p_col='free_count' then 1 else 0 end,
                            case when p_col='paid_count' then 1 else 0 end)
  on conflict (user_id, day) do update set
    free_count = usage_daily.free_count + case when p_col='free_count' then 1 else 0 end,
    paid_count = usage_daily.paid_count + case when p_col='paid_count' then 1 else 0 end;
end;
$$ language plpgsql security definer;

