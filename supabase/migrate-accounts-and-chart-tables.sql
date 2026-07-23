-- 卦來卦去：帳戶等級及三術分表遷移
-- 此遷移不會刪除 profiles 或 charts；舊 charts 資料會複製到新表。

begin;

-- 1. 帳戶資料與個人命盤資料分開管理。
create table if not exists public.accounts (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  account_type text not null default 'guest'
    check (account_type in ('guest', 'vip', 'admin')),
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_accounts_type
  on public.accounts(account_type);

-- 將現有用戶及 profiles.tier 搬入 accounts（保留原有 admin / vip）。
insert into public.accounts (
  id, email, account_type, is_anonymous, created_at, last_sign_in_at, updated_at
)
select
  u.id,
  u.email,
  case
    when p.tier in ('guest', 'vip', 'admin') then p.tier
    else 'guest'
  end,
  coalesce(u.is_anonymous, u.email is null),
  coalesce(p.created_at, u.created_at, now()),
  u.last_sign_in_at,
  now()
from auth.users u
left join public.profiles p on p.id = u.id
on conflict (id) do update set
  email = excluded.email,
  is_anonymous = excluded.is_anonymous,
  last_sign_in_at = excluded.last_sign_in_at,
  updated_at = now();

-- RLS 管理員判斷改用 accounts，角色不再混在個人八字資料內。
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.accounts
    where id = auth.uid() and account_type = 'admin'
  );
$$;

alter table public.accounts enable row level security;

drop policy if exists "accounts_self_select" on public.accounts;
drop policy if exists "accounts_admin_select" on public.accounts;
drop policy if exists "accounts_admin_update" on public.accounts;

create policy "accounts_self_select"
  on public.accounts for select
  using (auth.uid() = id);

create policy "accounts_admin_select"
  on public.accounts for select
  using (public.is_admin());

create policy "accounts_admin_update"
  on public.accounts for update
  using (public.is_admin())
  with check (account_type in ('guest', 'vip', 'admin'));

-- 登入後由前端呼叫：只建立 guest 帳戶及同步 email，不能自行升級角色。
create or replace function public.ensure_my_account()
returns public.accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
  v_is_anonymous boolean := coalesce(
    nullif(auth.jwt() ->> 'is_anonymous', '')::boolean,
    false
  );
  v_account public.accounts;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.accounts (
    id, email, account_type, is_anonymous, last_sign_in_at, updated_at
  )
  values (
    v_uid, v_email, 'guest', v_is_anonymous, now(), now()
  )
  on conflict (id) do update set
    email = coalesce(excluded.email, public.accounts.email),
    is_anonymous = excluded.is_anonymous,
    last_sign_in_at = now(),
    updated_at = now()
  returning * into v_account;

  return v_account;
end;
$$;

revoke all on function public.ensure_my_account() from public;
grant execute on function public.ensure_my_account() to authenticated;

-- 2. 八字存盤：常用欄位拆開，方便 Table Editor 篩選及管理。
create table if not exists public.bazi_charts (
  id uuid primary key default gen_random_uuid(),
  legacy_chart_id uuid unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  name text,
  birth_year int,
  birth_month int check (birth_month between 1 and 12),
  birth_day int check (birth_day between 1 and 31),
  birth_hour int check (birth_hour between 0 and 23),
  birth_minute int check (birth_minute between 0 and 59),
  gender text check (gender in ('男', '女')),
  longitude numeric,
  year_pillar text,
  month_pillar text,
  day_pillar text,
  hour_pillar text,
  data jsonb not null default '{}'::jsonb,
  ai_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_bazi_charts_user_created
  on public.bazi_charts(user_id, created_at desc);
create index if not exists idx_bazi_charts_birth
  on public.bazi_charts(birth_year, birth_month, birth_day, gender);

-- 3. 大六壬存盤。
create table if not exists public.liuren_charts (
  id uuid primary key default gen_random_uuid(),
  legacy_chart_id uuid unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  question text,
  cast_at timestamptz,
  day_ganzhi text,
  hour_ganzhi text,
  san_chuan text,
  method text,
  data jsonb not null default '{}'::jsonb,
  ai_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_liuren_charts_user_created
  on public.liuren_charts(user_id, created_at desc);

-- 4. 奇門遁甲存盤。
create table if not exists public.qimen_charts (
  id uuid primary key default gen_random_uuid(),
  legacy_chart_id uuid unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  question text,
  cast_at timestamptz,
  true_solar boolean not null default true,
  longitude numeric,
  dun text,
  ju int,
  yuan text,
  solar_term text,
  day_ganzhi text,
  hour_ganzhi text,
  data jsonb not null default '{}'::jsonb,
  ai_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_qimen_charts_user_created
  on public.qimen_charts(user_id, created_at desc);

alter table public.bazi_charts enable row level security;
alter table public.liuren_charts enable row level security;
alter table public.qimen_charts enable row level security;

drop policy if exists "bazi_charts_self_all" on public.bazi_charts;
drop policy if exists "bazi_charts_admin_select" on public.bazi_charts;
drop policy if exists "liuren_charts_self_all" on public.liuren_charts;
drop policy if exists "liuren_charts_admin_select" on public.liuren_charts;
drop policy if exists "qimen_charts_self_all" on public.qimen_charts;
drop policy if exists "qimen_charts_admin_select" on public.qimen_charts;

create policy "bazi_charts_self_all"
  on public.bazi_charts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "bazi_charts_admin_select"
  on public.bazi_charts for select
  using (public.is_admin());

create policy "liuren_charts_self_all"
  on public.liuren_charts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "liuren_charts_admin_select"
  on public.liuren_charts for select
  using (public.is_admin());

create policy "qimen_charts_self_all"
  on public.qimen_charts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "qimen_charts_admin_select"
  on public.qimen_charts for select
  using (public.is_admin());

-- 5. 複製舊 charts 存盤到三張新表。legacy_chart_id 令遷移可安全重跑。
insert into public.bazi_charts (
  legacy_chart_id, user_id, title, name,
  birth_year, birth_month, birth_day, birth_hour, birth_minute,
  gender, longitude,
  year_pillar, month_pillar, day_pillar, hour_pillar,
  data, ai_text, created_at, updated_at
)
select
  c.id,
  c.user_id,
  c.title,
  coalesce(nullif(c.data ->> 'name', ''), c.title),
  case when coalesce(c.data ->> 'birthY', split_part(c.data ->> 'date', '-', 1)) ~ '^[0-9]{4}$'
    then coalesce(c.data ->> 'birthY', split_part(c.data ->> 'date', '-', 1))::int end,
  case when coalesce(c.data ->> 'birthM', split_part(c.data ->> 'date', '-', 2)) ~ '^[0-9]{1,2}$'
    then coalesce(c.data ->> 'birthM', split_part(c.data ->> 'date', '-', 2))::int end,
  case when coalesce(c.data ->> 'birthD', split_part(c.data ->> 'date', '-', 3)) ~ '^[0-9]{1,2}$'
    then coalesce(c.data ->> 'birthD', split_part(c.data ->> 'date', '-', 3))::int end,
  case when coalesce(c.data ->> 'birthH', split_part(c.data ->> 'time', ':', 1)) ~ '^[0-9]{1,2}$'
    then coalesce(c.data ->> 'birthH', split_part(c.data ->> 'time', ':', 1))::int end,
  case when coalesce(c.data ->> 'birthMi', split_part(c.data ->> 'time', ':', 2)) ~ '^[0-9]{1,2}$'
    then coalesce(c.data ->> 'birthMi', split_part(c.data ->> 'time', ':', 2))::int end,
  case when c.data ->> 'gender' in ('男', '女') then c.data ->> 'gender' end,
  case when c.data ->> 'lng' ~ '^-?[0-9]+([.][0-9]+)?$' then (c.data ->> 'lng')::numeric end,
  nullif(split_part(c.data ->> 'gz', ' ', 1), ''),
  nullif(split_part(c.data ->> 'gz', ' ', 2), ''),
  nullif(split_part(c.data ->> 'gz', ' ', 3), ''),
  nullif(split_part(c.data ->> 'gz', ' ', 4), ''),
  c.data,
  coalesce(c.ai_text, c.data ->> 'aiText'),
  c.created_at,
  c.created_at
from public.charts c
where c.kind = 'bazi'
on conflict (legacy_chart_id) do nothing;

insert into public.liuren_charts (
  legacy_chart_id, user_id, title, question, cast_at,
  day_ganzhi, hour_ganzhi, san_chuan, method,
  data, ai_text, created_at, updated_at
)
select
  c.id,
  c.user_id,
  c.title,
  c.data ->> 'question',
  case when c.data ->> 'dateISO' is not null then (c.data ->> 'dateISO')::timestamptz else c.created_at end,
  c.data ->> 'dayGz',
  c.data ->> 'shiGz',
  c.data ->> 'sanChuan',
  c.data ->> 'method',
  c.data,
  coalesce(c.ai_text, c.data ->> 'aiText'),
  c.created_at,
  c.created_at
from public.charts c
where c.kind = 'liuren'
on conflict (legacy_chart_id) do nothing;

insert into public.qimen_charts (
  legacy_chart_id, user_id, title, question, cast_at,
  true_solar, longitude, dun, ju, yuan, solar_term,
  day_ganzhi, hour_ganzhi,
  data, ai_text, created_at, updated_at
)
select
  c.id,
  c.user_id,
  c.title,
  c.data ->> 'question',
  case when c.data ->> 'dateISO' is not null then (c.data ->> 'dateISO')::timestamptz else c.created_at end,
  case when c.data ->> 'trueSolar' in ('true', 'false') then (c.data ->> 'trueSolar')::boolean else true end,
  case when c.data ->> 'lng' ~ '^-?[0-9]+([.][0-9]+)?$' then (c.data ->> 'lng')::numeric end,
  nullif(left(c.data ->> 'juDesc', 1), ''),
  case when substring(c.data ->> 'juDesc' from '[0-9]+') is not null
    then substring(c.data ->> 'juDesc' from '[0-9]+')::int end,
  c.data ->> 'yuan',
  c.data ->> 'jq',
  c.data ->> 'dayGz',
  c.data ->> 'shiGz',
  c.data,
  coalesce(c.ai_text, c.data ->> 'aiText'),
  c.created_at,
  c.created_at
from public.charts c
where c.kind = 'qimen'
on conflict (legacy_chart_id) do nothing;

commit;

