import type { Route } from "@app/client";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useBack } from "./providers";
import { color, space, text } from "./theme";

/**
 * Stand-in for a route the minimal app has no screen for yet (everything but
 * the course list). Temporary platform copy, so it lives here rather than in
 * a view model; it goes when the screens arrive (see docs/decisions.md).
 */
export function NotYet({ route }: { route: Route }) {
  const back = useBack();
  return (
    <View style={styles.box}>
      <Text accessibilityRole="header" style={styles.title}>
        Not in the mobile app yet
      </Text>
      <Text style={styles.body}>The “{route.to}” screen is only on the web for now.</Text>
      <Pressable accessibilityRole="button" onPress={back}>
        <Text style={styles.link}>← Back</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space(3) },
  title: { ...text("page-title"), color: color.foreground },
  body: { ...text("body"), color: color["muted-foreground"] },
  link: { ...text("label"), color: color.foreground },
});
