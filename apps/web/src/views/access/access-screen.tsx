"use client";

import { accessViewModel, createAccessController } from "@app/client";
import { useScreen } from "@app/client/react";
import type { ReactNode } from "react";
import { AccessView } from "./access-view";

export function AccessScreen({ children }: { children: ReactNode }) {
  const { vm, actions } = useScreen(createAccessController, accessViewModel, {});
  return (
    <AccessView vm={vm} actions={actions}>
      {children}
    </AccessView>
  );
}
