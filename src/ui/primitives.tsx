/**
 * Les briques visuelles de l'app.
 *
 * Elles remplacent les cinq fichiers de styles de la v1, où les mêmes hex et la
 * même police étaient recopiés écran par écran. Toutes les valeurs viennent des
 * tokens : changer le rythme ou la couleur d'accent se fait à un seul endroit.
 *
 * Règles tenues ici plutôt que dans chaque écran : cible tactile de 48 dp
 * minimum, retour visuel au toucher sans décalage de mise en page, et libellé
 * d'accessibilité obligatoire sur tout contrôle porté par une icône seule.
 */
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import type { Tone } from "@/domain/types";
import { color, hitSize, radius, space, toneColor } from "@/theme/tokens";
import { type as type_ } from "@/theme/typography";

/* ------------------------------------------------------------------ texte */

type TextTone = "default" | "muted" | "brand" | Tone;

const textColor: Record<TextTone, string> = {
  default: color.text,
  muted: color.textMuted,
  brand: color.brand,
  go: color.go,
  stop: color.stop,
  hold: color.hold,
};

export function Label({
  children,
  variant = "body",
  tone = "default",
  style,
  numberOfLines,
}: {
  children: React.ReactNode;
  variant?: keyof typeof type_;
  tone?: TextTone;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[type_[variant], { color: textColor[tone] }, style]}
    >
      {children}
    </Text>
  );
}

/* --------------------------------------------------------------- surfaces */

export function Card({
  children,
  style,
  raised = false,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  raised?: boolean;
}) {
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: raised ? color.surfaceRaised : color.surface },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionHeader({ children, action }: { children: string; action?: React.ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <Label variant="eyebrow" tone="muted">
        {children}
      </Label>
      {action}
    </View>
  );
}

/* --------------------------------------------------------------- contrôle */

type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

const buttonFill: Record<ButtonVariant, string> = {
  primary: color.brand,
  secondary: color.surfaceRaised,
  quiet: "transparent",
  danger: color.stop,
};

const buttonInk: Record<ButtonVariant, string> = {
  primary: color.onTone,
  secondary: color.text,
  quiet: color.textMuted,
  danger: color.onTone,
};

export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  disabled = false,
  busy = false,
  full = false,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  busy?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const inactive = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy }}
      android_ripple={{ color: "#ffffff22" }}
      // L'opacité change, jamais la taille : un bouton qui rétrécit décale ses voisins.
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: buttonFill[variant],
          borderColor: variant === "quiet" ? color.border : "transparent",
          borderWidth: variant === "quiet" ? 1 : 0,
          opacity: inactive ? 0.45 : pressed ? 0.72 : 1,
          alignSelf: full ? "stretch" : "flex-start",
        },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={buttonInk[variant]} size="small" />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={buttonInk[variant]} /> : null}
          <Text style={[type_.label, { color: buttonInk[variant] }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  active = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  /** Obligatoire : un bouton porté par une seule icône doit s'annoncer. */
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      hitSlop={8}
      android_ripple={{ color: "#ffffff22", borderless: true, radius: 26 }}
      style={({ pressed }) => [
        styles.iconButton,
        {
          backgroundColor: active ? color.brand : color.surfaceRaised,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={22} color={active ? color.onTone : color.text} />
    </Pressable>
  );
}

/* ---------------------------------------------------------------- statuts */

export function Badge({ children, tone = "brand" }: { children: string; tone?: TextTone }) {
  const ink = textColor[tone];
  return (
    <View style={[styles.badge, { borderColor: ink }]}>
      <Text style={[type_.caption, { color: ink }]}>{children}</Text>
    </View>
  );
}

/**
 * Un chiffre et ce qu'il compte. Le nombre est en chasse fixe : les compteurs
 * qui montent ne doivent pas faire danser la mise en page.
 */
export function StatTile({
  value,
  caption,
  tone = "default",
  hint,
}: {
  value: string;
  caption: string;
  tone?: TextTone;
  hint?: string;
}) {
  return (
    <Card style={styles.stat}>
      <Label variant="metric" tone={tone}>
        {value}
      </Label>
      <Label variant="caption" tone="muted">
        {caption}
      </Label>
      {hint ? (
        <Label variant="caption" tone="muted" style={{ marginTop: space.xs }}>
          {hint}
        </Label>
      ) : null}
    </Card>
  );
}

export function ToneDot({ tone }: { tone: Tone }) {
  return <View style={[styles.dot, { backgroundColor: toneColor[tone] }]} />;
}

/* ------------------------------------------------------------------ input */

export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
}) {
  return (
    <View style={styles.search}>
      <Ionicons name="search" size={18} color={color.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={color.textMuted}
        accessibilityLabel={placeholder}
        autoCorrect={false}
        autoCapitalize="none"
        style={[type_.body, styles.searchInput]}
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChange("")} hitSlop={12} accessibilityLabel="Effacer la recherche">
          <Ionicons name="close-circle" size={18} color={color.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  secure = false,
  keyboardType = "default",
  autoComplete,
  error,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  secure?: boolean;
  keyboardType?: "default" | "email-address";
  autoComplete?: "email" | "current-password";
  error?: string;
}) {
  return (
    <View style={{ gap: space.sm }}>
      {/* Un libellé visible, pas un placeholder qui disparaît à la saisie. */}
      <Label variant="label" tone="muted">
        {label}
      </Label>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={color.textMuted}
        secureTextEntry={secure}
        keyboardType={keyboardType}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={autoComplete}
        accessibilityLabel={label}
        style={[
          type_.body,
          styles.input,
          { borderColor: error ? color.stop : color.border },
        ]}
      />
      {error ? (
        <Label variant="caption" tone="stop">
          {error}
        </Label>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------- vide */

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  /** Ce qu'il faut faire ensuite — un écran vide est une invitation, pas un constat. */
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={30} color={color.textMuted} />
      <Label variant="title">{title}</Label>
      <Label variant="body" tone="muted" style={{ textAlign: "center" }}>
        {body}
      </Label>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    padding: space.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.md,
  },
  button: {
    minHeight: hitSize,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
  },
  iconButton: {
    width: hitSize,
    height: hitSize,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  stat: {
    flex: 1,
    gap: space.xs,
    paddingVertical: space.lg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: hitSize,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  searchInput: {
    flex: 1,
    color: color.text,
    paddingVertical: space.md,
  },
  input: {
    minHeight: hitSize,
    borderRadius: radius.md,
    borderWidth: 1,
    backgroundColor: color.surface,
    paddingHorizontal: space.lg,
    color: color.text,
  },
  empty: {
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.xxxl,
    paddingHorizontal: space.xl,
  },
});
