import { shellViewModel } from "@app/client";
import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RouteLink } from "@/platform/route-link";
import { color, hairline, space, text } from "@/platform/theme";
import { AccessScreen } from "@/views/access/access-screen";

/** Header and screen frame. Static, so it reads its view model directly. */
export function AppShell({ children }: { children: ReactNode }) {
  const vm = shellViewModel();
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
        <AccessScreen>{children}</AccessScreen>
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
});
