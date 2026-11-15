"use client";

import { catalogViewModel, createCatalogController } from "@app/client";
import { useScreen } from "@app/client/react";
import { CatalogView } from "./catalog-view";

export function CatalogScreen() {
  const { vm, actions } = useScreen(createCatalogController, catalogViewModel, {});
  return <CatalogView vm={vm} actions={actions} />;
}
