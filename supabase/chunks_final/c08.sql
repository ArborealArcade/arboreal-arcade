CREATE OR REPLACE FUNCTION public.snake_duels_rank_name(p_rank int)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$ SELECT CASE p_rank
  WHEN 14 THEN 'Ace' WHEN 13 THEN 'King' WHEN 12 THEN 'Queen' WHEN 11 THEN 'Jack'
  ELSE p_rank::text END $$;

-- Compare two eval scores: 1 / 0 / -1.
CREATE OR REPLACE FUNCTION public.snake_duels_cmp_score(a int[], b int[])
RETURNS int
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $func$
DECLARE
  i int;
  n int;
  d int;
BEGIN
  n := greatest(coalesce(array_length(a, 1), 0), coalesce(array_length(b, 1), 0));
  FOR i IN 1..n LOOP
    d := coalesce(a[i], 0) - coalesce(b[i], 0);
    IF d <> 0 THEN
      RETURN CASE WHEN d > 0 THEN 1 ELSE -1 END;
    END IF;
  END LOOP;
  RETURN 0;
END;
$func$;

-- Evaluate one 5-card hand. Cards are "As"-style strings ("10d" for ten).
CREATE OR REPLACE FUNCTION public.snake_duels_eval5(p_cards text[])
RETURNS public.snake_duels_eval
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $func$
DECLARE
  c text;
  rank_txt text;
  v_rank int;
  sr int[] := '{}';      -- ranks sorted desc
  v_suits text[] := '{}';
  i int; j int; tmp int;
  v_flush boolean;
  v_uniq int[] := '{}';  -- distinct ranks desc
  v_straight int := 0;
  v_counts int[] := array_fill(0, ARRAY[15]);
  v_grank int[] := '{}'; -- group ranks: count desc, then rank desc
  v_gcount int[] := '{}';
  v_score int[];
  v_name text;
  v_kickers int[];
BEGIN
  IF coalesce(array_length(p_cards, 1), 0) <> 5 THEN
    RAISE EXCEPTION 'eval5 needs exactly 5 cards';
  END IF;
  FOREACH c IN ARRAY p_cards LOOP
    rank_txt := substring(c from 1 for char_length(c) - 1);
    v_rank := CASE upper(rank_txt)
      WHEN 'A' THEN 14 WHEN 'K' THEN 13 WHEN 'Q' THEN 12 WHEN 'J' THEN 11
      ELSE rank_txt::int END;
    sr := sr || v_rank;
    v_suits := v_suits || lower(right(c, 1));
  END LOOP;
  -- insertion sort, descending
  FOR i IN 2..5 LOOP
    tmp := sr[i]; j := i - 1;
    WHILE j >= 1 AND sr[j] < tmp LOOP sr[j + 1] := sr[j]; j := j - 1; END LOOP;
    sr[j + 1] := tmp;
  END LOOP;
  v_flush := v_suits[1] = v_suits[2] AND v_suits[2] = v_suits[3]
         AND v_suits[3] = v_suits[4] AND v_suits[4] = v_suits[5];
  FOR i IN 1..5 LOOP
    IF i = 1 OR sr[i] <> sr[i - 1] THEN v_uniq := v_uniq || sr[i]; END IF;
  END LOOP;
  IF array_length(v_uniq, 1) = 5 THEN
    IF v_uniq[1] - v_uniq[5] = 4 THEN v_straight := v_uniq[1];
    ELSIF v_uniq[1] = 14 AND v_uniq[2] = 5 THEN v_straight := 5; END IF;
  END IF;
  FOR i IN 1..5 LOOP v_counts[sr[i]] := v_counts[sr[i]] + 1; END LOOP;
  FOR i IN REVERSE 4..1 LOOP
    FOR v_rank IN REVERSE 2..14 LOOP
      IF v_counts[v_rank] = i THEN
        v_grank := v_grank || v_rank;
        v_gcount := v_gcount || i;
      END IF;
    END LOOP;
  END LOOP;

  IF v_straight > 0 AND v_flush THEN
    v_score := ARRAY[8, v_straight];
    v_name := CASE WHEN v_straight = 14 THEN 'Royal Flush'
      ELSE 'Straight Flush, ' || public.snake_duels_rank_name(v_straight) || ' high' END;
  ELSIF v_gcount[1] = 4 THEN
    v_kickers := '{}';
    FOR i IN 1..5 LOOP IF sr[i] <> v_grank[1] THEN v_kickers := v_kickers || sr[i]; END IF; END LOOP;
    v_score := ARRAY[7, v_grank[1], v_kickers[1]];
    v_name := 'Four of a Kind, ' || public.snake_duels_rank_name(v_grank[1]) || 's';
  ELSIF v_gcount[1] = 3 AND v_gcount[2] = 2 THEN
    v_score := ARRAY[6, v_grank[1], v_grank[2]];
    v_name := 'Full House, ' || public.snake_duels_rank_name(v_grank[1]) || 's over '
           || public.snake_duels_rank_name(v_grank[2]) || 's';
  ELSIF v_flush THEN
    v_score := ARRAY[5] || sr;
    v_name := 'Flush, ' || public.snake_duels_rank_name(sr[1]) || ' high';
  ELSIF v_straight > 0 THEN
    v_score := ARRAY[4, v_straight];
    v_name := 'Straight, ' || public.snake_duels_rank_name(v_straight) || ' high';
  ELSIF v_gcount[1] = 3 THEN
    v_kickers := '{}';
    FOR i IN 1..5 LOOP IF sr[i] <> v_grank[1] THEN v_kickers := v_kickers || sr[i]; END IF; END LOOP;
    v_score := ARRAY[3, v_grank[1]] || v_kickers;
    v_name := 'Three of a Kind, ' || public.snake_duels_rank_name(v_grank[1]) || 's';
  ELSIF v_gcount[1] = 2 AND v_gcount[2] = 2 THEN
    v_kickers := '{}';
    FOR i IN 1..5 LOOP
      IF sr[i] <> v_grank[1] AND sr[i] <> v_grank[2] THEN v_kickers := v_kickers || sr[i]; END IF;
    END LOOP;
    v_score := ARRAY[2, v_grank[1], v_grank[2]] || v_kickers;
    v_name := 'Two Pair, ' || public.snake_duels_rank_name(v_grank[1]) || 's and '
           || public.snake_duels_rank_name(v_grank[2]) || 's';
  ELSIF v_gcount[1] = 2 THEN
    v_kickers := '{}';
    FOR i IN 1..5 LOOP IF sr[i] <> v_grank[1] THEN v_kickers := v_kickers || sr[i]; END IF; END LOOP;
    v_score := ARRAY[1, v_grank[1]] || v_kickers;
    v_name := 'Pair of ' || public.snake_duels_rank_name(v_grank[1]) || 's';
  ELSE
    v_score := ARRAY[0] || sr;
    v_name := public.snake_duels_rank_name(sr[1]) || ' high';
  END IF;
  RETURN (v_score, v_name)::public.snake_duels_eval;
END;
$func$;

-- Best 5-card hand out of 7 (all 21 combos).
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
