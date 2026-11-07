ALTER TABLE public.monthly_natality
ADD COLUMN IF NOT EXISTS mother_birthday date;
