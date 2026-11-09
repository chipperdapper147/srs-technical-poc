"use client";

import { createStudyController, type StudyParams, studyViewModel } from "@app/client";
import { useScreen } from "@app/client/react";
import { StudyView } from "./study-view";

export function StudyScreen(params: StudyParams) {
  const { vm, actions } = useScreen(createStudyController, studyViewModel, params);
  return <StudyView vm={vm} actions={actions} />;
}
