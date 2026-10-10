-- ============================================================================
-- ARBOREAL ARCADE — standalone backend schema
-- Supabase project: arboreal-arcade (ref zuhovlszrohwtdxqrhnx)
-- Drafted 2026-10-06. NOT YET APPLIED — review before running.
--
-- Source: extracted verbatim (final versions) from the Arboreal Planet repo
-- supabase/migrations/:
--   20260926_arcade_poker.sql          (poker + hatchling stakes base)
--   20260927_canopy_hunter_exemptions.sql
--   20260927_stakes_claimed_source.sql (final create_npc_wager + claim fn)
--   20260927_stakes_search_path_fix.sql (folded into function definitions)
--   20260927_unlimited_stake_tokens.sql (final my_tokens + exemptions)
--   20260928_snake_duels_pvp.sql      (snake duels)
--   20260928_stakes_den_blackjack.sql (bj_state + bj_load/bj_save)
--   20260930_poker_arcade_conversion.sql
--   20260930_poker_bailout.sql
--   20261001_canopy_hunter_port_dev.sql
--   20261001_event_codes.sql
--   20261001_keeper_unlimited_spaces.sql
--   20261002_arcade_wallets.sql
--
-- RECONSTRUCTED (not in the Planet repo migrations — created via dashboard
-- before 2026-09-24; shapes inferred from code usage):
--   public.profiles            (minimal: id, role — FK target + staff check)
--   public.chondro_game_saves   (minimal: user_id, state, updated_at)
--   storage bucket lizard-music (public read; exact Planet policy unknown)
--
-- GRANT RULE (Supabase ends auto-grants on new tables Oct 30, 2026):
-- every table below gets revoke-first + minimal explicit grants in this file.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- §0 Extensions — pgcrypto (gen_random_bytes/digest/gen_random_uuid) lives in
-- the "extensions" schema on Supabase; several RPCs set search_path accordingly.
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- ----------------------------------------------------------------------------
-- §1 profiles (MINIMAL reconstruction)
-- Needed as the FK target for arcade_wallets.user_id and
-- event_code_claims.user_id, and for the role lookup in the event_codes
-- staff policy. Planet's full profiles table (usernames, avatars, seller
-- fields) is NOT in the repo migrations; extend this table if the Arcade
-- ever needs those columns. Rows are auto-created on signup via the trigger.
-- ----------------------------------------------------------------------------
-- NOTE: No FK to auth.users — the Arcade API signs a JWT server-side
-- (Arcade JWT secret, sub = the player's Planet user ID), so auth.uid()
-- works in RPCs/RLS without rows existing in auth.users. No user copying.
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  role text NOT NULL DEFAULT 'keeper',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- No signup trigger needed (see note above). Profiles rows are created
-- on first use by the wallet/claims code paths if absent.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS profiles_own_select ON public.profiles;
CREATE POLICY profiles_own_select ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

REVOKE ALL ON TABLE public.profiles FROM public, anon, authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;

-- ----------------------------------------------------------------------------
-- §2 chondro_game_saves (MINIMAL reconstruction)
-- The Keeper save lives in Planet; the Arcade needs this table only for:
--   * GET /api/wagers/collection — reads state (colony + emeraldKeeper.animals)
--     with the player's own JWT to build the stakes claim picker.
--   * redeem_event_code(cash|enclosure) — SECURITY DEFINER read/write of state.
-- Shape inferred from both consumers. If the Keeper save is ever replicated
-- here, this table accepts the full save JSON in `state`.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chondro_game_saves (
  user_id uuid PRIMARY KEY, -- no FK to auth.users (see profiles note above)
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chondro_game_saves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chondro_game_saves_own_select ON public.chondro_game_saves;
CREATE POLICY chondro_game_saves_own_select ON public.chondro_game_saves
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.chondro_game_saves FROM public, anon, authenticated;
GRANT SELECT ON TABLE public.chondro_game_saves TO authenticated;

-- ----------------------------------------------------------------------------
-- §3 SNAKE POKER — lifesap bankroll (soft arcade currency, starts at 1000)
-- Tables: lifesap_bankrolls, lifesap_ledger, poker_rounds
-- No direct client access: all movement goes through the RPCs in §11.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lifesap_bankrolls (
  user_id uuid PRIMARY KEY,
  balance bigint NOT NULL DEFAULT 1000 CHECK (balance >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lifesap_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  delta bigint NOT NULL,
  balance_after bigint NOT NULL,
  game text NOT NULL,
  round_ref uuid,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lifesap_ledger_user_idx ON public.lifesap_ledger (user_id, created_at DESC);

-- Open card rounds: a bet is debited up front; settle credits a bounded payout.
CREATE TABLE IF NOT EXISTS public.poker_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  game text NOT NULL CHECK (game IN ('holdem', 'blackjack', 'draw')),
  bet bigint NOT NULL CHECK (bet > 0),
  added_bet bigint NOT NULL DEFAULT 0 CHECK (added_bet >= 0),
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'settled', 'voided')),
  payout bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '2 hours'
);
CREATE INDEX IF NOT EXISTS poker_rounds_user_state_idx ON public.poker_rounds (user_id, game, state);

ALTER TABLE public.lifesap_bankrolls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lifesap_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poker_rounds ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.lifesap_bankrolls FROM public, anon, authenticated;
REVOKE ALL ON TABLE public.lifesap_ledger FROM public, anon, authenticated;
REVOKE ALL ON TABLE public.poker_rounds FROM public, anon, authenticated;
-- No grants: RPC-only tables.

-- ----------------------------------------------------------------------------
-- §4 HATCHLING STAKES (NPC pilot) — sidecar provenance registry + game state
-- No direct client access: everything flows through the RPCs in §11.
-- NOTE: source CHECK is the widened version (20260927_stakes_claimed_source):
--   'breeder-registered' | 'npc' | 'inventory-claim'
-- NOTE: wagers.game CHECK is the widened version (20260928_snake_duels_pvp):
--   'blackjack' | 'draw' | 'duel'
-- NOTE: game_sessions carries BOTH current_hand (20260926 §4) and bj_state
--   (20260928_stakes_den_blackjack) columns.
-- ----------------------------------------------------------------------------

-- Immutable server-issued proof that breeder X produced clutch Y.
CREATE TABLE IF NOT EXISTS public.hatchling_stakes_breeding_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  breeder uuid NOT NULL,
  clutch_fingerprint text NOT NULL,
  parents jsonb NOT NULL DEFAULT '{}'::jsonb,
  genetics jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (breeder, clutch_fingerprint)
);

-- Canonical asset registry. asset_key is server-issued and survives renames.
CREATE TABLE IF NOT EXISTS public.hatchling_stakes_animals (
  asset_key text PRIMARY KEY,
  producer uuid NOT NULL,
  owner uuid NOT NULL,
  source text NOT NULL CHECK (source IN ('breeder-registered', 'npc', 'inventory-claim')),
  tier text NOT NULL CHECK (tier IN ('sprout', 'vine', 'canopy', 'emergent', 'crown')),
  trait_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'staked', 'transferred', 'retired')),
  breeding_event_id uuid REFERENCES public.hatchling_stakes_breeding_events(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hs_animals_owner_idx ON public.hatchling_stakes_animals (owner, state);

-- Append-only ownership ledger.
CREATE TABLE IF NOT EXISTS public.hatchling_stakes_ownership_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_key text NOT NULL REFERENCES public.hatchling_stakes_animals(asset_key) ON DELETE CASCADE,
  from_user uuid,
  to_user uuid,
  reason text NOT NULL,
  seq int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_key, seq)
);

-- Anti-double-spend sidecar: one active lock per asset.
CREATE TABLE IF NOT EXISTS public.hatchling_stakes_wager_locks (
  asset_key text PRIMARY KEY REFERENCES public.hatchling_stakes_animals(asset_key) ON DELETE CASCADE,
  wager_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'released')),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '1 hour'
);

CREATE TABLE IF NOT EXISTS public.hatchling_stakes_wagers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL DEFAULT 'npc' CHECK (mode IN ('npc', 'keeper')),
  game text NOT NULL DEFAULT 'blackjack' CHECK (game IN ('blackjack', 'draw', 'duel')),
  state text NOT NULL DEFAULT 'locked'
    CHECK (state IN ('draft','open','confirming','locked','in_progress','settling','complete','void','review')),
  rule_version text NOT NULL DEFAULT 'bj-stake-v1',
  creator uuid NOT NULL,
  npc_asset_key text REFERENCES public.hatchling_stakes_animals(asset_key) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hatchling_stakes_wager_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wager_id uuid NOT NULL REFERENCES public.hatchling_stakes_wagers(id) ON DELETE CASCADE,
  actor uuid NOT NULL,
  asset_key text NOT NULL REFERENCES public.hatchling_stakes_animals(asset_key) ON DELETE CASCADE,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (wager_id, actor)
);

CREATE TABLE IF NOT EXISTS public.hatchling_stakes_wager_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wager_id uuid NOT NULL REFERENCES public.hatchling_stakes_wagers(id) ON DELETE CASCADE,
  seq int NOT NULL,
  type text NOT NULL,
  payload_hash text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (wager_id, seq)
);

-- Two weekly entries per account, Monday 00:00 UTC reset, no rollover.
CREATE TABLE IF NOT EXISTS public.hatchling_stakes_tokens (
  user_id uuid NOT NULL,
  week_key text NOT NULL,
  slot int NOT NULL CHECK (slot IN (1, 2)),
  status text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'reserved', 'consumed', 'refunded')),
  wager_id uuid REFERENCES public.hatchling_stakes_wagers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, week_key, slot)
);

-- Server-owned game session: shoe + transcript live here, never the browser.
CREATE TABLE IF NOT EXISTS public.hatchling_stakes_game_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wager_id uuid NOT NULL UNIQUE REFERENCES public.hatchling_stakes_wagers(id) ON DELETE CASCADE,
  seed_commitment text,
  shoe jsonb NOT NULL DEFAULT '[]'::jsonb,
  transcript jsonb NOT NULL DEFAULT '[]'::jsonb,
  player_score int NOT NULL DEFAULT 100,
  target_score int NOT NULL DEFAULT 100,
  hands_played int NOT NULL DEFAULT 0,
  base_bet int NOT NULL DEFAULT 10,
  winner uuid,
  state text NOT NULL DEFAULT 'awaiting_shoe'
    CHECK (state IN ('awaiting_shoe','in_progress','complete','voided')),
  current_hand jsonb NOT NULL DEFAULT '{}'::jsonb,
  bj_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Controlled NPC counter-stake inventory, seasonally capped.
CREATE TABLE IF NOT EXISTS public.hatchling_stakes_npc_inventory (
  asset_key text PRIMARY KEY REFERENCES public.hatchling_stakes_animals(asset_key) ON DELETE CASCADE,
  tier text NOT NULL,
  template text NOT NULL,
  season text NOT NULL,
  state text NOT NULL DEFAULT 'available' CHECK (state IN ('available', 'staked', 'awarded')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Kill switch + tunables.
CREATE TABLE IF NOT EXISTS public.hatchling_stakes_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Founder/testing exemption list for unlimited wager tokens.
CREATE TABLE IF NOT EXISTS public.hatchling_stakes_token_exemptions (
  user_id uuid PRIMARY KEY,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hatchling_stakes_breeding_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hatchling_stakes_animals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hatchling_stakes_ownership_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hatchling_stakes_wager_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hatchling_stakes_wagers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hatchling_stakes_wager_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hatchling_stakes_wager_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hatchling_stakes_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hatchling_stakes_game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hatchling_stakes_npc_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hatchling_stakes_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hatchling_stakes_token_exemptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.hatchling_stakes_breeding_events FROM public, anon, authenticated;
REVOKE ALL ON TABLE public.hatchling_stakes_animals FROM public, anon, authenticated;
REVOKE ALL ON TABLE public.hatchling_stakes_ownership_events FROM public, anon, authenticated;
REVOKE ALL ON TABLE public.hatchling_stakes_wager_locks FROM public, anon, authenticated;
REVOKE ALL ON TABLE public.hatchling_stakes_wagers FROM public, anon, authenticated;
REVOKE ALL ON TABLE public.hatchling_stakes_wager_entries FROM public, anon, authenticated;
REVOKE ALL ON TABLE public.hatchling_stakes_wager_events FROM public, anon, authenticated;
REVOKE ALL ON TABLE public.hatchling_stakes_tokens FROM public, anon, authenticated;
REVOKE ALL ON TABLE public.hatchling_stakes_game_sessions FROM public, anon, authenticated;
REVOKE ALL ON TABLE public.hatchling_stakes_npc_inventory FROM public, anon, authenticated;
REVOKE ALL ON TABLE public.hatchling_stakes_config FROM public, anon, authenticated;
REVOKE ALL ON TABLE public.hatchling_stakes_token_exemptions FROM public, anon, authenticated;
-- No grants: RPC-only tables.

-- ----------------------------------------------------------------------------
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

