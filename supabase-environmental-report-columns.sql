create table if not exists public.environmental_sanitation (
  env_san_id uuid primary key default gen_random_uuid(),
  created_by_user_id uuid references auth.users(id) default auth.uid(),
  device_id text not null,
  local_id text not null,
  purok text,
  total_hh integer,
  total_families integer,
  male_count integer default 0,
  female_count integer default 0,
  total_population integer default 0,
  hh_with_occupation integer default 0,

  -- Garbage disposal
  compost_pit boolean default false,
  garbage_collect boolean default false,
  garbage_others boolean default false,

  -- Water supply
  water_level_i boolean default false,
  water_level_ii boolean default false,
  water_level_iii boolean default false,
  without_potable_water boolean default false,
  water_source text,

  -- Toilet type: WS, OP, Communal, and No Sanitary Toilet
  toilet_sanitary boolean default false,
  toilet_not_sanitary boolean default false,
  toilet_communal boolean default false,
  toilet_none boolean default false,
  toilet_type text check (
    toilet_type is null or toilet_type in ('WS', 'OP', 'Communal', 'No Sanitary Toilet')
  ),

  -- Electricity
  electricity_owned boolean default false,
  electricity_connected boolean default false,

  -- Food production
  has_veg_garden boolean default false,
  has_herbal_garden boolean default false,
  has_backyard_poultry boolean default false,
  has_swine boolean default false,
  has_fish_pond boolean default false,
  uses_iodized_salt boolean default false,
  has_malunggay_tree boolean default false,
  child_re boolean default false,
  father_re boolean default false,
  household_nonsmoker boolean default false,
  household_smoker boolean default false,

  -- Selling iodized salt
  selling_iodized_sari boolean default false,
  selling_iodized_grocery boolean default false,
  selling_iodized_bakery boolean default false,
  selling_iodized_carenderia boolean default false,
  selling_iodized_restaurant boolean default false,
  selling_iodized_hotel boolean default false,

  -- Selling fortified foods
  selling_fortified_grocery boolean default false,
  selling_fortified_bakery boolean default false,
  selling_fortified_restaurant boolean default false,
  selling_fortified_sari boolean default false,
  selling_fortified_carenderia boolean default false,
  selling_fortified_hotel boolean default false,

  -- Establishments using iodized salt
  establishments_hospital boolean default false,
  establishments_hotel boolean default false,
  establishments_restaurant boolean default false,
  establishments_carenderia boolean default false,
  establishments_bakery boolean default false,
  establishments_grocery boolean default false,
  establishments_sari boolean default false,

  visit_date date,
  notes text,
  environmental_sanitation_photo text,
  status text not null default 'Synced',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (device_id, local_id)
);

alter table public.environmental_sanitation
  add column if not exists male_count integer default 0,
  add column if not exists female_count integer default 0,
  add column if not exists total_population integer default 0,
  add column if not exists hh_with_occupation integer default 0,
  add column if not exists without_potable_water boolean default false,
  add column if not exists water_source text,
  add column if not exists toilet_communal boolean default false,
  add column if not exists toilet_none boolean default false,
  add column if not exists toilet_no boolean default false,
  add column if not exists toilet_type text,
  add column if not exists electricity_owned boolean default false,
  add column if not exists electricity_connected boolean default false,
  add column if not exists has_veg_garden boolean default false,
  add column if not exists has_herbal_garden boolean default false,
  add column if not exists has_backyard_poultry boolean default false,
  add column if not exists has_swine boolean default false,
  add column if not exists has_fish_pond boolean default false,
  add column if not exists uses_iodized_salt boolean default false,
  add column if not exists has_malunggay_tree boolean default false,
  add column if not exists child_re boolean default false,
  add column if not exists father_re boolean default false,
  add column if not exists household_nonsmoker boolean default false,
  add column if not exists household_smoker boolean default false,
  add column if not exists selling_iodized_restaurant boolean default false,
  add column if not exists selling_iodized_hotel boolean default false,
  add column if not exists selling_fortified_sari boolean default false,
  add column if not exists selling_fortified_carenderia boolean default false,
  add column if not exists selling_fortified_hotel boolean default false;

comment on column public.environmental_sanitation.toilet_sanitary is 'WS';
comment on column public.environmental_sanitation.toilet_not_sanitary is 'OP';
comment on column public.environmental_sanitation.toilet_communal is 'Communal';
comment on column public.environmental_sanitation.toilet_none is 'No Sanitary Toilet';

drop view if exists public.environmental_sanitation_purok_totals;

create view public.environmental_sanitation_purok_totals as
select
  purok,
  coalesce(sum(total_hh), 0)::integer as total_hh,
  coalesce(sum(total_families), 0)::integer as total_families,
  coalesce(sum(male_count), 0)::integer as male_count,
  coalesce(sum(female_count), 0)::integer as female_count,
  coalesce(sum(coalesce(total_population, male_count + female_count)), 0)::integer as total_population,
  coalesce(sum(hh_with_occupation), 0)::integer as hh_with_occupation,
  count(*) filter (where toilet_sanitary)::integer as ws,
  count(*) filter (where toilet_not_sanitary)::integer as op,
  count(*) filter (where toilet_communal)::integer as communal,
  count(*) filter (where toilet_none or toilet_type = 'No Sanitary Toilet')::integer as none,
  count(*) filter (where water_level_i or water_source = 'Level I')::integer as water_i,
  count(*) filter (where water_level_ii or water_source = 'Level II')::integer as water_ii,
  count(*) filter (where water_level_iii or water_source = 'Level III')::integer as water_iii,
  count(*) filter (where electricity_owned)::integer as electricity_owned,
  count(*) filter (where electricity_connected)::integer as electricity_connected,
  count(*) filter (where not electricity_owned and not electricity_connected)::integer as electricity_none,
  count(*) filter (where has_veg_garden)::integer as vegetable_garden,
  count(*) filter (where has_herbal_garden)::integer as herbal_garden,
  count(*) filter (where has_backyard_poultry)::integer as backyard_poultry,
  count(*) filter (where has_swine)::integer as swine,
  count(*) filter (where has_fish_pond)::integer as fish_pond,
  count(*) filter (where uses_iodized_salt)::integer as uses_iodized_salt,
  count(*) filter (where has_malunggay_tree)::integer as malunggay_tree,
  count(*) filter (where garbage_collect)::integer as collected,
  count(*) filter (where compost_pit)::integer as compost_pit,
  count(*) filter (where garbage_others)::integer as burned,
  count(*) filter (where household_smoker)::integer as hh_smoker,
  count(*) filter (where household_nonsmoker)::integer as hh_nonsmoker,
  count(*) filter (where father_re)::integer as ch_nl_father,
  count(*) filter (where selling_iodized_sari)::integer as iodized_sari_store,
  count(*) filter (where selling_iodized_grocery)::integer as iodized_grocery_store,
  count(*) filter (where establishments_bakery)::integer as bakery,
  count(*) filter (where establishments_carenderia)::integer as carenderia,
  count(*) filter (where establishments_restaurant)::integer as restaurant,
  count(*) filter (where establishments_hotel)::integer as hotel
from public.environmental_sanitation
group by purok;
