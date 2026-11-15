import { WordsScreen } from "@/views/words/words-screen";

export default async function WordsPage({ params }: PageProps<"/courses/[id]/words">) {
  const { id } = await params;
  return <WordsScreen courseId={id} />;
}
