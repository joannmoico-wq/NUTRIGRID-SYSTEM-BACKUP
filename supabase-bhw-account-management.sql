-- BHW account profile fields, admin-only editing, and per-account activity counts.
-- Run in the Supabase SQL Editor as the project owner.
-- Auth users must be created with the create-bhw-account Edge Function; never
-- insert credentials directly into auth.users from a browser or SQL editor.
-- Run after supabase-add-tasks-sync-logs-purok.sql, supabase-monthly-report.sql,
-- and supabase-record-activity-logs.sql.

begin;

alter table public.profiles
  add column if not exists username text,
  add column if not exists contact_number text,
  add column if not exists designation text,
  add column if not exists assigned_purok text,
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'residents',
    'environmental_sanitation',
    'infant_feeding',
    'lactating_women',
    'pregnant_women',
    'monthly_natality'
  ]
  loop
    execute format(
      'alter table public.%I add column if not exists created_by_user_id uuid references auth.users(id) on delete set null',
      table_name
    );
    execute format(
      'create index if not exists %I on public.%I (created_by_user_id)',
      table_name || '_created_by_user_id_idx',
      table_name
    );
  end loop;
end
$$;

alter table public.monthly_report
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null;
alter table public.monthly_report
  alter column created_by_user_id set default auth.uid();
create index if not exists monthly_report_created_by_user_id_idx
  on public.monthly_report (created_by_user_id);

-- Preserve ownership history while allowing Auth users to be removed.
do $$
declare
  table_name text;
  constraint_record record;
begin
  foreach table_name in array array[
    'residents',
    'environmental_sanitation',
    'infant_feeding',
    'lactating_women',
    'pregnant_women',
    'monthly_natality',
    'monthly_report'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is null then
      continue;
    end if;

    for constraint_record in
      select c.conname
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid
       and a.attnum = c.conkey[1]
      where c.conrelid = to_regclass(format('public.%I', table_name))
        and c.contype = 'f'
        and c.confrelid = 'auth.users'::regclass
        and array_length(c.conkey, 1) = 1
        and a.attname = 'created_by_user_id'
    loop
      execute format('alter table public.%I drop constraint %I', table_name, constraint_record.conname);
    end loop;

    execute format(
      'alter table public.%I add constraint %I foreign key (created_by_user_id) references auth.users(id) on delete set null',
      table_name,
      table_name || '_created_by_user_id_fkey'
    );
  end loop;
end
$$;

-- Keep assigned tasks and sync/activity history when a worker's Auth user is removed.
do $$
declare
  constraint_record record;
begin
  if to_regclass('public.tasks') is not null then
    alter table public.tasks alter column assigned_to_user_id drop not null;
    for constraint_record in
      select c.conname
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid
       and a.attnum = c.conkey[1]
      where c.conrelid = 'public.tasks'::regclass
        and c.contype = 'f'
        and c.confrelid = 'auth.users'::regclass
        and array_length(c.conkey, 1) = 1
        and a.attname = 'assigned_to_user_id'
    loop
      execute format('alter table public.tasks drop constraint %I', constraint_record.conname);
    end loop;
    alter table public.tasks
      add constraint tasks_assigned_to_user_id_fkey
      foreign key (assigned_to_user_id) references auth.users(id) on delete set null;
  end if;

  if to_regclass('public.sync_log') is not null then
    alter table public.sync_log alter column user_id drop not null;
    for constraint_record in
      select c.conname
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid
       and a.attnum = c.conkey[1]
      where c.conrelid = 'public.sync_log'::regclass
        and c.contype = 'f'
        and c.confrelid = 'auth.users'::regclass
        and array_length(c.conkey, 1) = 1
        and a.attname = 'user_id'
    loop
      execute format('alter table public.sync_log drop constraint %I', constraint_record.conname);
    end loop;
    alter table public.sync_log
      add constraint sync_log_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete set null;
  end if;

  if to_regclass('public.record_activity_logs') is not null then
    alter table public.record_activity_logs alter column actor_user_id drop not null;
    for constraint_record in
      select c.conname
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid
       and a.attnum = c.conkey[1]
      where c.conrelid = 'public.record_activity_logs'::regclass
        and c.contype = 'f'
        and c.confrelid = 'auth.users'::regclass
        and array_length(c.conkey, 1) = 1
        and a.attname = 'actor_user_id'
    loop
      execute format('alter table public.record_activity_logs drop constraint %I', constraint_record.conname);
    end loop;
    alter table public.record_activity_logs
      add constraint record_activity_logs_actor_user_id_fkey
      foreign key (actor_user_id) references auth.users(id) on delete set null;
  end if;
end
$$;

create table if not exists public.bhw_account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  requested_by_user_id uuid not null,
  full_name text not null,
  email text not null,
  source text not null check (source in ('self', 'admin')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'deleted')),
  requested_at timestamptz not null default now(),
  reviewed_by_user_id uuid,
  reviewed_at timestamptz
);

create unique index if not exists bhw_account_deletion_requests_one_active_per_user_idx
  on public.bhw_account_deletion_requests (user_id)
  where status in ('pending', 'processing');
create index if not exists bhw_account_deletion_requests_pending_created_idx
  on public.bhw_account_deletion_requests (status, requested_at desc);

alter table public.bhw_account_deletion_requests enable row level security;
revoke all on public.bhw_account_deletion_requests from public, anon, authenticated;

create or replace function public.get_pending_bhw_account_deletion_requests()
returns table (
  id uuid,
  user_id uuid,
  full_name text,
  email text,
  requested_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.user_id,
    r.full_name,
    r.email,
    r.requested_at
  from public.bhw_account_deletion_requests r
  where r.status = 'pending'
    and public.nutrigrid_is_admin()
  order by r.requested_at desc;
$$;

revoke all on function public.get_pending_bhw_account_deletion_requests() from public;
grant execute on function public.get_pending_bhw_account_deletion_requests() to authenticated;

drop function if exists public.get_approved_bhws();
create function public.get_approved_bhws()
returns table (
  id uuid,
  full_name text,
  email text,
  username text,
  contact_number text,
  designation text,
  assigned_purok text,
  approved boolean,
  created_at timestamptz,
  created_by_name text,
  last_sign_in_at timestamptz
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    p.id,
    p.full_name,
    p.email,
    p.username,
    p.contact_number,
    p.designation,
    p.assigned_purok,
    p.approved,
    au.created_at,
    creator.full_name,
    au.last_sign_in_at
  from public.profiles p
  left join public.profiles creator on creator.id = p.created_by_user_id
  left join auth.users au on au.id = p.id
  where public.nutrigrid_is_admin()
    and lower(p.role) = 'field_worker'
    and p.approved is true
    and exists (
      select 1
      from public.allowed_emails ae
      where lower(ae.email) = lower(p.email)
    )
  order by p.full_name nulls last, p.email;
$$;

revoke all on function public.get_approved_bhws() from public;
grant execute on function public.get_approved_bhws() to authenticated;

create or replace function public.admin_update_bhw_profile(
  p_user_id uuid,
  p_full_name text,
  p_contact_number text,
  p_designation text,
  p_assigned_purok text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_profile public.profiles%rowtype;
begin
  if not public.nutrigrid_is_admin() then
    raise exception 'Only an approved admin can update BHW accounts.';
  end if;

  if nullif(btrim(p_full_name), '') is null then
    raise exception 'Full name is required.';
  end if;

  if p_contact_number is null
     or p_contact_number !~ '^[0-9+() -]+$'
     or length(regexp_replace(p_contact_number, '[^0-9]', '', 'g')) not between 7 and 15 then
    raise exception 'Contact number must contain 7 to 15 digits and no letters.';
  end if;

  if p_assigned_purok is null
     or p_assigned_purok !~ '^Purok ([1-5]|[6-8][AB]|9|10)$' then
    raise exception 'Choose Purok 1 to 5, 6A, 6B, 7A, 7B, 8A, 8B, 9, or 10.';
  end if;

  update public.profiles p
  set full_name = btrim(p_full_name),
      contact_number = btrim(p_contact_number),
      designation = nullif(btrim(p_designation), ''),
      assigned_purok = p_assigned_purok
  where p.id = p_user_id
    and lower(p.role) = 'field_worker'
    and p.approved is true
  returning p.* into updated_profile;

  if not found then
    raise exception 'Approved BHW account was not found.';
  end if;

  return jsonb_build_object(
    'id', updated_profile.id,
    'full_name', updated_profile.full_name,
    'email', updated_profile.email,
    'username', updated_profile.username,
    'contact_number', updated_profile.contact_number,
    'designation', updated_profile.designation,
    'assigned_purok', updated_profile.assigned_purok,
    'approved', updated_profile.approved,
    'created_at', (
      select au.created_at
      from auth.users au
      where au.id = updated_profile.id
    ),
    'created_by_name', (
      select creator.full_name
      from public.profiles creator
      where creator.id = updated_profile.created_by_user_id
    )
  );
end
$$;

revoke all on function public.admin_update_bhw_profile(uuid, text, text, text, text) from public;
grant execute on function public.admin_update_bhw_profile(uuid, text, text, text, text) to authenticated;

create or replace function public.admin_update_bhw_assigned_purok(
  p_user_id uuid,
  p_assigned_purok text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_profile public.profiles%rowtype;
begin
  if not public.nutrigrid_is_admin() then
    raise exception 'Only an approved admin can update BHW accounts.';
  end if;

  if p_assigned_purok is null
     or p_assigned_purok !~ '^Purok ([1-5]|[6-8][AB]|9|10)$' then
    raise exception 'Choose Purok 1 to 5, 6A, 6B, 7A, 7B, 8A, 8B, 9, or 10.';
  end if;

  update public.profiles p
  set assigned_purok = p_assigned_purok
  where p.id = p_user_id
    and lower(p.role) = 'field_worker'
    and p.approved is true
  returning p.* into updated_profile;

  if not found then
    raise exception 'Approved BHW account was not found.';
  end if;

  return jsonb_build_object(
    'id', updated_profile.id,
    'full_name', updated_profile.full_name,
    'email', updated_profile.email,
    'username', updated_profile.username,
    'contact_number', updated_profile.contact_number,
    'designation', updated_profile.designation,
    'assigned_purok', updated_profile.assigned_purok,
    'approved', updated_profile.approved,
    'created_at', (
      select au.created_at
      from auth.users au
      where au.id = updated_profile.id
    ),
    'created_by_name', (
      select creator.full_name
      from public.profiles creator
      where creator.id = updated_profile.created_by_user_id
    )
  );
end
$$;

revoke all on function public.admin_update_bhw_assigned_purok(uuid, text) from public;
grant execute on function public.admin_update_bhw_assigned_purok(uuid, text) to authenticated;

create or replace function public.get_bhw_activity_summaries()
returns table (
  user_id uuid,
  residents_encoded bigint,
  maternal_infant_logs bigint,
  monthly_reports_filed bigint,
  tasks_completed bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    (select count(*) from public.residents r
      where r.created_by_user_id = p.id or r.data->>'created_by_user_id' = p.id::text),
    (select count(*) from public.infant_feeding r
      where r.created_by_user_id = p.id or r.data->>'created_by_user_id' = p.id::text)
      + (select count(*) from public.lactating_women r
        where r.created_by_user_id = p.id or r.data->>'created_by_user_id' = p.id::text)
      + (select count(*) from public.pregnant_women r
        where r.created_by_user_id = p.id or r.data->>'created_by_user_id' = p.id::text)
      + (select count(*) from public.monthly_natality r
        where r.created_by_user_id = p.id or r.data->>'created_by_user_id' = p.id::text),
    (select count(*) from public.monthly_report r where r.created_by_user_id = p.id),
    (select count(*) from public.tasks t where t.assigned_to_user_id = p.id and t.status = 'Completed')
  from public.profiles p
  where public.nutrigrid_is_admin()
    and lower(p.role) = 'field_worker'
    and p.approved is true
    and exists (
      select 1
      from public.allowed_emails ae
      where lower(ae.email) = lower(p.email)
    )
  order by p.full_name nulls last, p.email;
$$;

revoke all on function public.get_bhw_activity_summaries() from public;
grant execute on function public.get_bhw_activity_summaries() to authenticated;

commit;
