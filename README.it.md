<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

## Perché

Quando ogni repository contiene una propria copia del logo, si verificano duplicazioni, discrepanze e incoerenze. Un cambiamento di immagine coordinata significa dover cercare in oltre 100 repository. Questo repository risolve questo problema: i loghi sono conservati qui, e i file README li richiamano tramite URL `raw.githubusercontent.com`.

## Struttura

```
logos/
  <slug>/
    readme.png    # or readme.jpg — format preserved as-is
manifest.json     # SHA-256 integrity hashes for every asset
docs/
  handbook.md     # Lessons learned from migrating 100+ repos
```

Sono presenti 117 loghi in tutta l'organizzazione. I file PNG rimangono file PNG, i file JPEG rimangono file JPEG. Il formato è una decisione di branding, non un obiettivo di compilazione.

## Interfaccia a riga di comando (CLI)

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

## Aggiungere un nuovo logo

1. Copiare il file in `logos/<slug>/readme.png` (o `.jpg`)
2. Eseguire `brand manifest` per aggiornare gli hash di integrità
3. Effettuare il commit sia del logo che di `manifest.json` insieme
4. Il sistema di integrazione continua (CI) verifica il file manifest ad ogni commit.

## Sicurezza

Ogni logo è tracciato tramite l'hash SHA-256 nel file `manifest.json`. Il sistema CI esegue `brand manifest --check` ad ogni commit che modifica i file in `logos/` o `manifest.json`. Qualsiasi discrepanza (sovrascrittura accidentale, manomissione, discrepanza) causa il fallimento della compilazione.

Consultare [SECURITY.md](SECURITY.md) per la politica di sicurezza completa e [docs/handbook.md](docs/handbook.md) per la guida alla migrazione.

## Privacy

Questo strumento non raccoglie dati di telemetria. Tutte le operazioni avvengono esclusivamente sul file system locale.

## Valutazione

| Categoria | Punteggio | Note |
|----------|-------|-------|
| A. Sicurezza | 10/10 | SECURITY.md, integrità SHA-256, nessuna connessione di rete, nessuna telemetria. |
| B. Gestione degli errori | 8/10 | Errori strutturati, output CLI chiaro, codici di uscita. |
| C. Documentazione per gli operatori | 10/10 | README, CHANGELOG, guida, documentazione completa CLI. |
| D. Qualità del codice | 9/10 | Controllo di integrità CI, 29 test, versione allineata. |
| E. Identità | 10/10 | Logo, traduzioni, pagina di presentazione, metadati. |
| **Total** | **47/50** | |

## Licenza

[MIT](LICENSE)

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
