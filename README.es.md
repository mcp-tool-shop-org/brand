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

## Por qué

Cuando cada repositorio contiene su propia copia del logotipo, se produce duplicación, divergencia e inconsistencia. Una renovación de la marca implica buscar en más de 100 repositorios. Este repositorio soluciona ese problema: los logotipos se almacenan aquí y los archivos README hacen referencia a ellos mediante URL de `raw.githubusercontent.com`.

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

El identificador de un logotipo `readme.<ext>` siempre es el logotipo canónico. Un identificador también puede tener una subcarpeta con imágenes adicionales (una colección de imágenes de diferentes ángulos de un personaje de un paquete de sprites, un conjunto de capturas de pantalla de una herramienta). El manifiesto etiqueta explícitamente el `role` de cada activo en lugar de tratar todos los archivos de imagen de la misma manera. Consulte [Galerías y archivos README dinámicos](#galerías-y-archivos-readme-dinámicos) a continuación.

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

Una acción GitHub diaria (`sync.yml`) analiza todos los repositorios de la organización en busca de logotipos, descarga los activos nuevos o modificados, regenera el manifiesto y abre una solicitud de incorporación de cambios (PR). También puede activarlo manualmente mediante `workflow_dispatch`.

El script de sincronización se encuentra en `scripts/sync-org-logos.sh` y se puede ejecutar localmente:

```bash
# Preview what would change
./scripts/sync-org-logos.sh --dry-run

# Sync logos from the org
./scripts/sync-org-logos.sh
```

### Configuración (única, por bifurcación)

El flujo de trabajo de sincronización abre una solicitud de incorporación de cambios, por lo que necesita permiso para hacerlo. Elija una de estas opciones en la configuración del repositorio:

1. **Habilitar la creación de solicitudes de incorporación de cambios de Actions.** Configuración -> Actions -> General -> "Permitir que GitHub Actions cree y apruebe solicitudes de incorporación de cambios" -> ACTIVADO. La opción más sencilla; no hay secretos adicionales que administrar. ([Documentación de GitHub](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#preventing-github-actions-from-creating-or-approving-pull-requests))
2. **Proporcionar un secreto de repositorio `SYNC_PAT`.** Token de acceso personal con los ámbitos `contents:write` + `pull-requests:write`. Esta opción también activa la CI descendente en la solicitud de incorporación de cambios automática (la opción `GITHUB_TOKEN` predeterminada no lo hace).

Si no se configura una de estas opciones, el flujo de trabajo diario fallará cada mañana a las `gh pr create` con un error de permisos.

### Solución de problemas

| Síntoma | Causa | Solución |
| --- | --- | --- |
| `gh pr create` 403 | Ninguna de las opciones de configuración anteriores está configurada | Elija la opción 1 o 2 anterior |
| El flujo de trabajo diario no abre ninguna solicitud de incorporación de cambios, no cambia nada | Todos los repositorios de la organización no tienen logotipo o los logotipos ya coinciden | Es lo esperado: las ejecuciones sin cambios son saludables |
| La verificación del manifiesto falló | Se descargaron los logotipos, pero hay una discrepancia en el hash del manifiesto | Se crea automáticamente un problema `sync-failure`; vuelva a ejecutar `brand manifest && brand verify` localmente |
| Una solicitud de incorporación de cambios de sincronización introduce un logotipo incorrecto | El repositorio upstream publicó una imagen dañada o con contenido incorrecto | Revierta la fusión: `git revert <merge-sha> && brand manifest && git commit --amend --no-edit && git push`. Consulte [SECURITY.md](SECURITY.md#incident-response) |

## Galerías y archivos README dinámicos

Algunos productos necesitan más de una imagen de presentación por identificador: una colección de imágenes de diferentes ángulos de un personaje de un paquete de sprites, un conjunto de capturas de pantalla de una herramienta. `brand` trata estas imágenes como una **galería** de primera clase, distinta del logotipo canónico, en lugar de una colección anónima de archivos adicionales:

```bash
# Register a directory of images as a gallery (idempotent — re-run any time
# source-dir changes; new files are added, changed files updated, deleted
# files removed. Regenerates manifest.json automatically.)
brand add-gallery pirate-raiders-3d-2 /path/to/turnarounds
```

Para renderizar esa galería en el **archivo README de un repositorio de destino** y mantenerla sincronizada a medida que la galería cambia, coloque un par de marcadores en cualquier lugar del archivo README:

```html
<!-- brand:gallery:start slug="pirate-raiders-3d-2" -->
<!-- brand:gallery:end -->
```

Luego, ejecute:

```bash
brand sync --slug pirate-raiders-3d-2 --repos /path/to/clones
```

`sync` regenera todo lo que hay entre los marcadores a partir del manifiesto: salida determinista e idéntica en cada ejecución con entradas sin cambios, por lo que se integra limpiamente con la CI. `--check` informa sobre las discrepancias sin escribir (sale con 1 si el archivo README está desactualizado, 0 si está actualizado); incorpórelo en la CI de un repositorio de destino de la misma manera que `brand manifest --check` controla este. Esta es una sección de **archivo README dinámico**: el contenido escrito a mano alrededor de los marcadores no se modifica; todo lo que hay entre ellos es propiedad de la máquina y se puede regenerar de forma segura en cualquier momento. El prefijo `brand:gallery:` tiene un espacio de nombres para que los futuros tipos de bloques (insignias, estadísticas) puedan compartir un archivo README sin conflictos.

`brand audit` también entiende la diferencia: un archivo README con varias etiquetas de galería `<img>` para un solo identificador ya no se marca como una posible colisión de insignias; si aún no está conectado a un bloque de marcador, `audit` sugiere `brand sync` en su lugar.

## Agregar un logotipo manualmente

1. Coloque el archivo en `logos/<slug>/readme.png` (o `.jpg`)
2. Ejecute `brand manifest` para actualizar los hashes de integridad
3. Confirme tanto el logotipo como `manifest.json`
4. La CI verifica el manifiesto al realizar la confirmación

El paso 2 es fácil de olvidar y nada local se queja: las confirmaciones del logotipo
se realizan correctamente, el sitio sigue compilándose, las pruebas siguen pasando y el error solo aparece
en la CI después de la confirmación. Por lo tanto, un gancho `pre-commit` ahora lo hace por usted: crea un cambio
en `logos/` y regenera y crea `manifest.json` en la misma confirmación.

Se instala en `npm install` (a través de `prepare` → [`scripts/install-hooks.mjs`](scripts/install-hooks.mjs),
que apunta `core.hooksPath` a [`.githooks/`](.githooks/)). Para instalarlo manualmente:

```bash
git config core.hooksPath .githooks
```

El gancho necesita que `dist/` esté compilado (`npm run build`) ya que ejecuta la CLI, y no
intenta adivinar cuándo `logos/` tiene cambios sin confirmar: el manifiesto se calcula a partir del árbol de trabajo, por lo que si esto no coincide con lo que está confirmando, los hashes que escribe describirían bytes que la confirmación no contiene. `git commit --no-verify` lo omite y la CI sigue aplicando la misma invariante.

## Seguridad

| Aspecto | Detalle |
|--------|--------|
| **Data touched** | Archivos de imagen de logotipo y galería en `logos/` (lectura), `manifest.json` (lectura/escritura), archivos README (lectura/escritura durante la migración y la sincronización: `sync` solo vuelve a escribir el contenido entre los marcadores `brand:gallery:start`/`end`) |
| **Data NOT touched** | No hay telemetría, análisis ni ejecución de código a partir de los archivos de logotipo/galería |
| **Permissions** | Lectura: archivos de logotipo/galería, manifiesto, archivos README. Escritura: manifiesto.json, archivos README (solo migración/sincronización) y `logos/<slug>/` (solo `remove`, lo que requiere `--yes`) |
| **Network** | Ninguno de forma predeterminada. `brand audit --remote` es la única excepción y es estrictamente opcional: sin esa marca, no se realiza ninguna llamada de red. `sync`, `verify`, `manifest`, `stats`, `migrate`, `add-gallery`, `remove` y `history` son completamente independientes. |
| **Telemetry** | Ninguno recopilado ni enviado |

Cada logotipo se realiza un seguimiento mediante el hash SHA-256 en `manifest.json`. La CI ejecuta `brand manifest --check` en cada confirmación que modifica `logos/` o `manifest.json`. Solo se realizan un seguimiento de los archivos de imagen (`.png`, `.jpg`, `.jpeg`, `.svg`, `.webp`); se ignoran los archivos que no son de imagen en `logos/`.

**Qué demuestra y qué no demuestra el hash.** Una discrepancia detecta una sobrescritura accidental, un archivo dañado o una desviación entre el disco y el manifiesto, es decir, los fallos cotidianos. No impide una manipulación deliberada: cualquier persona con permisos de escritura puede cambiar un logotipo, ejecutar `brand manifest` y confirmar ambos cambios, tras lo cual `verify` pasa la verificación. El hash demuestra que el árbol es internamente consistente, pero no que su contenido haya sido aprobado. Lo que realmente cierra esa brecha son los controles del repositorio, junto con el mecanismo de detección de divergencias de la sincronización diaria, que cruza los datos de cada logotipo del registro con su repositorio de origen; consulte [SECURITY.md](SECURITY.md#the-limit-of-the-manifest--read-this-before-trusting-it) y [`.github/SECURITY-CONTROLS.md`](.github/SECURITY-CONTROLS.md).

Los informes de vulnerabilidades se envían al [canal de asesoramiento privado](https://github.com/mcp-tool-shop-org/brand/security/advisories/new) de GitHub. Consulte [SECURITY.md](SECURITY.md) para conocer la política completa y [docs/handbook.md](docs/handbook.md) para obtener el manual de migración.

## Tabla de evaluación

| Categoría | Puntuación |
|----------|-------|
| A. Seguridad | 10 |
| B. Gestión de errores | 10 |
| C. Documentación para operadores | 10 |
| D. Buenas prácticas de distribución | 10 |
| E. Identidad (suave) | 10 |
| **Overall** | **50/50** |

Cada línea D es verde: matriz de Node 20/22/24, acciones con SHA fijado, paso `npm audit`, Dependabot, contenido del archivo tar y paridad total de etiquetas/versiones/npm (resuelto el 01-07-2026; v1.0.2/v1.0.3 nunca llegó a npm; etiquetado retroactivamente para la paridad con git/CHANGELOG).

> Auditoría completa: [SHIP_GATE.md](SHIP_GATE.md) · [SCORECARD.md](SCORECARD.md)

## Licencia

[MIT](LICENSE)

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
