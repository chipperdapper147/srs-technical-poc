import type { ImportActions, ImportFormVM, ImportPreviewVM, ImportVM } from "@app/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { RouteLink } from "@/platform/route-link";
import { ErrorMessage, Loading } from "@/views/shared/query-state";
import { SelectField } from "@/views/shared/select-field";

export function ImportView({ vm, actions }: { vm: ImportVM; actions: ImportActions }) {
  if (vm.kind === "loading") return <Loading />;
  if (vm.kind === "error") return <ErrorMessage message={vm.message} />;
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <RouteLink to={vm.back.route} className="text-sm text-muted-foreground">
          {vm.back.label}
        </RouteLink>
        <h1 className="text-2xl font-semibold">{vm.title}</h1>
      </div>
      {vm.form ? (
        <ImportForm vm={vm.form} actions={actions} />
      ) : (
        <p className="text-sm text-muted-foreground">{vm.readOnlyNotice}</p>
      )}
    </div>
  );
}

function ImportForm({ vm, actions }: { vm: ImportFormVM; actions: ImportActions }) {
  return (
    <form
      className="space-y-8"
      onSubmit={(e) => {
        e.preventDefault();
        actions.confirm();
      }}
    >
      <Card>
        <CardHeader>
          <CardDescription>{vm.help}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-1.5">
            <Label htmlFor={vm.file.id}>{vm.file.label}</Label>
            <Input
              id={vm.file.id}
              type="file"
              accept=".txt,.csv,text/plain,text/csv"
              onChange={async (e) => {
                const input = e.currentTarget;
                const file = input.files?.[0];
                if (!file) return;
                actions.loadFile(file.name, await file.text());
                input.value = ""; // the view model says which file was loaded
              }}
            />
            {vm.file.loaded && <p className="text-xs text-muted-foreground">{vm.file.loaded}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={vm.text.id}>{vm.text.label}</Label>
            <Textarea
              id={vm.text.id}
              rows={8}
              placeholder={vm.text.placeholder}
              value={vm.text.value}
              onChange={(e) => actions.setText(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <SelectField field={vm.format} onChange={actions.setFormat} />
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {vm.detected}
            </p>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor={vm.swap.id}>{vm.swap.label}</Label>
              <p className="text-xs text-muted-foreground">{vm.swap.help}</p>
            </div>
            <Switch
              id={vm.swap.id}
              checked={vm.swap.checked}
              onCheckedChange={(checked) => actions.setSwap(checked)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField field={vm.unit} onChange={actions.setUnit} />
            {vm.newUnit && (
              <div className="space-y-1.5">
                <Label htmlFor={vm.newUnit.id}>{vm.newUnit.label}</Label>
                <Input
                  id={vm.newUnit.id}
                  value={vm.newUnit.value}
                  placeholder={vm.newUnit.placeholder}
                  required={vm.newUnit.required}
                  onChange={(e) => actions.setNewUnitTitle(e.target.value)}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {vm.preview && <Preview vm={vm.preview} />}

      <div className="space-y-3">
        <Button type="submit" disabled={vm.submit.disabled}>
          {vm.submit.label}
        </Button>
        {vm.error && (
          <Alert variant="destructive">
            <AlertDescription>{vm.error}</AlertDescription>
          </Alert>
        )}
        {vm.result && (
          <p role="status" className="text-sm text-muted-foreground">
            {vm.result}
          </p>
        )}
      </div>
    </form>
  );
}

function Preview({ vm }: { vm: ImportPreviewVM }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{vm.title}</h2>
        </CardTitle>
        <CardDescription aria-live="polite">{vm.summary}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {vm.rows.length > 0 && (
          <div className="space-y-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{vm.columns.line}</TableHead>
                  <TableHead>{vm.columns.term}</TableHead>
                  <TableHead>{vm.columns.definition}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vm.rows.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="text-muted-foreground">{row.line}</TableCell>
                    <TableCell className="whitespace-normal">{row.term}</TableCell>
                    <TableCell className="whitespace-normal">{row.definition}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {vm.more && <p className="text-xs text-muted-foreground">{vm.more}</p>}
          </div>
        )}
        {vm.rejected.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">{vm.rejectedTitle}</h3>
            <ul className="space-y-1 text-sm text-destructive">
              {vm.rejected.map((r) => (
                <li key={r.key}>{r.text}</li>
              ))}
            </ul>
            {vm.rejectedMore && <p className="text-xs text-muted-foreground">{vm.rejectedMore}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
