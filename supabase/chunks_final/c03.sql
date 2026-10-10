-- §5 SNAKE DUELS — keeper-vs-keeper Texas Hold'em (uses the Stakes tables)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.snake_duels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL DEFAULT 'open'
    CHECK (state IN ('open', 'in_progress', 'settling', 'complete', 'expired', 'void')),
  tier text NOT NULL CHECK (tier IN ('sprout', 'vine', 'canopy')),
  challenger uuid NOT NULL,
  opponent uuid,
  challenger_snake text NOT NULL,
  opponent_snake text,
  challenger_hole jsonb,
  opponent_hole jsonb,
  deck jsonb,
  challenger_decision text CHECK (challenger_decision IN ('run', 'fold')),
  opponent_decision text CHECK (opponent_decision IN ('run', 'fold')),
  winner uuid,
  win_reason text CHECK (win_reason IN ('fold', 'showdown', 'tie')),
  winning_hand text,
  wager_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '48 hours'
);
CREATE INDEX IF NOT EXISTS snake_duels_challenger_idx ON public.snake_duels (challenger, state);
CREATE INDEX IF NOT EXISTS snake_duels_opponent_idx ON public.snake_duels (opponent, state);
CREATE INDEX IF NOT EXISTS snake_duels_state_idx ON public.snake_duels (state, expires_at);

ALTER TABLE public.snake_duels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS snake_duels_no_direct_access ON public.snake_duels;
CREATE POLICY snake_duels_no_direct_access ON public.snake_duels
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public.snake_duels FROM public, anon, authenticated;
-- No grants: RPC-only table.

-- Evaluated 5-card hand type: lexicographic int[] score + display name.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'snake_duels_eval') THEN
    CREATE TYPE public.snake_duels_eval AS (score int[], name text);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- §6 ARCADE WALLETS — token wallets follow the account, not the device
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.arcade_wallets (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.arcade_wallets ENABLE ROW LEVEL SECURITY;

-- Keepers read and grow only their own wallet; the RPCs in §11 do the writes.
DROP POLICY IF EXISTS arcade_wallets_own_select ON public.arcade_wallets;
CREATE POLICY arcade_wallets_own_select ON public.arcade_wallets
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS arcade_wallets_own_insert ON public.arcade_wallets;
CREATE POLICY arcade_wallets_own_insert ON public.arcade_wallets
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS arcade_wallets_own_update ON public.arcade_wallets;
CREATE POLICY arcade_wallets_own_update ON public.arcade_wallets
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

REVOKE ALL ON TABLE public.arcade_wallets FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.arcade_wallets TO authenticated;

-- ----------------------------------------------------------------------------
-- §7 EVENT CODES — owner-created redeemable codes for the Arcade
-- Codes are never readable by players directly — redemption goes through the
-- SECURITY DEFINER redeem_event_code function so active codes can't be
-- enumerated. reward_kind: 'cash' | 'tokens' | 'enclosure'.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_codes (
  code text PRIMARY KEY,
  reward_kind text NOT NULL CHECK (reward_kind IN ('cash', 'tokens', 'enclosure')),
  reward_amount integer,
  reward_value text,
  label text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  expires_at timestamptz,
  max_claims integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.event_code_claims (
  code text NOT NULL REFERENCES public.event_codes(code) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (code, user_id)
);

ALTER TABLE public.event_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_code_claims ENABLE ROW LEVEL SECURITY;

-- Codes are managed by staff only; players never read this table.
DROP POLICY IF EXISTS event_codes_staff_all ON public.event_codes;
CREATE POLICY event_codes_staff_all ON public.event_codes
  FOR ALL TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'owner'))
  WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'owner'));

-- Players may see their own claims; staff may see all.
DROP POLICY IF EXISTS event_code_claims_select ON public.event_code_claims;
CREATE POLICY event_code_claims_select ON public.event_code_claims
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'owner')
  );

REVOKE ALL ON TABLE public.event_codes FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_codes TO authenticated;
REVOKE ALL ON TABLE public.event_code_claims FROM public, anon, authenticated;
GRANT SELECT ON TABLE public.event_code_claims TO authenticated;

-- ----------------------------------------------------------------------------
-- §8 EXEMPTION / GATE TABLES — server-side allowlists, no direct client access
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.canopy_hunter_exemptions (
  user_id uuid PRIMARY KEY,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.canopy_hunter_port_devs (
  user_id uuid PRIMARY KEY,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.keeper_unlimited_spaces (
  user_id uuid PRIMARY KEY,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.canopy_hunter_exemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canopy_hunter_port_devs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keeper_unlimited_spaces ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.canopy_hunter_exemptions FROM public, anon, authenticated;
REVOKE ALL ON TABLE public.canopy_hunter_port_devs FROM public, anon, authenticated;
REVOKE ALL ON TABLE public.keeper_unlimited_spaces FROM public, anon, authenticated;
-- No grants: RPC-only tables.

