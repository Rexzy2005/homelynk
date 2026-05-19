create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.homes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'My Home',
  timezone text not null default 'Africa/Lagos',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  public_device_id text not null unique default ('HLY-' || upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 12))),
  name text not null default 'Primary ESP32',
  status text not null default 'pairing' check (status in ('pairing', 'provisioned', 'online', 'offline')),
  pairing_code text unique default upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8)),
  device_secret_hash text,
  firmware_version text,
  last_seen_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.appliances (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  name text not null,
  room text not null,
  kind text not null check (kind in ('light', 'fan', 'lock', 'plug', 'sensor')),
  state jsonb not null default '{}'::jsonb,
  is_online boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.appliance_commands (
  id uuid primary key default gen_random_uuid(),
  request_id text unique,
  device_id uuid not null references public.devices(id) on delete cascade,
  appliance_id uuid references public.appliances(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  desired_state jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (
    status in (
      'pending',
      'sent_to_device',
      'queued_device_offline',
      'acknowledged',
      'completed',
      'failed',
      'timeout',
      'rejected',
      'local_preview'
    )
  ),
  error_message text,
  sent_at timestamptz,
  acknowledged_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists homes_owner_id_idx on public.homes(owner_id);
create index if not exists devices_owner_id_idx on public.devices(owner_id);
create index if not exists devices_public_device_id_idx on public.devices(public_device_id);
create index if not exists appliances_device_id_idx on public.appliances(device_id);
create index if not exists appliance_commands_device_id_created_at_idx
  on public.appliance_commands(device_id, created_at desc);
create index if not exists appliance_commands_user_id_created_at_idx
  on public.appliance_commands(user_id, created_at desc);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists homes_set_updated_at on public.homes;
create trigger homes_set_updated_at
before update on public.homes
for each row execute function public.set_updated_at();

drop trigger if exists devices_set_updated_at on public.devices;
create trigger devices_set_updated_at
before update on public.devices
for each row execute function public.set_updated_at();

drop trigger if exists appliances_set_updated_at on public.appliances;
create trigger appliances_set_updated_at
before update on public.appliances
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
security definer
set search_path = public
language plpgsql
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do update set full_name = excluded.full_name;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

drop function if exists public.ensure_home_bootstrap();
create or replace function public.ensure_home_bootstrap()
returns table (
  home_id uuid,
  home_name text
)
security definer
set search_path = public
language plpgsql
as $$
declare
  current_user_id uuid := auth.uid();
  selected_home public.homes%rowtype;
  metadata_home_name text;
  metadata_full_name text;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select
    coalesce(raw_user_meta_data ->> 'home_name', 'My Home'),
    raw_user_meta_data ->> 'full_name'
  into metadata_home_name, metadata_full_name
  from auth.users
  where id = current_user_id;

  insert into public.profiles (id, full_name)
  values (current_user_id, metadata_full_name)
  on conflict (id) do nothing;

  select *
  into selected_home
  from public.homes
  where owner_id = current_user_id
  order by created_at asc
  limit 1;

  if selected_home.id is null then
    insert into public.homes (owner_id, name)
    values (current_user_id, metadata_home_name)
    returning * into selected_home;
  end if;

  return query
  select
    selected_home.id,
    selected_home.name;
end;
$$;

grant execute on function public.ensure_home_bootstrap() to authenticated;

drop function if exists public.create_home_device(text);
create or replace function public.create_home_device(device_name text default 'ESP32 Hub')
returns table (
  id uuid,
  home_id uuid,
  public_device_id text,
  name text,
  status text,
  pairing_code text,
  firmware_version text,
  last_seen_at timestamptz
)
security definer
set search_path = public
language plpgsql
as $$
declare
  current_user_id uuid := auth.uid();
  selected_home public.homes%rowtype;
  selected_device public.devices%rowtype;
  cleaned_name text := nullif(trim(device_name), '');
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into selected_home
  from public.homes
  where owner_id = current_user_id
  order by created_at asc
  limit 1;

  if selected_home.id is null then
    insert into public.homes (owner_id, name)
    values (current_user_id, 'My Home')
    returning * into selected_home;
  end if;

  insert into public.devices (home_id, owner_id, name)
  values (selected_home.id, current_user_id, coalesce(cleaned_name, 'ESP32 Hub'))
  returning * into selected_device;

  insert into public.appliances (device_id, name, room, kind, state, is_online, sort_order)
  values
    (selected_device.id, 'Relay Channel 1', 'Unassigned', 'plug', '{"power": false, "relay": 1}', false, 1),
    (selected_device.id, 'Relay Channel 2', 'Unassigned', 'plug', '{"power": false, "relay": 2}', false, 2),
    (selected_device.id, 'Relay Channel 3', 'Unassigned', 'plug', '{"power": false, "relay": 3}', false, 3),
    (selected_device.id, 'Relay Channel 4', 'Unassigned', 'plug', '{"power": false, "relay": 4}', false, 4);

  return query
  select
    selected_device.id,
    selected_device.home_id,
    selected_device.public_device_id,
    selected_device.name,
    selected_device.status,
    selected_device.pairing_code,
    selected_device.firmware_version,
    selected_device.last_seen_at;
end;
$$;

grant execute on function public.create_home_device(text) to authenticated;

alter table public.profiles enable row level security;
alter table public.homes enable row level security;
alter table public.devices enable row level security;
alter table public.appliances enable row level security;
alter table public.appliance_commands enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
to authenticated
using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "homes_select_own" on public.homes;
create policy "homes_select_own"
on public.homes for select
to authenticated
using (owner_id = auth.uid());

drop policy if exists "devices_select_own" on public.devices;
create policy "devices_select_own"
on public.devices for select
to authenticated
using (owner_id = auth.uid());

drop policy if exists "appliances_select_own" on public.appliances;
create policy "appliances_select_own"
on public.appliances for select
to authenticated
using (
  exists (
    select 1
    from public.devices d
    where d.id = appliances.device_id
      and d.owner_id = auth.uid()
  )
);

drop policy if exists "commands_select_own" on public.appliance_commands;
create policy "commands_select_own"
on public.appliance_commands for select
to authenticated
using (user_id = auth.uid());
