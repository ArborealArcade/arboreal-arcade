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
