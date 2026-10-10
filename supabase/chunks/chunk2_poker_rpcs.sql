-- ============================================================================
-- §9 RPC FUNCTIONS (all SECURITY DEFINER; called with the player's own JWT)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Poker / lifesap
-- ----------------------------------------------------------------------------

-- Return the caller's bankroll, creating it at 1000 on first use.
CREATE OR REPLACE FUNCTION public.lifesap_get_bankroll()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance bigint;
BEGIN
  INSERT INTO public.lifesap_bankrolls (user_id, balance)
  VALUES (auth.uid(), 1000)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT balance INTO v_balance FROM public.lifesap_bankrolls WHERE user_id = auth.uid();
  RETURN v_balance;
END;
$$;
REVOKE ALL ON FUNCTION public.lifesap_get_bankroll() FROM public;
GRANT EXECUTE ON FUNCTION public.lifesap_get_bankroll() TO authenticated;

-- Table limits (per game) and max payout multipliers (× bet, incl. returned stake).
-- These bounds are the anti-mint: the client reports a hand result, the server
-- caps what it can be worth.
CREATE OR REPLACE FUNCTION public.poker_game_limits(p_game text)
RETURNS TABLE (max_bet bigint, max_payout_mult numeric)
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  CASE p_game
    WHEN 'holdem' THEN RETURN QUERY SELECT 1000::bigint, 6::numeric;
    WHEN 'blackjack' THEN RETURN QUERY SELECT 500::bigint, 12::numeric;
    WHEN 'draw' THEN RETURN QUERY SELECT 50::bigint, 30000::numeric;
    ELSE RAISE EXCEPTION 'unknown game %', p_game;
  END CASE;
END;
$$;

-- Debit a bet and open a round. Voids (refunds) the caller's expired open rounds first.
CREATE OR REPLACE FUNCTION public.poker_place_bet(p_game text, p_bet bigint)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_bet bigint;
  v_balance bigint;
  v_round_id uuid;
  v_exp interval;
BEGIN
  IF p_game NOT IN ('holdem', 'blackjack', 'draw') THEN
    RAISE EXCEPTION 'unknown game %', p_game;
  END IF;
  SELECT max_bet INTO v_max_bet FROM public.poker_game_limits(p_game);
  IF p_bet IS NULL OR p_bet <= 0 OR p_bet > v_max_bet THEN
    RAISE EXCEPTION 'bet out of range';
  END IF;

  INSERT INTO public.lifesap_bankrolls (user_id, balance)
  VALUES (auth.uid(), 1000)
  ON CONFLICT (user_id) DO NOTHING;

  -- Refund expired open rounds before opening a new one.
  UPDATE public.poker_rounds
  SET state = 'voided', updated_at = now()
  WHERE user_id = auth.uid() AND state = 'open' AND expires_at < now();

  UPDATE public.lifesap_bankrolls b
  SET balance = b.balance + r.bet + r.added_bet, updated_at = now()
  FROM public.poker_rounds r
  WHERE r.user_id = auth.uid() AND r.state = 'voided' AND r.payout IS NULL
    AND b.user_id = auth.uid()
    AND r.updated_at > now() - interval '1 minute';
  -- Mark refunded so the sweep above never double-refunds.
  UPDATE public.poker_rounds
  SET payout = 0
  WHERE user_id = auth.uid() AND state = 'voided' AND payout IS NULL
    AND updated_at > now() - interval '1 minute';

  IF EXISTS (SELECT 1 FROM public.poker_rounds
             WHERE user_id = auth.uid() AND game = p_game AND state = 'open') THEN
    RAISE EXCEPTION 'settle your open % round first', p_game;
  END IF;

  SELECT balance INTO v_balance FROM public.lifesap_bankrolls WHERE user_id = auth.uid();
  IF v_balance < p_bet THEN
    RAISE EXCEPTION 'insufficient lifesap';
  END IF;

  v_exp := CASE WHEN p_game = 'holdem' THEN interval '24 hours' ELSE interval '2 hours' END;

  UPDATE public.lifesap_bankrolls
  SET balance = balance - p_bet, updated_at = now()
  WHERE user_id = auth.uid();

  INSERT INTO public.poker_rounds (user_id, game, bet, expires_at)
  VALUES (auth.uid(), p_game, p_bet, now() + v_exp)
  RETURNING id INTO v_round_id;

  INSERT INTO public.lifesap_ledger (user_id, delta, balance_after, game, round_ref, reason)
  VALUES (auth.uid(), -p_bet, v_balance - p_bet, p_game, v_round_id, 'bet placed');

  RETURN v_round_id;
END;
$$;
REVOKE ALL ON FUNCTION public.poker_place_bet(text, bigint) FROM public;
GRANT EXECUTE ON FUNCTION public.poker_place_bet(text, bigint) TO authenticated;

-- Hold'em rebuys top up the open round's stake (capped).
CREATE OR REPLACE FUNCTION public.poker_add_rebuy(p_round_id uuid, p_amount bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance bigint;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 1000 THEN
    RAISE EXCEPTION 'rebuy out of range';
  END IF;
  SELECT balance INTO v_balance FROM public.lifesap_bankrolls WHERE user_id = auth.uid();
  IF v_balance IS NULL OR v_balance < p_amount THEN
    RAISE EXCEPTION 'insufficient lifesap';
  END IF;
  UPDATE public.poker_rounds
  SET added_bet = added_bet + p_amount, updated_at = now()
  WHERE id = p_round_id AND user_id = auth.uid() AND game = 'holdem' AND state = 'open'
    AND bet + added_bet + p_amount <= 3000;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no open holdem round for rebuy';
  END IF;
  UPDATE public.lifesap_bankrolls SET balance = balance - p_amount, updated_at = now()
  WHERE user_id = auth.uid();
  INSERT INTO public.lifesap_ledger (user_id, delta, balance_after, game, round_ref, reason)
  VALUES (auth.uid(), -p_amount, v_balance - p_amount, 'holdem', p_round_id, 'rebuy');
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.poker_add_rebuy(uuid, bigint) FROM public;
GRANT EXECUTE ON FUNCTION public.poker_add_rebuy(uuid, bigint) TO authenticated;

-- Credit a bounded payout for an open round. The client reports the result;
-- the server caps what it can be worth (see poker_game_limits).
-- p_risked (blackjack only): total lifesap actually put at risk this hand
-- (doubles/splits/insurance). The server debits any risk beyond the opening
-- bet first, then bounds the payout at 2.5x risked (blackjack pays 3:2).
CREATE OR REPLACE FUNCTION public.poker_settle_round(p_round_id uuid, p_payout bigint, p_risked bigint DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.poker_rounds%ROWTYPE;
  v_max_mult numeric;
  v_max_payout bigint;
  v_balance bigint;
  v_risked bigint;
  v_extra bigint;
BEGIN
  SELECT * INTO r FROM public.poker_rounds
  WHERE id = p_round_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'round not found';
  END IF;
  IF r.state <> 'open' THEN
    RAISE EXCEPTION 'round already settled';
  END IF;

  IF r.game = 'blackjack' AND p_risked IS NOT NULL THEN
    -- Blackjack: risk is only known once the hand is played.
    v_risked := p_risked;
    IF v_risked < r.bet OR v_risked > r.bet * 5 THEN
      RAISE EXCEPTION 'risk out of bounds';
    END IF;
    v_extra := v_risked - r.bet;
    SELECT balance INTO v_balance FROM public.lifesap_bankrolls WHERE user_id = auth.uid() FOR UPDATE;
    IF v_balance < v_extra THEN
      RAISE EXCEPTION 'insufficient lifesap';
    END IF;
    IF v_extra > 0 THEN
      UPDATE public.lifesap_bankrolls SET balance = balance - v_extra, updated_at = now()
      WHERE user_id = auth.uid();
      INSERT INTO public.lifesap_ledger (user_id, delta, balance_after, game, round_ref, reason)
      VALUES (auth.uid(), -v_extra, v_balance - v_extra, r.game, p_round_id, 'extra risk (double/split/insurance)');
      v_balance := v_balance - v_extra;
    END IF;
    v_max_payout := floor(v_risked * 2.5)::bigint;
  ELSE
    SELECT max_payout_mult INTO v_max_mult FROM public.poker_game_limits(r.game);
    v_max_payout := floor((r.bet + r.added_bet) * v_max_mult)::bigint;
  END IF;

  IF p_payout IS NULL OR p_payout < 0 OR p_payout > v_max_payout THEN
    RAISE EXCEPTION 'payout out of bounds';
  END IF;

  UPDATE public.poker_rounds
  SET state = 'settled', payout = p_payout, updated_at = now()
  WHERE id = p_round_id;

  UPDATE public.lifesap_bankrolls
  SET balance = balance + p_payout, updated_at = now()
  WHERE user_id = auth.uid()
  RETURNING balance INTO v_balance;

  INSERT INTO public.lifesap_ledger (user_id, delta, balance_after, game, round_ref, reason)
  VALUES (auth.uid(), p_payout, v_balance, r.game, p_round_id, 'round settled');

  RETURN v_balance;
END;
$$;
REVOKE ALL ON FUNCTION public.poker_settle_round(uuid, bigint, bigint) FROM public;
GRANT EXECUTE ON FUNCTION public.poker_settle_round(uuid, bigint, bigint) TO authenticated;

-- Arcade cashier: convert lifesap into arcade tokens.
-- Debits the caller's bankroll directly (no game round is opened) and records the
-- debit in lifesap_ledger with reason 'arcade conversion'. The token credit happens
-- client-side in the arcade wallet; the server only burns the lifesap.
-- Rate is enforced client-side (100 lifesap = 1 token); the server only enforces
-- that the amount is a positive multiple of 100, within a per-call cap, and that
-- at least 500 lifesap stays in the stack so the keeper can keep playing.
CREATE OR REPLACE FUNCTION public.poker_convert_lifesap(p_amount bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance bigint;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount % 100 <> 0 THEN
    RAISE EXCEPTION 'conversion amount must be a positive multiple of 100';
  END IF;
  IF p_amount > 10000 THEN
    RAISE EXCEPTION 'conversion capped at 10000 lifesap per call';
  END IF;

  INSERT INTO public.lifesap_bankrolls (user_id, balance)
  VALUES (auth.uid(), 1000)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance INTO v_balance FROM public.lifesap_bankrolls WHERE user_id = auth.uid();
  IF v_balance IS NULL OR v_balance - p_amount < 500 THEN
    RAISE EXCEPTION 'insufficient lifesap (500 must stay in your stack)';
  END IF;

  UPDATE public.lifesap_bankrolls
  SET balance = balance - p_amount, updated_at = now()
  WHERE user_id = auth.uid();

  INSERT INTO public.lifesap_ledger (user_id, delta, balance_after, game, round_ref, reason)
  VALUES (auth.uid(), -p_amount, v_balance - p_amount, 'cashier', NULL, 'arcade conversion');

  RETURN v_balance - p_amount;
END;
$$;
REVOKE ALL ON FUNCTION public.poker_convert_lifesap(bigint) FROM public;
GRANT EXECUTE ON FUNCTION public.poker_convert_lifesap(bigint) TO authenticated;

-- Bust-out bailout: a signed-in keeper whose stack falls under 100 lifesap can
-- claim a top-up back to 500 once per calendar day (server UTC). This keeps a
-- busted player in the game without creating a farmable token faucet: the
-- conversion floor (500 must stay in the stack) means bailout lifesap can only
-- become tokens after genuine winnings at the tables.
CREATE OR REPLACE FUNCTION public.poker_claim_bailout()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance bigint;
BEGIN
  INSERT INTO public.lifesap_bankrolls (user_id, balance)
  VALUES (auth.uid(), 1000)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance INTO v_balance FROM public.lifesap_bankrolls WHERE user_id = auth.uid();

  IF v_balance IS NULL OR v_balance >= 100 THEN
    RAISE EXCEPTION 'bailout only when busted (under 100 lifesap)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.lifesap_ledger
    WHERE user_id = auth.uid()
      AND reason = 'daily bailout'
      AND created_at >= date_trunc('day', now())
  ) THEN
    RAISE EXCEPTION 'bailout already claimed today';
  END IF;

  UPDATE public.lifesap_bankrolls
  SET balance = 500, updated_at = now()
  WHERE user_id = auth.uid();

  INSERT INTO public.lifesap_ledger (user_id, delta, balance_after, game, round_ref, reason)
  VALUES (auth.uid(), 500 - v_balance, 500, 'cashier', NULL, 'daily bailout');

  RETURN 500;
END;
$$;
REVOKE ALL ON FUNCTION public.poker_claim_bailout() FROM public;
GRANT EXECUTE ON FUNCTION public.poker_claim_bailout() TO authenticated;

-- ----------------------------------------------------------------------------
-- Hatchling Stakes
-- (search_path = public, extensions wherever pgcrypto helpers are used —
-- folds in 20260927_stakes_search_path_fix.sql)
-- ----------------------------------------------------------------------------

-- Weekly token ledger for the caller (creates this week's two slots).
-- Exempt callers get 'unlimited: true' and skip token consumption.
