# ADR 0001: Move the prototype to a dedicated repository

- **Status:** Accepted; code moved 2026-11-09, repository setup pending
- **Date:** 2026-11-09

## Context

The prototype lives on branch `ccr-7f8b4c24-u0wnj2` of `chipperdapper147/thoughts`,
a repository whose `main` is a blank knowledge-base template. The branch was
never meant to merge into `main`.

That blocks the development process we want:

- **Merging** has no target: there is no trunk for feature branches to merge into.
- **Branch protection and required checks** can't be configured without affecting
  the unrelated template on `main`.
- **CI scope:** the workflow runs on pushes to any branch of a repo with other content.
- **Deploys, preview environments and secrets** (Auth0, hosting) would be shared
  with unrelated work.
- **Workflow file visibility:** GitHub shows `.github/workflows/ci.yml` against
  `main`, where it doesn't exist.

## Decision

Move the project to its own repository, with `main` as the trunk and the full
verification process in [`../verification.md`](../verification.md) enforced there.

## Consequences

- **History:** done, into `chipperdapper147/srs-technical-poc`. That repo already
  had a GitHub-created initial commit, so the branch's commits were replayed on
  top of it rather than pushed over it. The branch's first commit (removing the
  knowledge-base scaffolding) was dropped because it has no meaning here.
- **On the new repo**, set up:
  - branch protection on `main`;
  - required CI checks;
  - optionally a merge queue (verification stage 4);
  - environment secrets for Auth0 and the deploy target.
- **Docs:** done. The branch name was only in `README.md`.
- **Until then:** CI runs as it does now, merge-gate stages stay on paper, and
  nothing is enforced.

## Open questions

- ~~Repository name.~~ `srs-technical-poc`.
- Deploy target (Vercel / Fly / Railway / other). This decides whether preview
  environments, and the real-integration tier that runs against them, are possible.
- Pre-commit hooks (e.g. lefthook) vs CI-only enforcement.
