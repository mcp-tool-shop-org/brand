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

Lorsque chaque dépôt contient sa propre copie du logo, cela entraîne une duplication, des divergences et une incohérence. Une refonte de l'image de marque implique de parcourir plus de 100 dépôts. Ce dépôt résout ce problème : les logos sont stockés ici, et les fichiers README y font référence via les URL `raw.githubusercontent.com`.

## Structure

```
logos/
  <slug>/
    readme.png    # or readme.jpg — format preserved as-is
manifest.json     # SHA-256 integrity hashes for every asset
docs/
  handbook.md     # Lessons learned from migrating 100+ repos
```

Des centaines de logos à travers l'organisation. Les fichiers PNG restent des fichiers PNG. Les fichiers JPEG restent des fichiers JPEG. Le format est une décision de marque, et non une cible de compilation.

## Interface en ligne de commande (CLI)

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
```

## Synchronisation automatique

Une action GitHub quotidienne (`sync.yml`) analyse chaque dépôt de l'organisation à la recherche de logos, télécharge les nouveaux actifs ou les actifs modifiés, régénère le manifeste et ouvre une demande de tirage (pull request). Vous pouvez également la déclencher manuellement via `workflow_dispatch`.

Le script de synchronisation se trouve dans `scripts/sync-org-logos.sh` et peut être exécuté localement :

```bash
# Preview what would change
./scripts/sync-org-logos.sh --dry-run

# Sync logos from the org
./scripts/sync-org-logos.sh
```

### Configuration (une seule fois, par branche)

L'action de synchronisation ouvre une demande de tirage, elle a donc besoin de l'autorisation de le faire. Choisissez l'une de ces options dans les paramètres du dépôt :

1. **Activer la création de demandes de tirage par les actions GitHub.** Paramètres -> Actions -> Général -> "Autoriser les actions GitHub à créer et à approuver les demandes de tirage" -> ACTIVÉ. C'est la solution la plus simple ; elle ne nécessite pas de gérer de secrets supplémentaires. ([Documentation GitHub](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#preventing-github-actions-from-creating-or-approving-pull-requests))
2. **Fournir un secret de dépôt `SYNC_PAT`.** Un jeton d'accès personnel avec les autorisations `contents:write` et `pull-requests:write`. Cette option déclenche également le CI en aval sur la demande de tirage automatique (le `GITHUB_TOKEN` par défaut ne le fait pas).

Sans l'une de ces options, l'action quotidienne échoue chaque matin avec une erreur d'autorisation lors de l'exécution de `gh pr create`.

### Dépannage

| Symptôme | Cause | Solution |
| --- | --- | --- |
| `gh pr create` renvoie le code 403 | Aucune des options de configuration ci-dessus n'est configurée. | Choisissez l'option 1 ou 2 ci-dessus. |
| L'action quotidienne n'ouvre aucune demande de tirage, rien ne change. | Tous les dépôts de l'organisation n'ont pas de logo, ou les logos correspondent déjà. | Comportement attendu : les exécutions sans modification sont normales. |
| La vérification du manifeste a échoué. | Les logos ont été téléchargés, mais la somme de contrôle du manifeste ne correspond pas. | Un problème `sync-failure` est créé automatiquement ; relancez `brand manifest && brand verify` localement. |
| Une demande de tirage de synchronisation introduit un mauvais logo. | Le dépôt source a publié une image corrompue ou contenant un contenu incorrect. | Annulez la fusion : `git revert <merge-sha> && brand manifest && git commit --amend --no-edit && git push`. Consultez [SECURITY.md](SECURITY.md#incident-response). |

## Ajouter un logo manuellement

1. Déposez le fichier dans `logos/<slug>/readme.png` (ou `.jpg`).
2. Exécutez `brand manifest` pour mettre à jour les sommes de contrôle d'intégrité.
3. Validez à la fois le logo et `manifest.json` ensemble.
4. Le CI vérifie le manifeste lors de la validation.

## Sécurité

| Aspect | Détails |
|--------|--------|
| **Data touched** | Fichiers de logo dans `logos/` (lecture), `manifest.json` (lecture/écriture), fichiers README (lecture/écriture pendant la migration). |
| **Data NOT touched** | Aucune télémétrie, aucune analyse, aucun appel réseau, aucune exécution de code à partir des fichiers de logo. |
| **Permissions** | Lecture : fichiers de logo, manifeste, fichiers README. Écriture : `manifest.json`, fichiers README (uniquement pendant la migration). |
| **Network** | Aucune — outil CLI entièrement hors ligne. |
| **Telemetry** | Aucune donnée collectée ou envoyée. |

Chaque logo est suivi par une somme de contrôle SHA-256 dans `manifest.json`. Le CI exécute `brand manifest --check` à chaque validation qui modifie `logos/` ou `manifest.json`. Toute incohérence (écrasement accidentel, falsification, divergence) entraîne l'échec de la compilation. Seuls les fichiers image (`.png`, `.jpg`, `.jpeg`, `.svg`, `.webp`) sont suivis ; les fichiers non image sous `logos/` sont ignorés.

Les rapports de vulnérabilités doivent être envoyés à la [plateforme privée de signalement](https://github.com/mcp-tool-shop-org/brand/security/advisories/new) de GitHub. Consultez le fichier [SECURITY.md](SECURITY.md) pour connaître la politique complète et le fichier [docs/handbook.md](docs/handbook.md) pour le guide de migration.

## Tableau de notation

| Catégorie | Score |
|----------|-------|
| A. Sécurité | 10 |
| B. Gestion des erreurs | 10 |
| C. Documentation pour les utilisateurs | 10 |
| D. Bonnes pratiques de publication | 9 |
| E. Identité (aspects logiciels) | 10 |
| **Overall** | **49/50** |

Le score D est de 9/10, en attente d'une vérification supplémentaire : les balises Git distantes ne remontent qu'à la version 1.0.1, alors que le fichier CHANGELOG documente les versions 1.0.2 et 1.0.3 publiées. Toutes les autres lignes de la section D sont vertes : prise en charge des versions Node 18/20/22, actions avec hachage fixe, étape `npm audit`, Dependabot, contenu des archives tar.

> Audit complet : [SHIP_GATE.md](SHIP_GATE.md) · [SCORECARD.md](SCORECARD.md)

## Licence

[MIT](LICENSE)

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
