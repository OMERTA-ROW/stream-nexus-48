
CREATE TABLE public.coupon_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  plan text NOT NULL CHECK (plan IN ('free','creator','broadcaster')),
  lifetime boolean NOT NULL DEFAULT true,
  max_uses integer,
  uses integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.coupon_codes TO authenticated;
GRANT ALL ON public.coupon_codes TO service_role;
ALTER TABLE public.coupon_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY coupon_codes_select_auth ON public.coupon_codes FOR SELECT TO authenticated USING (true);

CREATE TABLE public.entitlements (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free','creator','broadcaster')),
  lifetime boolean NOT NULL DEFAULT false,
  source text,
  redeemed_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.entitlements TO authenticated;
GRANT ALL ON public.entitlements TO service_role;
ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY entitlements_select_own ON public.entitlements FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY entitlements_insert_own ON public.entitlements FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY entitlements_update_own ON public.entitlements FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER entitlements_set_updated_at BEFORE UPDATE ON public.entitlements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.coupon_codes (code, plan, lifetime) VALUES ('08/28/89Souljary', 'broadcaster', true);
