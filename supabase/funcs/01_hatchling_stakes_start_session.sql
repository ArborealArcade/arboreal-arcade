CREATE OR REPLACE FUNCTION public.hatchling_stakes_start_session(
  p_wager_id uuid, p_seed_commitment text, p_shoe jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_state text;
  v_creator uuid;
BEGIN
  SELECT state, creator INTO v_state, v_creator FROM public.hatchling_stakes_wagers
  WHERE id = p_wager_id FOR UPDATE;
  IF NOT FOUND OR v_creator <> auth.uid() THEN
    RAISE EXCEPTION 'wager not found';
  END IF;
  IF v_state <> 'locked' THEN
    RAISE EXCEPTION 'wager not lockable';
  END IF;
  IF p_shoe IS NULL OR jsonb_array_length(p_shoe) < 100 THEN
    RAISE EXCEPTION 'bad shoe';
  END IF;

  UPDATE public.hatchling_stakes_game_sessions
  SET seed_commitment = p_seed_commitment, shoe = p_shoe, state = 'in_progress',
      updated_at = now()
  WHERE wager_id = p_wager_id AND state = 'awaiting_shoe';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not ready';
  END IF;

  UPDATE public.hatchling_stakes_wagers
  SET state = 'in_progress', updated_at = now()
  WHERE id = p_wager_id;

  UPDATE public.hatchling_stakes_tokens
  SET status = 'consumed', updated_at = now()
  WHERE wager_id = p_wager_id AND status = 'reserved';

  INSERT INTO public.hatchling_stakes_wager_events (wager_id, seq, type, payload_hash, payload)
  VALUES (p_wager_id,
          (SELECT COALESCE(max(seq), 0) + 1 FROM public.hatchling_stakes_wager_events WHERE wager_id = p_wager_id),
          'session_started', encode(digest(p_seed_commitment, 'sha256'), 'hex'),
          jsonb_build_object('seed_commitment', p_seed_commitment));

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.hatchling_stakes_start_session(uuid, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.hatchling_stakes_start_session(uuid, text, jsonb) TO authenticated;

-- Draw the next N cards from the server shoe. The browser never sees undealt cards.
