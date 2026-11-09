"use client";

import type { UpdateMe } from "@app/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NativeSelect } from "@/components/native-select";
import { ErrorMessage, Loading } from "@/components/query-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api, queryKeys } from "@/lib/api";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: queryKeys.me, queryFn: api.me });
  const update = useMutation({
    mutationFn: (body: UpdateMe) => api.updateMe(body),
    onSuccess: (data) => queryClient.setQueryData(queryKeys.me, data),
  });

  if (me.isPending) return <Loading />;
  if (me.error) return <ErrorMessage error={me.error} />;
  const settings = me.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Settings</CardTitle>
        <CardDescription>
          Defaults for every course. A course can override grading on its own page.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-1.5">
          <Label htmlFor="grading-mode">Answer grading</Label>
          <NativeSelect
            id="grading-mode"
            value={settings.gradingMode}
            onChange={(e) =>
              update.mutate({ gradingMode: e.target.value as UpdateMe["gradingMode"] })
            }
          >
            <option value="lenient">Lenient: small typos count as "almost" (rated Hard)</option>
            <option value="strict">Strict: exact match only</option>
          </NativeSelect>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="accent-sensitive">Require accents</Label>
            <p className="text-xs text-muted-foreground">
              When off, "cancion" is accepted for "canción".
            </p>
          </div>
          <Switch
            id="accent-sensitive"
            checked={settings.accentSensitive}
            onCheckedChange={(checked) => update.mutate({ accentSensitive: checked })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="new-items">New words per learn session</Label>
          <Input
            id="new-items"
            type="number"
            min={1}
            max={50}
            defaultValue={settings.newItemsPerSession}
            onBlur={(e) => {
              const n = Number(e.target.value);
              if (n >= 1 && n <= 50 && n !== settings.newItemsPerSession) {
                update.mutate({ newItemsPerSession: n });
              }
            }}
            className="w-24"
          />
        </div>

        {update.error && <ErrorMessage error={update.error} />}
      </CardContent>
    </Card>
  );
}
