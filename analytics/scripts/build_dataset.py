"""Génère le jeu de données simulé et affiche ce qu'il contient.

    python scripts/build_dataset.py --seed 42

Le résumé imprimé n'est pas décoratif : il sert à vérifier que la simulation
produit bien le recouvrement qu'on lui demande. En particulier la dernière
section — la part de doublons réellement frauduleux. Si elle valait 100 %, une
règle suffirait et le reste du dossier n'aurait pas lieu d'être.

Format de sortie : CSV. À cette volumétrie (quelques dizaines de milliers de
lignes) le colonne-orienté n'apporte rien, et le CSV reste lisible et
diffable — ce qui compte davantage pour un jeu de données qu'on veut pouvoir
inspecter à la main. Parquet serait le bon choix à partir du million de lignes.
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import replace
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from tidar_sim import DEFAULT, simulate  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", type=int, default=DEFAULT.seed)
    parser.add_argument("--out", type=Path, default=ROOT / "data")
    args = parser.parse_args()

    cfg = replace(DEFAULT, seed=args.seed)
    data = simulate(cfg)
    scans = data.scans

    args.out.mkdir(parents=True, exist_ok=True)
    scans.to_csv(args.out / "scans.csv", index=False)
    data.tickets.to_csv(args.out / "tickets.csv", index=False)
    data.events.to_csv(args.out / "events.csv", index=False)

    print(f"graine {cfg.seed} · {cfg.n_events} soirées")
    print(f"  scans   : {len(scans):,}")
    print(f"  billets : {len(data.tickets):,}")
    print(f"  taux illégitime : {100 * scans.is_illegitimate.mean():.2f} %")
    print()
    print("Répartition des tentatives")
    for mode, n in scans.fraud_mode.value_counts().items():
        print(f"  {mode:<18} {n:>7,}")

    print()
    print("Doublons — le point qui décide si le problème est apprenable")
    ordered = scans.sort_values("at").copy()
    ordered["rank"] = ordered.groupby(["event_id", "code"]).cumcount()
    dup = ordered[ordered["rank"] > 0]
    if len(dup) == 0:
        print("  aucun doublon généré")
        return

    share = 100 * dup.is_illegitimate.mean()
    print(f"  seconds passages : {len(dup):,}")
    print(f"  dont illégitimes : {share:.1f} %")
    for mode, n in dup.fraud_mode.value_counts().items():
        print(f"    {mode:<16} {n:>6,}")
    print()
    if share > 97:
        print("  ⚠ quasi tous frauduleux : une règle suffirait, le modèle serait un alibi.")
    else:
        print(f"  ✓ {100 - share:.1f} % des doublons sont légitimes — c'est là que se joue")
        print("    la différence entre une règle et un modèle.")

    print()
    print(f"écrit dans {args.out}")


if __name__ == "__main__":
    main()
