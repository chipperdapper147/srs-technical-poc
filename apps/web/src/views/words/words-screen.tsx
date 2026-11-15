"use client";

import { createWordsController, type WordsParams, wordsViewModel } from "@app/client";
import { useScreen } from "@app/client/react";
import { WordsView } from "./words-view";

export function WordsScreen(params: WordsParams) {
  const { vm, actions } = useScreen(createWordsController, wordsViewModel, params);
  return <WordsView vm={vm} actions={actions} />;
}
