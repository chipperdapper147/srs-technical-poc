"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CourseGradingCard } from "@/components/course-grading-card";
import { ImportCsvCard } from "@/components/import-csv-card";
import { ErrorMessage, Loading } from "@/components/query-state";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { api, queryKeys } from "@/lib/api";
import { cn, languageName } from "@/lib/utils";

export default function CoursePage() {
  const { id } = useParams<{ id: string }>();
  const course = useQuery({ queryKey: queryKeys.course(id), queryFn: () => api.course(id) });

  if (course.isPending) return <Loading />;
  if (course.error) return <ErrorMessage error={course.error} />;
  const c = course.data;
  const unlearned = c.itemCount - c.learnedCount;

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{c.title}</h1>
        <p className="text-muted-foreground">
          {languageName(c.targetLang)} for {languageName(c.sourceLang)} speakers
        </p>
        {c.description && <p className="pt-2 text-sm">{c.description}</p>}
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href={`/courses/${id}/study?mode=learn`}
          className={cn(
            buttonVariants({ size: "lg" }),
            unlearned === 0 && "pointer-events-none opacity-50",
          )}
          aria-disabled={unlearned === 0}
        >
          Learn new words ({unlearned})
        </Link>
        <Link
          href={`/courses/${id}/study?mode=review`}
          className={cn(
            buttonVariants({ size: "lg", variant: "outline" }),
            c.dueCount === 0 && "pointer-events-none opacity-50",
          )}
          aria-disabled={c.dueCount === 0}
        >
          Review ({c.dueCount} due)
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Units</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {c.units.length === 0 && (
            <p className="text-sm text-muted-foreground">No words yet. Import a CSV below.</p>
          )}
          {c.units.map((unit) => (
            <div key={unit.id} className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span>
                  {unit.position}. {unit.title}
                </span>
                <span className="text-muted-foreground">
                  {unit.learnedCount} / {unit.itemCount}
                </span>
              </div>
              <Progress value={unit.itemCount ? (unit.learnedCount / unit.itemCount) * 100 : 0} />
            </div>
          ))}
        </CardContent>
      </Card>

      {c.editable ? (
        <>
          <CourseGradingCard course={c} />
          <ImportCsvCard courseId={id} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          This is a shared course, so it is read-only. Create your own course to import words.
        </p>
      )}
    </div>
  );
}
