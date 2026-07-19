
CREATE TABLE public.rooms (
  code text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.rooms TO anon, authenticated;
GRANT ALL ON public.rooms TO service_role;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can read rooms" ON public.rooms FOR SELECT USING (true);
CREATE POLICY "anyone can create rooms" ON public.rooms FOR INSERT WITH CHECK (true);

CREATE TABLE public.room_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code text NOT NULL REFERENCES public.rooms(code) ON DELETE CASCADE,
  platform text NOT NULL,
  handle text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX room_channels_room_code_idx ON public.room_channels(room_code);
GRANT SELECT, INSERT, DELETE ON public.room_channels TO anon, authenticated;
GRANT ALL ON public.room_channels TO service_role;
ALTER TABLE public.room_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can read room channels" ON public.room_channels FOR SELECT USING (true);
CREATE POLICY "anyone can add room channels" ON public.room_channels FOR INSERT WITH CHECK (true);
CREATE POLICY "anyone can remove room channels" ON public.room_channels FOR DELETE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_channels;
