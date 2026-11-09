import type {
  CourseActions,
  CourseGradingVM,
  CourseImportVM,
  CourseVM,
  StudyLinkVM,
} from "@app/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { RouteLink } from "@/platform/route-link";
import { ErrorMessage, Loading } from "@/views/shared/query-state";
import { RichText } from "@/views/shared/rich-text";
import { SelectField } from "@/views/shared/select-field";

export function CourseView({ vm, actions }: { vm: CourseVM; actions: CourseActions }) {
  if (vm.kind === "loading") return <Loading />;
  if (vm.kind === "error") return <ErrorMessage message={vm.message} />;
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{vm.title}</h1>
        <p className="text-muted-foreground">{vm.languages}</p>
        {vm.description && <p className="pt-2 text-sm">{vm.description}</p>}
      </div>

      <div className="flex flex-wrap gap-3">
        <StudyLink link={vm.learn} variant="default" />
        <StudyLink link={vm.review} variant="outline" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{vm.unitsTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {vm.unitsEmpty && <p className="text-sm text-muted-foreground">{vm.unitsEmpty}</p>}
          {vm.units.map((unit) => (
            <div key={unit.id} className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span>{unit.label}</span>
                <span className="text-muted-foreground">{unit.count}</span>
              </div>
              <Progress value={unit.progress.value} aria-label={unit.progress.label} />
            </div>
          ))}
        </CardContent>
      </Card>

      {vm.editing ? (
        <>
          <GradingSection vm={vm.editing.grading} actions={actions} />
          <ImportSection vm={vm.editing.import} actions={actions} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{vm.readOnlyNotice}</p>
      )}
    </div>
  );
}

function StudyLink({ link, variant }: { link: StudyLinkVM; variant: "default" | "outline" }) {
  return (
    <RouteLink
      to={link.route}
      className={cn(
        buttonVariants({ size: "lg", variant }),
        link.disabled && "pointer-events-none opacity-50",
      )}
      aria-disabled={link.disabled}
    >
      {link.label}
    </RouteLink>
  );
}

function GradingSection({ vm, actions }: { vm: CourseGradingVM; actions: CourseActions }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{vm.title}</CardTitle>
        <CardDescription>{vm.description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <SelectField field={vm.mode} onChange={actions.setGradingMode} />
        <SelectField field={vm.accents} onChange={actions.setAccents} />
        {vm.error && <ErrorMessage message={vm.error} />}
      </CardContent>
    </Card>
  );
}

function ImportSection({ vm, actions }: { vm: CourseImportVM; actions: CourseActions }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{vm.title}</CardTitle>
        <CardDescription>
          <RichText parts={vm.help} />
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            actions.importCsv();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="csv-file">{vm.fileLabel}</Label>
            <Input
              id="csv-file"
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) actions.setCsv(await file.text());
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="csv-text">{vm.pasteLabel}</Label>
            <Textarea
              id="csv-text"
              rows={6}
              placeholder={vm.placeholder}
              value={vm.csv}
              onChange={(e) => actions.setCsv(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <Button type="submit" disabled={!vm.canSubmit}>
            {vm.submitLabel}
          </Button>
          {vm.error && (
            <Alert variant="destructive">
              <AlertDescription>{vm.error}</AlertDescription>
            </Alert>
          )}
          {vm.result && <p className="text-sm text-muted-foreground">{vm.result}</p>}
        </form>
      </CardContent>
    </Card>
  );
}
