begin;

alter table public.profiles enable row level security;

create or replace function public.nutrigrid_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and approved is true
      and lower(role) = 'admin'
  );
$$;

create or replace function public.nutrigrid_is_approved_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and approved is true
      and lower(role) in ('admin', 'field_worker')
  );
$$;

create or replace function public.nutrigrid_is_activity_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and approved is true
      and lower(role) = 'admin'
  );
$$;

revoke all on function public.nutrigrid_is_admin() from public, anon;
revoke all on function public.nutrigrid_is_approved_staff() from public, anon;
revoke all on function public.nutrigrid_is_activity_admin() from public, anon;
grant execute on function public.nutrigrid_is_admin() to authenticated;
grant execute on function public.nutrigrid_is_approved_staff() to authenticated;
grant execute on function public.nutrigrid_is_activity_admin() to authenticated;

update public.profiles p
set role = v.role,
    approved = true,
    email = u.email,
    full_name = coalesce(nullif(p.full_name, ''), v.full_name)
from auth.users u
join (values
  ('arlrelandm@gmail.com', 'ARL', 'field_worker'),
  ('catemandras@gmail.com', 'Cate', 'field_worker'),
  ('joannmoico@gmail.com', 'Joann', 'field_worker'),
  ('julieubana29@gmail.com', 'Julie', 'field_worker'),
  ('joannmoico20@gmail.com', 'Joann', 'admin')
) v(email, full_name, role) on lower(u.email) = v.email
where p.id = u.id;

insert into public.profiles (id, email, full_name, role, approved)
select u.id, u.email, v.full_name, v.role, true
from auth.users u
join (values
  ('arlrelandm@gmail.com', 'ARL', 'field_worker'),
  ('catemandras@gmail.com', 'Cate', 'field_worker'),
  ('joannmoico@gmail.com', 'Joann', 'field_worker'),
  ('julieubana29@gmail.com', 'Julie', 'field_worker'),
  ('joannmoico20@gmail.com', 'Joann', 'admin')
) v(email, full_name, role) on lower(u.email) = v.email
where not exists (
  select 1
  from public.profiles p
  where p.id = u.id
);

-- Remove duplicate profile rows per account. auth.users.id is authoritative.
delete from public.profiles duplicate
where duplicate.ctid in (
  select duplicate_ctid
  from (
    select ctid as duplicate_ctid,
           row_number() over (
             partition by lower(email)
             order by
               (approved is true) desc,
               (lower(role) = 'field_worker') desc,
               ctid
           ) duplicate_rank
    from public.profiles
  ) ranked
  where duplicate_rank > 1
);

create table if not exists public.allowed_emails (
  email text primary key
);

create unique index if not exists allowed_emails_email_unique
  on public.allowed_emails (lower(email));

insert into public.allowed_emails (email)
select lower(email)
from public.profiles
where approved is true
  and lower(role) = 'field_worker'
and lower(email) is not null
and not exists (
  select 1
  from public.allowed_emails ae
  where ae.email = lower(public.profiles.email)
);

grant select on public.allowed_emails to authenticated;

create table if not exists public.record_activity_logs (
  id text primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_name text not null,
  actor_role text not null default 'unknown',
  category text not null,
  action text not null default 'edited',
  record_id text not null,
  field_changes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.record_activity_logs
  add column if not exists actor_role text not null default 'unknown',
  add column if not exists action text not null default 'edited';

alter table public.record_activity_logs enable row level security;
grant select, insert on public.record_activity_logs to authenticated;

drop policy if exists record_activity_logs_insert_own on public.record_activity_logs;
create policy record_activity_logs_insert_own
  on public.record_activity_logs
  for insert
  to authenticated
  with check (
    actor_user_id = (select auth.uid())
    and public.nutrigrid_is_approved_staff()
  );

drop policy if exists record_activity_logs_admin_read on public.record_activity_logs;
create policy record_activity_logs_admin_read
  on public.record_activity_logs
  for select
  to authenticated
  using (public.nutrigrid_is_activity_admin());

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

drop function if exists public.admin_update_bhw_assigned_purok(uuid, text);
create or replace function public.admin_update_bhw_assigned_purok(
  p_user_id uuid,
  p_assigned_purok text
)
returns jsonb
language plpgsql
stable
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

  update public.profiles
  set assigned_purok = p_assigned_purok
  where id = p_user_id
    and lower(role) = 'field_worker'
    and approved is true
  returning * into updated_profile;

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

revoke all on function public.admin_update_bhw_assigned_purok(uuid, text) from public, anon;
grant execute on function public.admin_update_bhw_assigned_purok(uuid, text) to authenticated;

drop function if exists public.get_bhw_activity_summaries();
create function public.get_bhw_activity_summaries()
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
    coalesce((
      select count(*)
      from public.residents r
      where r.created_by_user_id = p.id
         or r.data->>'created_by_user_id' = p.id::text
    ), 0),
    coalesce((
      select count(*) from public.infant_feeding r
      where r.created_by_user_id = p.id
         or r.data->>'created_by_user_id' = p.id::text
    ), 0)
    + coalesce((
      select count(*) from public.lactating_women r
      where r.created_by_user_id = p.id
         or r.data->>'created_by_user_id' = p.id::text
    ), 0)
    + coalesce((
      select count(*) from public.pregnant_women r
      where r.created_by_user_id = p.id
         or r.data->>'created_by_user_id' = p.id::text
    ), 0)
    + coalesce((
      select count(*) from public.monthly_natality r
      where r.created_by_user_id = p.id
         or r.data->>'created_by_user_id' = p.id::text
    ), 0),
    coalesce((
      select count(*)
      from public.monthly_report r
      where r.created_by_user_id = p.id
    ), 0),
    coalesce((
      select count(*)
      from public.tasks t
      where t.assigned_to_user_id = p.id
        and t.status = 'Completed'
    ), 0)
  from public.profiles p
  where public.nutrigrid_is_admin()
    and lower(p.role) = 'field_worker'
    and p.approved is true
  order by p.full_name nulls last, p.email;
$$;

revoke all on function public.get_bhw_activity_summaries() from public;
grant execute on function public.get_bhw_activity_summaries() to authenticated;

drop function if exists public.get_shared_household_counts_by_purok_for_month(text);
create function public.get_shared_household_counts_by_purok_for_month(p_month text)
returns table (purok text, household_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  with month_bounds as (
    select
      (substring(p_month from 1 for 7) || '-01')::date as period_start,
      ((substring(p_month from 1 for 7) || '-01')::date + interval '1 month')::date as period_end
  ),
  normalized as (
    select
      case
        when r.purok ~* '^Purok\\s*[1-9]$'
          then initcap(r.purok)
        when r.purok ~* '^[1-9]$'
          then 'Purok ' || r.purok
        else null
      end as purok_name,
      coalesce(
        r.visit_date,
        nullif(r.data->>'visit_date', '')::date,
        nullif(r.data->>'lastVisit', '')::date,
        r.created_at::date
      ) as record_date
    from public.residents r
  )
  select n.purok_name, count(*)::bigint
  from normalized n
  cross join month_bounds m
  where n.purok_name is not null
    and n.record_date >= m.period_start
    and n.record_date < m.period_end
  group by n.purok_name
  order by count(*) desc, n.purok_name;
$$;

revoke all on function public.get_shared_household_counts_by_purok_for_month(text) from public;
grant execute on function public.get_shared_household_counts_by_purok_for_month(text) to authenticated;

commit;
