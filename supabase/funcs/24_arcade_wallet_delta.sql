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
