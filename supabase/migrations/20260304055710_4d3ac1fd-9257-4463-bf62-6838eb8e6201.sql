
-- Add user_id column to nugget_history
ALTER TABLE public.nugget_history ADD COLUMN IF NOT EXISTS user_id uuid;

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Allow all access" ON public.nugget_history;

-- Enable RLS (ensure it's on)
ALTER TABLE public.nugget_history ENABLE ROW LEVEL SECURITY;

-- Scoped policies: authenticated users access only their own rows
CREATE POLICY "Users can view own nugget history"
  ON public.nugget_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own nugget history"
  ON public.nugget_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own nugget history"
  ON public.nugget_history FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own nugget history"
  ON public.nugget_history FOR DELETE
  USING (auth.uid() = user_id);
