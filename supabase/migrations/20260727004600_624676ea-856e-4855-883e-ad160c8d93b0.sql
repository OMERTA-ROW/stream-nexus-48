
CREATE TABLE public.user_channels (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL,
  handle text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform, handle)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_channels TO authenticated;
GRANT ALL ON public.user_channels TO service_role;

ALTER TABLE public.user_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_channels_select_own ON public.user_channels
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_channels_insert_own ON public.user_channels
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_channels_delete_own ON public.user_channels
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
