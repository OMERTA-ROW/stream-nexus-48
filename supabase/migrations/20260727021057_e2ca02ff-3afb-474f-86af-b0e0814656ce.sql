
-- 1. Add owner column to rooms
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS rooms_owner_id_idx ON public.rooms(owner_id);

-- 2. Replace permissive policies on rooms
DROP POLICY IF EXISTS "anyone can create rooms" ON public.rooms;
DROP POLICY IF EXISTS "anyone can read rooms" ON public.rooms;

-- Public SELECT stays: joining by a shared code is intentional.
CREATE POLICY "rooms_select_public"
  ON public.rooms FOR SELECT
  USING (true);

-- Only signed-in users may create rooms, and only for themselves.
CREATE POLICY "rooms_insert_owner"
  ON public.rooms FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

-- Only the owner may delete their room.
CREATE POLICY "rooms_delete_owner"
  ON public.rooms FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_id);

-- 3. Replace permissive policies on room_channels
DROP POLICY IF EXISTS "anyone can add room channels" ON public.room_channels;
DROP POLICY IF EXISTS "anyone can read room channels" ON public.room_channels;
DROP POLICY IF EXISTS "anyone can remove room channels" ON public.room_channels;

-- Restrict channel list reads to signed-in users (was previously public).
CREATE POLICY "room_channels_select_authenticated"
  ON public.room_channels FOR SELECT
  TO authenticated
  USING (true);

-- Only the room's owner can add channels to that room.
CREATE POLICY "room_channels_insert_room_owner"
  ON public.room_channels FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.code = room_channels.room_code
        AND r.owner_id = auth.uid()
    )
  );

-- Only the room's owner can remove channels from that room.
CREATE POLICY "room_channels_delete_room_owner"
  ON public.room_channels FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.code = room_channels.room_code
        AND r.owner_id = auth.uid()
    )
  );
