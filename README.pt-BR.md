<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
</p>

<p align="center">
  <img src="assets/logo.jpg" alt="Brand" width="400">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/brand/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/brand/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/brand/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

Registro centralizado de ativos da marca para a organização GitHub [mcp-tool-shop-org](https://github.com/mcp-tool-shop-org). Um repositório contém todos os logotipos. Cada arquivo README aponta para este repositório. Atualize uma vez e atualize em todos os lugares.

## Por que?

Quando cada repositório possui sua própria cópia do logotipo, você obtém duplicação, desvio e inconsistência. Uma mudança de marca significa procurar em mais de 80 repositórios. Este repositório resolve isso: os logotipos ficam aqui, e os arquivos README fazem referência a eles por meio de URLs `raw.githubusercontent.com`.

## Estrutura

```
logos/
  <slug>/
    readme.png    # or readme.jpg — format preserved as-is
manifest.json     # SHA-256 integrity hashes for every asset
docs/
  handbook.md     # Lessons learned from migrating 80+ repos
```

81 logotipos em 81 repositórios. Os arquivos PNG permanecem como PNGs. Os arquivos JPEG permanecem como JPEGs. O formato é uma decisão da marca, não um alvo de compilação.

## Interface de Linha de Comando (CLI)

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

## Adicionando um Novo Logotipo

1. Arraste o arquivo para `logos/<slug>/readme.png` (ou `.jpg`)
2. Execute `brand manifest` para atualizar os hashes de integridade
3. Faça o commit tanto do logotipo quanto do `manifest.json` juntos
4. O sistema de integração contínua (CI) verifica o manifesto a cada envio.

## Segurança

Cada logotipo é rastreado por um hash SHA-256 no `manifest.json`. O CI executa `brand manifest --check` em cada envio que afeta os arquivos `logos/` ou `manifest.json`. Qualquer incompatibilidade – sobrescrita acidental, adulteração, desvio – causa a falha da compilação.

Consulte [docs/handbook.md](docs/handbook.md) para obter mais detalhes: por que os links simbólicos não funcionam, como os selos interferem na detecção de logotipos, as armadilhas de renderização de Markdown que quebram as tags `<img>`, e o protocolo de segurança para migração.

## Licença

[MIT](LICENSE)
