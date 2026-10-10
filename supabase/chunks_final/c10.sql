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

