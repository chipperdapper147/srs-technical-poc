-- Production-shaped data for the migration rehearsal (scripts/schema/rehearse.ts).
--
-- Volume and awkward cases, not realistic content: duplicate terms in a unit,
-- surrounding whitespace, 500-character terms, decomposed vs composed accents,
-- empty alternatives, notes with quotes and newlines, NULL durations, cards in
-- every FSRS state with due dates in the past and future. Deterministic: no
-- random(), so a failure reproduces.
--
-- It must apply cleanly to the schema AT THE SAME COMMIT. The rehearsal runs the
-- base commit's copy of this file before applying a change's migrations, and
-- checks the head copy against the head schema: a schema change updates it.
--
-- Scale with `psql -v scale=N` (default 1: ~2k users, 88k items, 100k cards,
-- 200k review logs).

\set ON_ERROR_STOP on
\if :{?scale}
\else
  \set scale 1
\endif

BEGIN;

INSERT INTO users (auth_sub, display_name, grading_mode, accent_sensitive, new_items_per_session)
SELECT
  'rehearsal|' || i,
  CASE
    WHEN i % 97 = 0 THEN ''
    WHEN i % 50 = 0 THEN 'Zoë Ñúñez ' || i
    ELSE 'Learner ' || i
  END,
  (CASE WHEN i % 7 = 0 THEN 'strict' ELSE 'lenient' END)::grading_mode,
  i % 11 = 0,
  1 + (i % 50)
FROM generate_series(1, 2000 * :scale) AS i;

-- 20 shared courses (no owner), one owned course per 10 learners.
INSERT INTO courses (owner_id, title, description, source_lang, target_lang, grading_mode, accent_sensitive)
SELECT NULL, 'Shared course ' || i, '', 'en', (ARRAY['es', 'fr', 'de', 'pt-BR', 'ja', 'zh-Hant'])[1 + i % 6], NULL, NULL
FROM generate_series(1, 20) AS i
UNION ALL
SELECT
  u.id,
  CASE WHEN u.n % 13 = 0 THEN repeat('Long title ', 18) ELSE 'Course of learner ' || u.n END,
  CASE WHEN u.n % 3 = 0 THEN E'Description with "quotes"\nand a second line' ELSE '' END,
  'en',
  (ARRAY['es', 'fr', 'de', 'pt-BR', 'ja', 'zh-Hant'])[1 + u.n % 6],
  CASE u.n % 5 WHEN 0 THEN 'strict'::grading_mode WHEN 1 THEN 'lenient'::grading_mode END,
  CASE u.n % 4 WHEN 0 THEN true WHEN 1 THEN false END
FROM (SELECT id, row_number() OVER (ORDER BY auth_sub) AS n FROM users) AS u
WHERE u.n % 10 = 0;

INSERT INTO units (course_id, position, title)
SELECT c.id, p, 'Unit ' || p
FROM courses AS c, generate_series(1, 10) AS p;

INSERT INTO items (unit_id, position, term, definition, alternatives, notes)
SELECT
  u.id,
  p,
  CASE
    WHEN p % 37 = 0 THEN 'término ' || (p - 1) -- duplicates the previous item's term
    WHEN p % 29 = 0 THEN repeat('larga', 100)
    WHEN p % 23 = 0 THEN '  Espacios ' || p || '  '
    ELSE 'término ' || p
  END,
  'definition ' || p,
  CASE
    WHEN p % 19 = 0 THEN ARRAY['']
    WHEN p % 17 = 0 THEN ARRAY[normalize('canción', NFD), normalize('canción', NFC)]
    WHEN p % 5 = 0 THEN ARRAY['alt ' || p, 'otra ' || p]
    ELSE '{}'::text[]
  END,
  CASE WHEN p % 9 = 0 THEN E'Note with "quotes", commas\nand a newline' ELSE '' END
FROM units AS u, generate_series(1, 40) AS p;

-- Cards: every 4th learner has studied half of a 400-item sample.
INSERT INTO cards (
  user_id, item_id, due_at, last_review_at, stability, stability_fast, difficulty,
  scheduled_days, learning_step, reps, lapses, state, schedule_status
)
SELECT
  u.id,
  s.id,
  now() + ((s.m * u.n) % 60 - 20) * interval '1 day',
  CASE WHEN (s.m + u.n) % 4 = 0 THEN NULL ELSE now() - ((s.m + u.n) % 30) * interval '1 day' END,
  0.5 + (s.m % 30),
  0.1 + (s.m % 7) / 10.0,
  1 + (s.m % 9),
  s.m % 30,
  s.m % 3,
  s.m % 10,
  s.m % 3,
  (s.m + u.n) % 4,
  (ARRAY['new', 'learning', 'review', 'learning'])[1 + (s.m + u.n) % 4]
FROM (SELECT id, row_number() OVER (ORDER BY auth_sub) AS n FROM users) AS u
JOIN (SELECT id, row_number() OVER (ORDER BY id) AS m FROM items LIMIT 400) AS s ON (s.m + u.n) % 2 = 0
WHERE u.n % 4 = 0;

-- Two graded answers per card, revlog shaped like ts-fsrs's ReviewLog.
INSERT INTO review_logs (user_id, item_id, rating, answer, verdict, duration_ms, revlog, reviewed_at)
SELECT
  c.user_id,
  c.item_id,
  -- The app's ratingForVerdict: wrong 1, typo 2, exact 3 (Easy is unused).
  CASE (k + c.reps) % 4 WHEN 0 THEN 1 WHEN 1 THEN 2 ELSE 3 END,
  CASE WHEN (k + c.reps) % 4 = 0 THEN 'wrong answer' ELSE 'término' END,
  CASE (k + c.reps) % 4 WHEN 0 THEN 'wrong' WHEN 1 THEN 'typo' ELSE 'exact' END,
  CASE WHEN c.reps % 5 = 0 THEN NULL ELSE 1500 + c.reps * 100 END,
  jsonb_build_object(
    'rating', CASE (k + c.reps) % 4 WHEN 0 THEN 1 WHEN 1 THEN 2 ELSE 3 END,
    'state', c.state,
    'due', c.due_at,
    'stability', c.stability,
    'difficulty', c.difficulty,
    'elapsed_days', k,
    'last_elapsed_days', 0,
    'scheduled_days', c.scheduled_days,
    'learning_steps', c.learning_step,
    'review', c.due_at - interval '1 day'
  ),
  c.due_at - k * interval '1 day'
FROM cards AS c, generate_series(1, 2) AS k;

COMMIT;

ANALYZE;
