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

export function typoFor(definition: string): string {
  const word = WORDS.find((w) => w.definition === definition);
  if (!word) throw new Error(`Unknown prompt "${definition}"`);
  return word.typo;
}
