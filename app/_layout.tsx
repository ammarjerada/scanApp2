/**
 * Racine de l'application : polices, fournisseurs d'état, garde d'authentification.
 *
 * La v1 empilait huit écrans dans un `Stack.Navigator` déclaré à la main, avec
 * `Home` en route initiale — donc toute l'app accessible sans être connecté.
 * Ici le routage vient de l'arborescence de fichiers, et la garde ci-dessous est
 * le seul endroit qui décide qui voit quoi.
 */
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import {
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold,
} from "@expo-google-fonts/jetbrains-mono";
import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { LedgerProvider } from "@/ledger/LedgerProvider";
import { SessionProvider, useSession } from "@/session/SessionProvider";
import { color } from "@/theme/tokens";

void SplashScreen.preventAutoHideAsync();

/** Redirige selon l'état de session. Aucun écran n'a à s'en préoccuper. */
function AuthGate() {
  const { status } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    const onSignIn = segments[0] === "sign-in";
    if (status === "signedOut" && !onSignIn) router.replace("/sign-in");
    if (status === "signedIn" && onSignIn) router.replace("/");
  }, [status, segments, router]);

  return null;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) void SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: color.background }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: color.background }}>
      <SafeAreaProvider>
        <SessionProvider>
          <LedgerProvider>
            <AuthGate />
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: color.background },
                animation: "fade_from_bottom",
              }}
            >
              <Stack.Screen name="(shift)" />
              <Stack.Screen name="sign-in" options={{ animation: "fade" }} />
              {/* La prise de poste n'est pas une modale : elle bloque l'entrée
                  dans l'app tant qu'aucune soirée n'est ouverte, et on n'en sort
                  pas en balayant vers le bas. */}
              <Stack.Screen name="setup" options={{ animation: "fade" }} />
              {/* La recherche glisse par-dessus le scanner, qui reste monté derrière. */}
              <Stack.Screen name="lookup" options={{ presentation: "modal" }} />
              <Stack.Screen name="settings" options={{ presentation: "modal" }} />
              <Stack.Screen name="guest/[code]" options={{ presentation: "modal" }} />
            </Stack>
          </LedgerProvider>
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
