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
