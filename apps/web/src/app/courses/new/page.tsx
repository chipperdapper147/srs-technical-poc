"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, queryKeys } from "@/lib/api";

export default function NewCoursePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    title: "",
    description: "",
    sourceLang: "en",
    targetLang: "",
  });
  const create = useMutation({
    mutationFn: () => api.createCourse(form),
    onSuccess: async (course) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.courses });
      router.push(`/courses/${course.id}`);
    },
  });
  const field = (key: keyof typeof form) => ({
    id: key,
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>New course</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input required {...field("title")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea rows={2} {...field("description")} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="targetLang">Learning (language code)</Label>
              <Input required placeholder="es" {...field("targetLang")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sourceLang">From (language code)</Label>
              <Input required placeholder="en" {...field("sourceLang")} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Use BCP 47 codes: <code>es</code>, <code>fr</code>, <code>pt-BR</code>, <code>ja</code>…
          </p>
          <Button type="submit" disabled={create.isPending}>
            Create course
          </Button>
          {create.error && (
            <Alert variant="destructive">
              <AlertDescription>{create.error.message}</AlertDescription>
            </Alert>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
