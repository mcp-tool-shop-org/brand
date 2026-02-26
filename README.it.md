<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="assets/logo.jpg" alt="Brand" width="400">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/brand/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/brand/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/brand/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

Registro centralizzato delle risorse del marchio per l'organizzazione GitHub [mcp-tool-shop-org](https://github.com/mcp-tool-shop-org). Un repository contiene tutti i loghi. Ogni file README fa riferimento a questo repository. Aggiornare una volta, aggiornare ovunque.

## Perché

Quando ogni repository contiene una propria copia del logo, si verificano duplicazioni, discrepanze e incoerenze. Un cambiamento di immagine richiede di cercare in oltre 80 repository. Questo repository risolve questo problema: i loghi sono memorizzati qui, e i file README li richiamano tramite URL `raw.githubusercontent.com`.

## Struttura

```
logos/
  <slug>/
    readme.png    # or readme.jpg — format preserved as-is
manifest.json     # SHA-256 integrity hashes for every asset
docs/
  handbook.md     # Lessons learned from migrating 80+ repos
```

81 loghi distribuiti in 81 repository. I file PNG rimangono file PNG, i file JPEG rimangono file JPEG. Il formato è una decisione del marchio, non un obiettivo di compilazione.

## Interfaccia a riga di comando (CLI)

```bash
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

Consultare [docs/handbook.md](docs/handbook.md) per maggiori dettagli: perché i collegamenti simbolici non funzionano, come i badge interferiscono con il rilevamento dei loghi, le trappole di rendering Markdown che compromettono i tag `<img>`, e il protocollo di sicurezza per la migrazione.

## Licenza

[MIT](LICENSE)
