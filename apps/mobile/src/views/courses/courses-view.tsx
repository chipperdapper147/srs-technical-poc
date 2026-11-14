import type { CourseCardVM, CoursesVM } from "@app/client";
import { StyleSheet, Text, View } from "react-native";
import { RouteLink } from "@/platform/route-link";
import { color, hairline, radius, space, text, withAlpha } from "@/platform/theme";
import { Progress } from "@/views/shared/progress";
import { ErrorMessage, Loading } from "@/views/shared/query-state";

export function CoursesView({ vm }: { vm: CoursesVM }) {
  const { body } = vm;
  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          {vm.heading}
        </Text>
        <RouteLink to={vm.newCourse.route} style={styles.outlineButton}>
          <Text style={styles.buttonLabel}>{vm.newCourse.label}</Text>
        </RouteLink>
      </View>

      {body.kind === "loading" && <Loading />}
      {body.kind === "error" && <ErrorMessage message={body.message} />}
      {body.kind === "empty" && <Text style={styles.muted}>{body.message}</Text>}
      {body.kind === "list" && (
        <View style={styles.list}>
          {body.courses.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </View>
      )}
    </View>
  );
}

function CourseCard({ course }: { course: CourseCardVM }) {
  return (
    <RouteLink to={course.route} style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitles}>
          <Text style={styles.cardTitle}>{course.title}</Text>
          <Text style={styles.muted}>{course.languages}</Text>
        </View>
        {course.due && (
          <View style={styles.badge}>
            <Text style={styles.badgeLabel}>{course.due}</Text>
          </View>
        )}
      </View>
      <Progress progress={course.progress} />
      <Text style={styles.caption}>{course.learned}</Text>
    </RouteLink>
  );
}

const styles = StyleSheet.create({
  page: { gap: space(6) },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { ...text("page-title"), color: color.foreground },
  outlineButton: {
    paddingHorizontal: space(2.5),
    paddingVertical: space(1.5),
    borderRadius: radius.base,
    borderWidth: hairline,
    borderColor: color.border,
    backgroundColor: color.background,
  },
  buttonLabel: { ...text("label"), color: color.foreground },
  muted: { ...text("body"), color: color["muted-foreground"] },
  list: { gap: space(4) },
  // Depth from a 10% foreground ring, never a shadow (design system README).
  card: {
    gap: space(4),
    padding: space(4),
    borderRadius: radius.card,
    borderWidth: hairline,
    borderColor: withAlpha(color.foreground, 0.1),
    backgroundColor: color.card,
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: space(2) },
  cardTitles: { flex: 1, gap: space(1) },
  cardTitle: { ...text("card-title"), color: color["card-foreground"] },
  badge: {
    paddingHorizontal: space(2),
    paddingVertical: space(0.5),
    borderRadius: radius.full,
    backgroundColor: color.primary,
  },
  badgeLabel: { ...text("badge"), color: color["primary-foreground"] },
  caption: { ...text("caption"), color: color["muted-foreground"] },
});
