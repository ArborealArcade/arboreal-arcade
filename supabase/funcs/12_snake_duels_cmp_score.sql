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
