/**
 * Prise de poste.
 *
 * La v1 affichait « Logged in successfully » puis ne faisait rien : pas de jeton
 * gardé, pas de redirection, et l'écran de connexion perdu dans les réglages.
 * Ici c'est la porte d'entrée, et elle mène quelque part.
 */
import React, { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { isDemoMode } from "@/data/client";
import { useSession } from "@/session/SessionProvider";
import { color, space } from "@/theme/tokens";
import { Button, Card, Field, Label } from "@/ui/primitives";

export default function SignInScreen() {
  const { signIn, pending, error } = useSession();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState(isDemoMode ? "karim@tidar.ma" : "");
  const [password, setPassword] = useState(isDemoMode ? "demo" : "");
  const [touched, setTouched] = useState(false);

  const emailInvalid = touched && !email.includes("@");
  const canSubmit = email.includes("@") && password.length > 0 && !pending;

  const submit = () => {
    setTouched(true);
    if (!canSubmit) return;
    void signIn(email, password).catch(() => undefined);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: color.background }}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.xxxl, paddingBottom: insets.bottom + space.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          <Image
            source={require("../assets/images/Tidar.png")}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="Tidar"
          />
          <Label variant="eyebrow" tone="brand">
            Contrôle d'accès
          </Label>
          <Label variant="display">Prenez votre poste</Label>
          <Label variant="body" tone="muted">
            Vos scans seront signés à votre nom et rattachés à votre porte.
          </Label>
        </View>

        <Card style={{ gap: space.lg }}>
          <Field
            label="Adresse e-mail"
            value={email}
            onChange={setEmail}
            placeholder="prenom@tidar.ma"
            keyboardType="email-address"
            autoComplete="email"
            error={emailInvalid ? "Saisissez une adresse valide." : undefined}
          />
          <Field
            label="Mot de passe"
            value={password}
            onChange={setPassword}
            secure
            autoComplete="current-password"
          />

          {error ? (
            <View style={styles.error} accessibilityLiveRegion="polite">
              <Label variant="caption" tone="stop">
                {error}
              </Label>
            </View>
          ) : null}

          <Button label="Se connecter" onPress={submit} busy={pending} disabled={!canSubmit} full />
        </Card>

        {isDemoMode ? (
          <Card raised style={{ gap: space.sm }}>
            <Label variant="label" tone="brand">
              Mode démonstration
            </Label>
            <Label variant="caption" tone="muted">
              Aucun serveur n'est configuré : l'app tourne sur un jeu de données local et
              n'importe quelle adresse ouvre une session. Renseignez `EXPO_PUBLIC_API_URL`
              pour la brancher au vrai backend.
            </Label>
          </Card>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.xl,
    gap: space.xl,
  },
  brand: {
    gap: space.sm,
  },
  logo: {
    width: 120,
    height: 40,
    marginBottom: space.lg,
  },
  error: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.stop,
    padding: space.md,
  },
});
