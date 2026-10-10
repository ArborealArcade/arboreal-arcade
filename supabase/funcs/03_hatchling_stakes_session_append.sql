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
