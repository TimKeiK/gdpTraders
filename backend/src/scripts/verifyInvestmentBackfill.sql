-- Task 5: Verification query — counts historical records still missing a plan
-- snapshot after the backfill (npm run backfill:investments).
-- Expected result after a successful backfill: still_null = 0.
SELECT
  COUNT(*) FILTER (WHERE assigned_plan IS NULL) AS still_null,          -- must be 0
  COUNT(*) FILTER (WHERE status = 'under_review') AS under_review,      -- legacy rows < $20
  COUNT(*) FILTER (WHERE assigned_plan IS NOT NULL) AS backfilled,
  COUNT(*) AS total
FROM investments;

-- Optional drill-down: list any rows the backfill could not assign a plan to.
SELECT id, user_id, initial_deposit, start_date, status
FROM investments
WHERE assigned_plan IS NULL
ORDER BY start_date;
