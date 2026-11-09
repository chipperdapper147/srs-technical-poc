"use client";

import { createNewCourseController, newCourseViewModel } from "@app/client";
import { useScreen } from "@app/client/react";
import { NewCourseView } from "./new-course-view";

export function NewCourseScreen() {
  const { vm, actions } = useScreen(createNewCourseController, newCourseViewModel, {});
  return <NewCourseView vm={vm} actions={actions} />;
}
