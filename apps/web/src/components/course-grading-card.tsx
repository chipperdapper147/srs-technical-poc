"use client";

import type { CourseDetail, UpdateCourse } from "@app/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { NativeSelect } from "@/components/native-select";
import { ErrorMessage } from "@/components/query-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { api, queryKeys } from "@/lib/api";

const INHERIT = "inherit";

export function CourseGradingCard({ course }: { course: CourseDetail }) {
  const queryClient = useQueryClient();
  const update = useMutation({
    mutationFn: (body: UpdateCourse) => api.updateCourse(course.id, body),
    onSuccess: (data) => queryClient.setQueryData(queryKeys.course(course.id), data),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Grading for this course</CardTitle>
        <CardDescription>Overrides your defaults in Settings.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="course-grading-mode">Answer grading</Label>
          <NativeSelect
            id="course-grading-mode"
            value={course.gradingMode ?? INHERIT}
            onChange={(e) => {
              const v = e.target.value;
              update.mutate({ gradingMode: v === INHERIT ? null : (v as "lenient" | "strict") });
            }}
          >
            <option value={INHERIT}>Use my setting</option>
            <option value="lenient">Lenient</option>
            <option value="strict">Strict</option>
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="course-accents">Accents</Label>
          <NativeSelect
            id="course-accents"
            value={course.accentSensitive === null ? INHERIT : String(course.accentSensitive)}
            onChange={(e) => {
              const v = e.target.value;
              update.mutate({ accentSensitive: v === INHERIT ? null : v === "true" });
            }}
          >
            <option value={INHERIT}>Use my setting</option>
            <option value="true">Required</option>
            <option value="false">Ignored</option>
          </NativeSelect>
        </div>
        {update.error && <ErrorMessage error={update.error} />}
      </CardContent>
    </Card>
  );
}
