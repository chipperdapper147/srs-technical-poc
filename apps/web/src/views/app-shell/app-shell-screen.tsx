"use client";

import { createAuthController, shellViewModel } from "@app/client";
import { useScreen } from "@app/client/react";
import type { ReactNode } from "react";
import { AppShellView } from "./app-shell-view";

export function AppShellScreen({ children }: { children: ReactNode }) {
  const { vm, actions } = useScreen(createAuthController, shellViewModel, {});
  return (
    <AppShellView vm={vm} actions={actions}>
      {children}
    </AppShellView>
  );
}
