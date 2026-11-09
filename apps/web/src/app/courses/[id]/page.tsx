import { CourseScreen } from "@/views/course/course-screen";

export default async function CoursePage({ params }: PageProps<"/courses/[id]">) {
  const { id } = await params;
  return <CourseScreen courseId={id} />;
}
