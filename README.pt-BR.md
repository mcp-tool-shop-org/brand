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

## Por que

Quando cada repositório possui sua própria cópia do logotipo, você obtém duplicação, desvio e inconsistência. Uma mudança de marca exige a busca em mais de 100 repositórios. Este repositório resolve isso: os logotipos ficam armazenados aqui, e os arquivos README fazem referência a eles por meio de URLs `raw.githubusercontent.com`.

## Estrutura

```
logos/
  <slug>/
    readme.png    # or readme.jpg — format preserved as-is
manifest.json     # SHA-256 integrity hashes for every asset
docs/
  handbook.md     # Lessons learned from migrating 100+ repos
```

Centenas de logotipos em toda a organização. Arquivos PNG permanecem como PNGs. Arquivos JPEG permanecem como JPEGs. O formato é uma decisão de marca, não um alvo de compilação.

## Interface de Linha de Comando (CLI)

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

## Sincronização Automática

Uma ação do GitHub diária (`sync.yml`) verifica todos os repositórios da organização em busca de logotipos, baixa ativos novos ou modificados, regenera o manifesto e abre um pull request. Você também pode acioná-la manualmente por meio de `workflow_dispatch`.

O script de sincronização está localizado em `scripts/sync-org-logos.sh` e pode ser executado localmente:

```bash
# Preview what would change
./scripts/sync-org-logos.sh --dry-run

# Sync logos from the org
./scripts/sync-org-logos.sh
```

### Configuração (única, por fork)

O fluxo de trabalho de sincronização abre um pull request, portanto, precisa de permissão para fazer isso. Escolha uma das seguintes opções nas configurações do repositório:

1. **Habilitar a criação de pull requests pelas ações do GitHub.** Configurações -> Ações -> Geral -> "Permitir que as ações do GitHub criem e aprovem pull requests" -> ATIVADO. É a opção mais simples; não requer gerenciamento de segredos adicionais. ([Documentação do GitHub](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#preventing-github-actions-from-creating-or-approving-pull-requests))
2. **Fornecer um segredo de repositório `SYNC_PAT`.** Token de acesso pessoal com escopos `contents:write` + `pull-requests:write`. Esta opção também aciona o CI subsequente no pull request automático (o `GITHUB_TOKEN` padrão não faz isso).

Sem uma dessas opções, o fluxo de trabalho diário falha todas as manhãs com um erro de permissão ao executar `gh pr create`.

### Solução de problemas

| Sintoma | Causa | Solução |
| --- | --- | --- |
| `gh pr create` retorna 403 | Nenhuma das opções de configuração acima está configurada. | Escolha a opção 1 ou 2 acima. |
| O fluxo de trabalho diário não abre nenhum pull request, nada muda. | Todos os repositórios da organização não possuem logotipo, ou os logotipos já correspondem. | Comportamento esperado — execuções sem alterações são saudáveis. |
| A verificação do manifesto falhou. | Os logotipos foram baixados, mas o hash do manifesto não corresponde. | Um problema `sync-failure` é criado automaticamente; execute novamente `brand manifest && brand verify` localmente. |
| Um pull request de sincronização introduz um logotipo incorreto. | O repositório de origem publicou uma imagem corrompida ou com conteúdo incorreto. | Reverta a mesclagem: `git revert <merge-sha> && brand manifest && git commit --amend --no-edit && git push`. Consulte [SECURITY.md](SECURITY.md#incident-response). |

## Adicionando um Logotipo Manualmente

1. Arraste o arquivo para `logos/<slug>/readme.png` (ou `.jpg`).
2. Execute `brand manifest` para atualizar os hashes de integridade.
3. Faça o commit tanto do logotipo quanto do `manifest.json` juntos.
4. O CI verifica o manifesto a cada push.

## Segurança

| Aspecto | Detalhe |
|--------|--------|
| **Data touched** | Arquivos de logotipo em `logos/` (leitura), `manifest.json` (leitura/escrita), arquivos README (leitura/escrita durante a migração). |
| **Data NOT touched** | Nenhuma telemetria, nenhuma análise, nenhuma chamada de rede, nenhuma execução de código a partir dos arquivos de logotipo. |
| **Permissions** | Leitura: arquivos de logotipo, manifesto, arquivos README. Escrita: `manifest.json`, arquivos README (apenas durante a migração). |
| **Network** | Nenhuma — ferramenta CLI totalmente offline. |
| **Telemetry** | Nenhuma coletada ou enviada. |

Cada logotipo é rastreado por um hash SHA-256 em `manifest.json`. O CI executa `brand manifest --check` em cada push que modifica `logos/` ou `manifest.json`. Qualquer incompatibilidade — sobrescrita acidental, adulteração, desvio — faz com que a compilação falhe. Apenas arquivos de imagem (`.png`, `.jpg`, `.jpeg`, `.svg`, `.webp`) são rastreados; arquivos não-imagem em `logos/` são ignorados.

Os relatórios de vulnerabilidades devem ser enviados para o [canal privado de notificações](https://github.com/mcp-tool-shop-org/brand/security/advisories/new) do GitHub. Consulte o arquivo [SECURITY.md](SECURITY.md) para a política completa e o arquivo [docs/handbook.md](docs/handbook.md) para o guia de migração.

## Avaliação

| Categoria | Pontuação |
|----------|-------|
| A. Segurança | 10 |
| B. Tratamento de Erros | 10 |
| C. Documentação para Operadores | 10 |
| D. Boas Práticas de Distribuição | 9 |
| E. Identidade (suave) | 10 |
| **Overall** | **49/50** |

A pontuação "D" é de 9/10, pendente de uma verificação: as tags Git remotas alcançam apenas a versão 1.0.1, mas o arquivo CHANGELOG documenta as versões 1.0.2 e 1.0.3 publicadas. Todas as outras linhas da categoria "D" estão com status positivo: matriz Node 18/20/22, ações com hash fixo, etapa `npm audit`, Dependabot, conteúdo do arquivo tarball.

> Auditoria completa: [SHIP_GATE.md](SHIP_GATE.md) · [SCORECARD.md](SCORECARD.md)

## Licença

[MIT](LICENSE)

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
