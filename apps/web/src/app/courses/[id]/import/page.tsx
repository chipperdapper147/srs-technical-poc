import { ImportScreen } from "@/views/import/import-screen";

export default async function ImportPage({ params }: PageProps<"/courses/[id]/import">) {
  const { id } = await params;
  return <ImportScreen courseId={id} />;
}
