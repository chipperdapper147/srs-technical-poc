import { StyleSheet, Text, View } from "react-native";
import { color, hairline, radius, space, text, withAlpha } from "@/platform/theme";

export function Loading() {
  return <Text style={styles.muted}>Loading…</Text>;
}

/** The web's destructive Alert: a tint with destructive text, never a solid red fill. */
export function ErrorMessage({ message }: { message: string }) {
  return (
    <View accessible accessibilityRole="alert" style={styles.alert}>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.description}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  muted: { ...text("body"), color: color["muted-foreground"] },
  alert: {
    gap: space(0.5),
    padding: space(3),
    borderRadius: radius.base,
    borderWidth: hairline,
    borderColor: withAlpha(color.destructive, 0.2),
    backgroundColor: withAlpha(color.destructive, 0.1),
  },
  title: { ...text("label"), color: color.destructive },
  description: { ...text("body"), color: color.destructive },
});
