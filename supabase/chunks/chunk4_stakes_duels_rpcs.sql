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
