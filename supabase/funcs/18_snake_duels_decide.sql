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
