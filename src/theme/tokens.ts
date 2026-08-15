/**
 * Design tokens — la source unique de vérité pour la couleur, l'espace et le rythme.
 *
 * Le contexte d'usage dicte chaque valeur ci-dessous : l'app est tenue à une main
 * par un agent d'accueil, la nuit, dans une salle bruyante, avec une file qui
 * attend. La palette est construite pour une pièce sombre, les cibles tactiles
 * pour un pouce pressé, et les verdicts pour être lus à bout de bras.
 *
 * Aucune couleur ne doit être écrite en dur dans un écran : tout passe par ici.
 */

/** Palette brute — nommée par la matière, pas par l'usage. */
const palette = {
  /** Le noir de la salle. Plus profond qu'un gris ardoise : l'écran est la seule source de lumière. */
  ink: "#07080C",
  slate: "#12141C",
  slateRaised: "#1B1E29",
  line: "#2A2F3D",

  chalk: "#F5F7FA",
  smoke: "#8A93A6",

  /** Le violet Tidar, repris de la v1 (#A78ED6) et remonté pour tenir le contraste sur fond noir. */
  violet: "#A78BFA",
  violetDeep: "#2E2547",

  /** Verdicts. Volontairement clairs : sur fond sombre, une couleur saturée foncée passe sous 4,5:1. */
  go: "#34D399",
  stop: "#FB7185",
  hold: "#FBBF24",
} as const;

/**
 * Tokens sémantiques. Les écrans consomment ceux-ci, jamais `palette`.
 * Changer une valeur ici déplace toute l'app — c'est le levier qu'on n'avait pas
 * quand les mêmes hex étaient recopiés dans cinq fichiers de styles.
 */
export const color = {
  background: palette.ink,
  surface: palette.slate,
  surfaceRaised: palette.slateRaised,
  border: palette.line,

  text: palette.chalk,
  textMuted: palette.smoke,

  brand: palette.violet,
  brandSurface: palette.violetDeep,

  go: palette.go,
  stop: palette.stop,
  hold: palette.hold,

  /** Texte posé sur un aplat de verdict : le noir de la salle, pas du blanc. */
  onTone: palette.ink,
} as const;

/** Ton d'un verdict. Jamais utilisé seul — toujours doublé d'une icône et d'un mot. */
export type Tone = "go" | "stop" | "hold";

export const toneColor: Record<Tone, string> = {
  go: color.go,
  stop: color.stop,
  hold: color.hold,
};

/** Rythme 4/8. Toute marge de l'app sort de cette échelle. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 28,
  pill: 999,
} as const;

/**
 * Cible tactile minimale. On prend 48 (Android) plutôt que 44 (iOS) :
 * la valeur la plus exigeante des deux plateformes couvre les deux.
 */
export const hitSize = 48;

/**
 * Durées. Une seule durée recopiée partout est un anti-pattern — chacune est
 * choisie pour ce qu'elle accompagne.
 */
export const duration = {
  /** Retour au toucher : doit être perçu comme instantané. */
  press: 90,
  /** Apparition d'un panneau ou d'une carte. */
  enter: 220,
  /** Sortie — toujours plus rapide que l'entrée, sinon l'interface traîne. */
  exit: 150,
  /** Durée d'affichage du verdict avant retour automatique à la caméra. */
  verdictHold: 1100,
} as const;
