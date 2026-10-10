CREATE OR REPLACE FUNCTION public.snake_duels_rank_name(p_rank int)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$ SELECT CASE p_rank
  WHEN 14 THEN 'Ace' WHEN 13 THEN 'King' WHEN 12 THEN 'Queen' WHEN 11 THEN 'Jack'
  ELSE p_rank::text END $$;

-- Compare two eval scores: 1 / 0 / -1.
