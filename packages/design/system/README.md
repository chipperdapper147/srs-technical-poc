The interface of SRS, a typed-recall vocabulary trainer: a quiet, greyscale workspace where the only colour is the verdict on your answer. Build every screen from these tokens and components. The tokens have one source, `tokens.json` in the `@app/design` package: the web app reads them as CSS variables (generated `apps/web/src/app/tokens.css`, used through Tailwind utilities such as `bg-primary`), and the Expo app imports them from `@app/design` (colours as hex, sizes in dp). Never write a colour or size literal in a view.

## Content fundamentals

The learner is mid-task and typing; copy gets out of the way.

- **Sentence case everywhere**: buttons, titles, labels ("Create course", "New words per learn session"). Language names keep their capitals ("Spanish for English speakers").
- **Name actions by their result**: "Check", "Continue", "Import", "Back to course". Never "Submit" or "OK".
- **Talk to the learner without saying "you"** where a label works: "Type the answer", "Type it to continue", "Nothing due right now."
- **Verdicts are short and kind, and always in words**: "Correct", "Almost: watch the spelling", "Not quite". Colour only reinforces them.
- **Counts carry their unit**: "3 due", "1 / 4 words learned", "Review (2 due)", "Imported 3 words (1 new units)."
- **Errors say what went wrong in the learner's terms**, as the API states it ("Course not found", 'CSV is missing the "unit" column'). No apologies, no codes.
- **Hints are one line in `caption`**: 'When off, "cancion" is accepted for "canción".'
- No emoji. The one glyph in use is the back arrow in "← Spanish basics".
- All of this text lives in view models (`@app/client`), so web and mobile say the same thing. Views never write copy.

## Colour

A neutral (pure grey, chroma 0) palette with one strong fill. Hue appears only to mean something.

- Page ground is `background`; text is `foreground`. Secondary text (descriptions, counts, hints, placeholders) is `muted-foreground`.
- `primary` is the only solid fill: the main Button, the Progress indicator, the default Badge. Text on it is `primary-foreground`. Use one `primary` element per region.
- Quiet surfaces use `muted` (Progress track, card footers at 50%, hover fills) or `secondary` (secondary Button and Badge). Keep `muted-foreground` text off `muted` fills at body size: 4.3:1 in light.
- Cards are `card`. In light, that equals `background`; a card is set apart by a 10% `foreground` ring. In dark, `card` is one step lighter.
- Hairlines are `border`; form controls are outlined with `input`.
- Focus is a 3px `ring` at 50%. It is under the 3:1 focus-indicator floor in light (`ring` is 2.6:1 on `background`); kept as the source has it.
- Errors and the "wrong" verdict use `destructive`. It appears as text, or as a 10–20% tint with `destructive` text; never as a solid red fill.
- Verdicts: `verdict-exact`, `verdict-typo` and `verdict-wrong` tint the feedback panel (border at 40%, fill at 10%). The text on them stays `foreground`, and the verdict is always named in words.
- `chart-*`, `sidebar-*`, `popover*` and `accent*` come with shadcn and are not used by any screen yet.

Dark theme: all tokens have dark values (`data-theme="dark"`; `.dark` in the web app). The web app does not offer dark mode yet.

## Type

One family, Geist (Google Fonts; `next/font` on web), for both `sans` and `heading`. Monospace is the system stack.

- One `page-title` (24px, 600) per screen.
- Study is the largest type: the new word in `term` (30px, 600) with `lang` set to the target language, the prompt in `prompt` (24px, 600), and the definition and typed answer in `definition` (18px).
- Interface text is `body` (14px). Labels, button text and alert titles are `label` (14px, 500). Counts and hints are `caption` (12px) in `muted-foreground`.
- Card titles are `card-title` (16px, 500, snug).
- CSV and inline code are `code` (12px mono).
- Inputs are 16px on phones and 14px from the `md` breakpoint, so iOS doesn't zoom. Study inputs stay at 18px.

## Spacing and layout

- Everything is a multiple of `spacing` (4px): 6px between a label and its control, 8–12px between controls, 16px card padding and grid gaps, 24px between form rows, 32px between page sections.
- Controls are 32px tall (`h-8`); study answer inputs are 44px (`h-11`), the comfortable touch size.
- Web pages are one centred column, max 768px (`max-w-3xl`), with 16px side padding and 32px top and bottom. Forms use two columns only for short paired fields (language codes); everything stacks on phones.

## Shape, borders and depth

- `radius` (10px) is the base: buttons, inputs, selects, alerts, feedback panels. Cards use 1.4× (14px); badges, switches and progress bars are fully round.
- Depth comes from rings and borders, never shadows: cards have a 10% `foreground` ring, and controls have an `input` border.
- Disabled is 50% opacity with no pointer events. Pressed buttons move down 1px. Invalid fields get a `destructive` border and ring.

## Motion

Only `transition-all` on controls (colour, the switch thumb, the progress indicator). No entrances or page transitions.

## Iconography

`lucide-react` is the configured icon set (`components.json`), but no screen uses icons yet. The text arrow "←" marks back-links. When icons arrive, use lucide at 16px (`size-4`) inside buttons and keep their labels.

## Accessibility

- Every control has a label: a `Label` with `htmlFor`, or an `aria-label`. Placeholders are not labels.
- Every Progress has an `aria-label` from its view model.
- Feedback uses `role="status"` so screen readers announce the verdict.
- Each web view is checked with axe in tests (`apps/web/src/test/a11y.ts`; colour contrast is checked only in the browser).

## Not synced

- **Tokens:** the derived radius scale (`radius-sm` … `radius-4xl`, `calc(var(--radius) * n)` in `@theme inline`) is not a token; only the base `radius` is. Tailwind's spacing steps are multiples of `spacing`, not separate tokens.
- **Fonts:** Geist is a hosted Google face, with no font files in the repository.
- **Logos:** there are none; the product name is set in plain type ("SRS").
- **Components:** all ten in `apps/web/src/components` are built from source (`ui/*` and `native-select.tsx`) into a live bundle with React 18. `StudyFeedback` is a hand-written static rendition of a view, not a component.
