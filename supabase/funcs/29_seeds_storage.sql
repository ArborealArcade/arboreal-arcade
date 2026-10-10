-- ============================================================================
-- §10 SEED DATA (idempotent; auth.users email lookups are no-ops when absent)
-- ============================================================================

INSERT INTO public.hatchling_stakes_config (key, value) VALUES
  ('stakes_enabled', 'true'),
  ('npc_monthly_cap_per_tier', '50')
ON CONFLICT (key) DO NOTHING;

-- Inactive example so the table shape is obvious in the dashboard.
INSERT INTO public.event_codes (code, reward_kind, reward_amount, label, active)
VALUES ('EVENT-EXAMPLE', 'cash', 500, 'Example reward: 500 Keeper cash', false)
ON CONFLICT (code) DO NOTHING;

-- Founder exemption: unlimited free Canopy Hunter expeditions.
INSERT INTO public.canopy_hunter_exemptions (user_id, reason)
SELECT id, 'founder: unlimited free canopy hunter expeditions'
FROM auth.users
WHERE email = 'gageallanbunn@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

-- Founder exemption: unlimited staking tokens.
INSERT INTO public.hatchling_stakes_token_exemptions (user_id, reason)
SELECT id, 'founder: unlimited staking tokens'
FROM auth.users
WHERE email = 'gageallanbunn@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

-- Owner playtest gate for the Canopy Hunter river port stop.
INSERT INTO public.canopy_hunter_port_devs (user_id, reason)
SELECT id, 'Owner playtest gate — remove the row to revoke.'
FROM auth.users
WHERE email IN ('gageallanbunn@gmail.com', 'arborealsbybunn@gmail.com')
ON CONFLICT (user_id) DO NOTHING;

-- Founder exemption: unlimited snake housing spaces.
INSERT INTO public.keeper_unlimited_spaces (user_id, reason)
SELECT id, 'founder: unlimited snake housing spaces'
FROM auth.users
WHERE lower(email) = 'arborealsbybunn@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================================
-- §11 STORAGE BUCKETS
-- arcade-card-art: public card art for Snake Poker (15 JPGs, uploaded separately).
-- lizard-music: Arboreal Radio MP3s (reconstructed — Planet created this via
--   dashboard; exact Planet storage policies unknown, public read assumed).
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('arcade-card-art', 'arcade-card-art', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('lizard-music', 'lizard-music', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "arcade card art public read" ON storage.objects;
CREATE POLICY "arcade card art public read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'arcade-card-art');

DROP POLICY IF EXISTS "lizard music public read" ON storage.objects;
CREATE POLICY "lizard music public read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'lizard-music');

-- ============================================================================
-- END — verify with:
--   select tablename from pg_tables where schemaname='public' order by 1;
--   select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--     where n.nspname='public' order by 1;
-- ============================================================================
