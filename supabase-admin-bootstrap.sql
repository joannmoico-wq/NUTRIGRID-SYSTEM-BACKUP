begin;

alter table public.profiles enable row level security;
grant select on public.profiles to authenticated;

drop policy if exists nutrigrid_profiles_read_own on public.profiles;
create policy nutrigrid_profiles_read_own
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

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

create or replace function public.is_approved_staff()
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

revoke all on function public.nutrigrid_is_admin() from public, anon;
revoke all on function public.nutrigrid_is_approved_staff() from public, anon;
revoke all on function public.nutrigrid_is_activity_admin() from public, anon;
grant execute on function public.nutrigrid_is_admin() to authenticated;
grant execute on function public.nutrigrid_is_approved_staff() to authenticated;
grant execute on function public.nutrigrid_is_activity_admin() to authenticated;
revoke all on function public.is_approved_staff() from public, anon;
grant execute on function public.is_approved_staff() to authenticated;

-- Preserve existing profile fields and repair all known NutriGrid accounts.
with target_accounts(email, full_name, role) as (
  values
    ('arlrelandm@gmail.com', 'ARL', 'field_worker'),
    ('catemandras@gmail.com', 'Cate', 'field_worker'),
    ('joannmoico@gmail.com', 'Joann', 'field_worker'),
    ('julieubana29@gmail.com', 'Julie', 'field_worker'),
    ('joannmoico20@gmail.com', 'Joann', 'admin')
),
target_users as (
  select u.id, u.email, a.full_name, a.role
  from auth.users u
  join target_accounts a on lower(u.email) = a.email
)
update public.profiles p
set
  email = t.email,
  full_name = coalesce(nullif(btrim(p.full_name), ''), t.full_name),
  role = t.role,
  approved = true
from target_users t
where p.id = t.id;

with target_accounts(email, full_name, role) as (
  values
    ('arlrelandm@gmail.com', 'ARL', 'field_worker'),
    ('catemandras@gmail.com', 'Cate', 'field_worker'),
    ('joannmoico@gmail.com', 'Joann', 'field_worker'),
    ('julieubana29@gmail.com', 'Julie', 'field_worker'),
    ('joannmoico20@gmail.com', 'Joann', 'admin')
),
target_users as (
  select u.id, u.email, a.full_name, a.role
  from auth.users u
  join target_accounts a on lower(u.email) = a.email
)
insert into public.profiles (id, email, full_name, role, approved)
select t.id, t.email, t.full_name, t.role, true
from target_users t
where not exists (
  select 1
  from public.profiles p
  where p.id = t.id
);

-- Remove profile duplicates that point to the same Auth UUID.
delete from public.profiles p
where p.ctid not in (
  select min(ctid)
  from public.profiles
  group by id
);

-- Remove orphaned profile rows and duplicate email rows.
delete from public.profiles p
where not exists (
  select 1
  from auth.users u
  where u.id = p.id
);

delete from public.profiles p
where p.ctid in (
  select ranked.ctid
  from (
    select
      candidate.ctid,
      row_number() over (
        partition by lower(candidate.email)
        order by
          exists (
            select 1
            from auth.users u
            where u.id = candidate.id
              and lower(u.email) = lower(candidate.email)
          ) desc,
          candidate.approved desc,
          candidate.ctid
      ) as duplicate_rank
    from public.profiles candidate
    where candidate.email is not null
  ) ranked
  where ranked.duplicate_rank > 1
);

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
    if to_regclass(format('public.%I', table_name)) is null then
      continue;
    end if;

    execute format(
      'alter table public.%I add column if not exists created_by_user_id uuid',
      table_name
    );
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'grant select, insert, update, delete on public.%I to authenticated',
      table_name
    );

    execute format('drop policy if exists nutrigrid_member_read_own on public.%I', table_name);
    execute format(
      'create policy nutrigrid_member_read_own on public.%I
       for select to authenticated
       using (
         public.is_approved_staff()
         and (
           created_by_user_id = (select auth.uid())
           or data->>''created_by_user_id'' = (select auth.uid())::text
         )
       )',
      table_name
    );

    execute format('drop policy if exists nutrigrid_member_insert_own on public.%I', table_name);
    execute format(
      'create policy nutrigrid_member_insert_own on public.%I
       for insert to authenticated
       with check (
         public.is_approved_staff()
         and created_by_user_id = (select auth.uid())
       )',
      table_name
    );

    execute format('drop policy if exists nutrigrid_member_update_own on public.%I', table_name);
    execute format(
      'create policy nutrigrid_member_update_own on public.%I
       for update to authenticated
       using (
         public.is_approved_staff()
         and (
           created_by_user_id = (select auth.uid())
           or data->>''created_by_user_id'' = (select auth.uid())::text
         )
       )
       with check (
         public.is_approved_staff()
         and created_by_user_id = (select auth.uid())
       )',
      table_name
    );

    execute format('drop policy if exists nutrigrid_member_delete_own on public.%I', table_name);
    execute format(
      'create policy nutrigrid_member_delete_own on public.%I
       for delete to authenticated
       using (
         public.is_approved_staff()
         and (
           created_by_user_id = (select auth.uid())
           or data->>''created_by_user_id'' = (select auth.uid())::text
         )
       )',
      table_name
    );

    execute format('drop policy if exists nutrigrid_admin_read_all on public.%I', table_name);
    execute format(
      'create policy nutrigrid_admin_read_all on public.%I
       for select to authenticated
       using (public.nutrigrid_is_admin())',
      table_name
    );

    execute format('drop policy if exists nutrigrid_admin_insert_all on public.%I', table_name);
    execute format(
      'create policy nutrigrid_admin_insert_all on public.%I
       for insert to authenticated
       with check (public.nutrigrid_is_admin())',
      table_name
    );

    execute format('drop policy if exists nutrigrid_admin_update_all on public.%I', table_name);
    execute format(
      'create policy nutrigrid_admin_update_all on public.%I
       for update to authenticated
       using (public.nutrigrid_is_admin())
       with check (public.nutrigrid_is_admin())',
      table_name
    );

    execute format('drop policy if exists nutrigrid_admin_delete_all on public.%I', table_name);
    execute format(
      'create policy nutrigrid_admin_delete_all on public.%I
       for delete to authenticated
       using (public.nutrigrid_is_admin())',
      table_name
    );
  end loop;
end
$$;

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

alter table public.profiles
  add column if not exists fcm_token text;

drop function if exists public.set_my_fcm_token(text);
create or replace function public.set_my_fcm_token(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  profile_updated boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if p_token is not null and octet_length(p_token) > 4096 then
    raise exception 'Push token is too long.';
  end if;

  update public.profiles
  set fcm_token = nullif(trim(p_token), '')
  where id = auth.uid();

  profile_updated := found;
  return profile_updated;
end
$$;

revoke all on function public.set_my_fcm_token(text) from public, anon;
grant execute on function public.set_my_fcm_token(text) to authenticated;

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

-- Remap migrated record ownership from old project UUIDs to new project UUIDs.
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
      'update public.%I r
       set created_by_user_id = m.new_id
       from (values
         (''0b7386d3-7fe1-478a-aa19-1ee04d02a2a3''::uuid, ''1e96c0a4-c6ce-4a9e-a2b5-271ca12faaab''::uuid),
         (''c4e49c01-7092-4512-bd5a-27d00da22d62''::uuid, ''792022a4-5759-4160-9bc9-30b4343d317a''::uuid),
         (''8abef1cd-303b-4d47-8a40-22fd4380df2b''::uuid, ''df16969c-061d-442d-ad74-1834c167229f''::uuid),
         (''ae6a2fc4-4f3e-4aaf-ae25-284a87c32f2e''::uuid, ''3738aaa1-3c42-41db-90fb-7b1ffbbf258d''::uuid),
         (''a6456fff-49e2-4144-ad28-3566f83d46f7''::uuid, ''f0939257-1204-4941-b0e6-257053b9aedc''::uuid)
       ) m(old_id, new_id)
       where r.created_by_user_id = m.old_id',
      table_name
    );

    execute format(
      'update public.%I r
       set data = jsonb_set(
         coalesce(r.data, ''{}''::jsonb),
         ''{created_by_user_id}'',
         to_jsonb(m.new_id::text),
         true
       )
       from (values
         (''0b7386d3-7fe1-478a-aa19-1ee04d02a2a3''::uuid, ''1e96c0a4-c6ce-4a9e-a2b5-271ca12faaab''::uuid),
         (''c4e49c01-7092-4512-bd5a-27d00da22d62''::uuid, ''792022a4-5759-4160-9bc9-30b4343d317a''::uuid),
         (''8abef1cd-303b-4d47-8a40-22fd4380df2b''::uuid, ''df16969c-061d-442d-ad74-1834c167229f''::uuid),
         (''ae6a2fc4-4f3e-4aaf-ae25-284a87c32f2e''::uuid, ''3738aaa1-3c42-41db-90fb-7b1ffbbf258d''::uuid),
         (''a6456fff-49e2-4144-ad28-3566f83d46f7''::uuid, ''f0939257-1204-4941-b0e6-257053b9aedc''::uuid)
       ) m(old_id, new_id)
       where r.data->>''created_by_user_id'' = m.old_id::text',
      table_name
    );
  end loop;
end
$$;

drop function if exists public.admin_update_bhw_assigned_purok(uuid, text);
create or replace function public.admin_update_bhw_assigned_purok(
  p_user_id uuid,
  p_assigned_purok text
)
returns jsonb
language plpgsql
volatile
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
  with normalized as (
    select
      case
        when trim(r.purok) ~* '^Purok\s*(10|[1-9])$'
          then 'Purok ' || trim(regexp_replace(trim(r.purok), '^Purok\s*', '', 'i'))
        when trim(r.purok) ~* '^(10|[1-9])$'
          then 'Purok ' || trim(r.purok)
        else null
      end as purok_name,
      coalesce(
        nullif(r.visit_date::text, ''),
        nullif(r.data->>'visit_date', ''),
        nullif(r.data->>'lastVisit', ''),
        r.created_at::date::text
      ) as record_date_text
    from public.residents r
  )
  select n.purok_name, count(*)::bigint
  from normalized n
  where n.purok_name is not null
    and substring(n.record_date_text from 1 for 7) = substring(p_month from 1 for 7)
  group by n.purok_name
  order by count(*) desc, n.purok_name;
$$;

revoke all on function public.get_shared_household_counts_by_purok_for_month(text) from public;
grant execute on function public.get_shared_household_counts_by_purok_for_month(text) to authenticated;

commit;
