import { StudyScreen } from "@/views/study/study-screen";

/** One review session across every course. */
export default function ReviewAllPage() {
  return <StudyScreen courseId={null} mode="review" />;
}
