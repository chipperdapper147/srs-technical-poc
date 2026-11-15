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
- **Home dashboard.** Reviews due across all courses, one "Review all due"
  session, and a 7-day forecast (chosen and built 2026-11-14,
  `docs/decisions.md`).
- **Editing words.** Add, edit and delete a course's words, and search
  within a course (chosen and built 2026-11-15, #51, `docs/decisions.md`).
- **Study aids.** Hints that cap the rating, "I was right" after a wrong or
  typo verdict, and undo last answer (chosen and built 2026-11-15, #55,
  `docs/decisions.md`).

## Ideas

1. ~~**Home dashboard.**~~ Chosen; see above.
2. ~~**Editing words.**~~ Chosen; see above.
3. **Leeches.** Words a learner keeps failing get flagged, with options to
   add a mnemonic note, suspend or reset them.
4. ~~**Progress stats.**~~ Chosen and built 2026-11-15 (`docs/decisions.md`):
   retention, a review heatmap, streaks and the hardest words.
5. **Daily limits and pacing.** A cap on reviews per day, spreading out a
   backlog after a break, and a vacation mode.
6. **Better import.** Anki and Quizlet exports, and pasting text directly.
7. ~~**Hints.**~~ Chosen and built 2026-11-15 (#55, `docs/decisions.md`),
   with "I was right" and undo last answer.
8. **Reminders.** Notifications for due reviews; comes with the mobile app.
9. **Shared or public courses.** Publishing a course, or copying someone
   else's.

## Deferred

- **Mapping fast exact answers to Easy.** It would need per-learner timing
  baselines, and it isn't clear that it's a good idea (decided 2026-11-11).
