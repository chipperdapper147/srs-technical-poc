import type { AccessActions, AccessVM } from "@app/client";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { color, hairline, radius, space, text, withAlpha } from "@/platform/theme";

/** The screen, or the access-key form when the API wants a key. */
export function AccessView({
  vm,
  actions,
  children,
}: {
  vm: AccessVM;
  actions: AccessActions;
  children: ReactNode;
}) {
  if (vm.kind === "open") {
    return (
      <>
        {children}
        {vm.forget && (
          <Pressable accessibilityRole="button" onPress={actions.forget} style={styles.footer}>
            <Text style={styles.forget}>{vm.forget.label}</Text>
          </Pressable>
        )}
      </>
    );
  }
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text accessibilityRole="header" style={styles.title}>
          {vm.title}
        </Text>
        <Text style={styles.description}>{vm.description}</Text>
      </View>
      <View style={styles.field}>
        <Text nativeID={vm.field.id} style={styles.label}>
          {vm.field.label}
        </Text>
        <TextInput
          accessibilityLabel={vm.field.label}
          aria-labelledby={vm.field.id}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          autoCorrect={false}
          value={vm.field.value}
          onChangeText={actions.setDraft}
          onSubmitEditing={actions.submit}
          returnKeyType="go"
          style={styles.input}
        />
      </View>
      {vm.error && (
        <View accessible accessibilityRole="alert" style={styles.alert}>
          <Text style={styles.alertText}>{vm.error}</Text>
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: vm.submit.disabled }}
        disabled={vm.submit.disabled}
        onPress={actions.submit}
        style={[styles.button, vm.submit.disabled && styles.disabled]}
      >
        <Text style={styles.buttonLabel}>{vm.submit.label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { marginTop: space(12), alignSelf: "center", padding: space(2) },
  forget: { ...text("caption"), color: color["muted-foreground"] },
  card: {
    gap: space(4),
    padding: space(4),
    borderRadius: radius.card,
    borderWidth: hairline,
    borderColor: withAlpha(color.foreground, 0.1),
    backgroundColor: color.card,
  },
  cardHeader: { gap: space(1) },
  title: { ...text("page-title"), color: color["card-foreground"] },
  description: { ...text("body"), color: color["muted-foreground"] },
  field: { gap: space(1.5) },
  label: { ...text("label"), color: color.foreground },
  // The study input's size: 44 tall, the comfortable touch size (design system README).
  input: {
    ...text("definition"),
    minHeight: space(11),
    paddingHorizontal: space(2.5),
    borderRadius: radius.base,
    borderWidth: hairline,
    borderColor: color.input,
    color: color.foreground,
  },
  alert: {
    padding: space(3),
    borderRadius: radius.base,
    backgroundColor: withAlpha(color.destructive, 0.1),
  },
  alertText: { ...text("body"), color: color.destructive },
  button: {
    alignSelf: "flex-start",
    paddingHorizontal: space(4),
    paddingVertical: space(2.5),
    borderRadius: radius.base,
    backgroundColor: color.primary,
  },
  disabled: { opacity: 0.5 },
  buttonLabel: { ...text("label"), color: color["primary-foreground"] },
});
