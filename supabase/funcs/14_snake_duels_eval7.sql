CREATE OR REPLACE FUNCTION public.snake_duels_eval7(p_cards text[])
RETURNS public.snake_duels_eval
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $func$
DECLARE
  a int; b int; c int; d int; e int;
  ev public.snake_duels_eval;
  best public.snake_duels_eval;
  have_best boolean := false;
BEGIN
  IF coalesce(array_length(p_cards, 1), 0) <> 7 THEN
    RAISE EXCEPTION 'eval7 needs exactly 7 cards';
  END IF;
  FOR a IN 1..3 LOOP FOR b IN a + 1..4 LOOP FOR c IN b + 1..5 LOOP
  FOR d IN c + 1..6 LOOP FOR e IN d + 1..7 LOOP
    ev := public.snake_duels_eval5(ARRAY[p_cards[a], p_cards[b], p_cards[c], p_cards[d], p_cards[e]]);
    IF NOT have_best OR public.snake_duels_cmp_score(ev.score, best.score) > 0 THEN
      best := ev; have_best := true;
    END IF;
  END LOOP; END LOOP; END LOOP; END LOOP; END LOOP;
  RETURN best;
END;
$func$;

-- CSPRNG-shuffled 52-card deck. Called only from inside SECURITY DEFINER
-- functions; never exposed to callers.
