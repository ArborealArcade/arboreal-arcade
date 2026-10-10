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
