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
