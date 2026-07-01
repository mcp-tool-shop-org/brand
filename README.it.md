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

Quando ogni repository contiene la propria copia del logo, si ottiene duplicazione, incoerenza e divergenza. Un rebranding significa dover cercare in oltre 100 repository. Questo repository risolve il problema: i loghi sono archiviati qui e i file README fanno riferimento ad essi tramite URL `raw.githubusercontent.com`.

## Struttura

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

Centinaia di loghi in tutta l'organizzazione. I file PNG rimangono PNG, i JPEG rimangono JPEG. Il formato è una decisione del marchio, non un obiettivo di build.

Il file `readme.<ext>` di uno "slug" è sempre il logo principale. Uno "slug" può anche avere una sottocartella con immagini aggiuntive (ad esempio, le animazioni dei personaggi di una serie di sprite o una raccolta di schermate di un'applicazione). Il manifesto etichetta esplicitamente il "ruolo" di ogni elemento anziché trattare tutti i file immagine allo stesso modo. Vedere [Gallerie e README dinamici](#galleries--dynamic-readmes) qui sotto.

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

## Sincronizzazione automatica

Un'azione GitHub giornaliera (`sync.yml`) esamina tutti i repository dell'organizzazione alla ricerca di loghi, scarica gli elementi nuovi o modificati, rigenera il manifesto e apre una richiesta pull (PR). È anche possibile avviarla manualmente tramite `workflow_dispatch`.

Lo script di sincronizzazione si trova in `scripts/sync-org-logos.sh` e può essere eseguito localmente:

```bash
# Preview what would change
./scripts/sync-org-logos.sh --dry-run

# Sync logos from the org
./scripts/sync-org-logos.sh
```

### Configurazione (una tantum, per ogni fork)

Il flusso di lavoro di sincronizzazione apre una PR, quindi richiede l'autorizzazione per farlo. Scegliere una delle seguenti opzioni nelle impostazioni del repository:

1. **Abilitare la creazione di PR tramite Azioni.** Impostazioni -> Azioni -> Generale -> "Consenti alle azioni GitHub di creare e approvare richieste pull" -> ATTIVATO. È l'opzione più semplice; non richiede la gestione di segreti aggiuntivi. ([Documentazione GitHub](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#preventing-github-actions-from-creating-or-approving-pull-requests))
2. **Fornire un segreto di repository `SYNC_PAT`.** Token di accesso personale con gli ambiti `contents:write` e `pull-requests:write`. Questa opzione attiva anche il CI a valle sulla PR automatica (il token `GITHUB_TOKEN` predefinito non lo fa).

Se non si configura una di queste opzioni, il flusso di lavoro giornaliero fallirà ogni mattina al comando `gh pr create` a causa di un errore di autorizzazione.

### Risoluzione dei problemi

| Sintomo | Causa | Soluzione |
| --- | --- | --- |
| `gh pr create` 403 | Nessuna delle opzioni di configurazione sopra indicate è stata configurata. | Scegliere l'opzione 1 o 2 sopra indicata. |
| Il flusso di lavoro giornaliero non apre alcuna PR, nulla cambia. | Tutti i repository dell'organizzazione non hanno loghi oppure i loghi sono già corretti. | È previsto: le esecuzioni senza modifiche sono normali. |
| La verifica del manifesto è fallita. | I loghi sono stati scaricati, ma l'hash del manifesto non corrisponde. | Viene creata automaticamente un issue `sync-failure`; rieseguire localmente `brand manifest && brand verify`. |
| Una PR di sincronizzazione introduce un logo errato. | Il repository upstream ha pubblicato un'immagine corrotta o con contenuto errato. | Annullare l'unione: `git revert <merge-sha> && brand manifest && git commit --amend --no-edit && git push`. Vedere [SECURITY.md](SECURITY.md#incident-response). |

## Gallerie e README dinamici

Alcuni prodotti richiedono più di un'immagine per "slug": ad esempio, le animazioni dei personaggi di una serie di sprite o una raccolta di schermate di un'applicazione. `brand` tratta questi elementi come una **galleria** distinta dal logo principale, anziché come una semplice raccolta di file aggiuntivi:

```bash
# Register a directory of images as a gallery (idempotent — re-run any time
# source-dir changes; new files are added, changed files updated, deleted
# files removed. Regenerates manifest.json automatically.)
brand add-gallery pirate-raiders-3d-2 /path/to/turnarounds
```

Per visualizzare la galleria in un **README del repository di destinazione** e mantenerla sincronizzata quando la galleria cambia, inserire una coppia di marcatori ovunque nel README:

```html
<!-- brand:gallery:start slug="pirate-raiders-3d-2" -->
<!-- brand:gallery:end -->
```

Quindi eseguire:

```bash
brand sync --slug pirate-raiders-3d-2 --repos /path/to/clones
```

`sync` rigenera tutto ciò che si trova tra i marcatori dal manifesto: l'output è deterministico e identico ad ogni esecuzione con input invariati, quindi si integra perfettamente con il CI. L'opzione `--check` segnala le differenze senza scrivere (esce con codice 1 se il README non è aggiornato, 0 se lo è) e può essere integrata nel CI del repository di destinazione nello stesso modo in cui `brand manifest --check` controlla questo flusso di lavoro. Questa è una sezione **README dinamica**: il contenuto creato manualmente attorno ai marcatori rimane invariato; tutto ciò che si trova tra i marcatori è gestito dalla macchina e può essere rigenerato in qualsiasi momento. Il prefisso `brand:gallery:` è con uno spazio dei nomi, in modo che tipi di blocchi futuri (badge, statistiche) possano condividere un README senza conflitti.

Anche `brand audit` comprende la differenza: un README con diversi tag `<img>` per uno "slug" non viene più segnalato come possibile conflitto di badge; se non è ancora collegato a un blocco marcatore, `audit` suggerisce l'utilizzo di `brand sync`.

## Aggiunta manuale di un logo

1. Inserire il file in `logos/<slug>/readme.png` (o `.jpg`)
2. Eseguire `brand manifest` per aggiornare gli hash di integrità
3. Commit sia del logo che di `manifest.json`
4. Il CI verifica il manifesto all'invio

## Sicurezza

| Aspetto | Dettagli |
|--------|--------|
| **Data touched** | File immagine del logo e della galleria in `logos/` (lettura), `manifest.json` (lettura/scrittura), file README (lettura/scrittura durante la migrazione e la sincronizzazione: `sync` riscrive solo il contenuto tra i marcatori `brand:gallery:start`/`end`) |
| **Data NOT touched** | Nessuna telemetria, nessun dato analitico, nessuna chiamata di rete (incluso `sync`: è una funzione pura del manifesto locale + README locale), nessuna esecuzione di codice dai file logo/galleria. |
| **Permissions** | Lettura: file logo/galleria, manifesto, README. Scrittura: manifest.json, README (solo migrazione/sincronizzazione). |
| **Network** | Nessuno: strumento CLI completamente offline. |
| **Telemetry** | Nessun dato raccolto o inviato. |

Ogni logo è tracciato tramite l'hash SHA-256 in `manifest.json`. Il CI esegue `brand manifest --check` su ogni invio che modifica `logos/` o `manifest.json`. Qualsiasi discrepanza (sovrascrittura accidentale, manomissione, divergenza) fa fallire la build. Vengono tracciati solo i file immagine (`.png`, `.jpg`, `.jpeg`, `.svg`, `.webp`); i file non immagine in `logos/` vengono ignorati.

Le segnalazioni di vulnerabilità vanno inviate al canale privato di GitHub dedicato: [https://github.com/mcp-tool-shop-org/brand/security/advisories/new]. Per la politica completa, consultare il file [SECURITY.md](SECURITY.md), e per la guida alla migrazione, il file [docs/handbook.md](docs/handbook.md).

## Scheda di valutazione

| Categoria | Punteggio |
|----------|-------|
| A. Sicurezza | 10 |
| B. Gestione degli errori | 10 |
| C. Documentazione per gli operatori | 10 |
| D. Pratiche di rilascio | 10 |
| E. Identità (aspetto secondario) | 10 |
| **Overall** | **50/50** |

Ogni riga contrassegnata con "D" è verde: matrice Node 20/22/24, azioni con SHA fisso, passaggio `npm audit`, Dependabot, contenuto del tarball e piena corrispondenza tra tag/release/npm (risolto il 2026-07-01; v1.0.2/v1.0.3 non sono mai stati pubblicati su npm; contrassegnati retroattivamente per la corrispondenza con git/CHANGELOG).

> Audit completo: [SHIP_GATE.md](SHIP_GATE.md) · [SCORECARD.md](SCORECARD.md)

## Licenza

[MIT](LICENSE)

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
