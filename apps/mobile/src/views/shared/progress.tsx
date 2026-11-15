import type { ProgressVM } from "@app/client";
import { StyleSheet, View } from "react-native";
import { color, radius, space } from "@/platform/theme";

/** The web's Progress: a `muted` track with a `primary` indicator, named by its view model. */
export function Progress({ progress }: { progress: ProgressVM }) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={progress.label}
      accessibilityValue={{ min: 0, max: 100, now: progress.value }}
      style={styles.track}
    >
      <View style={[styles.indicator, { width: `${progress.value}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: space(1),
    borderRadius: radius.full,
    backgroundColor: color.muted,
    overflow: "hidden",
  },
  indicator: { height: "100%", backgroundColor: color.primary },
});
