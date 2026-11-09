-- Desired state of the database. Atlas diffs this file against db/migrations
-- to generate new versioned migrations: `pnpm db:diff <name>`.
-- Never edit an applied migration; change this file and diff instead.

CREATE TYPE grading_mode AS ENUM ('lenient', 'strict');

-- People. `auth_sub` is the identity-provider subject (Auth0 `sub` once auth
-- lands; `dev|local` for the development stub user).
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  auth_sub text NOT NULL,
  display_name text NOT NULL,
  -- Default answer-grading settings; courses may override.
  grading_mode grading_mode NOT NULL DEFAULT 'lenient',
  accent_sensitive boolean NOT NULL DEFAULT false,
  new_items_per_session integer NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_auth_sub_key UNIQUE (auth_sub),
  CONSTRAINT users_new_items_per_session_check CHECK (new_items_per_session BETWEEN 1 AND 50)
);

-- A course teaches one target language to speakers of a source language.
-- Language codes are BCP 47 tags (e.g. 'es', 'pt-BR', 'ja').
CREATE TABLE courses (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  owner_id uuid NULL REFERENCES users (id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  source_lang text NOT NULL,
  target_lang text NOT NULL,
  -- NULL = inherit from the learner's settings.
  grading_mode grading_mode NULL,
  accent_sensitive boolean NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT courses_title_check CHECK (length(title) BETWEEN 1 AND 200),
  CONSTRAINT courses_source_lang_check CHECK (source_lang ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  CONSTRAINT courses_target_lang_check CHECK (target_lang ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$')
);
CREATE INDEX courses_owner_id_idx ON courses (owner_id);

-- Ordered groups of items within a course.
CREATE TABLE units (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  course_id uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  position integer NOT NULL,
  title text NOT NULL,
  CONSTRAINT units_course_id_position_key UNIQUE (course_id, position)
);

-- A vocabulary item. The learner is shown `definition` (source language)
-- and types `term` (target language). `alternatives` are other accepted answers.
CREATE TABLE items (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  unit_id uuid NOT NULL REFERENCES units (id) ON DELETE CASCADE,
  position integer NOT NULL,
  term text NOT NULL,
  definition text NOT NULL,
  alternatives text[] NOT NULL DEFAULT '{}',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT items_unit_id_position_key UNIQUE (unit_id, position),
  CONSTRAINT items_term_check CHECK (length(term) > 0),
  CONSTRAINT items_definition_check CHECK (length(definition) > 0)
);

-- FSRS scheduling state for one learner and one item. A row exists once the
-- learner has answered the item at least once. Columns mirror the ts-fsrs v6
-- card (FSRS-7 model); see apps/api/src/srs.ts for the mapping.
CREATE TABLE cards (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  due_at timestamptz NOT NULL,
  last_review_at timestamptz NULL,
  stability double precision NOT NULL,
  stability_fast double precision NOT NULL,
  difficulty double precision NOT NULL,
  scheduled_days double precision NOT NULL,
  learning_step integer NOT NULL,
  reps integer NOT NULL,
  lapses integer NOT NULL,
  -- ts-fsrs State: 0 New, 1 Learning, 2 Review, 3 Relearning
  state smallint NOT NULL,
  -- ts-fsrs scheduleStatus: 'new' | 'learning' | 'review'
  schedule_status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id),
  CONSTRAINT cards_state_check CHECK (state BETWEEN 0 AND 3)
);
CREATE INDEX cards_user_id_due_at_idx ON cards (user_id, due_at);

-- Append-only history of every graded answer. `revlog` is the raw ts-fsrs
-- review log (pre-review card snapshot + rating), kept verbatim so FSRS
-- parameters can be re-fitted per learner later.
CREATE TABLE review_logs (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  -- ts-fsrs Rating: 1 Again, 2 Hard, 3 Good, 4 Easy
  rating smallint NOT NULL,
  answer text NOT NULL,
  verdict text NOT NULL,
  duration_ms integer NULL,
  revlog jsonb NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT review_logs_rating_check CHECK (rating BETWEEN 1 AND 4),
  CONSTRAINT review_logs_verdict_check CHECK (verdict IN ('exact', 'typo', 'wrong'))
);
CREATE INDEX review_logs_user_id_reviewed_at_idx ON review_logs (user_id, reviewed_at);
CREATE INDEX review_logs_item_id_idx ON review_logs (item_id);
