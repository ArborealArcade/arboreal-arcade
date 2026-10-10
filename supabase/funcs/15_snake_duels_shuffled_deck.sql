CREATE OR REPLACE FUNCTION public.snake_duels_shuffled_deck()
RETURNS text[]
LANGUAGE plpgsql
SET search_path = public, extensions
AS $func$
DECLARE
  v_ranks text[] := ARRAY['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  v_suits text[] := ARRAY['s','h','d','c'];
  deck text[] := '{}';
  r text; s text;
  i int; j int; tmp text;
  rb bytea;
BEGIN
  FOREACH r IN ARRAY v_ranks LOOP
    FOREACH s IN ARRAY v_suits LOOP
      deck := deck || (r || s);
    END LOOP;
  END LOOP;
  FOR i IN REVERSE 52..2 LOOP
    rb := gen_random_bytes(2);
    j := 1 + ((get_byte(rb, 0) * 256 + get_byte(rb, 1)) % i);
    tmp := deck[i]; deck[i] := deck[j]; deck[j] := tmp;
  END LOOP;
  RETURN deck;
END;
$func$;
REVOKE ALL ON FUNCTION public.snake_duels_shuffled_deck() FROM public;

-- Create a challenge. The challenger's snake + one weekly token are escrowed.
-- The duel tier comes from the snake's registered tier. Returns the duel id
-- (the challenge link).
