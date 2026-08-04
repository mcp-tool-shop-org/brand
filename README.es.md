<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

## ¿Por qué?

Cuando cada repositorio contiene su propia copia del logotipo, se produce duplicación, divergencia e inconsistencia. Una actualización de la marca implica buscar en más de 100 repositorios. Este repositorio soluciona ese problema: los logotipos están aquí y los archivos README hacen referencia a ellos mediante URL `raw.githubusercontent.com`.

## Estructura

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

Cientos de logotipos en toda la organización. Los archivos PNG siguen siendo PNG. Los archivos JPEG siguen siendo JPEG. El formato es una decisión de marca, no un objetivo de compilación.

A slug's `readme.<ext>` is always the one canonical logo. A slug MAY also have one subfolder of additional showcase images (a sprite pack's character turnarounds, a tool's screenshot set) — the manifest tags each asset's `role` explicitly rather than treating every image file the same way. See [Galleries & Dynamic READMEs](#galleries--dynamic-readmes) below.

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

## Sincronización automática

Una acción de GitHub diaria (`sync.yml`) analiza todos los repositorios de la organización en busca de logotipos, descarga los archivos nuevos o modificados, regenera el manifiesto y abre una solicitud de extracción. También puede activarlo manualmente mediante `workflow_dispatch`.

El script de sincronización se encuentra en `scripts/sync-org-logos.sh` y se puede ejecutar localmente:

```bash
# Preview what would change
./scripts/sync-org-logos.sh --dry-run

# Sync logos from the org
./scripts/sync-org-logos.sh
```

### Configuración (única, por bifurcación)

El flujo de trabajo de sincronización abre una solicitud de extracción, por lo que necesita permiso para hacerlo. Elija una de estas opciones en la configuración del repositorio:

1. **Habilitar la creación de solicitudes de extracción de acciones.** Configuración -> Acciones -> General -> "Permitir que las acciones de GitHub creen y aprueben solicitudes de extracción" -> ACTIVADO. Es la opción más sencilla; no hay secretos adicionales que administrar. ([Documentación de GitHub](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#preventing-github-actions-from-creating-or-approving-pull-requests))
2. **Proporcionar un secreto de repositorio `SYNC_PAT`.** Token de acceso personal con los ámbitos `contents:write` + `pull-requests:write`. Esta opción también activa la CI descendente en la solicitud de extracción automática (la configuración predeterminada `GITHUB_TOKEN` no lo hace).

Si no se configura ninguna de estas opciones, el flujo de trabajo diario fallará cada mañana a las `gh pr create` con un error de permisos.

### Solución de problemas

| Síntoma | Causa | Solución |
| --- | --- | --- |
| `gh pr create` 403 | Ninguna de las opciones de configuración anteriores está configurada. | Elija la opción 1 o 2 anterior. |
| El flujo de trabajo diario no abre ninguna solicitud de extracción, nada cambia. | Todos los repositorios de la organización tienen ya un logotipo o los logotipos coinciden. | Es lo esperado: las ejecuciones sin cambios son saludables. |
| La verificación del manifiesto falló. | Se descargaron los logotipos, pero el hash del manifiesto no coincide. | Se crea automáticamente un problema `sync-failure`; vuelva a ejecutar `brand manifest && brand verify` localmente. |
| Una solicitud de extracción de sincronización introduce un logotipo incorrecto. | El repositorio ascendente publicó una imagen corrupta o con contenido incorrecto. | Deshaga la fusión: `git revert <merge-sha> && brand manifest && git commit --amend --no-edit && git push`. Consulte [SECURITY.md](SECURITY.md#incident-response). |

## Galerías y archivos README dinámicos

Algunos productos necesitan más de una imagen para cada identificador único, como las diferentes vistas de los personajes de un paquete de sprites o un conjunto de capturas de pantalla de una herramienta. `brand` trata estos elementos como una **galería** de primera clase, distinta del logotipo canónico, en lugar de como una colección anónima de archivos adicionales:

```bash
# Register a directory of images as a gallery (idempotent — re-run any time
# source-dir changes; new files are added, changed files updated, deleted
# files removed. Regenerates manifest.json automatically.)
brand add-gallery pirate-raiders-3d-2 /path/to/turnarounds
```

Para renderizar esa galería en el **archivo README de un repositorio receptor** y mantenerla sincronizada a medida que la galería cambia, coloque un par de marcadores en cualquier parte del archivo README:

```html
<!-- brand:gallery:start slug="pirate-raiders-3d-2" -->
<!-- brand:gallery:end -->
```

Luego ejecute:

```bash
brand sync --slug pirate-raiders-3d-2 --repos /path/to/clones
```

`sync` regenera todo lo que hay entre los marcadores a partir del manifiesto: salida determinista e idéntica en cada ejecución con entradas sin cambios, por lo que se integra perfectamente con la CI. `--check` informa sobre las divergencias sin escribir (sale con el código de error 1 si el archivo README está desactualizado y 0 si está actualizado), así puede integrarse en la CI del repositorio receptor de la misma manera que `brand manifest --check` controla este flujo de trabajo. Esta es una sección de **archivo README dinámico**: el contenido escrito a mano alrededor de los marcadores no se modifica; todo lo que hay entre ellos pertenece a la máquina y se puede regenerar en cualquier momento. El prefijo `brand:gallery:` está asignado a un espacio de nombres para que futuros tipos de bloques (insignias, estadísticas) puedan compartir un archivo README sin conflictos.

`brand audit` también entiende la diferencia: un archivo README con varias etiquetas de galería `<img>` para un mismo identificador único ya no se marca como una posible colisión de insignias; si aún no está conectado a un bloque de marcador, `audit` sugiere `brand sync`.

## Agregar un logotipo manualmente

1. Coloque el archivo en `logos/<slug>/readme.png` (o `.jpg`).
2. Ejecute `brand manifest` para actualizar los hashes de integridad.
3. Confirme tanto el logotipo como `manifest.json` juntos.
4. La CI verifica el manifiesto al realizar la confirmación.

## Seguridad

| Aspecto | Detalle |
|--------|--------|
| **Data touched** | Archivos de imagen de logotipo y galería en `logos/` (lectura), `manifest.json` (lectura/escritura), archivos README (lectura/escritura durante la migración y la sincronización; `sync` solo vuelve a escribir el contenido entre los marcadores `brand:gallery:start`/`end`). |
| **Data NOT touched** | No hay telemetría, análisis ni ejecución de código desde los archivos de logotipo/galería. |
| **Permissions** | Lectura: archivos de logotipo/galería, manifiesto, archivos README. Escritura: manifest.json, archivos README (solo migración/sincronización) y `logos/<slug>/` (solo `remove`, lo que requiere `--yes`). |
| **Network** | Ninguna por defecto. `brand audit --remote` es la única excepción y solo se activa explícitamente; sin esa marca, no se realiza ninguna llamada de red. `sync`, `verify`, `manifest`, `stats`, `migrate`, `add-gallery`, `remove` y `history` son completamente independientes. |
| **Telemetry** | Ninguna recopilada ni enviada. |

Cada logotipo se realiza un seguimiento mediante un hash SHA-256 en `manifest.json`. La CI ejecuta `brand manifest --check` en cada confirmación que modifica `logos/` o `manifest.json`. Solo se realizan un seguimiento de los archivos de imagen (`.png`, `.jpg`, `.jpeg`, `.svg`, `.webp`); los archivos que no son imágenes que están debajo de `logos/` se ignoran.

**Qué demuestra y qué no demuestra el hash.** Una discrepancia detecta una sobrescritura accidental, un archivo dañado o una desviación entre el disco y el manifiesto; estos son los fallos cotidianos. No impide una manipulación deliberada: cualquier persona con permisos de escritura puede cambiar un logotipo, ejecutar `brand manifest` y confirmar ambos cambios, tras lo cual `verify` se aprobará. El hash demuestra que el árbol es internamente consistente, pero no que su contenido haya sido aprobado. Lo que realmente cierra esa brecha son los controles del repositorio más la función de detección de divergencias de la sincronización diaria, que verifica cada logotipo del registro con su repositorio original; consulte [SECURITY.md](SECURITY.md#the-limit-of-the-manifest--read-this-before-trusting-it) y [`.github/SECURITY-CONTROLS.md`](.github/SECURITY-CONTROLS.md).

Los informes de vulnerabilidades se envían al [canal privado de avisos de GitHub](https://github.com/mcp-tool-shop-org/brand/security/advisories/new). Consulte [SECURITY.md](SECURITY.md) para conocer la política completa y [docs/handbook.md](docs/handbook.md) para obtener el manual de migración.

## Puntuación general

| Categoría | Puntuación |
|----------|-------|
| A. Seguridad | 10 |
| B. Manejo de errores | 10 |
| C. Documentación para operadores | 10 |
| D. Buenas prácticas de publicación | 10 |
| E. Identidad (suave) | 10 |
| **Overall** | **50/50** |

Cada línea D es verde: matriz Node 20/22/24, acciones con SHA fijado, paso `npm audit`, Dependabot, contenido del archivo tar y paridad completa de etiquetas/versiones/npm (resuelto el 2026-07-01; v1.0.2/v1.0.3 nunca llegó a npm; etiquetado retroactivamente para la paridad con git/CHANGELOG).

> Auditoría completa: [SHIP_GATE.md](SHIP_GATE.md) · [SCORECARD.md](SCORECARD.md)

## Licencia

[MIT](LICENSE)

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
