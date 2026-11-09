"use client";

import { coursesViewModel, createCoursesController } from "@app/client";
import { useScreen } from "@app/client/react";
import { CoursesView } from "./courses-view";

export function CoursesScreen() {
  const { vm } = useScreen(createCoursesController, coursesViewModel, {});
  return <CoursesView vm={vm} />;
}
