// Atlas project config. Schema source of truth: db/schema.sql.
// Versioned migrations live in db/migrations and are committed.

env "local" {
  src = "file://db/schema.sql"
  url = getenv("DATABASE_URL")
  // Throwaway Postgres 18 container Atlas uses to normalize and diff schemas.
  dev = "docker://postgres/18/dev?search_path=public"

  migration {
    dir = "file://db/migrations"
  }

  format {
    migrate {
      diff = "{{ sql . \"  \" }}"
    }
  }
}
