import {
  HEAT_LEVELS,
  type HeatLevel,
  type StatsActions,
  type StatsReadyVM,
  type StatsVM,
} from "@app/client";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { RouteLink } from "@/platform/route-link";
import { ErrorMessage, Loading } from "@/views/shared/query-state";
import { SelectField } from "@/views/shared/select-field";

/** Heatmap fill per intensity step: the quiet surface, then `primary` in quarters. */
const HEAT_FILL: Record<HeatLevel, string> = {
  0: "bg-muted",
  1: "bg-primary/25",
  2: "bg-primary/50",
  3: "bg-primary/75",
  4: "bg-primary",
};

/** Grid row of the heatmap's first day, by the blanks before it (Monday is row 1). */
const FIRST_ROW = [
  "row-start-1",
  "row-start-2",
  "row-start-3",
  "row-start-4",
  "row-start-5",
  "row-start-6",
  "row-start-7",
];

export function StatsView({ vm, actions }: { vm: StatsVM; actions: StatsActions }) {
  const { body } = vm;
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">{vm.heading}</h1>
      {vm.filter && (
        <div className="max-w-xs">
          <SelectField field={vm.filter} onChange={actions.setCourse} />
        </div>
      )}
      {body.kind === "loading" && <Loading />}
      {body.kind === "error" && <ErrorMessage message={body.message} />}
      {body.kind === "empty" && (
        <div className="space-y-4">
          <p className="text-muted-foreground">{body.message}</p>
          {body.action && (
            <RouteLink to={body.action.route} className={buttonVariants({ variant: "outline" })}>
              {body.action.label}
            </RouteLink>
          )}
        </div>
      )}
      {body.kind === "ready" && <Ready vm={body} />}
    </div>
  );
}

function Ready({ vm }: { vm: StatsReadyVM }) {
  return (
    <>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4" data-testid="stat-tiles">
        {vm.tiles.map((tile) => (
          <li key={tile.id}>
            <Card size="sm" className="h-full">
              <CardContent className="space-y-1">
                <p className="text-sm font-medium">{tile.label}</p>
                <p className="text-2xl font-semibold tabular-nums">{tile.value}</p>
                <p className="text-xs text-muted-foreground">{tile.detail}</p>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      <section className="space-y-3" aria-labelledby="stats-heatmap">
        <div className="space-y-1">
          <h2 id="stats-heatmap" className="text-lg font-semibold">
            {vm.heatmap.title}
          </h2>
          <p className="text-sm text-muted-foreground">
            {vm.heatmap.description} · {vm.heatmap.range}
          </p>
        </div>
        <Card>
          <CardContent className="space-y-3">
            {/* Seven rows, one column per week; cells flow down each column. */}
            <ol
              className="grid max-w-md auto-cols-fr grid-flow-col grid-rows-7 gap-1"
              data-testid="heatmap"
            >
              {vm.heatmap.cells.map((cell, i) => (
                <li
                  key={cell.date}
                  title={cell.label}
                  data-level={cell.level}
                  className={cn(
                    "aspect-square rounded-sm",
                    HEAT_FILL[cell.level],
                    // The first day starts on its weekday's row; the rest follow it.
                    i === 0 && FIRST_ROW[vm.heatmap.leadingBlanks],
                  )}
                >
                  <span className="sr-only">{cell.label}</span>
                </li>
              ))}
            </ol>
            <div
              aria-hidden="true"
              className="flex items-center gap-1 text-xs text-muted-foreground"
            >
              <span className="mr-1">{vm.heatmap.legend.less}</span>
              {HEAT_LEVELS.map((level) => (
                <span key={level} className={cn("size-3 rounded-sm", HEAT_FILL[level])} />
              ))}
              <span className="ml-1">{vm.heatmap.legend.more}</span>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3" aria-labelledby="stats-hardest">
        <div className="space-y-1">
          <h2 id="stats-hardest" className="text-lg font-semibold">
            {vm.hardest.title}
          </h2>
          <p className="text-sm text-muted-foreground">{vm.hardest.description}</p>
        </div>
        {vm.hardest.words.length === 0 ? (
          <p className="text-sm text-muted-foreground">{vm.hardest.emptyMessage}</p>
        ) : (
          <ol className="grid gap-3">
            {vm.hardest.words.map((word) => (
              <li key={word.id}>
                <RouteLink to={word.route} className="block">
                  <Card size="sm" className="transition-colors hover:bg-muted/40">
                    <CardHeader>
                      <CardTitle>{word.term}</CardTitle>
                      <CardDescription>
                        {word.definition} · {word.detail}
                      </CardDescription>
                      <div>
                        <Badge variant="secondary">{word.course}</Badge>
                      </div>
                    </CardHeader>
                  </Card>
                </RouteLink>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
