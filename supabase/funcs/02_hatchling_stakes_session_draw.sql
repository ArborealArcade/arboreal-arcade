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
