"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ErrorMessage, Loading } from "@/components/query-state";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { api, queryKeys } from "@/lib/api";
import { languageName } from "@/lib/utils";

export default function CoursesPage() {
  const courses = useQuery({ queryKey: queryKeys.courses, queryFn: api.courses });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Courses</h1>
        <Link href="/courses/new" className={buttonVariants({ variant: "outline" })}>
          New course
        </Link>
      </div>

      {courses.isPending && <Loading />}
      {courses.error && <ErrorMessage error={courses.error} />}
      {courses.data?.length === 0 && (
        <p className="text-muted-foreground">No courses yet. Create one or run `pnpm db:seed`.</p>
      )}

      <div className="grid gap-4">
        {courses.data?.map((course) => (
          <Link key={course.id} href={`/courses/${course.id}`} className="block">
            <Card className="transition-colors hover:bg-muted/40">
              <CardHeader>
                <CardTitle>{course.title}</CardTitle>
                <CardDescription>
                  {languageName(course.targetLang)} for {languageName(course.sourceLang)} speakers
                </CardDescription>
                {course.dueCount > 0 && (
                  <CardAction>
                    <Badge>{course.dueCount} due</Badge>
                  </CardAction>
                )}
              </CardHeader>
              <CardContent className="space-y-2">
                <Progress
                  value={course.itemCount ? (course.learnedCount / course.itemCount) * 100 : 0}
                />
                <p className="text-xs text-muted-foreground">
                  {course.learnedCount} / {course.itemCount} words learned
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
