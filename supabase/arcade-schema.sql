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

-- ============================================================================
-- §9 RPC FUNCTIONS (all SECURITY DEFINER; called with the player's own JWT)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Poker / lifesap
-- ----------------------------------------------------------------------------

-- Return the caller's bankroll, creating it at 1000 on first use.
CREATE OR REPLACE FUNCTION public.lifesap_get_bankroll()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance bigint;
BEGIN
  INSERT INTO public.lifesap_bankrolls (user_id, balance)
  VALUES (auth.uid(), 1000)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT balance INTO v_balance FROM public.lifesap_bankrolls WHERE user_id = auth.uid();
  RETURN v_balance;
END;
$$;
REVOKE ALL ON FUNCTION public.lifesap_get_bankroll() FROM public;
GRANT EXECUTE ON FUNCTION public.lifesap_get_bankroll() TO authenticated;

-- Table limits (per game) and max payout multipliers (× bet, incl. returned stake).
-- These bounds are the anti-mint: the client reports a hand result, the server
-- caps what it can be worth.
CREATE OR REPLACE FUNCTION public.poker_game_limits(p_game text)
RETURNS TABLE (max_bet bigint, max_payout_mult numeric)
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  CASE p_game
    WHEN 'holdem' THEN RETURN QUERY SELECT 1000::bigint, 6::numeric;
    WHEN 'blackjack' THEN RETURN QUERY SELECT 500::bigint, 12::numeric;
    WHEN 'draw' THEN RETURN QUERY SELECT 50::bigint, 30000::numeric;
    ELSE RAISE EXCEPTION 'unknown game %', p_game;
  END CASE;
END;
$$;

-- Debit a bet and open a round. Voids (refunds) the caller's expired open rounds first.
CREATE OR REPLACE FUNCTION public.poker_place_bet(p_game text, p_bet bigint)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_bet bigint;
  v_balance bigint;
  v_round_id uuid;
  v_exp interval;
BEGIN
  IF p_game NOT IN ('holdem', 'blackjack', 'draw') THEN
    RAISE EXCEPTION 'unknown game %', p_game;
  END IF;
  SELECT max_bet INTO v_max_bet FROM public.poker_game_limits(p_game);
  IF p_bet IS NULL OR p_bet <= 0 OR p_bet > v_max_bet THEN
    RAISE EXCEPTION 'bet out of range';
  END IF;

  INSERT INTO public.lifesap_bankrolls (user_id, balance)
  VALUES (auth.uid(), 1000)
  ON CONFLICT (user_id) DO NOTHING;

  -- Refund expired open rounds before opening a new one.
  UPDATE public.poker_rounds
  SET state = 'voided', updated_at = now()
  WHERE user_id = auth.uid() AND state = 'open' AND expires_at < now();

  UPDATE public.lifesap_bankrolls b
  SET balance = b.balance + r.bet + r.added_bet, updated_at = now()
  FROM public.poker_rounds r
  WHERE r.user_id = auth.uid() AND r.state = 'voided' AND r.payout IS NULL
    AND b.user_id = auth.uid()
    AND r.updated_at > now() - interval '1 minute';
  -- Mark refunded so the sweep above never double-refunds.
  UPDATE public.poker_rounds
  SET payout = 0
  WHERE user_id = auth.uid() AND state = 'voided' AND payout IS NULL
    AND updated_at > now() - interval '1 minute';

  IF EXISTS (SELECT 1 FROM public.poker_rounds
             WHERE user_id = auth.uid() AND game = p_game AND state = 'open') THEN
    RAISE EXCEPTION 'settle your open % round first', p_game;
  END IF;

  SELECT balance INTO v_balance FROM public.lifesap_bankrolls WHERE user_id = auth.uid();
  IF v_balance < p_bet THEN
    RAISE EXCEPTION 'insufficient lifesap';
  END IF;

  v_exp := CASE WHEN p_game = 'holdem' THEN interval '24 hours' ELSE interval '2 hours' END;

  UPDATE public.lifesap_bankrolls
  SET balance = balance - p_bet, updated_at = now()
  WHERE user_id = auth.uid();

  INSERT INTO public.poker_rounds (user_id, game, bet, expires_at)
  VALUES (auth.uid(), p_game, p_bet, now() + v_exp)
  RETURNING id INTO v_round_id;

  INSERT INTO public.lifesap_ledger (user_id, delta, balance_after, game, round_ref, reason)
  VALUES (auth.uid(), -p_bet, v_balance - p_bet, p_game, v_round_id, 'bet placed');

  RETURN v_round_id;
END;
$$;
REVOKE ALL ON FUNCTION public.poker_place_bet(text, bigint) FROM public;
GRANT EXECUTE ON FUNCTION public.poker_place_bet(text, bigint) TO authenticated;

-- Hold'em rebuys top up the open round's stake (capped).
CREATE OR REPLACE FUNCTION public.poker_add_rebuy(p_round_id uuid, p_amount bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance bigint;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 1000 THEN
    RAISE EXCEPTION 'rebuy out of range';
  END IF;
  SELECT balance INTO v_balance FROM public.lifesap_bankrolls WHERE user_id = auth.uid();
  IF v_balance IS NULL OR v_balance < p_amount THEN
    RAISE EXCEPTION 'insufficient lifesap';
  END IF;
  UPDATE public.poker_rounds
  SET added_bet = added_bet + p_amount, updated_at = now()
  WHERE id = p_round_id AND user_id = auth.uid() AND game = 'holdem' AND state = 'open'
    AND bet + added_bet + p_amount <= 3000;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no open holdem round for rebuy';
  END IF;
  UPDATE public.lifesap_bankrolls SET balance = balance - p_amount, updated_at = now()
  WHERE user_id = auth.uid();
  INSERT INTO public.lifesap_ledger (user_id, delta, balance_after, game, round_ref, reason)
  VALUES (auth.uid(), -p_amount, v_balance - p_amount, 'holdem', p_round_id, 'rebuy');
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.poker_add_rebuy(uuid, bigint) FROM public;
GRANT EXECUTE ON FUNCTION public.poker_add_rebuy(uuid, bigint) TO authenticated;

-- Credit a bounded payout for an open round. The client reports the result;
-- the server caps what it can be worth (see poker_game_limits).
-- p_risked (blackjack only): total lifesap actually put at risk this hand
-- (doubles/splits/insurance). The server debits any risk beyond the opening
-- bet first, then bounds the payout at 2.5x risked (blackjack pays 3:2).
CREATE OR REPLACE FUNCTION public.poker_settle_round(p_round_id uuid, p_payout bigint, p_risked bigint DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.poker_rounds%ROWTYPE;
  v_max_mult numeric;
  v_max_payout bigint;
  v_balance bigint;
  v_risked bigint;
  v_extra bigint;
BEGIN
  SELECT * INTO r FROM public.poker_rounds
  WHERE id = p_round_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'round not found';
  END IF;
  IF r.state <> 'open' THEN
    RAISE EXCEPTION 'round already settled';
  END IF;

  IF r.game = 'blackjack' AND p_risked IS NOT NULL THEN
    -- Blackjack: risk is only known once the hand is played.
    v_risked := p_risked;
    IF v_risked < r.bet OR v_risked > r.bet * 5 THEN
      RAISE EXCEPTION 'risk out of bounds';
    END IF;
    v_extra := v_risked - r.bet;
    SELECT balance INTO v_balance FROM public.lifesap_bankrolls WHERE user_id = auth.uid() FOR UPDATE;
    IF v_balance < v_extra THEN
      RAISE EXCEPTION 'insufficient lifesap';
    END IF;
    IF v_extra > 0 THEN
      UPDATE public.lifesap_bankrolls SET balance = balance - v_extra, updated_at = now()
      WHERE user_id = auth.uid();
      INSERT INTO public.lifesap_ledger (user_id, delta, balance_after, game, round_ref, reason)
      VALUES (auth.uid(), -v_extra, v_balance - v_extra, r.game, p_round_id, 'extra risk (double/split/insurance)');
      v_balance := v_balance - v_extra;
    END IF;
    v_max_payout := floor(v_risked * 2.5)::bigint;
  ELSE
    SELECT max_payout_mult INTO v_max_mult FROM public.poker_game_limits(r.game);
    v_max_payout := floor((r.bet + r.added_bet) * v_max_mult)::bigint;
  END IF;

  IF p_payout IS NULL OR p_payout < 0 OR p_payout > v_max_payout THEN
    RAISE EXCEPTION 'payout out of bounds';
  END IF;

  UPDATE public.poker_rounds
  SET state = 'settled', payout = p_payout, updated_at = now()
  WHERE id = p_round_id;

  UPDATE public.lifesap_bankrolls
  SET balance = balance + p_payout, updated_at = now()
  WHERE user_id = auth.uid()
  RETURNING balance INTO v_balance;

  INSERT INTO public.lifesap_ledger (user_id, delta, balance_after, game, round_ref, reason)
  VALUES (auth.uid(), p_payout, v_balance, r.game, p_round_id, 'round settled');

  RETURN v_balance;
END;
$$;
REVOKE ALL ON FUNCTION public.poker_settle_round(uuid, bigint, bigint) FROM public;
GRANT EXECUTE ON FUNCTION public.poker_settle_round(uuid, bigint, bigint) TO authenticated;

-- Arcade cashier: convert lifesap into arcade tokens.
-- Debits the caller's bankroll directly (no game round is opened) and records the
-- debit in lifesap_ledger with reason 'arcade conversion'. The token credit happens
-- client-side in the arcade wallet; the server only burns the lifesap.
-- Rate is enforced client-side (100 lifesap = 1 token); the server only enforces
-- that the amount is a positive multiple of 100, within a per-call cap, and that
-- at least 500 lifesap stays in the stack so the keeper can keep playing.
CREATE OR REPLACE FUNCTION public.poker_convert_lifesap(p_amount bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance bigint;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount % 100 <> 0 THEN
    RAISE EXCEPTION 'conversion amount must be a positive multiple of 100';
  END IF;
  IF p_amount > 10000 THEN
    RAISE EXCEPTION 'conversion capped at 10000 lifesap per call';
  END IF;

  INSERT INTO public.lifesap_bankrolls (user_id, balance)
  VALUES (auth.uid(), 1000)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance INTO v_balance FROM public.lifesap_bankrolls WHERE user_id = auth.uid();
  IF v_balance IS NULL OR v_balance - p_amount < 500 THEN
    RAISE EXCEPTION 'insufficient lifesap (500 must stay in your stack)';
  END IF;

  UPDATE public.lifesap_bankrolls
  SET balance = balance - p_amount, updated_at = now()
  WHERE user_id = auth.uid();

  INSERT INTO public.lifesap_ledger (user_id, delta, balance_after, game, round_ref, reason)
  VALUES (auth.uid(), -p_amount, v_balance - p_amount, 'cashier', NULL, 'arcade conversion');

  RETURN v_balance - p_amount;
END;
$$;
REVOKE ALL ON FUNCTION public.poker_convert_lifesap(bigint) FROM public;
GRANT EXECUTE ON FUNCTION public.poker_convert_lifesap(bigint) TO authenticated;

-- Bust-out bailout: a signed-in keeper whose stack falls under 100 lifesap can
-- claim a top-up back to 500 once per calendar day (server UTC). This keeps a
-- busted player in the game without creating a farmable token faucet: the
-- conversion floor (500 must stay in the stack) means bailout lifesap can only
-- become tokens after genuine winnings at the tables.
CREATE OR REPLACE FUNCTION public.poker_claim_bailout()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance bigint;
BEGIN
  INSERT INTO public.lifesap_bankrolls (user_id, balance)
  VALUES (auth.uid(), 1000)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance INTO v_balance FROM public.lifesap_bankrolls WHERE user_id = auth.uid();

  IF v_balance IS NULL OR v_balance >= 100 THEN
    RAISE EXCEPTION 'bailout only when busted (under 100 lifesap)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.lifesap_ledger
    WHERE user_id = auth.uid()
      AND reason = 'daily bailout'
      AND created_at >= date_trunc('day', now())
  ) THEN
    RAISE EXCEPTION 'bailout already claimed today';
  END IF;

  UPDATE public.lifesap_bankrolls
  SET balance = 500, updated_at = now()
  WHERE user_id = auth.uid();

  INSERT INTO public.lifesap_ledger (user_id, delta, balance_after, game, round_ref, reason)
  VALUES (auth.uid(), 500 - v_balance, 500, 'cashier', NULL, 'daily bailout');

  RETURN 500;
END;
$$;
REVOKE ALL ON FUNCTION public.poker_claim_bailout() FROM public;
GRANT EXECUTE ON FUNCTION public.poker_claim_bailout() TO authenticated;

-- ----------------------------------------------------------------------------
-- Hatchling Stakes
-- (search_path = public, extensions wherever pgcrypto helpers are used —
-- folds in 20260927_stakes_search_path_fix.sql)
-- ----------------------------------------------------------------------------

-- Weekly token ledger for the caller (creates this week's two slots).
-- Exempt callers get 'unlimited: true' and skip token consumption.
CREATE OR REPLACE FUNCTION public.hatchling_stakes_my_tokens()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week text := to_char(date_trunc('week', now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD');
  v_next timestamptz := date_trunc('week', now() AT TIME ZONE 'UTC') + interval '7 days';
  v_exempt boolean;
  v_tokens jsonb;
BEGIN
  INSERT INTO public.hatchling_stakes_tokens (user_id, week_key, slot)
  VALUES (auth.uid(), v_week, 1), (auth.uid(), v_week, 2)
  ON CONFLICT (user_id, week_key, slot) DO NOTHING;
  SELECT EXISTS (
    SELECT 1 FROM public.hatchling_stakes_token_exemptions WHERE user_id = auth.uid()
  ) INTO v_exempt;
  SELECT jsonb_agg(jsonb_build_object('slot', slot, 'status', status, 'wager_id', wager_id)
                    ORDER BY slot)
    INTO v_tokens
    FROM public.hatchling_stakes_tokens
    WHERE user_id = auth.uid() AND week_key = v_week;
  RETURN jsonb_build_object(
    'week_key', v_week,
    'resets_at', v_next,
    'unlimited', v_exempt,
    'tokens', v_tokens
  );
END;
$$;
REVOKE ALL ON FUNCTION public.hatchling_stakes_my_tokens() FROM public;
GRANT EXECUTE ON FUNCTION public.hatchling_stakes_my_tokens() TO authenticated;

-- Animals the caller may stake: server-registered, producer = owner = caller,
-- active, and not currently locked.
CREATE OR REPLACE FUNCTION public.hatchling_stakes_eligible_animals()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'asset_key', a.asset_key,
      'tier', a.tier,
      'trait_snapshot', a.trait_snapshot,
      'created_at', a.created_at
    ) ORDER BY a.created_at DESC)
    FROM public.hatchling_stakes_animals a
    WHERE a.producer = auth.uid()
      AND a.owner = auth.uid()
      AND a.source = 'breeder-registered'
      AND a.state = 'active'
      AND NOT EXISTS (SELECT 1 FROM public.hatchling_stakes_wager_locks l
                      WHERE l.asset_key = a.asset_key AND l.state = 'active')
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.hatchling_stakes_eligible_animals() FROM public;
GRANT EXECUTE ON FUNCTION public.hatchling_stakes_eligible_animals() TO authenticated;

-- Register a bred clutch. Idempotent per (breeder, clutch_fingerprint): a rolled-back
-- or re-submitted save returns the SAME canonical assets, never duplicates.
-- p_offspring: jsonb array of {name, tier, traits}.
CREATE OR REPLACE FUNCTION public.hatchling_stakes_register_offspring(
  p_clutch_fingerprint text,
  p_parents jsonb,
  p_offspring jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_event_id uuid;
  v_assets jsonb := '[]'::jsonb;
  o jsonb;
  v_key text;
BEGIN
  IF p_clutch_fingerprint IS NULL OR length(p_clutch_fingerprint) > 200 THEN
    RAISE EXCEPTION 'bad fingerprint';
  END IF;
  IF p_offspring IS NULL OR jsonb_array_length(p_offspring) = 0
     OR jsonb_array_length(p_offspring) > 40 THEN
    RAISE EXCEPTION 'bad offspring list';
  END IF;

  SELECT id INTO v_event_id FROM public.hatchling_stakes_breeding_events
  WHERE breeder = auth.uid() AND clutch_fingerprint = p_clutch_fingerprint;

  IF v_event_id IS NULL THEN
    INSERT INTO public.hatchling_stakes_breeding_events (breeder, clutch_fingerprint, parents)
    VALUES (auth.uid(), p_clutch_fingerprint, COALESCE(p_parents, '{}'::jsonb))
    RETURNING id INTO v_event_id;

    FOR o IN SELECT * FROM jsonb_array_elements(p_offspring) LOOP
      IF COALESCE(o->>'tier', '') NOT IN ('sprout','vine','canopy','emergent','crown') THEN
        RAISE EXCEPTION 'bad tier';
      END IF;
      v_key := 'hs-' || encode(gen_random_bytes(16), 'hex');
      INSERT INTO public.hatchling_stakes_animals
        (asset_key, producer, owner, source, tier, trait_snapshot, breeding_event_id)
      VALUES (v_key, auth.uid(), auth.uid(), 'breeder-registered', o->>'tier',
              jsonb_build_object('name', left(COALESCE(o->>'name','Hatchling'), 80),
                                 'traits', COALESCE(o->'traits', '{}'::jsonb)),
              v_event_id);
      v_assets := v_assets || jsonb_build_object('asset_key', v_key, 'tier', o->>'tier',
                                                'name', left(COALESCE(o->>'name','Hatchling'), 80));
    END LOOP;
  ELSE
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'asset_key', asset_key, 'tier', tier,
      'name', trait_snapshot->>'name') ORDER BY created_at), '[]'::jsonb)
    INTO v_assets
    FROM public.hatchling_stakes_animals WHERE breeding_event_id = v_event_id;
  END IF;

  RETURN jsonb_build_object('breeding_event_id', v_event_id, 'assets', v_assets);
END;
$$;
REVOKE ALL ON FUNCTION public.hatchling_stakes_register_offspring(text, jsonb, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.hatchling_stakes_register_offspring(text, jsonb, jsonb) TO authenticated;

-- Claim a snake from the keeper collection into the stakes registry.
-- (Recorded from the live dashboard implementation in 20260927_stakes_claimed_source.)
CREATE OR REPLACE FUNCTION public.hatchling_stakes_claim_inventory_animal(
  p_name text, p_tier text, p_life_stage text, p_traits jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_key text := 'inv-' || gen_random_uuid()::text;
    v_name text := substr(trim(p_name), 1, 80);
    v_snapshot jsonb;
BEGIN
    IF v_name = '' THEN
        RAISE EXCEPTION 'name is required';
    END IF;
    IF p_tier NOT IN ('sprout', 'vine', 'canopy', 'emergent', 'crown') THEN
        RAISE EXCEPTION 'unknown tier';
    END IF;
    IF p_life_stage NOT IN ('neonate', 'juvenile', 'subadult', 'adult') THEN
        RAISE EXCEPTION 'unknown life stage';
    END IF;
    v_snapshot := jsonb_build_object(
        'name', v_name,
        'life_stage', p_life_stage,
        'origin', 'inventory-claim'
    ) || COALESCE(p_traits, '{}'::jsonb);
    INSERT INTO public.hatchling_stakes_animals
        (asset_key, producer, owner, source, tier, state, trait_snapshot, breeding_event_id)
    VALUES (v_key, auth.uid(), auth.uid(), 'inventory-claim', p_tier, 'active', v_snapshot, NULL);
    RETURN jsonb_build_object('asset_key', v_key, 'tier', p_tier, 'trait_snapshot', v_snapshot);
END;
$function$;
REVOKE ALL ON FUNCTION public.hatchling_stakes_claim_inventory_animal(text, text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.hatchling_stakes_claim_inventory_animal(text, text, text, jsonb) TO authenticated;

-- Create an NPC wager for the caller's staked hatchling, mints a same-tier
-- canonical NPC hatchling (seasonally capped), and opens the server-owned
-- game session. Idempotent per player asset lock.
-- Exempt callers skip the weekly token reservation entirely.
-- FINAL version (20260927_stakes_claimed_source): accepts 'inventory-claim'
-- snakes as well as 'breeder-registered'.
CREATE OR REPLACE FUNCTION public.hatchling_stakes_create_npc_wager(p_asset_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_enabled text;
  v_week text := to_char(date_trunc('week', now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD');
  v_token_slot int;
  v_exempt boolean;
  v_tier text;
  v_snapshot jsonb;
  v_wager_id uuid;
  v_npc_key text;
  v_season text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
  v_cap int;
  v_npc_count int;
  v_npc_template text;
  v_npc_name text;
BEGIN
  SELECT value INTO v_enabled FROM public.hatchling_stakes_config WHERE key = 'stakes_enabled';
  IF v_enabled IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'hatchling stakes are paused';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.hatchling_stakes_token_exemptions WHERE user_id = auth.uid()
  ) INTO v_exempt;

  IF NOT v_exempt THEN
    INSERT INTO public.hatchling_stakes_tokens (user_id, week_key, slot)
    VALUES (auth.uid(), v_week, 1), (auth.uid(), v_week, 2)
    ON CONFLICT (user_id, week_key, slot) DO NOTHING;

    SELECT slot INTO v_token_slot FROM public.hatchling_stakes_tokens
    WHERE user_id = auth.uid() AND week_key = v_week AND status = 'available'
    ORDER BY slot LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'no wager tokens left this week';
    END IF;
  END IF;

  SELECT tier, trait_snapshot INTO v_tier, v_snapshot
  FROM public.hatchling_stakes_animals
  WHERE asset_key = p_asset_key AND producer = auth.uid() AND owner = auth.uid()
    AND source IN ('breeder-registered', 'inventory-claim') AND state = 'active' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'animal not eligible';
  END IF;
  IF v_tier NOT IN ('sprout', 'vine', 'canopy') THEN
    RAISE EXCEPTION 'tier not open in the NPC pilot';
  END IF;
  IF EXISTS (SELECT 1 FROM public.hatchling_stakes_wager_locks
             WHERE asset_key = p_asset_key AND state = 'active') THEN
    RAISE EXCEPTION 'animal already staked';
  END IF;

  SELECT value::int INTO v_cap FROM public.hatchling_stakes_config
  WHERE key = 'npc_monthly_cap_per_tier';
  SELECT count(*) INTO v_npc_count FROM public.hatchling_stakes_npc_inventory
  WHERE tier = v_tier AND season = v_season;
  IF v_npc_count >= v_cap THEN
    RAISE EXCEPTION 'no NPC counter-stakes left this season';
  END IF;

  -- Mint the canonical NPC asset (never from a player save).
  v_npc_key := 'hs-npc-' || encode(gen_random_bytes(16), 'hex');
  v_npc_template := CASE v_tier
    WHEN 'sprout' THEN 'Canopy wildling'
    WHEN 'vine' THEN 'Riverbend yearling'
    ELSE 'Emergent line prospect' END;
  v_npc_name := CASE v_tier
    WHEN 'sprout' THEN 'Wildling'
    WHEN 'vine' THEN 'River pup'
    ELSE 'Canopy prospect' END;
  INSERT INTO public.hatchling_stakes_animals
    (asset_key, producer, owner, source, tier, trait_snapshot, state)
  VALUES (v_npc_key, '00000000-0000-0000-0000-000000000000',
          '00000000-0000-0000-0000-000000000000', 'npc', v_tier,
          jsonb_build_object('name', v_npc_name, 'traits', '{}'::jsonb,
                             'template', v_npc_template), 'staked');
  INSERT INTO public.hatchling_stakes_npc_inventory (asset_key, tier, template, season, state)
  VALUES (v_npc_key, v_tier, v_npc_template, v_season, 'staked');

  INSERT INTO public.hatchling_stakes_wagers (mode, game, state, creator, npc_asset_key)
  VALUES ('npc', 'blackjack', 'locked', auth.uid(), v_npc_key)
  RETURNING id INTO v_wager_id;

  INSERT INTO public.hatchling_stakes_wager_entries (wager_id, actor, asset_key, snapshot)
  VALUES
    (v_wager_id, auth.uid(), p_asset_key,
     jsonb_build_object('tier', v_tier, 'snapshot', v_snapshot, 'side', 'player')),
    (v_wager_id, '00000000-0000-0000-0000-000000000000', v_npc_key,
     jsonb_build_object('tier', v_tier, 'template', v_npc_template, 'side', 'npc'));

  INSERT INTO public.hatchling_stakes_wager_locks (asset_key, wager_id)
  VALUES (p_asset_key, v_wager_id), (v_npc_key, v_wager_id);

  UPDATE public.hatchling_stakes_animals SET state = 'staked'
  WHERE asset_key IN (p_asset_key, v_npc_key);

  INSERT INTO public.hatchling_stakes_wager_events (wager_id, seq, type, payload_hash, payload)
  VALUES (v_wager_id, 1, 'wager_locked', encode(digest(v_wager_id::text, 'sha256'), 'hex'),
          jsonb_build_object('player_asset', p_asset_key, 'npc_asset', v_npc_key, 'tier', v_tier));

  IF NOT v_exempt THEN
    UPDATE public.hatchling_stakes_tokens
    SET status = 'reserved', wager_id = v_wager_id, updated_at = now()
    WHERE user_id = auth.uid() AND week_key = v_week AND slot = v_token_slot;
  END IF;

  INSERT INTO public.hatchling_stakes_game_sessions (wager_id, target_score)
  VALUES (v_wager_id, 100);

  RETURN jsonb_build_object(
    'wager_id', v_wager_id,
    'npc_asset_key', v_npc_key,
    'npc_name', v_npc_name,
    'tier', v_tier,
    'target', 100,
    'token_slot', v_token_slot
  );
END;
$$;
REVOKE ALL ON FUNCTION public.hatchling_stakes_create_npc_wager(text) FROM public;
GRANT EXECUTE ON FUNCTION public.hatchling_stakes_create_npc_wager(text) TO authenticated;

-- Attach the server-generated shoe to a locked wager and enter in_progress.
-- Called by the trusted game service (API route) with a CSPRNG shoe.
CREATE OR REPLACE FUNCTION public.hatchling_stakes_start_session(
  p_wager_id uuid, p_seed_commitment text, p_shoe jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_state text;
  v_creator uuid;
BEGIN
  SELECT state, creator INTO v_state, v_creator FROM public.hatchling_stakes_wagers
  WHERE id = p_wager_id FOR UPDATE;
  IF NOT FOUND OR v_creator <> auth.uid() THEN
    RAISE EXCEPTION 'wager not found';
  END IF;
  IF v_state <> 'locked' THEN
    RAISE EXCEPTION 'wager not lockable';
  END IF;
  IF p_shoe IS NULL OR jsonb_array_length(p_shoe) < 100 THEN
    RAISE EXCEPTION 'bad shoe';
  END IF;

  UPDATE public.hatchling_stakes_game_sessions
  SET seed_commitment = p_seed_commitment, shoe = p_shoe, state = 'in_progress',
      updated_at = now()
  WHERE wager_id = p_wager_id AND state = 'awaiting_shoe';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not ready';
  END IF;

  UPDATE public.hatchling_stakes_wagers
  SET state = 'in_progress', updated_at = now()
  WHERE id = p_wager_id;

  UPDATE public.hatchling_stakes_tokens
  SET status = 'consumed', updated_at = now()
  WHERE wager_id = p_wager_id AND status = 'reserved';

  INSERT INTO public.hatchling_stakes_wager_events (wager_id, seq, type, payload_hash, payload)
  VALUES (p_wager_id,
          (SELECT COALESCE(max(seq), 0) + 1 FROM public.hatchling_stakes_wager_events WHERE wager_id = p_wager_id),
          'session_started', encode(digest(p_seed_commitment, 'sha256'), 'hex'),
          jsonb_build_object('seed_commitment', p_seed_commitment));

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.hatchling_stakes_start_session(uuid, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.hatchling_stakes_start_session(uuid, text, jsonb) TO authenticated;

-- Draw the next N cards from the server shoe. The browser never sees undealt cards.
CREATE OR REPLACE FUNCTION public.hatchling_stakes_session_draw(p_wager_id uuid, p_count int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator uuid;
  v_wstate text;
  v_shoe jsonb;
  v_drawn jsonb;
BEGIN
  SELECT w.creator, w.state INTO v_creator, v_wstate
  FROM public.hatchling_stakes_wagers w WHERE w.id = p_wager_id;
  IF NOT FOUND OR v_creator <> auth.uid() THEN
    RAISE EXCEPTION 'wager not found';
  END IF;
  IF v_wstate <> 'in_progress' THEN
    RAISE EXCEPTION 'wager not in progress';
  END IF;
  IF p_count IS NULL OR p_count < 1 OR p_count > 12 THEN
    RAISE EXCEPTION 'bad draw count';
  END IF;

  SELECT shoe INTO v_shoe FROM public.hatchling_stakes_game_sessions
  WHERE wager_id = p_wager_id FOR UPDATE;
  IF jsonb_array_length(v_shoe) < p_count THEN
    RAISE EXCEPTION 'shoe exhausted';
  END IF;

  v_drawn := (SELECT jsonb_agg(e ORDER BY o)
              FROM jsonb_array_elements(v_shoe) WITH ORDINALITY AS t(e, o)
              WHERE o <= p_count);

  UPDATE public.hatchling_stakes_game_sessions
  SET shoe = (SELECT jsonb_agg(e ORDER BY o)
              FROM jsonb_array_elements(v_shoe) WITH ORDINALITY AS t(e, o)
              WHERE o > p_count),
      transcript = transcript || jsonb_build_object('t', 'draw', 'n', p_count,
                                                    'at', now()::text),
      updated_at = now()
  WHERE wager_id = p_wager_id;

  RETURN v_drawn;
END;
$$;
REVOKE ALL ON FUNCTION public.hatchling_stakes_session_draw(uuid, int) FROM public;
GRANT EXECUTE ON FUNCTION public.hatchling_stakes_session_draw(uuid, int) TO authenticated;

-- Append a game event to the server transcript + optionally update the score.
CREATE OR REPLACE FUNCTION public.hatchling_stakes_session_append(
  p_wager_id uuid, p_event jsonb, p_player_score int, p_hands_played int
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator uuid;
  v_wstate text;
BEGIN
  SELECT w.creator, w.state INTO v_creator, v_wstate
  FROM public.hatchling_stakes_wagers w WHERE w.id = p_wager_id;
  IF NOT FOUND OR v_creator <> auth.uid() THEN
    RAISE EXCEPTION 'wager not found';
  END IF;
  IF v_wstate <> 'in_progress' THEN
    RAISE EXCEPTION 'wager not in progress';
  END IF;
  UPDATE public.hatchling_stakes_game_sessions
  SET transcript = transcript || COALESCE(p_event, '{}'::jsonb),
      player_score = COALESCE(p_player_score, player_score),
      hands_played = COALESCE(p_hands_played, hands_played),
      updated_at = now()
  WHERE wager_id = p_wager_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.hatchling_stakes_session_append(uuid, jsonb, int, int) FROM public;
GRANT EXECUTE ON FUNCTION public.hatchling_stakes_session_append(uuid, jsonb, int, int) TO authenticated;

-- Atomic settlement: one winner, exactly once. Appends ownership events for both
-- assets, transfers canonical ownership, releases locks, completes the wager.
-- Idempotent: replays return the original receipt.
CREATE OR REPLACE FUNCTION public.hatchling_stakes_settle(
  p_wager_id uuid, p_winner uuid, p_player_score int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_state text;
  v_creator uuid;
  v_player_asset text;
  v_npc_asset text;
  v_seq int;
  v_npc uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  SELECT state, creator INTO v_state, v_creator
  FROM public.hatchling_stakes_wagers WHERE id = p_wager_id FOR UPDATE;
  IF NOT FOUND OR v_creator <> auth.uid() THEN
    RAISE EXCEPTION 'wager not found';
  END IF;
  IF v_state = 'complete' THEN
    RETURN jsonb_build_object('wager_id', p_wager_id, 'state', 'complete', 'replay', true,
      'winner', (SELECT winner FROM public.hatchling_stakes_game_sessions WHERE wager_id = p_wager_id));
  END IF;
  IF v_state <> 'in_progress' THEN
    RAISE EXCEPTION 'wager not settleable';
  END IF;
  IF p_winner <> auth.uid() AND p_winner <> v_npc THEN
    RAISE EXCEPTION 'bad winner';
  END IF;

  SELECT asset_key INTO v_player_asset FROM public.hatchling_stakes_wager_entries
  WHERE wager_id = p_wager_id AND actor = auth.uid();
  SELECT asset_key INTO v_npc_asset FROM public.hatchling_stakes_wager_entries
  WHERE wager_id = p_wager_id AND actor = v_npc;

  UPDATE public.hatchling_stakes_wagers SET state = 'settling', updated_at = now()
  WHERE id = p_wager_id;

  -- Ownership ledger: winner takes both.
  SELECT COALESCE(max(seq), 0) + 1 INTO v_seq FROM public.hatchling_stakes_ownership_events
  WHERE asset_key = v_player_asset;
  INSERT INTO public.hatchling_stakes_ownership_events (asset_key, from_user, to_user, reason, seq)
  VALUES (v_player_asset, auth.uid(), p_winner, 'wager_settlement', v_seq);
  SELECT COALESCE(max(seq), 0) + 1 INTO v_seq FROM public.hatchling_stakes_ownership_events
  WHERE asset_key = v_npc_asset;
  INSERT INTO public.hatchling_stakes_ownership_events (asset_key, from_user, to_user, reason, seq)
  VALUES (v_npc_asset, v_npc, p_winner, 'wager_settlement', v_seq);

  UPDATE public.hatchling_stakes_animals
  SET owner = p_winner, state = 'active'
  WHERE asset_key IN (v_player_asset, v_npc_asset);

  DELETE FROM public.hatchling_stakes_wager_locks WHERE wager_id = p_wager_id;
  UPDATE public.hatchling_stakes_npc_inventory SET state = 'awarded'
  WHERE asset_key = v_npc_asset;

  UPDATE public.hatchling_stakes_game_sessions
  SET winner = p_winner, player_score = p_player_score, state = 'complete', updated_at = now()
  WHERE wager_id = p_wager_id;

  INSERT INTO public.hatchling_stakes_wager_events (wager_id, seq, type, payload_hash, payload)
  VALUES (p_wager_id,
          (SELECT COALESCE(max(seq), 0) + 1 FROM public.hatchling_stakes_wager_events WHERE wager_id = p_wager_id),
          'settled', encode(digest(p_wager_id::text || p_winner::text, 'sha256'), 'hex'),
          jsonb_build_object('winner', p_winner, 'player_score', p_player_score));

  UPDATE public.hatchling_stakes_wagers SET state = 'complete', updated_at = now()
  WHERE id = p_wager_id;

  RETURN jsonb_build_object('wager_id', p_wager_id, 'state', 'complete',
                            'winner', p_winner, 'player_score', p_player_score,
                            'player_is_winner', p_winner = auth.uid());
END;
$$;
REVOKE ALL ON FUNCTION public.hatchling_stakes_settle(uuid, uuid, int) FROM public;
GRANT EXECUTE ON FUNCTION public.hatchling_stakes_settle(uuid, uuid, int) TO authenticated;

-- Void: platform fault or tie — unlock both assets, refund the token, no winner.
CREATE OR REPLACE FUNCTION public.hatchling_stakes_void(p_wager_id uuid, p_reason text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state text;
  v_creator uuid;
BEGIN
  SELECT state, creator INTO v_state, v_creator
  FROM public.hatchling_stakes_wagers WHERE id = p_wager_id FOR UPDATE;
  IF NOT FOUND OR v_creator <> auth.uid() THEN
    RAISE EXCEPTION 'wager not found';
  END IF;
  IF v_state IN ('complete', 'void') THEN
    RETURN true;
  END IF;

  UPDATE public.hatchling_stakes_animals SET state = 'active'
  WHERE asset_key IN (SELECT asset_key FROM public.hatchling_stakes_wager_locks WHERE wager_id = p_wager_id);
  DELETE FROM public.hatchling_stakes_wager_locks WHERE wager_id = p_wager_id;
  UPDATE public.hatchling_stakes_npc_inventory SET state = 'available'
  WHERE asset_key IN (SELECT npc_asset_key FROM public.hatchling_stakes_wagers WHERE id = p_wager_id)
    AND state = 'staked';

  UPDATE public.hatchling_stakes_tokens
  SET status = 'refunded', updated_at = now()
  WHERE wager_id = p_wager_id AND status IN ('reserved', 'consumed');

  UPDATE public.hatchling_stakes_game_sessions SET state = 'voided', updated_at = now()
  WHERE wager_id = p_wager_id;

  INSERT INTO public.hatchling_stakes_wager_events (wager_id, seq, type, payload_hash, payload)
  VALUES (p_wager_id,
          (SELECT COALESCE(max(seq), 0) + 1 FROM public.hatchling_stakes_wager_events WHERE wager_id = p_wager_id),
          'voided', encode(digest(p_wager_id::text || coalesce(p_reason,''), 'sha256'), 'hex'),
          jsonb_build_object('reason', left(coalesce(p_reason, ''), 200)));

  UPDATE public.hatchling_stakes_wagers SET state = 'void', updated_at = now()
  WHERE id = p_wager_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.hatchling_stakes_void(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.hatchling_stakes_void(uuid, text) TO authenticated;

-- Wager history for the caller (receipts).
CREATE OR REPLACE FUNCTION public.hatchling_stakes_history(p_limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'wager_id', w.id, 'mode', w.mode, 'game', w.game, 'state', w.state,
      'rule_version', w.rule_version, 'created_at', w.created_at,
      'player_asset', (SELECT asset_key FROM public.hatchling_stakes_wager_entries e
                       WHERE e.wager_id = w.id AND e.actor = auth.uid()),
      'npc_asset', w.npc_asset_key,
      'winner', s.winner, 'player_score', s.player_score, 'target', s.target_score,
      'hands_played', s.hands_played,
      'player_is_winner', s.winner = auth.uid()
    ) ORDER BY w.created_at DESC)
    FROM public.hatchling_stakes_wagers w
    LEFT JOIN public.hatchling_stakes_game_sessions s ON s.wager_id = w.id
    WHERE w.creator = auth.uid()
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.hatchling_stakes_history(int) FROM public;
GRANT EXECUTE ON FUNCTION public.hatchling_stakes_history(int) TO authenticated;

-- Public session projection for the wager creator: everything EXCEPT the shoe.
-- The browser never learns undealt cards.
CREATE OR REPLACE FUNCTION public.hatchling_stakes_session_public(p_wager_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator uuid;
BEGIN
  SELECT w.creator INTO v_creator FROM public.hatchling_stakes_wagers w WHERE w.id = p_wager_id;
  IF NOT FOUND OR v_creator <> auth.uid() THEN
    RAISE EXCEPTION 'wager not found';
  END IF;
  RETURN (
    SELECT jsonb_build_object(
      'wager_id', w.id,
      'wager_state', w.state,
      'mode', w.mode,
      'game', w.game,
      'rule_version', w.rule_version,
      'npc_asset_key', w.npc_asset_key,
      'npc_name', (SELECT a.trait_snapshot->>'name'
                  FROM public.hatchling_stakes_animals a WHERE a.asset_key = w.npc_asset_key),
      'tier', (SELECT e.snapshot->>'tier' FROM public.hatchling_stakes_wager_entries e
               WHERE e.wager_id = w.id AND e.actor = auth.uid()),
      'player_asset_key', (SELECT e.asset_key FROM public.hatchling_stakes_wager_entries e
                           WHERE e.wager_id = w.id AND e.actor = auth.uid()),
      'player_asset_name', (SELECT e.snapshot->'snapshot'->>'name'
                            FROM public.hatchling_stakes_wager_entries e
                            WHERE e.wager_id = w.id AND e.actor = auth.uid()),
      'session_state', s.state,
      'player_score', s.player_score,
      'target_score', s.target_score,
      'hands_played', s.hands_played,
      'base_bet', s.base_bet,
      'winner', s.winner,
      'current_hand', s.current_hand,
      'transcript', s.transcript,
      'seed_commitment', s.seed_commitment
    )
    FROM public.hatchling_stakes_wagers w
    JOIN public.hatchling_stakes_game_sessions s ON s.wager_id = w.id
    WHERE w.id = p_wager_id
  );
END;
$$;
REVOKE ALL ON FUNCTION public.hatchling_stakes_session_public(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.hatchling_stakes_session_public(uuid) TO authenticated;

-- Store/replace the in-progress hand (trusted game service only, creator-scoped).
CREATE OR REPLACE FUNCTION public.hatchling_stakes_session_set_hand(p_wager_id uuid, p_hand jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator uuid;
  v_wstate text;
BEGIN
  SELECT w.creator, w.state INTO v_creator, v_wstate
  FROM public.hatchling_stakes_wagers w WHERE w.id = p_wager_id;
  IF NOT FOUND OR v_creator <> auth.uid() THEN
    RAISE EXCEPTION 'wager not found';
  END IF;
  IF v_wstate <> 'in_progress' THEN
    RAISE EXCEPTION 'wager not in progress';
  END IF;
  UPDATE public.hatchling_stakes_game_sessions
  SET current_hand = COALESCE(p_hand, '{}'::jsonb), updated_at = now()
  WHERE wager_id = p_wager_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.hatchling_stakes_session_set_hand(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.hatchling_stakes_session_set_hand(uuid, jsonb) TO authenticated;

-- Load the full server-side blackjack table for the wager creator.
-- The shoe and the dealer's hole card stay server-side.
CREATE OR REPLACE FUNCTION public.hatchling_stakes_bj_load(p_wager_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator uuid;
BEGIN
  SELECT creator INTO v_creator
  FROM public.hatchling_stakes_wagers WHERE id = p_wager_id;
  IF NOT FOUND OR v_creator <> auth.uid() THEN
    RAISE EXCEPTION 'wager not found';
  END IF;
  RETURN (SELECT bj_state FROM public.hatchling_stakes_game_sessions
          WHERE wager_id = p_wager_id);
END;
$$;
REVOKE ALL ON FUNCTION public.hatchling_stakes_bj_load(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.hatchling_stakes_bj_load(uuid) TO authenticated;

-- Persist the full server-side blackjack table. Only while the wager is in progress.
CREATE OR REPLACE FUNCTION public.hatchling_stakes_bj_save(p_wager_id uuid, p_state jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator uuid;
  v_state text;
BEGIN
  SELECT creator, state INTO v_creator, v_state
  FROM public.hatchling_stakes_wagers WHERE id = p_wager_id;
  IF NOT FOUND OR v_creator <> auth.uid() THEN
    RAISE EXCEPTION 'wager not found';
  END IF;
  IF v_state <> 'in_progress' THEN
    RAISE EXCEPTION 'wager not in progress';
  END IF;
  UPDATE public.hatchling_stakes_game_sessions
  SET bj_state = p_state, updated_at = now()
  WHERE wager_id = p_wager_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.hatchling_stakes_bj_save(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.hatchling_stakes_bj_save(uuid, jsonb) TO authenticated;

-- ----------------------------------------------------------------------------
-- Snake Duels — server-side card engine + state machine
-- (mirrors src/lib/poker/duel-eval.ts; the client never evaluates)
-- ----------------------------------------------------------------------------

-- Friendly rank names shared by the evaluator.
CREATE OR REPLACE FUNCTION public.snake_duels_rank_name(p_rank int)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$ SELECT CASE p_rank
  WHEN 14 THEN 'Ace' WHEN 13 THEN 'King' WHEN 12 THEN 'Queen' WHEN 11 THEN 'Jack'
  ELSE p_rank::text END $$;

-- Compare two eval scores: 1 / 0 / -1.
CREATE OR REPLACE FUNCTION public.snake_duels_cmp_score(a int[], b int[])
RETURNS int
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $func$
DECLARE
  i int;
  n int;
  d int;
BEGIN
  n := greatest(coalesce(array_length(a, 1), 0), coalesce(array_length(b, 1), 0));
  FOR i IN 1..n LOOP
    d := coalesce(a[i], 0) - coalesce(b[i], 0);
    IF d <> 0 THEN
      RETURN CASE WHEN d > 0 THEN 1 ELSE -1 END;
    END IF;
  END LOOP;
  RETURN 0;
END;
$func$;

-- Evaluate one 5-card hand. Cards are "As"-style strings ("10d" for ten).
CREATE OR REPLACE FUNCTION public.snake_duels_eval5(p_cards text[])
RETURNS public.snake_duels_eval
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $func$
DECLARE
  c text;
  rank_txt text;
  v_rank int;
  sr int[] := '{}';      -- ranks sorted desc
  v_suits text[] := '{}';
  i int; j int; tmp int;
  v_flush boolean;
  v_uniq int[] := '{}';  -- distinct ranks desc
  v_straight int := 0;
  v_counts int[] := array_fill(0, ARRAY[15]);
  v_grank int[] := '{}'; -- group ranks: count desc, then rank desc
  v_gcount int[] := '{}';
  v_score int[];
  v_name text;
  v_kickers int[];
BEGIN
  IF coalesce(array_length(p_cards, 1), 0) <> 5 THEN
    RAISE EXCEPTION 'eval5 needs exactly 5 cards';
  END IF;
  FOREACH c IN ARRAY p_cards LOOP
    rank_txt := substring(c from 1 for char_length(c) - 1);
    v_rank := CASE upper(rank_txt)
      WHEN 'A' THEN 14 WHEN 'K' THEN 13 WHEN 'Q' THEN 12 WHEN 'J' THEN 11
      ELSE rank_txt::int END;
    sr := sr || v_rank;
    v_suits := v_suits || lower(right(c, 1));
  END LOOP;
  -- insertion sort, descending
  FOR i IN 2..5 LOOP
    tmp := sr[i]; j := i - 1;
    WHILE j >= 1 AND sr[j] < tmp LOOP sr[j + 1] := sr[j]; j := j - 1; END LOOP;
    sr[j + 1] := tmp;
  END LOOP;
  v_flush := v_suits[1] = v_suits[2] AND v_suits[2] = v_suits[3]
         AND v_suits[3] = v_suits[4] AND v_suits[4] = v_suits[5];
  FOR i IN 1..5 LOOP
    IF i = 1 OR sr[i] <> sr[i - 1] THEN v_uniq := v_uniq || sr[i]; END IF;
  END LOOP;
  IF array_length(v_uniq, 1) = 5 THEN
    IF v_uniq[1] - v_uniq[5] = 4 THEN v_straight := v_uniq[1];
    ELSIF v_uniq[1] = 14 AND v_uniq[2] = 5 THEN v_straight := 5; END IF;
  END IF;
  FOR i IN 1..5 LOOP v_counts[sr[i]] := v_counts[sr[i]] + 1; END LOOP;
  FOR i IN REVERSE 4..1 LOOP
    FOR v_rank IN REVERSE 2..14 LOOP
      IF v_counts[v_rank] = i THEN
        v_grank := v_grank || v_rank;
        v_gcount := v_gcount || i;
      END IF;
    END LOOP;
  END LOOP;

  IF v_straight > 0 AND v_flush THEN
    v_score := ARRAY[8, v_straight];
    v_name := CASE WHEN v_straight = 14 THEN 'Royal Flush'
      ELSE 'Straight Flush, ' || public.snake_duels_rank_name(v_straight) || ' high' END;
  ELSIF v_gcount[1] = 4 THEN
    v_kickers := '{}';
    FOR i IN 1..5 LOOP IF sr[i] <> v_grank[1] THEN v_kickers := v_kickers || sr[i]; END IF; END LOOP;
    v_score := ARRAY[7, v_grank[1], v_kickers[1]];
    v_name := 'Four of a Kind, ' || public.snake_duels_rank_name(v_grank[1]) || 's';
  ELSIF v_gcount[1] = 3 AND v_gcount[2] = 2 THEN
    v_score := ARRAY[6, v_grank[1], v_grank[2]];
    v_name := 'Full House, ' || public.snake_duels_rank_name(v_grank[1]) || 's over '
           || public.snake_duels_rank_name(v_grank[2]) || 's';
  ELSIF v_flush THEN
    v_score := ARRAY[5] || sr;
    v_name := 'Flush, ' || public.snake_duels_rank_name(sr[1]) || ' high';
  ELSIF v_straight > 0 THEN
    v_score := ARRAY[4, v_straight];
    v_name := 'Straight, ' || public.snake_duels_rank_name(v_straight) || ' high';
  ELSIF v_gcount[1] = 3 THEN
    v_kickers := '{}';
    FOR i IN 1..5 LOOP IF sr[i] <> v_grank[1] THEN v_kickers := v_kickers || sr[i]; END IF; END LOOP;
    v_score := ARRAY[3, v_grank[1]] || v_kickers;
    v_name := 'Three of a Kind, ' || public.snake_duels_rank_name(v_grank[1]) || 's';
  ELSIF v_gcount[1] = 2 AND v_gcount[2] = 2 THEN
    v_kickers := '{}';
    FOR i IN 1..5 LOOP
      IF sr[i] <> v_grank[1] AND sr[i] <> v_grank[2] THEN v_kickers := v_kickers || sr[i]; END IF;
    END LOOP;
    v_score := ARRAY[2, v_grank[1], v_grank[2]] || v_kickers;
    v_name := 'Two Pair, ' || public.snake_duels_rank_name(v_grank[1]) || 's and '
           || public.snake_duels_rank_name(v_grank[2]) || 's';
  ELSIF v_gcount[1] = 2 THEN
    v_kickers := '{}';
    FOR i IN 1..5 LOOP IF sr[i] <> v_grank[1] THEN v_kickers := v_kickers || sr[i]; END IF; END LOOP;
    v_score := ARRAY[1, v_grank[1]] || v_kickers;
    v_name := 'Pair of ' || public.snake_duels_rank_name(v_grank[1]) || 's';
  ELSE
    v_score := ARRAY[0] || sr;
    v_name := public.snake_duels_rank_name(sr[1]) || ' high';
  END IF;
  RETURN (v_score, v_name)::public.snake_duels_eval;
END;
$func$;

-- Best 5-card hand out of 7 (all 21 combos).
CREATE OR REPLACE FUNCTION public.snake_duels_eval7(p_cards text[])
RETURNS public.snake_duels_eval
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $func$
DECLARE
  a int; b int; c int; d int; e int;
  ev public.snake_duels_eval;
  best public.snake_duels_eval;
  have_best boolean := false;
BEGIN
  IF coalesce(array_length(p_cards, 1), 0) <> 7 THEN
    RAISE EXCEPTION 'eval7 needs exactly 7 cards';
  END IF;
  FOR a IN 1..3 LOOP FOR b IN a + 1..4 LOOP FOR c IN b + 1..5 LOOP
  FOR d IN c + 1..6 LOOP FOR e IN d + 1..7 LOOP
    ev := public.snake_duels_eval5(ARRAY[p_cards[a], p_cards[b], p_cards[c], p_cards[d], p_cards[e]]);
    IF NOT have_best OR public.snake_duels_cmp_score(ev.score, best.score) > 0 THEN
      best := ev; have_best := true;
    END IF;
  END LOOP; END LOOP; END LOOP; END LOOP; END LOOP;
  RETURN best;
END;
$func$;

-- CSPRNG-shuffled 52-card deck. Called only from inside SECURITY DEFINER
-- functions; never exposed to callers.
CREATE OR REPLACE FUNCTION public.snake_duels_shuffled_deck()
RETURNS text[]
LANGUAGE plpgsql
SET search_path = public, extensions
AS $func$
DECLARE
  v_ranks text[] := ARRAY['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  v_suits text[] := ARRAY['s','h','d','c'];
  deck text[] := '{}';
  r text; s text;
  i int; j int; tmp text;
  rb bytea;
BEGIN
  FOREACH r IN ARRAY v_ranks LOOP
    FOREACH s IN ARRAY v_suits LOOP
      deck := deck || (r || s);
    END LOOP;
  END LOOP;
  FOR i IN REVERSE 52..2 LOOP
    rb := gen_random_bytes(2);
    j := 1 + ((get_byte(rb, 0) * 256 + get_byte(rb, 1)) % i);
    tmp := deck[i]; deck[i] := deck[j]; deck[j] := tmp;
  END LOOP;
  RETURN deck;
END;
$func$;
REVOKE ALL ON FUNCTION public.snake_duels_shuffled_deck() FROM public;

-- Create a challenge. The challenger's snake + one weekly token are escrowed.
-- The duel tier comes from the snake's registered tier. Returns the duel id
-- (the challenge link).
CREATE OR REPLACE FUNCTION public.snake_duels_create(p_asset_key text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_wager uuid;
  v_duel_id uuid;
  v_week text := to_char(date_trunc('week', now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD');
  v_token_slot int;
  v_exempt boolean;
  v_tier text;
  v_snapshot jsonb;
  v_cfg text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  SELECT value INTO v_cfg FROM public.hatchling_stakes_config WHERE key = 'duels_enabled';
  IF v_cfg IS NOT NULL AND v_cfg <> 'true' THEN RAISE EXCEPTION 'keeper duels are paused'; END IF;

  -- Same animal gate as the Den: you stake a snake you produced and own,
  -- from the claim/registry sources, currently idle.
  SELECT tier, trait_snapshot INTO v_tier, v_snapshot
  FROM public.hatchling_stakes_animals
  WHERE asset_key = p_asset_key AND producer = v_uid AND owner = v_uid
    AND source IN ('breeder-registered', 'inventory-claim') AND state = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'snake not available'; END IF;
  IF v_tier NOT IN ('sprout', 'vine', 'canopy') THEN RAISE EXCEPTION 'bad tier'; END IF;
  IF EXISTS (SELECT 1 FROM public.hatchling_stakes_wager_locks
             WHERE asset_key = p_asset_key AND state = 'active') THEN
    RAISE EXCEPTION 'snake is locked in another game';
  END IF;

  -- One weekly token, reserved (not consumed) until the duel settles.
  -- Exempt accounts (founder/testing) skip the token ledger entirely.
  SELECT EXISTS (
    SELECT 1 FROM public.hatchling_stakes_token_exemptions WHERE user_id = v_uid
  ) INTO v_exempt;
  IF NOT v_exempt THEN
    INSERT INTO public.hatchling_stakes_tokens (user_id, week_key, slot)
    VALUES (v_uid, v_week, 1), (v_uid, v_week, 2)
    ON CONFLICT (user_id, week_key, slot) DO NOTHING;
    SELECT slot INTO v_token_slot FROM public.hatchling_stakes_tokens
    WHERE user_id = v_uid AND week_key = v_week AND status = 'available'
    ORDER BY slot LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'no duel token available'; END IF;
  END IF;

  INSERT INTO public.hatchling_stakes_wagers (mode, game, state, creator)
  VALUES ('keeper', 'duel', 'in_progress', v_uid) RETURNING id INTO v_wager;
  INSERT INTO public.hatchling_stakes_wager_entries (wager_id, actor, asset_key, snapshot)
  VALUES (v_wager, v_uid, p_asset_key,
          jsonb_build_object('tier', v_tier, 'snapshot', v_snapshot, 'side', 'challenger'));
  INSERT INTO public.hatchling_stakes_wager_locks (asset_key, wager_id)
  VALUES (p_asset_key, v_wager);
  UPDATE public.hatchling_stakes_animals SET state = 'staked' WHERE asset_key = p_asset_key;
  INSERT INTO public.hatchling_stakes_wager_events (wager_id, seq, type, payload_hash, payload)
  VALUES (v_wager, 1, 'duel_opened', encode(digest(v_wager::text, 'sha256'), 'hex'),
          jsonb_build_object('challenger_asset', p_asset_key, 'tier', v_tier));

  IF NOT v_exempt THEN
    UPDATE public.hatchling_stakes_tokens
    SET status = 'reserved', wager_id = v_wager, updated_at = now()
    WHERE user_id = v_uid AND week_key = v_week AND slot = v_token_slot;
  END IF;

  INSERT INTO public.snake_duels (tier, challenger, challenger_snake, wager_id)
  VALUES (v_tier, v_uid, p_asset_key, v_wager)
  RETURNING id INTO v_duel_id;
  RETURN v_duel_id;
END;
$$;
REVOKE ALL ON FUNCTION public.snake_duels_create(text) FROM public;
GRANT EXECUTE ON FUNCTION public.snake_duels_create(text) TO authenticated;

-- Accept an open challenge. The deck is shuffled server-side and dealt here;
-- the caller supplies only their snake. Returns the public duel state.
CREATE OR REPLACE FUNCTION public.snake_duels_accept(p_duel_id uuid, p_asset_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  d record;
  v_week text := to_char(date_trunc('week', now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD');
  v_token_slot int;
  v_exempt boolean;
  v_tier text;
  v_snapshot jsonb;
  v_deck text[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  SELECT * INTO d FROM public.snake_duels WHERE id = p_duel_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'challenge not found'; END IF;
  PERFORM public.snake_duels_expire(p_duel_id);
  SELECT * INTO d FROM public.snake_duels WHERE id = p_duel_id;
  IF d.state <> 'open' THEN RAISE EXCEPTION 'challenge not open'; END IF;
  IF d.challenger = v_uid THEN RAISE EXCEPTION 'cannot accept your own challenge'; END IF;

  SELECT tier, trait_snapshot INTO v_tier, v_snapshot
  FROM public.hatchling_stakes_animals
  WHERE asset_key = p_asset_key AND producer = v_uid AND owner = v_uid
    AND source IN ('breeder-registered', 'inventory-claim') AND state = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'snake not available'; END IF;
  IF v_tier <> d.tier THEN RAISE EXCEPTION 'tier must match'; END IF;
  IF EXISTS (SELECT 1 FROM public.hatchling_stakes_wager_locks
             WHERE asset_key = p_asset_key AND state = 'active') THEN
    RAISE EXCEPTION 'snake is locked in another game';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.hatchling_stakes_token_exemptions WHERE user_id = v_uid
  ) INTO v_exempt;
  IF NOT v_exempt THEN
    INSERT INTO public.hatchling_stakes_tokens (user_id, week_key, slot)
    VALUES (v_uid, v_week, 1), (v_uid, v_week, 2)
    ON CONFLICT (user_id, week_key, slot) DO NOTHING;
    SELECT slot INTO v_token_slot FROM public.hatchling_stakes_tokens
    WHERE user_id = v_uid AND week_key = v_week AND status = 'available'
    ORDER BY slot LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'no duel token available'; END IF;
  END IF;

  INSERT INTO public.hatchling_stakes_wager_entries (wager_id, actor, asset_key, snapshot)
  VALUES (d.wager_id, v_uid, p_asset_key,
          jsonb_build_object('tier', v_tier, 'snapshot', v_snapshot, 'side', 'opponent'));
  INSERT INTO public.hatchling_stakes_wager_locks (asset_key, wager_id)
  VALUES (p_asset_key, d.wager_id);
  UPDATE public.hatchling_stakes_animals SET state = 'staked' WHERE asset_key = p_asset_key;
  INSERT INTO public.hatchling_stakes_wager_events (wager_id, seq, type, payload_hash, payload)
  VALUES (d.wager_id,
          (SELECT coalesce(max(seq), 0) + 1 FROM public.hatchling_stakes_wager_events WHERE wager_id = d.wager_id),
          'duel_started', encode(digest(d.wager_id::text || p_asset_key, 'sha256'), 'hex'),
          jsonb_build_object('opponent_asset', p_asset_key, 'tier', v_tier));

  IF NOT v_exempt THEN
    UPDATE public.hatchling_stakes_tokens
    SET status = 'reserved', wager_id = d.wager_id, updated_at = now()
    WHERE user_id = v_uid AND week_key = v_week AND slot = v_token_slot;
  END IF;

  -- The house shuffle: no caller input, no caller visibility.
  v_deck := public.snake_duels_shuffled_deck();
  UPDATE public.snake_duels
  SET state = 'in_progress',
      opponent = v_uid,
      opponent_snake = p_asset_key,
      challenger_hole = to_jsonb(v_deck[1:2]),
      opponent_hole = to_jsonb(v_deck[3:4]),
      deck = to_jsonb(v_deck),
      -- a fresh 48h clock from the moment the duel actually starts
      expires_at = now() + interval '48 hours'
  WHERE id = p_duel_id;

  RETURN public.snake_duels_state(p_duel_id);
END;
$$;
REVOKE ALL ON FUNCTION public.snake_duels_accept(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.snake_duels_accept(uuid, text) TO authenticated;

-- Lock in a run/fold decision. A fold ends the duel at once (the other
-- snake wins). When both decisions are in, the duel moves to 'settling' and
-- the API route calls snake_duels_settle to finish it.
CREATE OR REPLACE FUNCTION public.snake_duels_decide(p_duel_id uuid, p_decision text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  d record;
  v_is_challenger boolean;
  v_other_decision text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  IF p_decision NOT IN ('run', 'fold') THEN RAISE EXCEPTION 'bad decision'; END IF;
  SELECT * INTO d FROM public.snake_duels WHERE id = p_duel_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'duel not found'; END IF;
  PERFORM public.snake_duels_expire(p_duel_id);
  SELECT * INTO d FROM public.snake_duels WHERE id = p_duel_id;

  IF d.state = 'settling' THEN
    -- Settle retry path: the route's settle call may have failed after both
    -- decisions landed. Report ready so the route can finish the job.
    RETURN jsonb_build_object('settle_ready', true, 'state', d.state);
  END IF;
  IF d.state <> 'in_progress' THEN RAISE EXCEPTION 'duel not in progress'; END IF;
  IF v_uid <> d.challenger AND v_uid <> d.opponent THEN RAISE EXCEPTION 'not your duel'; END IF;
  v_is_challenger := (v_uid = d.challenger);

  IF v_is_challenger THEN
    IF d.challenger_decision IS NOT NULL THEN
      RETURN jsonb_build_object('settle_ready', d.opponent_decision IS NOT NULL, 'state', d.state);
    END IF;
    UPDATE public.snake_duels SET challenger_decision = p_decision WHERE id = p_duel_id;
    v_other_decision := d.opponent_decision;
  ELSE
    IF d.opponent_decision IS NOT NULL THEN
      RETURN jsonb_build_object('settle_ready', d.challenger_decision IS NOT NULL, 'state', d.state);
    END IF;
    UPDATE public.snake_duels SET opponent_decision = p_decision WHERE id = p_duel_id;
    v_other_decision := d.opponent_decision;
  END IF;

  -- A fold ends it immediately: the duel is ready to settle with one winner.
  IF p_decision = 'fold' OR v_other_decision = 'fold' THEN
    UPDATE public.snake_duels SET state = 'settling' WHERE id = p_duel_id;
    RETURN jsonb_build_object('settle_ready', true, 'state', 'settling');
  END IF;

  IF v_other_decision IS NOT NULL THEN
    UPDATE public.snake_duels SET state = 'settling' WHERE id = p_duel_id;
    RETURN jsonb_build_object('settle_ready', true, 'state', 'settling');
  END IF;
  RETURN jsonb_build_object('settle_ready', false, 'state', 'in_progress');
END;
$$;
REVOKE ALL ON FUNCTION public.snake_duels_decide(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.snake_duels_decide(uuid, text) TO authenticated;

-- Settle a duel whose decisions are final. Fully server-side: the outcome is
-- computed here from the stored deck and decisions — callers pass nothing
-- but the duel id. Idempotent: replays return the recorded result.
CREATE OR REPLACE FUNCTION public.snake_duels_settle(p_duel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  d record;
  v_uid uuid := auth.uid();
  v_ch_hole text[];
  v_op_hole text[];
  v_board text[];
  v_ch7 text[];
  v_op7 text[];
  v_chev public.snake_duels_eval;
  v_opev public.snake_duels_eval;
  v_cmp int;
  v_winner uuid := NULL;
  v_win_reason text;
  v_hand_name text := NULL;
  v_ch_asset text;
  v_op_asset text;
  v_seq int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  SELECT * INTO d FROM public.snake_duels WHERE id = p_duel_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'duel not found'; END IF;

  -- Idempotent replay: a double-submit or retry returns the recorded result.
  IF d.state = 'complete' THEN
    RETURN jsonb_build_object(
      'duel_id', p_duel_id, 'state', 'complete', 'replay', true,
      'winner', d.winner, 'win_reason', d.win_reason, 'winning_hand', d.winning_hand);
  END IF;
  IF d.state <> 'settling' THEN RAISE EXCEPTION 'duel not ready to settle'; END IF;
  IF v_uid <> d.challenger AND v_uid <> d.opponent THEN RAISE EXCEPTION 'not your duel'; END IF;

  -- ---- compute the outcome from stored game state (no caller input) ----
  IF d.challenger_decision = 'fold' AND d.opponent_decision = 'fold' THEN
    -- Defensive only (unreachable via decide): both folded, so nobody pays.
    -- Snakes go home, tokens refunded.
    v_win_reason := 'tie';
    v_hand_name := 'Both players folded — stakes returned';
  ELSIF d.challenger_decision = 'fold' THEN
    v_winner := d.opponent; v_win_reason := 'fold';
  ELSIF d.opponent_decision = 'fold' THEN
    v_winner := d.challenger; v_win_reason := 'fold';
  ELSE
    -- Showdown: run out the board from the stored deck, evaluate in-database.
    SELECT array_agg(x ORDER BY ord) INTO v_board
    FROM jsonb_array_elements_text(d.deck) WITH ORDINALITY AS t(x, ord)
    WHERE ord BETWEEN 5 AND 9;
    SELECT array_agg(x ORDER BY ord) INTO v_ch_hole
    FROM jsonb_array_elements_text(d.challenger_hole) WITH ORDINALITY AS t(x, ord);
    SELECT array_agg(x ORDER BY ord) INTO v_op_hole
    FROM jsonb_array_elements_text(d.opponent_hole) WITH ORDINALITY AS t(x, ord);
    v_ch7 := v_ch_hole || v_board;
    v_op7 := v_op_hole || v_board;
    v_chev := public.snake_duels_eval7(v_ch7);
    v_opev := public.snake_duels_eval7(v_op7);
    v_cmp := public.snake_duels_cmp_score(v_chev.score, v_opev.score);
    IF v_cmp > 0 THEN
      v_winner := d.challenger; v_win_reason := 'showdown'; v_hand_name := v_chev.name;
    ELSIF v_cmp < 0 THEN
      v_winner := d.opponent; v_win_reason := 'showdown'; v_hand_name := v_opev.name;
    ELSE
      v_win_reason := 'tie'; v_hand_name := 'Tied board: ' || v_chev.name;
    END IF;
  END IF;

  -- ---- settle the ledger (same escrow semantics as Den wagers) ----
  v_ch_asset := d.challenger_snake;
  v_op_asset := d.opponent_snake;

  IF v_winner IS NULL THEN
    -- Tie (including both-fold): escrow never moved ownership, so each snake
    -- just goes back to 'active'. Tokens are marked refunded, matching the
    -- Den void ledger.
    UPDATE public.hatchling_stakes_animals SET state = 'active'
    WHERE asset_key IN (v_ch_asset, v_op_asset);
    UPDATE public.hatchling_stakes_tokens SET status = 'refunded', updated_at = now()
    WHERE wager_id = d.wager_id AND status = 'reserved';
    UPDATE public.hatchling_stakes_wagers SET state = 'complete', updated_at = now()
    WHERE id = d.wager_id;
  ELSE
    -- Winner takes both snakes; both tokens are spent.
    UPDATE public.hatchling_stakes_animals SET state = 'active', owner = v_winner
    WHERE asset_key IN (v_ch_asset, v_op_asset);
    SELECT coalesce(max(seq), 0) + 1 INTO v_seq
    FROM public.hatchling_stakes_ownership_events WHERE asset_key = v_ch_asset;
    INSERT INTO public.hatchling_stakes_ownership_events (asset_key, from_user, to_user, reason, seq)
    VALUES (v_ch_asset, d.challenger, v_winner, 'wager_settlement', v_seq);
    SELECT coalesce(max(seq), 0) + 1 INTO v_seq
    FROM public.hatchling_stakes_ownership_events WHERE asset_key = v_op_asset;
    INSERT INTO public.hatchling_stakes_ownership_events (asset_key, from_user, to_user, reason, seq)
    VALUES (v_op_asset, d.opponent, v_winner, 'wager_settlement', v_seq);
    UPDATE public.hatchling_stakes_tokens SET status = 'consumed', updated_at = now()
    WHERE wager_id = d.wager_id AND status = 'reserved';
    UPDATE public.hatchling_stakes_wagers SET state = 'complete', updated_at = now()
    WHERE id = d.wager_id;
  END IF;
  DELETE FROM public.hatchling_stakes_wager_locks WHERE wager_id = d.wager_id;
  INSERT INTO public.hatchling_stakes_wager_events (wager_id, seq, type, payload_hash, payload)
  VALUES (d.wager_id,
          (SELECT coalesce(max(seq), 0) + 1 FROM public.hatchling_stakes_wager_events WHERE wager_id = d.wager_id),
          'duel_settled', encode(digest(d.id::text || coalesce(v_winner::text, 'tie'), 'sha256'), 'hex'),
          jsonb_build_object('winner', v_winner, 'win_reason', v_win_reason, 'winning_hand', v_hand_name));

  UPDATE public.snake_duels
  SET state = 'complete', winner = v_winner, win_reason = v_win_reason, winning_hand = v_hand_name
  WHERE id = p_duel_id;

  RETURN jsonb_build_object(
    'duel_id', p_duel_id, 'state', 'complete', 'replay', false,
    'winner', v_winner, 'win_reason', v_win_reason, 'winning_hand', v_hand_name,
    'board', CASE WHEN v_win_reason = 'showdown' OR v_win_reason = 'tie'
                  THEN coalesce(to_jsonb(v_board), '[]'::jsonb) ELSE '[]'::jsonb END);
END;
$$;
REVOKE ALL ON FUNCTION public.snake_duels_settle(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.snake_duels_settle(uuid) TO authenticated;

-- Challenger backs out of an unaccepted challenge. Snake unlocks, token freed.
CREATE OR REPLACE FUNCTION public.snake_duels_void(p_duel_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d record;
BEGIN
  SELECT * INTO d FROM public.snake_duels WHERE id = p_duel_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'duel not found'; END IF;
  IF d.state <> 'open' THEN RAISE EXCEPTION 'challenge not open'; END IF;
  IF d.challenger <> auth.uid() THEN RAISE EXCEPTION 'not your challenge'; END IF;
  UPDATE public.hatchling_stakes_animals SET state = 'active'
  WHERE asset_key = d.challenger_snake;
  DELETE FROM public.hatchling_stakes_wager_locks WHERE wager_id = d.wager_id;
  UPDATE public.hatchling_stakes_tokens SET status = 'refunded', updated_at = now()
  WHERE wager_id = d.wager_id AND status = 'reserved';
  UPDATE public.hatchling_stakes_wagers SET state = 'void', updated_at = now()
  WHERE id = d.wager_id;
  UPDATE public.snake_duels SET state = 'void' WHERE id = p_duel_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.snake_duels_void(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.snake_duels_void(uuid) TO authenticated;

-- Expire a duel whose clock ran out. Open: challenger's snake unlocks and
-- token is freed. In progress: both snakes go home and both tokens refunded.
CREATE OR REPLACE FUNCTION public.snake_duels_expire(p_duel_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d record;
BEGIN
  SELECT * INTO d FROM public.snake_duels WHERE id = p_duel_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF d.state NOT IN ('open', 'in_progress') THEN RETURN false; END IF;
  IF d.expires_at > now() THEN RETURN false; END IF;

  IF d.state = 'open' THEN
    UPDATE public.hatchling_stakes_animals SET state = 'active'
    WHERE asset_key = d.challenger_snake;
  ELSE
    UPDATE public.hatchling_stakes_animals SET state = 'active'
    WHERE asset_key IN (d.challenger_snake, d.opponent_snake);
  END IF;
  DELETE FROM public.hatchling_stakes_wager_locks WHERE wager_id = d.wager_id;
  UPDATE public.hatchling_stakes_tokens SET status = 'refunded', updated_at = now()
  WHERE wager_id = d.wager_id AND status = 'reserved';
  UPDATE public.hatchling_stakes_wagers SET state = 'void', updated_at = now()
  WHERE id = d.wager_id;
  UPDATE public.snake_duels SET state = 'expired' WHERE id = p_duel_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.snake_duels_expire(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.snake_duels_expire(uuid) TO authenticated;

-- Public duel state. Strangers see the tier and challenge terms on an open
-- challenge, and nothing else while it is live. Duelists see their own hole
-- cards while live; after completion, both holes and the board stay
-- participant-only (a duel's cards are never public).
CREATE OR REPLACE FUNCTION public.snake_duels_state(p_duel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d record;
  v_uid uuid := auth.uid();
  v_is_challenger boolean;
  v_is_opponent boolean;
  v_ch_name text;
  v_op_name text;
BEGIN
  SELECT * INTO d FROM public.snake_duels WHERE id = p_duel_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'duel not found'; END IF;
  PERFORM public.snake_duels_expire(p_duel_id);
  SELECT * INTO d FROM public.snake_duels WHERE id = p_duel_id;
  v_is_challenger := (v_uid = d.challenger);
  v_is_opponent := (v_uid = d.opponent);
  -- Snake display names from the registry snapshots (asset keys are not names).
  SELECT trait_snapshot->>'name' INTO v_ch_name
  FROM public.hatchling_stakes_animals WHERE asset_key = d.challenger_snake;
  SELECT trait_snapshot->>'name' INTO v_op_name
  FROM public.hatchling_stakes_animals WHERE asset_key = d.opponent_snake;
  RETURN jsonb_build_object(
    'id', d.id,
    'state', d.state,
    'tier', d.tier,
    'challenger', CASE WHEN v_is_challenger OR v_is_opponent THEN d.challenger END,
    'opponent', CASE WHEN v_is_challenger OR v_is_opponent THEN d.opponent END,
    'challenger_snake', CASE
       WHEN v_is_challenger OR v_is_opponent THEN d.challenger_snake
       WHEN d.state = 'open' THEN d.challenger_snake END,
    'opponent_snake', CASE WHEN v_is_challenger OR v_is_opponent THEN d.opponent_snake END,
    'challenger_snake_name', CASE
       WHEN v_is_challenger OR v_is_opponent THEN v_ch_name
       WHEN d.state = 'open' THEN v_ch_name END,
    'opponent_snake_name', CASE WHEN v_is_challenger OR v_is_opponent THEN v_op_name END,
    'challenger_decided', d.challenger_decision IS NOT NULL,
    'opponent_decided', d.opponent_decision IS NOT NULL,
    'created_at', d.created_at,
    'expires_at', d.expires_at,
    'winner', d.winner,
    'win_reason', d.win_reason,
    'winning_hand', d.winning_hand,
    'is_challenger', v_is_challenger,
    'is_opponent', v_is_opponent,
    'can_accept', d.state = 'open' AND NOT v_is_challenger AND v_uid IS NOT NULL,
    'my_hole', CASE
       WHEN d.state IN ('in_progress', 'settling')
            AND ((v_is_challenger AND d.challenger_hole IS NOT NULL)
              OR (v_is_opponent AND d.opponent_hole IS NOT NULL)) THEN
         CASE WHEN v_is_challenger THEN d.challenger_hole ELSE d.opponent_hole END
       WHEN d.state = 'complete' AND (v_is_challenger OR v_is_opponent) THEN
         CASE WHEN v_is_challenger THEN d.challenger_hole ELSE d.opponent_hole END
       END,
    'my_decision', CASE WHEN v_is_challenger THEN d.challenger_decision
                        WHEN v_is_opponent THEN d.opponent_decision END,
    'my_snake', CASE WHEN v_is_challenger THEN d.challenger_snake
                     WHEN v_is_opponent THEN d.opponent_snake END,
    'board', CASE WHEN d.state = 'complete' AND d.deck IS NOT NULL
                   AND (v_is_challenger OR v_is_opponent)
                  THEN (SELECT jsonb_agg(x ORDER BY ord)
                        FROM jsonb_array_elements_text(d.deck) WITH ORDINALITY AS t(x, ord)
                        WHERE ord BETWEEN 5 AND 9)
             END,
    'challenger_hole', CASE WHEN d.state = 'complete' AND (v_is_challenger OR v_is_opponent)
                            THEN d.challenger_hole END,
    'opponent_hole', CASE WHEN d.state = 'complete' AND (v_is_challenger OR v_is_opponent)
                          THEN d.opponent_hole END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.snake_duels_state(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.snake_duels_state(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- Arcade wallets
-- ----------------------------------------------------------------------------

-- First-sync seed: adopt the larger of the server balance and the device
-- balance, so signing in on a new device never wipes earned tokens.
CREATE OR REPLACE FUNCTION public.arcade_wallet_seed(p_amount integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  v_balance integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in.';
  END IF;
  INSERT INTO public.arcade_wallets (user_id, balance)
  VALUES (uid, greatest(0, coalesce(p_amount, 0)))
  ON CONFLICT (user_id) DO UPDATE
    SET balance = greatest(
          public.arcade_wallets.balance,
          greatest(0, coalesce(p_amount, 0))
        ),
        updated_at = now()
  RETURNING balance INTO v_balance;
  RETURN v_balance;
END
$$;
REVOKE ALL ON FUNCTION public.arcade_wallet_seed(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.arcade_wallet_seed(integer) TO authenticated;

-- Every earn/spend lands here: atomic, clamped at zero so a balance can
-- never go negative no matter how many devices spend at once.
CREATE OR REPLACE FUNCTION public.arcade_wallet_delta(p_delta integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  v_balance integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in.';
  END IF;
  INSERT INTO public.arcade_wallets (user_id, balance)
  VALUES (uid, greatest(0, coalesce(p_delta, 0)))
  ON CONFLICT (user_id) DO UPDATE
    SET balance = greatest(0, public.arcade_wallets.balance + coalesce(p_delta, 0)),
        updated_at = now()
  RETURNING balance INTO v_balance;
  RETURN v_balance;
END
$$;
REVOKE ALL ON FUNCTION public.arcade_wallet_delta(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.arcade_wallet_delta(integer) TO authenticated;

-- ----------------------------------------------------------------------------
-- Event codes
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redeem_event_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  v_code public.event_codes%ROWTYPE;
  v_claims integer;
  v_state jsonb;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sign in to redeem a code.');
  END IF;

  SELECT * INTO v_code FROM public.event_codes WHERE code = upper(btrim(p_code));
  IF NOT FOUND OR NOT v_code.active THEN
    RETURN jsonb_build_object('ok', false, 'error', 'That code is not active.');
  END IF;
  IF v_code.starts_at IS NOT NULL AND now() < v_code.starts_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'That code has not started yet.');
  END IF;
  IF v_code.expires_at IS NOT NULL AND now() > v_code.expires_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'That code has expired.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.event_code_claims c WHERE c.code = v_code.code AND c.user_id = uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You already claimed this code.');
  END IF;
  IF v_code.max_claims IS NOT NULL THEN
    SELECT count(*) INTO v_claims FROM public.event_code_claims c WHERE c.code = v_code.code;
    IF v_claims >= v_code.max_claims THEN
      RETURN jsonb_build_object('ok', false, 'error', 'That code is fully claimed.');
    END IF;
  END IF;

  IF v_code.reward_kind IN ('cash', 'enclosure') THEN
    SELECT state::jsonb INTO v_state FROM public.chondro_game_saves WHERE user_id = uid;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Start Arboreal Keeper first, then redeem this code.');
    END IF;
    IF v_code.reward_kind = 'cash' THEN
      v_state := jsonb_set(
        v_state,
        '{cash}',
        to_jsonb(coalesce((v_state ->> 'cash')::numeric, 0) + coalesce(v_code.reward_amount, 0)),
        true
      );
    ELSE
      v_state := jsonb_set(
        v_state,
        ARRAY['enclosures', v_code.reward_value],
        to_jsonb(coalesce((v_state -> 'enclosures' ->> v_code.reward_value)::integer, 0) + 1),
        true
      );
    END IF;
    UPDATE public.chondro_game_saves SET state = v_state, updated_at = now() WHERE user_id = uid;
  END IF;

  INSERT INTO public.event_code_claims (code, user_id) VALUES (v_code.code, uid);

  RETURN jsonb_build_object(
    'ok', true,
    'kind', v_code.reward_kind,
    'amount', v_code.reward_amount,
    'value', v_code.reward_value,
    'label', v_code.label
  );
END
$$;
REVOKE ALL ON FUNCTION public.redeem_event_code(text) FROM public;
GRANT EXECUTE ON FUNCTION public.redeem_event_code(text) TO authenticated;

-- ----------------------------------------------------------------------------
-- Exemption / gate checks
-- ----------------------------------------------------------------------------

-- True when the caller is exempt from Canopy Hunter expedition entry limits.
CREATE OR REPLACE FUNCTION public.canopy_hunter_is_exempt()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.canopy_hunter_exemptions WHERE user_id = auth.uid()
  );
$$;
REVOKE ALL ON FUNCTION public.canopy_hunter_is_exempt() FROM public;
GRANT EXECUTE ON FUNCTION public.canopy_hunter_is_exempt() TO authenticated;

-- True when the signed-in user may see the Canopy Hunter river port stop.
CREATE OR REPLACE FUNCTION public.canopy_hunter_port_dev()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.canopy_hunter_port_devs x
       WHERE x.user_id = auth.uid()
     );
$$;
REVOKE ALL ON FUNCTION public.canopy_hunter_port_dev() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.canopy_hunter_port_dev() TO authenticated;

-- True when the signed-in user has unlimited snake housing spaces.
CREATE OR REPLACE FUNCTION public.keeper_has_unlimited_spaces()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.keeper_unlimited_spaces x
       WHERE x.user_id = auth.uid()
     );
$$;
REVOKE ALL ON FUNCTION public.keeper_has_unlimited_spaces() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.keeper_has_unlimited_spaces() TO authenticated;

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
