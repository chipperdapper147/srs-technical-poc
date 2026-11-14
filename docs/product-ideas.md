# Product ideas

Candidate features for the vocabulary trainer, recorded on 2026-11-11.
**These are ideas, not commitments.** An idea becomes work when it is
chosen, and then it moves to `TODO.md` or an issue. The ones already
chosen are marked.

What exists today: courses and units, CSV import, learn mode (present,
copy, quiz), review mode with FSRS scheduling, typo-tolerant grading,
accent settings, and a sample course.

## Already chosen

These are tracked elsewhere and are listed here only for completeness.

- **Learning steps before FSRS.** New words come back within minutes or
  hours instead of about 5 days, with the steps in one config that's easy
  to change (decided 2026-11-11, `docs/decisions.md`).
- **Auth0 login.** Required for real accounts (`TODO.md`, section 7).
- **Reverse and listening modes.** First to be thought through: issue #24.
- **Mobile app (Expo)** on the shared client: issue #25.

## Ideas

1. **Home dashboard.** How many reviews are due across all courses, one
   "review everything due" action, and a forecast for the next days. Today
   each course has to be opened on its own.
2. **Editing words.** Edit or delete items, manage alternatives and notes,
   and search within a course. Today the only way in is CSV import.
3. **Leeches.** Words a learner keeps failing get flagged, with options to
   add a mnemonic note, suspend or reset them.
4. **Progress stats.** Retention rate, a review heatmap, streaks, and the
   hardest words.
5. **Daily limits and pacing.** A cap on reviews per day, spreading out a
   backlog after a break, and a vacation mode.
6. **Better import.** Anki and Quizlet exports, and pasting text directly.
7. **Hints.** Reveal the first letter during a quiz, with a lower rating
   applied automatically.
8. **Reminders.** Notifications for due reviews; comes with the mobile app.
9. **Shared or public courses.** Publishing a course, or copying someone
   else's.

## Deferred

- **Mapping fast exact answers to Easy.** It would need per-learner timing
  baselines, and it isn't clear that it's a good idea (decided 2026-11-11).
