"use client";

import { createImportController, type ImportParams, importViewModel } from "@app/client";
import { useScreen } from "@app/client/react";
import { ImportView } from "./import-view";

export function ImportScreen(params: ImportParams) {
  const { vm, actions } = useScreen(createImportController, importViewModel, params);
  return <ImportView vm={vm} actions={actions} />;
}
