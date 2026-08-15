/**
 * Le verdict au doigt.
 *
 * Dans une salle bruyante, l'agent ne regarde pas l'écran en continu : il regarde
 * la file. Chaque verdict a donc une signature vibratoire distincte, pour être
 * reconnu sans lever les yeux — une pulsation pour « entrée », deux pour un refus,
 * une longue pour un cas à vérifier.
 *
 * C'est aussi ce qui évite de faire reposer l'information sur la seule couleur.
 */
import * as Haptics from "expo-haptics";

import type { Tone } from "@/domain/types";

export async function pulse(tone: Tone): Promise<void> {
  try {
    switch (tone) {
      case "go":
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      case "hold":
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      case "stop":
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        // Deuxième impulsion : un refus ne doit pas pouvoir être confondu.
        setTimeout(() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        }, 160);
        return;
    }
  } catch {
    // Pas de moteur haptique (émulateur, web) : l'app continue.
  }
}

export async function tap(): Promise<void> {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // ignoré
  }
}
