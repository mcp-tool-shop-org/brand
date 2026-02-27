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

## Pourquoi ?

Lorsque chaque dépôt contient sa propre copie du logo, cela entraîne une duplication, des divergences et une incohérence. Une refonte de l'image de marque signifie devoir parcourir plus de 100 dépôts. Ce dépôt résout ce problème : les logos sont stockés ici, et les fichiers README y font référence via les URL `raw.githubusercontent.com`.

## Structure

```
logos/
  <slug>/
    readme.png    # or readme.jpg — format preserved as-is
manifest.json     # SHA-256 integrity hashes for every asset
docs/
  handbook.md     # Lessons learned from migrating 100+ repos
```

117 logos au sein de l'organisation. Les fichiers PNG restent des fichiers PNG. Les fichiers JPEG restent des fichiers JPEG. Le format est une décision de marque, et non une cible de construction.

## Interface en ligne de commande (CLI)

```bash
npm install -g @mcptoolshop/brand

# Verify all logos match their manifest hashes
brand verify

# Regenerate manifest after adding/replacing a logo
brand manifest

# CI mode — fail if manifest is out of date
brand manifest --check

# Audit repos for broken refs, badge collisions, indentation traps
brand audit --repos /path/to/clones

# Migrate READMEs to point at brand repo (dry run first)
brand migrate --repos /path/to/clones --dry-run
brand migrate --repos /path/to/clones
```

## Ajouter un nouveau logo

1. Déposez le fichier dans `logos/<slug>/readme.png` (ou `.jpg`)
2. Exécutez `brand manifest` pour mettre à jour les hachages d'intégrité
3. Validez à la fois le logo et `manifest.json` ensemble
4. L'intégration continue (CI) vérifie le fichier manifest lors de chaque envoi

## Sécurité

Chaque logo est suivi par un hachage SHA-256 dans `manifest.json`. L'intégration continue (CI) exécute `brand manifest --check` lors de chaque envoi qui modifie les fichiers `logos/` ou `manifest.json`. Toute incohérence – écrasement accidentel, manipulation, divergence – entraîne l'échec de la construction.

Consultez [SECURITY.md](SECURITY.md) pour la politique de sécurité complète et [docs/handbook.md](docs/handbook.md) pour le guide de migration.

## Confidentialité

Cet outil ne collecte aucune donnée télémétrique. Toutes les opérations se déroulent uniquement sur le système de fichiers local.

## Tableau de bord

| Catégorie | Score | Notes |
|----------|-------|-------|
| A. Sécurité | 10/10 | SECURITY.md, intégrité SHA-256, pas de réseau, pas de télémétrie. |
| B. Gestion des erreurs | 8/10 | Erreurs structurées, affichage clair de la ligne de commande, codes de sortie. |
| C. Documentation pour les utilisateurs | 10/10 | README, CHANGELOG, guide, documentation complète de la ligne de commande. |
| D. Qualité du code | 9/10 | Vérification d'intégrité CI, 29 tests, version alignée. |
| E. Identité | 10/10 | Logo, traductions, page d'accueil, métadonnées. |
| **Total** | **47/50** | |

## Licence

[MIT](LICENSE)

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
