import type { DashboardReadyVM, DashboardVM, ForecastDayVM } from "@app/client";
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
import { cn } from "@/lib/utils";
import { RouteLink } from "@/platform/route-link";
import { ErrorMessage, Loading } from "@/views/shared/query-state";

export function DashboardView({ vm }: { vm: DashboardVM }) {
  const { body } = vm;
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">{vm.heading}</h1>
      {body.kind === "loading" && <Loading />}
      {body.kind === "error" && <ErrorMessage message={body.message} />}
      {body.kind === "empty" && (
        <div className="space-y-4">
          <p className="text-muted-foreground">{body.message}</p>
          <RouteLink to={body.newCourse.route} className={buttonVariants({ variant: "outline" })}>
            {body.newCourse.label}
          </RouteLink>
        </div>
      )}
      {body.kind === "ready" && <Ready vm={body} />}
    </div>
  );
}

function Ready({ vm }: { vm: DashboardReadyVM }) {
  return (
    <>
      <Card>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1" data-testid="due-summary">
            <p>
              <span className="text-3xl font-semibold tabular-nums">{vm.summary.count}</span>{" "}
              <span className="text-muted-foreground">{vm.summary.unit}</span>
            </p>
            <p className="text-sm text-muted-foreground">{vm.summary.detail}</p>
          </div>
          <RouteLink
            to={vm.reviewAll.route}
            className={cn(
              buttonVariants({ size: "lg" }),
              vm.reviewAll.disabled && "pointer-events-none opacity-50",
            )}
            aria-disabled={vm.reviewAll.disabled}
          >
            {vm.reviewAll.label}
          </RouteLink>
        </CardContent>
      </Card>

      <section className="space-y-3" aria-labelledby="dashboard-courses">
        <h2 id="dashboard-courses" className="text-lg font-semibold">
          {vm.coursesTitle}
        </h2>
        <ul className="grid gap-3">
          {vm.courses.map((course) => (
            <li key={course.id}>
              <RouteLink to={course.route} className="block">
                <Card size="sm" className="transition-colors hover:bg-muted/40">
                  <CardHeader>
                    <CardTitle>{course.title}</CardTitle>
                    <CardDescription>{course.languages}</CardDescription>
                    <CardAction>
                      <Badge variant={course.hasDue ? "default" : "secondary"}>{course.due}</Badge>
                    </CardAction>
                  </CardHeader>
                </Card>
              </RouteLink>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3" aria-labelledby="dashboard-forecast">
        <div className="space-y-1">
          <h2 id="dashboard-forecast" className="text-lg font-semibold">
            {vm.forecast.title}
          </h2>
          <p className="text-sm text-muted-foreground">{vm.forecast.description}</p>
        </div>
        <Card>
          <CardContent>
            <ol className="space-y-3" data-testid="forecast">
              {vm.forecast.days.map((day) => (
                <ForecastRow key={day.date} day={day} />
              ))}
            </ol>
          </CardContent>
        </Card>
      </section>
    </>
  );
}

/** One day: its name and date, a bar scaled to the busiest day, and the count in words. */
function ForecastRow({ day }: { day: ForecastDayVM }) {
  return (
    <li className="flex items-center gap-3 text-sm">
      <span className="flex w-20 shrink-0 flex-col">
        <span className="font-medium">{day.day}</span>{" "}
        <span className="text-xs text-muted-foreground">{day.dateLabel}</span>
      </span>
      <span aria-hidden="true" className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full bg-primary" style={{ width: `${day.share}%` }} />
      </span>
      <span className="w-20 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
        {day.countLabel}
      </span>
    </li>
  );
}
