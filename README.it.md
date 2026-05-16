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

Quando ogni repository contiene una copia separata del logo, si verificano duplicazioni, discrepanze e incoerenze. Un rebranding richiede la ricerca in oltre 100 repository. Questo repository risolve questo problema: i loghi sono memorizzati qui, e i file README fanno riferimento ad essi tramite URL `raw.githubusercontent.com`.

## Struttura

```
logos/
  <slug>/
    readme.png    # or readme.jpg — format preserved as-is
manifest.json     # SHA-256 integrity hashes for every asset
docs/
  handbook.md     # Lessons learned from migrating 100+ repos
```

Centinaia di loghi all'interno dell'organizzazione. I file PNG rimangono file PNG. I file JPEG rimangono file JPEG. Il formato è una decisione di branding, non un obiettivo di compilazione.

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
```

## Sincronizzazione automatica

Un'azione giornaliera di GitHub (`sync.yml`) esamina ogni repository nell'organizzazione alla ricerca di loghi, scarica risorse nuove o modificate, rigenera il manifest e apre una pull request. È anche possibile avviarla manualmente tramite `workflow_dispatch`.

Lo script di sincronizzazione si trova in `scripts/sync-org-logos.sh` e può essere eseguito localmente:

```bash
# Preview what would change
./scripts/sync-org-logos.sh --dry-run

# Sync logos from the org
./scripts/sync-org-logos.sh
```

### Configurazione (una tantum, per ogni fork)

Il workflow di sincronizzazione apre una pull request, quindi necessita delle autorizzazioni per farlo. Scegliere una delle seguenti opzioni nelle impostazioni del repository:

1. **Abilitare la creazione di pull request da parte delle azioni di GitHub.** Impostazioni -> Azioni -> Generali -> "Consenti alle azioni di GitHub di creare e approvare pull request" -> ATTIVATO. È il metodo più semplice; non richiede la gestione di segreti aggiuntivi. ([Documentazione di GitHub](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#preventing-github-actions-from-creating-or-approving-pull-requests))
2. **Fornire un segreto di repository `SYNC_PAT`.** Token di accesso personale con le autorizzazioni `contents:write` e `pull-requests:write`. Questo metodo attiva anche il CI a valle sulla pull request automatica (il `GITHUB_TOKEN` predefinito non lo fa).

Senza una di queste opzioni, il workflow giornaliero fallisce ogni mattina con un errore di autorizzazione durante l'esecuzione di `gh pr create`.

### Risoluzione dei problemi

| Sintomo | Causa | Soluzione |
| --- | --- | --- |
| `gh pr create` restituisce il codice 403 | Nessuna delle opzioni di configurazione sopra indicate è stata impostata. | Scegli l'opzione 1 o 2 sopra. |
| Il workflow giornaliero non apre una pull request, non vengono apportate modifiche. | Tutti i repository dell'organizzazione non hanno un logo, oppure i loghi sono già corretti. | Comportamento previsto: le esecuzioni senza modifiche sono normali. |
| Verifica del manifest fallita. | I loghi sono stati scaricati, ma l'hash del manifest non corrisponde. | Viene creato automaticamente un problema `sync-failure`; rieseguire `brand manifest && brand verify` localmente. |
| Una pull request di sincronizzazione introduce un logo errato. | Il repository upstream ha pubblicato un'immagine corrotta o con contenuti errati. | Annullare il merge: `git revert <merge-sha> && brand manifest && git commit --amend --no-edit && git push`. Consultare [SECURITY.md](SECURITY.md#incident-response). |

## Aggiunta manuale di un logo

1. Copiare il file in `logos/<slug>/readme.png` (o `.jpg`).
2. Eseguire `brand manifest` per aggiornare gli hash di integrità.
3. Committare sia il logo che il file `manifest.json` insieme.
4. Il CI verifica il manifest durante il push.

## Sicurezza

| Aspetto | Dettagli |
|--------|--------|
| **Data touched** | File dei loghi in `logos/` (lettura), file `manifest.json` (lettura/scrittura), file README (lettura/scrittura durante la migrazione). |
| **Data NOT touched** | Nessuna telemetria, nessuna analisi, nessuna chiamata di rete, nessuna esecuzione di codice dai file dei loghi. |
| **Permissions** | Lettura: file dei loghi, manifest, file README. Scrittura: file `manifest.json`, file README (solo durante la migrazione). |
| **Network** | Nessuno: strumento CLI completamente offline. |
| **Telemetry** | Nessuno raccolto o inviato. |

Ogni logo è tracciato tramite l'hash SHA-256 in `manifest.json`. Il CI esegue `brand manifest --check` su ogni push che modifica `logos/` o `manifest.json`. Qualsiasi discrepanza (sovrascrittura accidentale, manomissione, deriva) causa il fallimento della compilazione. Vengono tracciati solo i file immagine (`.png`, `.jpg`, `.jpeg`, `.svg`, `.webp`); i file non immagine in `logos/` vengono ignorati.

I segnalazioni di vulnerabilità devono essere inviate al [canale privato di segnalazione](https://github.com/mcp-tool-shop-org/brand/security/advisories/new) di GitHub. Consultare il file [SECURITY.md](SECURITY.md) per la policy completa e il file [docs/handbook.md](docs/handbook.md) per la guida alla migrazione.

## Scorecard

| Categoria | Punteggio |
|----------|-------|
| A. Sicurezza | 10 |
| B. Gestione degli errori | 10 |
| C. Documentazione per gli operatori | 10 |
| D. Pratiche di sviluppo | 9 |
| E. Identità (soft) | 10 |
| **Overall** | **49/50** |

Il punteggio D è 9/10, in attesa di un ulteriore controllo: i tag Git remoti raggiungono solo la versione 1.0.1, ma il file CHANGELOG documenta le versioni 1.0.2 e 1.0.3 pubblicate. Tutte le altre voci relative alla categoria D sono positive: supporto per Node 18/20/22, azioni con hash fissi, passaggio `npm audit`, Dependabot, contenuto dei file tarball.

> Audit completo: [SHIP_GATE.md](SHIP_GATE.md) · [SCORECARD.md](SCORECARD.md)

## Licenza

[MIT](LICENSE)

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
