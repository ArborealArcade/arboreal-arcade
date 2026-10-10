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
