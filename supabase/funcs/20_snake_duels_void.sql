CREATE OR REPLACE FUNCTION public.snake_duels_void(p_duel_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d record;
BEGIN
  SELECT * INTO d FROM public.snake_duels WHERE id = p_duel_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'duel not found'; END IF;
  IF d.state <> 'open' THEN RAISE EXCEPTION 'challenge not open'; END IF;
  IF d.challenger <> auth.uid() THEN RAISE EXCEPTION 'not your challenge'; END IF;
  UPDATE public.hatchling_stakes_animals SET state = 'active'
  WHERE asset_key = d.challenger_snake;
  DELETE FROM public.hatchling_stakes_wager_locks WHERE wager_id = d.wager_id;
  UPDATE public.hatchling_stakes_tokens SET status = 'refunded', updated_at = now()
  WHERE wager_id = d.wager_id AND status = 'reserved';
  UPDATE public.hatchling_stakes_wagers SET state = 'void', updated_at = now()
  WHERE id = d.wager_id;
  UPDATE public.snake_duels SET state = 'void' WHERE id = p_duel_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.snake_duels_void(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.snake_duels_void(uuid) TO authenticated;

-- Expire a duel whose clock ran out. Open: challenger's snake unlocks and
-- token is freed. In progress: both snakes go home and both tokens refunded.
