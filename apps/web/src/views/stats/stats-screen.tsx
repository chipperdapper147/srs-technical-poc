"use client";

import { createStatsController, statsViewModel } from "@app/client";
import { useScreen } from "@app/client/react";
import { StatsView } from "./stats-view";

export function StatsScreen() {
  const { vm, actions } = useScreen(createStatsController, statsViewModel, {});
  return <StatsView vm={vm} actions={actions} />;
}
