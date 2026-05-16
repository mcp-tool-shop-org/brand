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

Cuando cada repositorio tiene su propia copia del logotipo, se produce duplicación, divergencia e inconsistencia. Una actualización de la imagen de marca implica buscar en más de 100 repositorios. Este repositorio soluciona eso: los logotipos se almacenan aquí, y los archivos README los referencian a través de URL de `raw.githubusercontent.com`.

## Estructura

```
logos/
  <slug>/
    readme.png    # or readme.jpg — format preserved as-is
manifest.json     # SHA-256 integrity hashes for every asset
docs/
  handbook.md     # Lessons learned from migrating 100+ repos
```

Cientos de logotipos en toda la organización. Los archivos PNG permanecen como PNG. Los archivos JPEG permanecen como JPEG. El formato es una decisión de la marca, no un objetivo de compilación.

## CLI (Interfaz de línea de comandos)

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

## Sincronización automática

Una acción de GitHub diaria (`sync.yml`) analiza cada repositorio de la organización en busca de logotipos, descarga los activos nuevos o modificados, regenera el manifiesto y abre una solicitud de extracción (PR). También puede activarla manualmente a través de `workflow_dispatch`.

El script de sincronización se encuentra en `scripts/sync-org-logos.sh` y se puede ejecutar localmente:

```bash
# Preview what would change
./scripts/sync-org-logos.sh --dry-run

# Sync logos from the org
./scripts/sync-org-logos.sh
```

### Configuración (única, por bifurcación)

El flujo de trabajo de sincronización abre una solicitud de extracción, por lo que necesita permiso para hacerlo. Elija una de estas opciones en la configuración del repositorio:

1. **Habilitar la creación de PR de Actions.** Configuración -> Actions -> General -> "Permitir que GitHub Actions cree y apruebe solicitudes de extracción" -> ACTIVADO. Es la opción más sencilla; no requiere administrar secretos adicionales. ([Documentación de GitHub](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#preventing-github-actions-from-creating-or-approving-pull-requests))
2. **Proporcione un secreto de repositorio `SYNC_PAT`.** Token de acceso personal con los ámbitos `contents:write` + `pull-requests:write`. Esta opción también activa la integración continua (CI) en la solicitud de extracción automática (el token `GITHUB_TOKEN` predeterminado no lo hace).

Sin una de estas opciones, el flujo de trabajo diario falla cada mañana con un error de permisos en `gh pr create`.

### Solución de problemas

| Síntoma | Causa | Solución |
| --- | --- | --- |
| `gh pr create` 403 | Ninguna de las opciones de configuración anteriores está configurada. | Elija la opción 1 o 2. |
| El flujo de trabajo diario no abre ninguna solicitud de extracción, no se realizan cambios. | Todos los repositorios de la organización no tienen logotipo, o los logotipos ya coinciden. | Es el comportamiento esperado: las ejecuciones sin cambios son saludables. |
| La verificación del manifiesto falló. | Se descargaron los logotipos, pero no coincide el hash del manifiesto. | Se crea automáticamente un problema de `sync-failure`; vuelva a ejecutar `brand manifest && brand verify` localmente. |
| Una solicitud de extracción de sincronización introduce un logotipo incorrecto. | El repositorio de origen publicó una imagen corrupta o con contenido incorrecto. | Revierte la fusión: `git revert <merge-sha> && brand manifest && git commit --amend --no-edit && git push`. Consulte [SECURITY.md](SECURITY.md#incident-response). |

## Agregar un logotipo manualmente

1. Coloque el archivo en `logos/<slug>/readme.png` (o `.jpg`).
2. Ejecute `brand manifest` para actualizar los hashes de integridad.
3. Confirme tanto el logotipo como `manifest.json` juntos.
4. La integración continua (CI) verifica el manifiesto al confirmar los cambios.

## Seguridad

| Aspecto | Detalle |
|--------|--------|
| **Data touched** | Archivos de logotipo en `logos/` (lectura), `manifest.json` (lectura/escritura), archivos README (lectura/escritura durante la migración). |
| **Data NOT touched** | Sin telemetría, sin análisis, sin llamadas de red, sin ejecución de código desde los archivos de logotipo. |
| **Permissions** | Lectura: archivos de logotipo, manifiesto, archivos README. Escritura: `manifest.json`, archivos README (solo durante la migración). |
| **Network** | Ninguna: herramienta de línea de comandos completamente fuera de línea. |
| **Telemetry** | Ninguna recopilada o enviada. |

Cada logotipo se rastrea mediante un hash SHA-256 en `manifest.json`. La integración continua (CI) ejecuta `brand manifest --check` en cada confirmación que modifica `logos/` o `manifest.json`. Cualquier discrepancia (sobreescritura accidental, manipulación, divergencia) hace que la compilación falle. Solo se rastrean los archivos de imagen (`.png`, `.jpg`, `.jpeg`, `.svg`, `.webp`); los archivos no de imagen en `logos/` se ignoran.

Los informes de vulnerabilidades se envían al [canal privado de avisos](https://github.com/mcp-tool-shop-org/brand/security/advisories/new) de GitHub. Consulte [SECURITY.md](SECURITY.md) para obtener la política completa y [docs/handbook.md](docs/handbook.md) para la guía de migración.

## Evaluación

| Categoría | Puntuación |
|----------|-------|
| A. Seguridad | 10 |
| B. Manejo de errores | 10 |
| C. Documentación para operadores | 10 |
| D. Higiene en el proceso de entrega | 9 |
| E. Identidad (suave) | 10 |
| **Overall** | **49/50** |

La puntuación D es de 9/10, pendiente de una revisión adicional: las etiquetas de Git remotas solo alcanzan la versión 1.0.1, pero el archivo CHANGELOG documenta las versiones 1.0.2 y 1.0.3 publicadas. Todas las demás líneas de la categoría D son correctas: matriz de Node 18/20/22, acciones con hash SHA, paso `npm audit`, Dependabot, contenido del archivo tarball.

> Auditoría completa: [SHIP_GATE.md](SHIP_GATE.md) · [SCORECARD.md](SCORECARD.md)

## Licencia

[MIT](LICENSE)

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
