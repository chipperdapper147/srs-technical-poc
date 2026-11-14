/** A small, deterministic word list for tests that create their own course. */
export const WORDS = [
  { term: "la biblioteca", definition: "library", typo: "la biblioteka" },
  { term: "gracias", definition: "thank you", typo: "grazias" },
  { term: "adiós", definition: "goodbye", typo: "adiox" },
] as const;

export const WORDS_CSV = `unit,term,definition\n${WORDS.map((w) => `Basics,${w.term},${w.definition}`).join("\n")}\n`;

export function termFor(definition: string): string {
  const word = WORDS.find((w) => w.definition === definition);
  if (!word) throw new Error(`Unknown prompt "${definition}"`);
  return word.term;
}

/** A second course's words, with prompts distinct from WORDS, for sessions that mix courses. */
export const GERMAN_WORDS = [
  { term: "danke", definition: "thanks" },
  { term: "der Hund", definition: "dog" },
] as const;

export const GERMAN_CSV = `unit,term,definition\n${GERMAN_WORDS.map((w) => `Grundlagen,${w.term},${w.definition}`).join("\n")}\n`;

/** The term for a prompt from either word list. */
export function anyTermFor(definition: string): string {
  const word = [...WORDS, ...GERMAN_WORDS].find((w) => w.definition === definition);
  if (!word) throw new Error(`Unknown prompt "${definition}"`);
  return word.term;
}

export function typoFor(definition: string): string {
  const word = WORDS.find((w) => w.definition === definition);
  if (!word) throw new Error(`Unknown prompt "${definition}"`);
  return word.typo;
}
