"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, queryKeys } from "@/lib/api";

const EXAMPLE = `unit,term,definition,alternatives,notes
Greetings,hola,hello,,
Food,el ordenador,computer,la computadora|computadora,"Spain vs Latin America"`;

export function ImportCsvCard({ courseId }: { courseId: string }) {
  const [csv, setCsv] = useState("");
  const queryClient = useQueryClient();
  const importCsv = useMutation({
    mutationFn: () => api.importCsv(courseId, csv),
    onSuccess: () => {
      setCsv("");
      return queryClient.invalidateQueries({ queryKey: queryKeys.courses });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import words</CardTitle>
        <CardDescription>
          CSV with a header row: <code>unit,term,definition,alternatives,notes</code>. Separate
          alternative answers with <code>|</code>. Rows join existing units with the same name.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            importCsv.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="csv-file">File</Label>
            <Input
              id="csv-file"
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) setCsv(await file.text());
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="csv-text">Or paste</Label>
            <Textarea
              id="csv-text"
              rows={6}
              placeholder={EXAMPLE}
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <Button type="submit" disabled={!csv.trim() || importCsv.isPending}>
            {importCsv.isPending ? "Importing…" : "Import"}
          </Button>
          {importCsv.error && (
            <Alert variant="destructive">
              <AlertDescription>{importCsv.error.message}</AlertDescription>
            </Alert>
          )}
          {importCsv.data && (
            <p className="text-sm text-muted-foreground">
              Imported {importCsv.data.itemsCreated} words ({importCsv.data.unitsCreated} new
              units).
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
