"use client";

import { type CourseParams, courseViewModel, createCourseController } from "@app/client";
import { useScreen } from "@app/client/react";
import { CourseView } from "./course-view";

export function CourseScreen(params: CourseParams) {
  const { vm, actions } = useScreen(createCourseController, courseViewModel, params);
  return <CourseView vm={vm} actions={actions} />;
}
