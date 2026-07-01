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

Lorsque chaque dépôt contient sa propre copie du logo, cela entraîne une duplication, des incohérences et un manque d’uniformité. Un changement de marque implique de parcourir plus de 100 dépôts. Ce dépôt résout ce problème : les logos sont stockés ici, et les fichiers README y font référence via des URL `raw.githubusercontent.com`.

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

Des centaines de logos dans l’ensemble de l’organisation. Les fichiers PNG restent des fichiers PNG. Les fichiers JPEG restent des fichiers JPEG. Le format est une décision de marque, et non un objectif de compilation.

Le fichier `readme.<ext>` d’un slug est toujours le logo principal. Un slug peut également avoir un sous-dossier contenant des images supplémentaires (par exemple, les différentes vues d’un personnage dans un ensemble de sprites, ou un ensemble de captures d’écran d’un outil). Le manifeste indique explicitement le « rôle » de chaque élément, au lieu de traiter tous les fichiers image de la même manière. Voir [Galeries et fichiers README dynamiques](#galeries--fichiers-readme-dynamiques) ci-dessous.

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

Une action GitHub quotidienne (`sync.yml`) analyse tous les dépôts de l’organisation à la recherche de logos, télécharge les nouveaux éléments ou ceux qui ont été modifiés, régénère le manifeste et ouvre une demande d’extraction (PR). Vous pouvez également la déclencher manuellement via `workflow_dispatch`.

Le script de synchronisation se trouve dans `scripts/sync-org-logos.sh` et peut être exécuté localement :

```bash
# Preview what would change
./scripts/sync-org-logos.sh --dry-run

# Sync logos from the org
./scripts/sync-org-logos.sh
```

### Configuration (unique, par branche)

L’action de synchronisation ouvre une demande d’extraction, elle a donc besoin des autorisations nécessaires pour le faire. Choisissez l’une de ces options dans les paramètres du dépôt :

1. **Activer la création de demandes d’extraction par Actions.** Paramètres -> Actions -> Général -> « Autoriser GitHub Actions à créer et approuver des demandes d’extraction » -> ACTIVÉ. C’est l’option la plus simple, car elle ne nécessite pas de secrets supplémentaires. ([Documentation GitHub](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#preventing-github-actions-from-creating-or-approving-pull-requests))
2. **Fournir un secret de dépôt `SYNC_PAT`.** Jeton d’accès personnel avec les autorisations `contents:write` et `pull-requests:write`. Cette option déclenche également le CI en aval sur la demande d’extraction automatique (ce que ne fait pas le jeton `GITHUB_TOKEN` par défaut).

Si aucune de ces options n’est configurée, l’action quotidienne échouera chaque matin à l’étape `gh pr create`, car elle aura un problème d’autorisation.

### Résolution des problèmes

| Symptôme | Cause | Solution |
| --- | --- | --- |
| `gh pr create` 403 | Aucune des options de configuration ci-dessus n’est configurée. | Choisissez l’option 1 ou 2 ci-dessus. |
| L’action quotidienne n’ouvre aucune demande d’extraction, rien ne change. | Tous les dépôts de l’organisation n’ont soit pas de logo, soit les logos sont déjà identiques. | C’est normal : les exécutions sans modification sont souhaitables. |
| La vérification du manifeste a échoué. | Les logos ont été téléchargés, mais le hachage du manifeste ne correspond pas. | Un problème `sync-failure` est créé automatiquement ; réexécutez `brand manifest` et `brand verify` localement. |
| Une demande d’extraction de synchronisation introduit un logo incorrect. | Le dépôt en amont a publié une image corrompue ou contenant un contenu incorrect. | Annulez la fusion : `git revert <merge-sha> && brand manifest && git commit --amend --no-edit && git push`. Voir [SECURITY.md](SECURITY.md#incident-response). |

## Galeries et fichiers README dynamiques

Certains produits nécessitent plus d’une image de présentation par slug : un ensemble de sprites avec les différentes vues d’un personnage, ou un ensemble de captures d’écran d’un outil. `brand` traite ces éléments comme une **galerie** à part entière, distincte du logo principal, au lieu d’un simple amas de fichiers supplémentaires :

```bash
# Register a directory of images as a gallery (idempotent — re-run any time
# source-dir changes; new files are added, changed files updated, deleted
# files removed. Regenerates manifest.json automatically.)
brand add-gallery pirate-raiders-3d-2 /path/to/turnarounds
```

Pour afficher cette galerie dans le **fichier README du dépôt cible** et la maintenir synchronisée lorsque la galerie est modifiée, ajoutez une paire de marqueurs n’importe où dans le fichier README :

```html
<!-- brand:gallery:start slug="pirate-raiders-3d-2" -->
<!-- brand:gallery:end -->
```

Exécutez ensuite :

```bash
brand sync --slug pirate-raiders-3d-2 --repos /path/to/clones
```

`sync` régénère tout ce qui se trouve entre les marqueurs à partir du manifeste. Cela garantit une sortie déterministe et identique à chaque exécution avec des entrées inchangées, ce qui permet une intégration facile avec le CI. L’option `--check` signale les différences sans écrire (elle renvoie 1 si le fichier README est obsolète, et 0 s’il est à jour). Vous pouvez l’intégrer au CI du dépôt cible de la même manière que `brand manifest --check` pour ce projet. Il s’agit d’une section **dynamique** du fichier README : le contenu rédigé manuellement autour des marqueurs reste intact ; tout ce qui se trouve entre eux est géré par la machine et peut être régénéré à tout moment. Le préfixe `brand:gallery:` est utilisé pour éviter les conflits, afin que d’autres types de blocs (badges, statistiques) puissent partager un fichier README sans problème.

`brand audit` comprend également la différence : un fichier README contenant plusieurs balises `<img>` pour un même slug ne sera plus signalé comme une possible collision de badges. S’il n’est pas encore associé à un bloc marqueur, `audit` suggère d’utiliser `brand sync`.

## Ajout manuel d’un logo

1. Déposez le fichier dans `logos/<slug>/readme.png` (ou `.jpg`).
2. Exécutez `brand manifest` pour mettre à jour les hachages d’intégrité.
3. Validez à la fois le logo et le fichier `manifest.json`.
4. Le CI vérifie le manifeste lors de la validation.

## Sécurité

| Aspect | Détail |
|--------|--------|
| **Data touched** | Fichiers d’images de logo et de galerie dans `logos/` (lecture), `manifest.json` (lecture/écriture), fichiers README (lecture/écriture pendant la migration et la synchronisation : `sync` ne réécrit jamais que le contenu entre les marqueurs `brand:gallery:start`/`end`). |
| **Data NOT touched** | Aucune télémétrie, aucun suivi analytique, aucune communication réseau (y compris pour `sync` : il s’agit d’une fonction pure du manifeste local et du fichier README local), aucune exécution de code à partir des fichiers logo/galerie. |
| **Permissions** | Lecture : fichiers logo/galerie, manifeste, fichiers README. Écriture : `manifest.json`, fichiers README (uniquement lors de la migration/synchronisation). |
| **Network** | Aucune : outil CLI entièrement hors ligne. |
| **Telemetry** | Aucune donnée n’est collectée ou envoyée. |

Chaque logo est suivi par un hachage SHA-256 dans `manifest.json`. Le CI exécute `brand manifest --check` à chaque validation qui modifie les fichiers dans `logos/` ou `manifest.json`. Toute différence (remplacement accidentel, altération, divergence) entraîne l’échec de la compilation. Seuls les fichiers image (`.png`, `.jpg`, `.jpeg`, `.svg`, `.webp`) sont suivis ; les fichiers non-image situés dans `logos/` sont ignorés.

Les rapports sur les vulnérabilités sont envoyés au canal privé de GitHub : [https://github.com/mcp-tool-shop-org/brand/security/advisories/new]. Consultez le fichier [SECURITY.md] pour connaître l’intégralité de la politique et le fichier [docs/handbook.md] pour obtenir le guide de migration.

## Tableau de bord

| Catégorie | Score |
|----------|-------|
| A. Sécurité | 10 |
| B. Gestion des erreurs | 10 |
| C. Documentation pour les opérateurs | 10 |
| D. Bonnes pratiques de publication | 10 |
| E. Identité (aspect souple) | 10 |
| **Overall** | **50/50** |

Chaque ligne D est verte : matrice Node 20/22/24, actions avec SHA fixe, étape `npm audit`, Dependabot, contenu des fichiers tarball et parfaite cohérence entre les balises/versions/paquets npm (résolu le 2026-07-01 — v1.0.2/v1.0.3 n’ont jamais été publiés sur npm ; étiquetés rétrospectivement pour assurer la cohérence avec git/CHANGELOG).

> Audit complet : [SHIP_GATE.md](SHIP_GATE.md) · [SCORECARD.md](SCORECARD.md)

## Licence

[MIT](LICENSE)

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
