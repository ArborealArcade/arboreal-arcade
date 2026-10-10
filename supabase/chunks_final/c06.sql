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
