import type { CatalogActions, CatalogCardVM, CatalogVM } from "@app/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RouteLink } from "@/platform/route-link";
import { ErrorMessage, Loading } from "@/views/shared/query-state";
import { SelectField } from "@/views/shared/select-field";

export function CatalogView({ vm, actions }: { vm: CatalogVM; actions: CatalogActions }) {
  const { body, search } = vm;
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{vm.heading}</h1>
        <p className="text-muted-foreground">{vm.intro}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_12rem] sm:items-end">
        <search>
          <form
            className="space-y-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              actions.search();
            }}
          >
            <Label htmlFor={search.field.id}>{search.field.label}</Label>
            <div className="flex gap-2">
              <Input
                id={search.field.id}
                type="search"
                value={search.field.value}
                placeholder={search.field.placeholder}
                onChange={(e) => actions.setQuery(e.target.value)}
              />
              <Button type="submit" variant="outline">
                {search.submitLabel}
              </Button>
            </div>
          </form>
        </search>
        <SelectField field={vm.language} onChange={actions.setTargetLang} />
      </div>

      {body.kind === "loading" && <Loading />}
      {body.kind === "error" && <ErrorMessage message={body.message} />}
      {body.kind === "empty" && <p className="text-muted-foreground">{body.message}</p>}
      {body.kind === "list" && (
        <section className="space-y-4" aria-label={vm.heading}>
          <p className="text-sm text-muted-foreground">{body.count}</p>
          <ul className="grid gap-4">
            {body.courses.map((course) => (
              <CatalogCard key={course.id} course={course} actions={actions} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function CatalogCard({ course, actions }: { course: CatalogCardVM; actions: CatalogActions }) {
  return (
    <li>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>
              <RouteLink to={course.route} className="hover:underline">
                {course.title}
              </RouteLink>
            </h2>
          </CardTitle>
          <CardDescription>
            {course.languages} · {course.words}
          </CardDescription>
          <CardAction>
            <Button
              disabled={course.copy.disabled}
              onClick={() => actions.copy(course.id)}
              aria-label={`${course.copy.label}: ${course.title}`}
            >
              {course.copy.label}
            </Button>
          </CardAction>
        </CardHeader>
        {(course.description || course.copy.error) && (
          <CardContent className="space-y-3">
            {course.description && <p className="text-sm">{course.description}</p>}
            {course.copy.error && (
              <Alert variant="destructive">
                <AlertDescription>{course.copy.error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        )}
      </Card>
    </li>
  );
}
