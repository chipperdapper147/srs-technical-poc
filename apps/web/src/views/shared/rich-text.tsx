import type { RichText as RichTextParts } from "@app/client";

/** Help text with inline code from a view model. */
export function RichText({ parts }: { parts: RichTextParts }) {
  return parts.map((part, i) =>
    // biome-ignore lint/suspicious/noArrayIndexKey: static text, never reordered
    typeof part === "string" ? part : <code key={i}>{part.code}</code>,
  );
}
