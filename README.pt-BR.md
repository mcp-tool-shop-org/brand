<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
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

## Por que?

Quando cada repositório possui sua própria cópia do logotipo, isso resulta em duplicação, desvio e inconsistência. Uma mudança de marca exige a busca em mais de 100 repositórios. Este repositório resolve esse problema: os logotipos estão armazenados aqui, e os arquivos README fazem referência a eles por meio de URLs do tipo `raw.githubusercontent.com`.

## Estrutura

```
logos/
  <slug>/
    readme.png    # or readme.jpg — format preserved as-is
manifest.json     # SHA-256 integrity hashes for every asset
docs/
  handbook.md     # Lessons learned from migrating 100+ repos
```

Existem 117 logotipos em toda a organização. Os arquivos PNG permanecem como PNGs. Os arquivos JPEG permanecem como JPEGs. O formato é uma decisão de marca, não um alvo de compilação.

## Interface de Linha de Comando (CLI)

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

## Adicionando um Novo Logotipo

1. Arraste o arquivo para `logos/<slug>/readme.png` (ou `.jpg`)
2. Execute `brand manifest` para atualizar os hashes de integridade
3. Faça o commit tanto do logotipo quanto do `manifest.json` juntos
4. O sistema de integração contínua (CI) verifica o manifesto a cada envio.

## Segurança

Cada logotipo é rastreado por um hash SHA-256 no `manifest.json`. O CI executa `brand manifest --check` em cada envio que afeta os arquivos `logos/` ou `manifest.json`. Qualquer incompatibilidade – sobrescrita acidental, adulteração, desvio – causa a falha da compilação.

Consulte [SECURITY.md](SECURITY.md) para a política de segurança completa e [docs/handbook.md](docs/handbook.md) para o guia de migração.

## Privacidade

Esta ferramenta não coleta dados de telemetria. Todas as operações são realizadas apenas no sistema de arquivos local.

## Avaliação

| Categoria | Pontuação | Observações |
|----------|-------|-------|
| A. Segurança | 10/10 | SECURITY.md, integridade SHA-256, sem conexão de rede, sem telemetria. |
| B. Tratamento de Erros | 8/10 | Erros estruturados, saída clara da linha de comando, códigos de saída. |
| C. Documentação para Usuários | 10/10 | README, CHANGELOG, guia, documentação completa da linha de comando. |
| D. Qualidade do Código | 9/10 | Verificação de integridade no CI, 29 testes, versão alinhada. |
| E. Identidade | 10/10 | Logotipo, traduções, página inicial, metadados. |
| **Total** | **47/50** | |

## Licença

[MIT](LICENSE)

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
