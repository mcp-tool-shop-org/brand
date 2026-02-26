<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="assets/logo.jpg" alt="Brand" width="400">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/brand/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/brand/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/brand/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

Registro centralizado de activos de marca para la organización GitHub [mcp-tool-shop-org](https://github.com/mcp-tool-shop-org). Un repositorio contiene todos los logotipos. Cada archivo README hace referencia a este repositorio. Actualiza una vez, y se actualiza en todas partes.

## ¿Por qué?

Cuando cada repositorio tiene su propia copia del logotipo, se produce duplicación, desviación e inconsistencia. Una actualización de la marca implica buscar en más de 80 repositorios. Este repositorio soluciona ese problema: los logotipos se encuentran aquí, y los archivos README los referencian a través de URLs de `raw.githubusercontent.com`.

## Estructura

```
logos/
  <slug>/
    readme.png    # or readme.jpg — format preserved as-is
manifest.json     # SHA-256 integrity hashes for every asset
docs/
  handbook.md     # Lessons learned from migrating 80+ repos
```

81 logotipos distribuidos en 81 repositorios. Los archivos PNG permanecen como PNG y los archivos JPEG como JPEG. El formato es una decisión de la marca, no un objetivo de compilación.

## Interfaz de línea de comandos (CLI)

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

## Añadir un nuevo logotipo

1. Copia el archivo en `logos/<slug>/readme.png` (o `.jpg`).
2. Ejecuta `brand manifest` para actualizar los hashes de integridad.
3. Realiza un commit tanto del logotipo como de `manifest.json` juntos.
4. El sistema de integración continua (CI) verifica el manifiesto al realizar un push.

## Seguridad

Cada logotipo está rastreado mediante un hash SHA-256 en `manifest.json`. El sistema de integración continua (CI) ejecuta `brand manifest --check` en cada push que afecte a `logos/` o `manifest.json`. Cualquier discrepancia, ya sea una sobrescritura accidental, manipulación o desviación, provoca el fallo de la compilación.

Consulta [docs/handbook.md](docs/handbook.md) para obtener más información: por qué los enlaces simbólicos no funcionan, cómo los distintivos interfieren con la detección de logotipos, las trampas de renderizado de Markdown que rompen las etiquetas `<img>`, y el protocolo de seguridad para la migración.

## Licencia

[MIT](LICENSE)
