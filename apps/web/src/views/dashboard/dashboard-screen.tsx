"use client";

import { createDashboardController, dashboardViewModel } from "@app/client";
import { useScreen } from "@app/client/react";
import { DashboardView } from "./dashboard-view";

export function DashboardScreen() {
  const { vm } = useScreen(createDashboardController, dashboardViewModel, {});
  return <DashboardView vm={vm} />;
}
