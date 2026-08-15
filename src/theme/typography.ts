/**
 * Deux familles, deux rôles — et le choix est fonctionnel avant d'être esthétique.
 *
 * Inter porte le texte courant. JetBrains Mono porte **toute donnée** : codes de
 * billet, compteurs, horaires, nombres en attente de synchro. Un agent qui lit
 * « TDR-4F0O1L » à voix haute doit distinguer le zéro du O et le 1 du l — un
 * chasse-fixe le garantit, une grotesque non. Et les compteurs qui montent ne
 * tressautent pas, puisque tous les chiffres ont la même largeur.
 */
import type { TextStyle } from "react-native";

export const font = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
  data: "JetBrainsMono_500Medium",
  dataBold: "JetBrainsMono_700Bold",
} as const;

export const type = {
  /** Le mot du verdict, plein écran, lu à bout de bras. */
  verdict: {
    fontFamily: font.bold,
    fontSize: 42,
    lineHeight: 46,
    letterSpacing: -1,
  },
  display: {
    fontFamily: font.bold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.6,
  },
  title: {
    fontFamily: font.semibold,
    fontSize: 19,
    lineHeight: 25,
    letterSpacing: -0.2,
  },
  body: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 22,
  },
  bodyStrong: {
    fontFamily: font.medium,
    fontSize: 15,
    lineHeight: 22,
  },
  label: {
    fontFamily: font.semibold,
    fontSize: 13,
    lineHeight: 18,
  },
  caption: {
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 17,
  },
  /** Sur-titre de section. L'espacement des lettres fait le travail, pas le gras. */
  eyebrow: {
    fontFamily: font.semibold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  /** Un grand nombre : compteur d'entrées, total. */
  metric: {
    fontFamily: font.dataBold,
    fontSize: 36,
    lineHeight: 40,
    letterSpacing: -1.2,
  },
  metricSmall: {
    fontFamily: font.dataBold,
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: -0.4,
  },
  /** Code de billet, horodatage, identifiant. */
  code: {
    fontFamily: font.data,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.6,
  },
} satisfies Record<string, TextStyle>;
