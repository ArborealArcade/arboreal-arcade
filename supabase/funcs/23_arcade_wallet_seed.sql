CREATE OR REPLACE FUNCTION public.arcade_wallet_seed(p_amount integer)
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
  VALUES (uid, greatest(0, coalesce(p_amount, 0)))
  ON CONFLICT (user_id) DO UPDATE
    SET balance = greatest(
          public.arcade_wallets.balance,
          greatest(0, coalesce(p_amount, 0))
        ),
        updated_at = now()
  RETURNING balance INTO v_balance;
  RETURN v_balance;
END
$$;
REVOKE ALL ON FUNCTION public.arcade_wallet_seed(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.arcade_wallet_seed(integer) TO authenticated;

-- Every earn/spend lands here: atomic, clamped at zero so a balance can
-- never go negative no matter how many devices spend at once.
