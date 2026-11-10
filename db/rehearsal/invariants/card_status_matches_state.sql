-- A card's schedule_status follows its FSRS state (apps/api/src/srs.ts):
-- 0 New -> new, 1 Learning and 3 Relearning -> learning, 2 Review -> review.
SELECT user_id, item_id, state, schedule_status
FROM cards
WHERE schedule_status <> (ARRAY['new', 'learning', 'review', 'learning'])[state + 1];
