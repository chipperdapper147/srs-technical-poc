import { StudyScreen } from "@/views/study/study-screen";

export default async function StudyPage({
  params,
  searchParams,
}: PageProps<"/courses/[id]/study">) {
  const [{ id }, { mode }] = await Promise.all([params, searchParams]);
  return <StudyScreen courseId={id} mode={typeof mode === "string" ? mode : null} />;
}
