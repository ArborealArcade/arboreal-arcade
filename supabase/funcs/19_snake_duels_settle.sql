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
