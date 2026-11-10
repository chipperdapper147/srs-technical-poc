-- A graded answer's FSRS rating follows its verdict (ratingForVerdict in
-- packages/shared/src/grading.ts): wrong 1, typo 2, exact 3. The revlog copy agrees.
SELECT id, verdict, rating, revlog ->> 'rating' AS revlog_rating
FROM review_logs
WHERE rating <> CASE verdict WHEN 'wrong' THEN 1 WHEN 'typo' THEN 2 WHEN 'exact' THEN 3 END
   OR (revlog ->> 'rating')::int <> rating;
