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
