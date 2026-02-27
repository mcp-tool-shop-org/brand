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

Cuando cada repositorio tiene su propia copia del logotipo, se produce duplicación, divergencia e inconsistencia. Una renovación de marca implica buscar en más de 100 repositorios. Este repositorio soluciona ese problema: los logotipos se almacenan aquí, y los archivos README los referencian a través de URLs de `raw.githubusercontent.com`.

## Estructura

```
logos/
  <slug>/
    readme.png    # or readme.jpg — format preserved as-is
manifest.json     # SHA-256 integrity hashes for every asset
docs/
  handbook.md     # Lessons learned from migrating 100+ repos
```

Hay 117 logotipos en toda la organización. Los archivos PNG permanecen como PNG y los archivos JPEG permanecen como JPEG. El formato es una decisión de marca, no un objetivo de compilación.

## Interfaz de línea de comandos (CLI)

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

## Añadir un nuevo logotipo

1. Copia el archivo en `logos/<slug>/readme.png` (o `.jpg`).
2. Ejecuta `brand manifest` para actualizar los hashes de integridad.
3. Realiza un commit tanto del logotipo como de `manifest.json` juntos.
4. El sistema de integración continua (CI) verifica el manifiesto al realizar un push.

## Seguridad

Cada logotipo está rastreado mediante un hash SHA-256 en `manifest.json`. El sistema de integración continua (CI) ejecuta `brand manifest --check` en cada push que afecte a `logos/` o `manifest.json`. Cualquier discrepancia, ya sea una sobrescritura accidental, manipulación o desviación, provoca el fallo de la compilación.

Consulte [SECURITY.md](SECURITY.md) para obtener la política de seguridad completa y [docs/handbook.md](docs/handbook.md) para obtener la guía de migración.

## Privacidad

Esta herramienta no recopila datos de telemetría. Todas las operaciones se realizan únicamente en el sistema de archivos local.

## Evaluación

| Categoría | Puntuación | Notas |
|----------|-------|-------|
| A. Seguridad | 10/10 | SECURITY.md, integridad SHA-256, sin conexión de red, sin telemetría. |
| B. Manejo de errores | 8/10 | Errores estructurados, salida clara de la línea de comandos, códigos de salida. |
| C. Documentación para el usuario | 10/10 | README, CHANGELOG, guía, documentación completa de la línea de comandos. |
| D. Higiene en la entrega | 9/10 | Comprobación de integridad de CI, 29 pruebas, versión alineada. |
| E. Identidad | 10/10 | Logotipo, traducciones, página de inicio, metadatos. |
| **Total** | **47/50** | |

## Licencia

[MIT](LICENSE)

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
