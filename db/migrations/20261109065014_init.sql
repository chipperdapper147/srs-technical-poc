-- Create enum type "grading_mode"
CREATE TYPE "grading_mode" AS ENUM ('lenient', 'strict');
-- Create "users" table
CREATE TABLE "users" (
  "id" uuid NOT NULL DEFAULT uuidv7(),
  "auth_sub" text NOT NULL,
  "display_name" text NOT NULL,
  "grading_mode" "grading_mode" NOT NULL DEFAULT 'lenient',
  "accent_sensitive" boolean NOT NULL DEFAULT false,
  "new_items_per_session" integer NOT NULL DEFAULT 5,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "users_auth_sub_key" UNIQUE ("auth_sub"),
  CONSTRAINT "users_new_items_per_session_check" CHECK ((new_items_per_session >= 1) AND (new_items_per_session <= 50))
);
-- Create "courses" table
CREATE TABLE "courses" (
  "id" uuid NOT NULL DEFAULT uuidv7(),
  "owner_id" uuid NULL,
  "title" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "source_lang" text NOT NULL,
  "target_lang" text NOT NULL,
  "grading_mode" "grading_mode" NULL,
  "accent_sensitive" boolean NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "courses_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users" ("id") ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT "courses_source_lang_check" CHECK (source_lang ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'::text),
  CONSTRAINT "courses_target_lang_check" CHECK (target_lang ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'::text),
  CONSTRAINT "courses_title_check" CHECK ((length(title) >= 1) AND (length(title) <= 200))
);
-- Create index "courses_owner_id_idx" to table: "courses"
CREATE INDEX "courses_owner_id_idx" ON "courses" ("owner_id");
-- Create "units" table
CREATE TABLE "units" (
  "id" uuid NOT NULL DEFAULT uuidv7(),
  "course_id" uuid NOT NULL,
  "position" integer NOT NULL,
  "title" text NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "units_course_id_position_key" UNIQUE ("course_id", "position"),
  CONSTRAINT "units_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create "items" table
CREATE TABLE "items" (
  "id" uuid NOT NULL DEFAULT uuidv7(),
  "unit_id" uuid NOT NULL,
  "position" integer NOT NULL,
  "term" text NOT NULL,
  "definition" text NOT NULL,
  "alternatives" text[] NOT NULL DEFAULT '{}',
  "notes" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "items_unit_id_position_key" UNIQUE ("unit_id", "position"),
  CONSTRAINT "items_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "items_definition_check" CHECK (length(definition) > 0),
  CONSTRAINT "items_term_check" CHECK (length(term) > 0)
);
-- Create "cards" table
CREATE TABLE "cards" (
  "user_id" uuid NOT NULL,
  "item_id" uuid NOT NULL,
  "due_at" timestamptz NOT NULL,
  "last_review_at" timestamptz NULL,
  "stability" double precision NOT NULL,
  "stability_fast" double precision NOT NULL,
  "difficulty" double precision NOT NULL,
  "scheduled_days" double precision NOT NULL,
  "learning_step" integer NOT NULL,
  "reps" integer NOT NULL,
  "lapses" integer NOT NULL,
  "state" smallint NOT NULL,
  "schedule_status" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "item_id"),
  CONSTRAINT "cards_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "cards_state_check" CHECK ((state >= 0) AND (state <= 3))
);
-- Create index "cards_user_id_due_at_idx" to table: "cards"
CREATE INDEX "cards_user_id_due_at_idx" ON "cards" ("user_id", "due_at");
-- Create "review_logs" table
CREATE TABLE "review_logs" (
  "id" uuid NOT NULL DEFAULT uuidv7(),
  "user_id" uuid NOT NULL,
  "item_id" uuid NOT NULL,
  "rating" smallint NOT NULL,
  "answer" text NOT NULL,
  "verdict" text NOT NULL,
  "duration_ms" integer NULL,
  "revlog" jsonb NOT NULL,
  "reviewed_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "review_logs_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "review_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "review_logs_rating_check" CHECK ((rating >= 1) AND (rating <= 4)),
  CONSTRAINT "review_logs_verdict_check" CHECK (verdict = ANY (ARRAY['exact'::text, 'typo'::text, 'wrong'::text]))
);
-- Create index "review_logs_item_id_idx" to table: "review_logs"
CREATE INDEX "review_logs_item_id_idx" ON "review_logs" ("item_id");
-- Create index "review_logs_user_id_reviewed_at_idx" to table: "review_logs"
CREATE INDEX "review_logs_user_id_reviewed_at_idx" ON "review_logs" ("user_id", "reviewed_at");
