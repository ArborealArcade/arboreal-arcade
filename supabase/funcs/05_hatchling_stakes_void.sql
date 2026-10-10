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
