-- Create "prebuilt_courses" table
CREATE TABLE "prebuilt_courses" (
  "key" text NOT NULL,
  "course_id" uuid NULL,
  "inserted_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("key"),
  CONSTRAINT "prebuilt_courses_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses" ("id") ON UPDATE NO ACTION ON DELETE SET NULL
);
