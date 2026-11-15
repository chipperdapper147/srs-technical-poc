-- Modify "review_logs" table
ALTER TABLE "review_logs" ADD COLUMN "hints" smallint NOT NULL DEFAULT 0, ADD COLUMN "overridden_at" timestamptz NULL;
