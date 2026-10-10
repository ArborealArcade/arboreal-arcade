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
