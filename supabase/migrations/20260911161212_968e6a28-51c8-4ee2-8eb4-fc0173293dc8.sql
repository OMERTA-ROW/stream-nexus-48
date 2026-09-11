DROP POLICY IF EXISTS "room_channels_select_authenticated" ON public.room_channels;

CREATE POLICY "room_channels_select_shared_room"
  ON public.room_channels
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.rooms r
      WHERE r.code = room_channels.room_code
    )
  );

GRANT SELECT ON public.room_channels TO anon;
GRANT SELECT, INSERT, DELETE ON public.room_channels TO authenticated;