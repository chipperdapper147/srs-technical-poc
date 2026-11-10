# StudyFeedback

The verdict panel after a quiz answer: one of three tinted panels whose title names the verdict, so colour is never the only signal.

**Source:** hand-written static rendition of `FeedbackPanel` in `apps/web/src/views/study/study-view.tsx` (a view, not a library component).

## Anatomy

- `role="status"` and `data-verdict` (`exact | typo | wrong`).
- A border at 40% and a fill at 10% of `verdict-exact`, `verdict-typo` or `verdict-wrong` (= `destructive`); text stays `foreground`, at a 10px radius (`radius`).
- Title from `FEEDBACK_TITLES` in `@app/client`: "Correct", "Almost: watch the spelling", "Not quite".
- "Answer:" with the accepted spelling in semibold (typo: the matched alternative; wrong: the term), with `lang` set.
- "Next review …" in the `caption` style, `muted-foreground`.

## In code

Web: `border-verdict-<verdict>/40 bg-verdict-<verdict>/10`. Expo: `colors[theme]["verdict-<verdict>"]` from `@app/design`, at the same opacities.
