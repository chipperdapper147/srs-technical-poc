import type { CoursesVM } from "@app/client";
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
import { RouteLink } from "@/platform/route-link";
import { ErrorMessage, Loading } from "@/views/shared/query-state";

export function CoursesView({ vm }: { vm: CoursesVM }) {
  const { body } = vm;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{vm.heading}</h1>
        <RouteLink to={vm.newCourse.route} className={buttonVariants({ variant: "outline" })}>
          {vm.newCourse.label}
        </RouteLink>
      </div>

      {body.kind === "loading" && <Loading />}
      {body.kind === "error" && <ErrorMessage message={body.message} />}
      {body.kind === "empty" && <p className="text-muted-foreground">{body.message}</p>}
      {body.kind === "list" && (
        <div className="grid gap-4">
          {body.courses.map((course) => (
            <RouteLink key={course.id} to={course.route} className="block">
              <Card className="transition-colors hover:bg-muted/40">
                <CardHeader>
                  <CardTitle>{course.title}</CardTitle>
                  <CardDescription>{course.languages}</CardDescription>
                  {course.due && (
                    <CardAction>
                      <Badge>{course.due}</Badge>
                    </CardAction>
                  )}
                </CardHeader>
                <CardContent className="space-y-2">
                  <Progress value={course.progress.value} aria-label={course.progress.label} />
                  <p className="text-xs text-muted-foreground">{course.learned}</p>
                </CardContent>
              </Card>
            </RouteLink>
          ))}
        </div>
      )}
    </div>
  );
}
