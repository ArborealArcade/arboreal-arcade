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
