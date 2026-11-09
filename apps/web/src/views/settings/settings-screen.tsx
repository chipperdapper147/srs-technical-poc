"use client";

import { createSettingsController, settingsViewModel } from "@app/client";
import { useScreen } from "@app/client/react";
import { SettingsView } from "./settings-view";

export function SettingsScreen() {
  const { vm, actions } = useScreen(createSettingsController, settingsViewModel, {});
  return <SettingsView vm={vm} actions={actions} />;
}
