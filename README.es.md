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

Cuando cada repositorio contiene su propia copia del logotipo, se produce duplicación, divergencia e inconsistencia. Una actualización de la marca implica buscar en más de 100 repositorios. Este repositorio soluciona ese problema: los logotipos están aquí y los archivos README hacen referencia a ellos mediante URL de `raw.githubusercontent.com`.

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

El archivo `readme.<ext>` de cada "slug" siempre es el logotipo canónico. Un "slug" también puede tener una subcarpeta con imágenes adicionales (las diferentes vistas de los personajes de un paquete de sprites o un conjunto de capturas de pantalla de una herramienta). El manifiesto etiqueta explícitamente el "rol" de cada activo, en lugar de tratar todos los archivos de imagen de la misma manera. Consulte [Galerías y archivos README dinámicos](#galleries--dynamic-readmes) a continuación.

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

## Sincronización automática

Una acción de GitHub diaria (`sync.yml`) analiza todos los repositorios de la organización en busca de logotipos, descarga los activos nuevos o modificados, regenera el manifiesto y abre una solicitud de extracción (PR). También puede activarla manualmente mediante `workflow_dispatch`.

El script de sincronización se encuentra en `scripts/sync-org-logos.sh` y se puede ejecutar localmente:

```bash
# Preview what would change
./scripts/sync-org-logos.sh --dry-run

# Sync logos from the org
./scripts/sync-org-logos.sh
```

### Configuración (única, por bifurcación)

El flujo de trabajo de sincronización abre una solicitud de extracción, por lo que necesita permiso para hacerlo. Elija una de estas opciones en la configuración del repositorio:

1. **Habilitar la creación de solicitudes de extracción mediante acciones.** Configuración -> Acciones -> General -> "Permitir que las acciones de GitHub creen y aprueben solicitudes de extracción" -> ACTIVADO. Es la opción más sencilla; no hay secretos adicionales que administrar. ([Documentación de GitHub](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#preventing-github-actions-from-creating-or-approving-pull-requests))
2. **Proporcionar un secreto de repositorio `SYNC_PAT`.** Token de acceso personal con los permisos `contents:write` y `pull-requests:write`. Esta opción también activa la CI posterior en la solicitud de extracción automática (el token `GITHUB_TOKEN` predeterminado no lo hace).

Si no se configura ninguna de estas opciones, el flujo de trabajo diario fallará cada mañana en `gh pr create` debido a un error de permisos.

### Solución de problemas

| Síntoma | Causa | Solución |
| --- | --- | --- |
| `gh pr create` 403 | Ninguna de las opciones de configuración anteriores está configurada. | Elija la opción 1 o 2 anterior. |
| El flujo de trabajo diario no abre ninguna solicitud de extracción, nada cambia. | Todos los repositorios de la organización tienen ya un logotipo o los logotipos coinciden. | Es lo esperado: las ejecuciones sin cambios son saludables. |
| La verificación del manifiesto falló. | Se descargaron los logotipos, pero el hash del manifiesto no coincide. | Se crea automáticamente un problema de `sync-failure`; vuelva a ejecutar `brand manifest` y `brand verify` localmente. |
| Una solicitud de extracción de sincronización introduce un logotipo incorrecto. | El repositorio upstream publicó una imagen corrupta o con contenido incorrecto. | Deshaga la fusión: `git revert <merge-sha> && brand manifest && git commit --amend --no-edit && git push`. Consulte [SECURITY.md](SECURITY.md#incident-response). |

## Galerías y archivos README dinámicos

Algunos productos necesitan más de una imagen para cada "slug": las diferentes vistas de los personajes de un paquete de sprites o un conjunto de capturas de pantalla de una herramienta. `brand` trata estas imágenes como una **galería** independiente del logotipo canónico, en lugar de como una colección anónima de archivos adicionales:

```bash
# Register a directory of images as a gallery (idempotent — re-run any time
# source-dir changes; new files are added, changed files updated, deleted
# files removed. Regenerates manifest.json automatically.)
brand add-gallery pirate-raiders-3d-2 /path/to/turnarounds
```

Para renderizar esa galería en el archivo **README del repositorio receptor** y mantenerla sincronizada a medida que la galería cambia, coloque un par de marcadores en cualquier parte del archivo README:

```html
<!-- brand:gallery:start slug="pirate-raiders-3d-2" -->
<!-- brand:gallery:end -->
```

Luego ejecute:

```bash
brand sync --slug pirate-raiders-3d-2 --repos /path/to/clones
```

`sync` regenera todo lo que hay entre los marcadores a partir del manifiesto: salida determinista e idéntica en cada ejecución con entradas sin cambios, por lo que se integra perfectamente con la CI. `--check` informa sobre las diferencias sin escribir (sale con 1 si el archivo README está desactualizado y con 0 si está actualizado); incorpórelo a la CI del repositorio receptor de la misma manera que `brand manifest --check` controla este proceso. Esta es una sección de **archivo README dinámico**: el contenido escrito manualmente alrededor de los marcadores permanece intacto; todo lo que hay entre ellos pertenece a la máquina y se puede regenerar en cualquier momento. El prefijo `brand:gallery:` tiene un espacio de nombres para que futuros tipos de bloques (insignias, estadísticas) puedan compartir un archivo README sin conflictos.

`brand audit` también entiende la diferencia: un archivo README con varias etiquetas `<img>` de galería para un "slug" ya no se marcará como una posible colisión de insignias; si aún no está conectado a un bloque de marcador, `audit` sugiere usar `brand sync`.

## Agregar un logotipo manualmente

1. Coloque el archivo en `logos/<slug>/readme.png` (o `.jpg`)
2. Ejecute `brand manifest` para actualizar los hashes de integridad.
3. Confirme tanto el logotipo como `manifest.json`.
4. La CI verifica el manifiesto al realizar la confirmación.

## Seguridad

| Aspecto | Detalle |
|--------|--------|
| **Data touched** | Archivos de imagen de logotipo y galería en `logos/` (lectura), `manifest.json` (lectura/escritura), archivos README (lectura/escritura durante la migración y la sincronización: `sync` solo vuelve a escribir el contenido entre los marcadores `brand:gallery:start`/`end`). |
| **Data NOT touched** | No hay telemetría, análisis ni llamadas de red (incluido `sync`: es una función puramente local), no se ejecuta código desde los archivos de logotipo/galería. |
| **Permissions** | Lectura: archivos de logotipo/galería, manifiesto, archivos README. Escritura: `manifest.json`, archivos README (solo migración/sincronización). |
| **Network** | Ninguna: herramienta CLI completamente fuera de línea. |
| **Telemetry** | Ninguna recopilada ni enviada. |

Cada logotipo se rastrea mediante un hash SHA-256 en `manifest.json`. La CI ejecuta `brand manifest --check` en cada confirmación que modifica `logos/` o `manifest.json`. Cualquier discrepancia (reescritura accidental, manipulación, divergencia) hace que la compilación falle. Solo se rastrean los archivos de imagen (`.png`, `.jpg`, `.jpeg`, `.svg`, `.webp`); se ignoran los archivos que no son imágenes en `logos/`.

Los informes de vulnerabilidades se envían al [canal privado de avisos] de GitHub (https://github.com/mcp-tool-shop-org/brand/security/advisories/new). Consulte [SECURITY.md](SECURITY.md) para conocer la política completa y [docs/handbook.md](docs/handbook.md) para obtener el manual de migración.

## Tabla de evaluación

| Categoría | Puntuación |
|----------|-------|
| A. Seguridad | 10 |
| B. Gestión de errores | 10 |
| C. Documentación para operadores | 10 |
| D. Buenas prácticas en el proceso de lanzamiento | 10 |
| E. Identidad (suave) | 10 |
| **Overall** | **50/50** |

Cada línea D es verde: matriz de Node 20/22/24, acciones con SHA fijado, paso `npm audit`, Dependabot, contenido del archivo tar y total paridad entre etiquetas/versiones/npm (resuelto el 01-07-2026; v1.0.2/v1.0.3 nunca llegó a npm; etiquetado retroactivamente para la paridad con git/CHANGELOG).

> Auditoría completa: [SHIP_GATE.md](SHIP_GATE.md) · [SCORECARD.md](SCORECARD.md)

## Licencia

[MIT](LICENSE)

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
