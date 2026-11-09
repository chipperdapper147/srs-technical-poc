import type { SettingsActions, SettingsVM } from "@app/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ErrorMessage, Loading } from "@/views/shared/query-state";
import { SelectField } from "@/views/shared/select-field";

export function SettingsView({ vm, actions }: { vm: SettingsVM; actions: SettingsActions }) {
  if (vm.kind === "loading") return <Loading />;
  if (vm.kind === "error") return <ErrorMessage message={vm.message} />;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{vm.title}</CardTitle>
        <CardDescription>{vm.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <SelectField field={vm.grading} onChange={actions.setGradingMode} />

        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor={vm.accents.id}>{vm.accents.label}</Label>
            <p className="text-xs text-muted-foreground">{vm.accents.help}</p>
          </div>
          <Switch
            id={vm.accents.id}
            checked={vm.accents.checked}
            onCheckedChange={actions.setAccentSensitive}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={vm.newItems.id}>{vm.newItems.label}</Label>
          <Input
            id={vm.newItems.id}
            type="number"
            min={vm.newItems.min}
            max={vm.newItems.max}
            value={vm.newItems.value}
            onChange={(e) => actions.setNewItemsDraft(e.target.value)}
            onBlur={actions.commitNewItems}
            className="w-24"
          />
        </div>

        {vm.error && <ErrorMessage message={vm.error} />}
      </CardContent>
    </Card>
  );
}
