import type { ShellVM } from "@app/client";
import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RouteLink } from "@/platform/route-link";
import { color, hairline, space, text } from "@/platform/theme";

/**
 * Header and screen frame. Mobile runs only on the dev auth port for now,
 * always signed in, so there is no Sign out and no sign-in screen (issue
 * #48): when not signed in (an API in jwt mode) it says only that.
 */
export function AppShellView({ vm, children }: { vm: ShellVM; children: ReactNode }) {
  const { content } = vm;
  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <View role="navigation" style={styles.header}>
        <RouteLink to={vm.brand.route}>
          <Text style={styles.brand}>{vm.brand.label}</Text>
        </RouteLink>
        {vm.nav.map((item) => (
          <RouteLink key={item.label} to={item.route}>
            <Text style={styles.nav}>{item.label}</Text>
          </RouteLink>
        ))}
      </View>
      <ScrollView contentContainerStyle={styles.main} keyboardShouldPersistTaps="handled">
        {content.kind === "screen" && children}
        {content.kind === "loading" && <Text style={styles.muted}>{content.label}</Text>}
        {content.kind === "signIn" && (
          <View style={styles.signedOut}>
            <Text accessibilityRole="header" style={styles.title}>
              {content.signIn.title}
            </Text>
            {content.signIn.error && <Text style={styles.muted}>{content.signIn.error}</Text>}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.background },
  header: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: space(4),
    rowGap: space(2),
    paddingHorizontal: space(4),
    paddingVertical: space(3),
    borderBottomWidth: hairline,
    borderBottomColor: color.border,
  },
  brand: { ...text("label"), fontWeight: text("page-title").fontWeight, color: color.foreground },
  nav: { ...text("body"), color: color["muted-foreground"] },
  main: { paddingHorizontal: space(4), paddingVertical: space(8) },
  muted: { ...text("body"), color: color["muted-foreground"] },
  signedOut: { gap: space(2) },
  title: { ...text("page-title"), color: color.foreground },
});
