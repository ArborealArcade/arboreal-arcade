-- Arcade feature flags (e.g. seasonal shop theme for the Arcade loading screen).
-- Values are public; only the owner may write them.
-- Mirrors Planet's supabase/migrations/20260930_site_settings.sql; the table
-- is renamed to arcade_settings so the Arcade owns its own flags.
-- Standing grant rule: revoke-first + minimal explicit grants in this file.

CREATE TABLE public.arcade_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.arcade_settings ENABLE ROW LEVEL SECURITY;

-- Public read: these are feature flags, safe for everyone.
DROP POLICY IF EXISTS arcade_settings_public_select ON public.arcade_settings;
CREATE POLICY arcade_settings_public_select ON public.arcade_settings
  FOR SELECT TO anon, authenticated
  USING (true);

-- Writes are owner-only (role checked against public.profiles; the Arcade
-- API signs a JWT server-side with sub = Planet user ID, so auth.uid()
-- resolves without rows in auth.users).
DROP POLICY IF EXISTS arcade_settings_owner_insert ON public.arcade_settings;
CREATE POLICY arcade_settings_owner_insert ON public.arcade_settings
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'owner');

DROP POLICY IF EXISTS arcade_settings_owner_update ON public.arcade_settings;
CREATE POLICY arcade_settings_owner_update ON public.arcade_settings
  FOR UPDATE TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'owner')
  WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'owner');

DROP POLICY IF EXISTS arcade_settings_owner_delete ON public.arcade_settings;
CREATE POLICY arcade_settings_owner_delete ON public.arcade_settings
  FOR DELETE TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'owner');

REVOKE ALL ON TABLE public.arcade_settings FROM public, anon, authenticated;
GRANT SELECT ON TABLE public.arcade_settings TO anon, authenticated;

-- Seed the current live value (matches Planet's shop_theme as of 2026-10-08).
INSERT INTO public.arcade_settings (key, value)
VALUES ('shop_theme', '"halloween"'::jsonb)
ON CONFLICT (key) DO NOTHING;
