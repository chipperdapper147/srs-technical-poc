-- A graded answer's FSRS rating follows its verdict and hints (ratingForAnswer
-- in packages/shared/src/grading.ts): wrong 1, typo 2, exact 3; any hint caps
-- it at Hard (2), and the whole word hinted makes it Again (1), so a hinted
-- rating is checked only for the cap. An overridden answer ("I was right",
-- only from wrong or typo) is rated as exact would be. The revlog copy agrees.
SELECT id, verdict, hints, overridden_at, rating, revlog ->> 'rating' AS revlog_rating
FROM review_logs
WHERE (revlog ->> 'rating')::int <> rating
   OR (overridden_at IS NOT NULL AND verdict = 'exact')
   OR (hints > 0 AND rating > 2)
   OR (hints = 0 AND rating <> CASE
         WHEN overridden_at IS NOT NULL THEN 3
         ELSE CASE verdict WHEN 'wrong' THEN 1 WHEN 'typo' THEN 2 WHEN 'exact' THEN 3 END
       END);
