CREATE OR REPLACE FUNCTION public.snake_duels_expire(p_duel_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d record;
BEGIN
  SELECT * INTO d FROM public.snake_duels WHERE id = p_duel_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF d.state NOT IN ('open', 'in_progress') THEN RETURN false; END IF;
  IF d.expires_at > now() THEN RETURN false; END IF;

  IF d.state = 'open' THEN
    UPDATE public.hatchling_stakes_animals SET state = 'active'
    WHERE asset_key = d.challenger_snake;
  ELSE
    UPDATE public.hatchling_stakes_animals SET state = 'active'
    WHERE asset_key IN (d.challenger_snake, d.opponent_snake);
  END IF;
  DELETE FROM public.hatchling_stakes_wager_locks WHERE wager_id = d.wager_id;
  UPDATE public.hatchling_stakes_tokens SET status = 'refunded', updated_at = now()
  WHERE wager_id = d.wager_id AND status = 'reserved';
  UPDATE public.hatchling_stakes_wagers SET state = 'void', updated_at = now()
  WHERE id = d.wager_id;
  UPDATE public.snake_duels SET state = 'expired' WHERE id = p_duel_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.snake_duels_expire(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.snake_duels_expire(uuid) TO authenticated;

-- Public duel state. Strangers see the tier and challenge terms on an open
-- challenge, and nothing else while it is live. Duelists see their own hole
-- cards while live; after completion, both holes and the board stay
-- participant-only (a duel's cards are never public).
