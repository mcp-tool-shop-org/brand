<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/assets/logo.jpg" alt="Brand" width="400">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/brand/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/brand/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/brand"><img src="https://img.shields.io/npm/v/@mcptoolshop/brand" alt="npm"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
  <a href="https://mcp-tool-shop-org.github.io/brand/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

<p align="center">
  Centralized brand asset registry for the <a href="https://github.com/mcp-tool-shop-org">mcp-tool-shop-org</a> GitHub org.<br>
  One repo holds every logo. Every README points here. Update once, update everywhere.
</p>

---

## Pourquoi

Lorsque chaque dépôt contient sa propre copie du logo, cela entraîne une duplication, une divergence et un manque de cohérence. Un changement de marque implique de parcourir plus de 100 dépôts. Ce dépôt résout ce problème : les logos sont stockés ici, et les fichiers README y font référence via des URL `raw.githubusercontent.com`.

## Structure

```
logos/
  <slug>/
    readme.png       # THE logo — one canonical image, format preserved as-is
    gallery/          # optional — a named collection of N extra showcase images
      side.png
      back.png
manifest.json     # SHA-256 integrity hashes for every asset, tagged role: primary | gallery
docs/
  handbook.md     # Lessons learned from migrating 100+ repos
```

Des centaines de logos dans toute l’organisation. Les fichiers PNG restent des fichiers PNG. Les fichiers JPEG restent des fichiers JPEG. Le format est une décision de marque, et non un objectif de compilation.

L’identifiant d’un logo `readme.<ext>` est toujours celui du logo principal. Un identifiant peut également avoir un sous-dossier contenant des images supplémentaires (par exemple, les différentes vues d’un personnage dans un ensemble de sprites, ou un ensemble de captures d’écran pour un outil). Le manifeste identifie explicitement le `role` de chaque élément, au lieu de traiter tous les fichiers image de la même manière. Voir [Galeries et fichiers README dynamiques](#galeries--fichiers-readme-dynamiques) ci-dessous.

## CLI

```bash
npm install -g @mcptoolshop/brand

# Verify all logos match their manifest hashes
brand verify

# Regenerate manifest after adding/replacing a logo
brand manifest

# CI mode — fail if manifest is out of date
brand manifest --check

# Show registry summary — counts, formats, sync status
brand stats
brand stats --json

# Audit repos for broken refs, badge collisions, indentation traps
brand audit --repos /path/to/clones

# Audit against the live org without cloning anything, and reconcile the
# registry against it — reports renamed, archived, and orphaned slugs.
# Opt-in network access; needs GH_TOKEN or GITHUB_TOKEN.
brand audit --remote --org mcp-tool-shop-org

# Show a slug's asset history from git — added/changed/removed, with hashes
brand history <slug>
brand history <slug> --limit 5 --json

# Remove a slug (or just one of its galleries). Destructive, so --yes is
# required; --dry-run shows exactly what would go first.
brand remove <slug> --dry-run
brand remove <slug> --yes
brand remove <slug> --gallery turnarounds --yes

# Migrate READMEs to point at brand repo (dry run first)
brand migrate --repos /path/to/clones --dry-run
brand migrate --repos /path/to/clones

# Register a directory of images as a named gallery for a slug
brand add-gallery <slug> /path/to/turnarounds --dry-run
brand add-gallery <slug> /path/to/turnarounds

# Sync a consuming repo's README gallery block from the manifest
brand sync --slug <slug> --repos /path/to/clones --check
brand sync --slug <slug> --repos /path/to/clones
```

## Synchronisation automatique

Une action GitHub quotidienne (`sync.yml`) analyse tous les dépôts de l’organisation à la recherche de logos, télécharge les nouveaux éléments ou ceux qui ont été modifiés, régénère le manifeste et ouvre une demande d’extraction. Vous pouvez également la déclencher manuellement via `workflow_dispatch`.

Le script de synchronisation se trouve à l’adresse `scripts/sync-org-logos.sh` et peut être exécuté localement :

```bash
# Preview what would change
./scripts/sync-org-logos.sh --dry-run

# Sync logos from the org
./scripts/sync-org-logos.sh
```

### Configuration (unique, par branche)

L’action de synchronisation ouvre une demande d’extraction, elle a donc besoin de l’autorisation de le faire. Choisissez l’une des options suivantes dans les paramètres du dépôt :

1. **Activer la création de demandes d’extraction par les actions.** Paramètres -> Actions -> Général -> « Autoriser les actions GitHub à créer et approuver des demandes d’extraction » -> ACTIVÉ. C’est l’option la plus simple ; il n’y a pas de secrets supplémentaires à gérer. ([Documentation GitHub](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#preventing-github-actions-from-creating-or-approving-pull-requests))
2. **Fournir un secret de dépôt `SYNC_PAT`.** Jeton d’accès personnel avec les étendues `contents:write` + `pull-requests:write`. Cette option déclenche également le CI en aval sur la demande d’extraction automatique (l’option par défaut `GITHUB_TOKEN` ne le fait pas).

Si aucune de ces options n’est sélectionnée, l’action quotidienne échoue chaque matin à `gh pr create` en raison d’une erreur d’autorisation.

### Résolution des problèmes

| Symptôme | Cause | Solution |
| --- | --- | --- |
| `gh pr create` 403 | Aucune des options de configuration ci-dessus n’est configurée. | Choisissez l’option 1 ou 2 ci-dessus. |
| L’action quotidienne n’ouvre aucune demande d’extraction, rien ne change. | Tous les dépôts de l’organisation n’ont soit pas de logo, soit les logos correspondent déjà. | C’est normal : les exécutions sans modification sont normales. |
| La vérification du manifeste a échoué. | Les logos ont été téléchargés, mais le hachage du manifeste ne correspond pas. | Un problème `sync-failure` est créé automatiquement ; réexécutez `brand manifest && brand verify` localement. |
| Une demande d’extraction de synchronisation introduit un logo incorrect. | Le dépôt en amont a publié une image corrompue ou avec un contenu incorrect. | Annulez la fusion : `git revert <merge-sha> && brand manifest && git commit --amend --no-edit && git push`. Voir [SECURITY.md](SECURITY.md#incident-response). |

## Galeries et fichiers README dynamiques

Certains produits ont besoin de plus d’une image pour chaque identifiant, par exemple les huit vues d’un personnage dans un ensemble de sprites ou un ensemble de captures d’écran pour un outil. `brand` traite ces éléments comme une **galerie**, distincte du logo principal, au lieu d’un simple ensemble de fichiers supplémentaires :

```bash
# Register a directory of images as a gallery (idempotent — re-run any time
# source-dir changes; new files are added, changed files updated, deleted
# files removed. Regenerates manifest.json automatically.)
brand add-gallery pirate-raiders-3d-2 /path/to/turnarounds
```

Pour afficher cette galerie dans le **fichier README d’un dépôt cible** et la maintenir synchronisée lorsque la galerie change, ajoutez une paire de marqueurs n’importe où dans le fichier README :

```html
<!-- brand:gallery:start slug="pirate-raiders-3d-2" -->
<!-- brand:gallery:end -->
```

Ensuite, exécutez :

```bash
brand sync --slug pirate-raiders-3d-2 --repos /path/to/clones
```

`sync` régénère tout ce qui se trouve entre les marqueurs à partir du manifeste. Cela garantit une sortie déterministe et identique à chaque exécution avec des entrées inchangées, ce qui permet de l’intégrer facilement au CI. `--check` signale les différences sans écrire (renvoie 1 si le fichier README est obsolète, 0 s’il est à jour) ; intégrez-le au CI du dépôt cible de la même manière que `brand manifest --check` contrôle celui-ci. Il s’agit d’une section **dynamique** du fichier README : le contenu rédigé manuellement autour des marqueurs n’est pas modifié ; tout ce qui se trouve entre eux appartient à la machine et peut être régénéré à tout moment. Le préfixe `brand:gallery:` est mis en espace de noms afin que les futurs types de blocs (badges, statistiques) puissent partager un fichier README sans conflit.

`brand audit` comprend également la différence : un fichier README contenant plusieurs balises de galerie `<img>` pour un même identifiant ne sera plus signalé comme pouvant entraîner un conflit avec des badges ; s’il n’est pas encore lié à un bloc de marqueur, `audit` oriente plutôt vers `brand sync`.

## Ajout manuel d’un logo

1. Déposez le fichier dans `logos/<slug>/readme.png` (ou `.jpg`).
2. Exécutez `brand manifest` pour mettre à jour les hachages d’intégrité.
3. Validez à la fois le logo et `manifest.json`.
4. Le CI vérifie le manifeste lors de la validation.

## Sécurité

| Aspect | Détail |
|--------|--------|
| **Data touched** | Fichiers d’images de logo et de galerie dans `logos/` (lecture), `manifest.json` (lecture/écriture), fichiers README (lecture/écriture pendant la migration et la synchronisation : `sync` ne réécrit jamais que le contenu entre les marqueurs `brand:gallery:start`/`end`). |
| **Data NOT touched** | Aucune télémétrie, aucune analyse, aucune exécution de code à partir des fichiers logo/galerie. |
| **Permissions** | Lecture : fichiers logo/galerie, manifeste, fichiers README. Écriture : manifest.json, fichiers README (migration/synchronisation uniquement) et `logos/<slug>/` (`remove` uniquement, ce qui nécessite `--yes`). |
| **Network** | Aucune par défaut. `brand audit --remote` est la seule exception et son utilisation est strictement facultative ; sans cet indicateur, aucune requête réseau n’est effectuée. `sync`, `verify`, `manifest`, `stats`, `migrate`, `add-gallery`, `remove` et `history` sont entièrement hors ligne. |
| **Telemetry** | Aucune donnée collectée ou envoyée. |

Chaque logo est suivi par un hachage SHA-256 dans `manifest.json`. Le CI exécute `brand manifest --check` à chaque validation qui modifie `logos/` ou `manifest.json`. Seuls les fichiers image (`.png`, `.jpg`, `.jpeg`, `.svg`, `.webp`) sont suivis ; les fichiers non-image situés dans `logos/` sont ignorés.

**Ce que la valeur de hachage prouve et ne prouve pas.** Une incohérence permet de détecter une écriture accidentelle, un fichier corrompu ou une divergence entre le disque et le manifeste, ce qui correspond aux erreurs courantes. Elle n’empêche **pas** une manipulation délibérée : toute personne ayant les droits d’écriture peut remplacer un logo, exécuter `brand manifest` et valider les deux modifications, après quoi `verify` est accepté. La valeur de hachage prouve que l’arborescence est cohérente en interne, mais pas que son contenu a été approuvé. Ce qui permet réellement de combler cette lacune, ce sont les contrôles du dépôt ainsi que le mécanisme de détection des divergences lors de la synchronisation quotidienne, qui vérifient chaque logo enregistré par rapport à son référentiel d’origine — voir [SECURITY.md](SECURITY.md#the-limit-of-the-manifest--read-this-before-trusting-it) et [`.github/SECURITY-CONTROLS.md`](.github/SECURITY-CONTROLS.md).

Les signalements de vulnérabilités sont envoyés au canal d’alerte privé de GitHub : [https://github.com/mcp-tool-shop-org/brand/security/advisories/new](https://github.com/mcp-tool-shop-org/brand/security/advisories/new). Voir [SECURITY.md](SECURITY.md) pour la politique complète et [docs/handbook.md](docs/handbook.md) pour le guide de migration.

## Tableau de bord

| Catégorie | Score |
|----------|-------|
| A. Sécurité | 10 |
| B. Gestion des erreurs | 10 |
| C. Documentation pour les opérateurs | 10 |
| D. Bonnes pratiques de publication | 10 |
| E. Identité (souple) | 10 |
| **Overall** | **50/50** |

Chaque ligne D est verte : matrice Node 20/22/24, actions avec hachage SHA fixe, étape `npm audit`, Dependabot, contenu du fichier tarball et parfaite cohérence entre les balises/versions/paquets npm (résolu le 2026-07-01 — v1.0.2/v1.0.3 n’a jamais été publié sur npm ; étiqueté rétrospectivement pour assurer la cohérence avec git/CHANGELOG).

> Audit complet : [SHIP_GATE.md](SHIP_GATE.md) · [SCORECARD.md](SCORECARD.md)

## Licence

[MIT](LICENSE)

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
