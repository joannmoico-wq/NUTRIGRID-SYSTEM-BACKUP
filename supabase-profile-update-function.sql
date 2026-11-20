alter table public.profiles
  add column if not exists full_name text,
  add column if not exists age integer;

drop policy if exists nutrigrid_profiles_update_own on public.profiles;
create policy nutrigrid_profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

grant update (full_name, age) on public.profiles to authenticated;

CREATE OR REPLACE FUNCTION public.update_own_profile(
  p_full_name text,
  p_age integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.';
  END IF;

  IF length(btrim(coalesce(p_full_name, ''))) = 0 THEN
    RAISE EXCEPTION 'Name is required.';
  END IF;

  IF p_age IS NULL OR p_age < 1 OR p_age > 120 THEN
    RAISE EXCEPTION 'Age must be between 1 and 120.';
  END IF;

  UPDATE public.profiles
  SET full_name = btrim(p_full_name),
      age = p_age
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The signed-in profile was not found.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_own_profile(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_own_profile(text, integer) TO authenticated;

-- Let every authenticated user read only their own profile. This is required
-- by login, profile editing, and approval checks.
alter table public.profiles enable row level security;

drop policy if exists nutrigrid_profiles_read_own on public.profiles;
create policy nutrigrid_profiles_read_own
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

grant select on public.profiles to authenticated;
