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

Quando cada repositório contém sua própria cópia do logotipo, você obtém duplicação, divergência e inconsistência. Uma mudança de marca significa procurar em mais de 100 repositórios. Este repositório resolve isso — os logotipos ficam aqui, os arquivos README fazem referência a eles por meio de URLs `raw.githubusercontent.com`.

## Estrutura

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

Centenas de logotipos em toda a organização. Os arquivos PNG permanecem em formato PNG. Os arquivos JPEG permanecem em formato JPEG. O formato é uma decisão de marca, não um objetivo de construção.

O identificador de um logotipo `readme.<ext>` é sempre o logotipo canônico. Um identificador também pode ter uma subpasta com imagens adicionais (um conjunto de animações de personagens de um pacote de sprites, um conjunto de capturas de tela de uma ferramenta) — o manifesto marca explicitamente cada ativo com seu `role`, em vez de tratar todos os arquivos de imagem da mesma forma. Consulte [Galerias e arquivos README dinâmicos](#galerias-e-arquivos-readme-dinâmicos) abaixo.

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

## Sincronização automática

Uma ação GitHub diária (`sync.yml`) examina todos os repositórios da organização em busca de logotipos, baixa novos ativos ou ativos modificados, regenera o manifesto e abre um PR. Você também pode acioná-lo manualmente por meio de `workflow_dispatch`.

O script de sincronização está localizado em `scripts/sync-org-logos.sh` e pode ser executado localmente:

```bash
# Preview what would change
./scripts/sync-org-logos.sh --dry-run

# Sync logos from the org
./scripts/sync-org-logos.sh
```

### Configuração (única, por fork)

O fluxo de trabalho de sincronização abre um PR, portanto, ele precisa de permissão para fazê-lo. Escolha uma das seguintes opções nas configurações do repositório:

1. **Habilitar a criação de PRs de ações.** Configurações -> Ações -> Geral -> "Permitir que as GitHub Ações criem e aprovem solicitações de pull" -> LIGADO. O caminho mais simples; não há segredos adicionais para gerenciar. ([Documentação GitHub](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#preventing-github-actions-from-creating-or-approving-pull-requests))
2. **Fornecer um segredo de repositório `SYNC_PAT`.** Token de acesso pessoal com os escopos `contents:write` + `pull-requests:write`. Este caminho também aciona o CI downstream no PR automático (o padrão `GITHUB_TOKEN` não o faz).

Sem uma dessas opções, o fluxo de trabalho diário falha todas as manhãs em `gh pr create` com um erro de permissão.

### Solução de problemas

| Sintoma | Causa | Solução |
| --- | --- | --- |
| `gh pr create` 403 | Nenhuma das opções de configuração acima está configurada | Escolha a opção 1 ou 2 acima |
| O fluxo de trabalho diário não abre nenhum PR, nada muda | Todos os repositórios da organização têm ou nenhum logotipo, ou os logotipos já correspondem | Esperado — execuções sem alterações são saudáveis |
| A verificação do manifesto falhou | Logotipos baixados, mas hash do manifesto incompatível | Um problema `sync-failure` é criado automaticamente; execute `brand manifest && brand verify` localmente |
| Um PR de sincronização introduz um logotipo ruim | O repositório upstream publicou uma imagem corrompida ou com conteúdo incorreto | Reverta a mesclagem: `git revert <merge-sha> && brand manifest && git commit --amend --no-edit && git push`. Consulte [SECURITY.md](SECURITY.md#incident-response) |

## Galerias e arquivos README dinâmicos

Alguns produtos precisam de mais de uma imagem de destaque por identificador — um conjunto de animações de personagens de um pacote de sprites, um conjunto de capturas de tela de uma ferramenta. `brand` trata isso como uma **galeria** de primeira classe, distinta do logotipo canônico, em vez de uma pilha anônima de arquivos adicionais:

```bash
# Register a directory of images as a gallery (idempotent — re-run any time
# source-dir changes; new files are added, changed files updated, deleted
# files removed. Regenerates manifest.json automatically.)
brand add-gallery pirate-raiders-3d-2 /path/to/turnarounds
```

Para renderizar essa galeria em um **arquivo README do repositório de consumo** e mantê-la sincronizada à medida que a galeria muda, coloque um par de marcadores em qualquer lugar no arquivo README:

```html
<!-- brand:gallery:start slug="pirate-raiders-3d-2" -->
<!-- brand:gallery:end -->
```

Em seguida, execute:

```bash
brand sync --slug pirate-raiders-3d-2 --repos /path/to/clones
```

`sync` regenera tudo entre os marcadores a partir do manifesto — saída determinística e idêntica em cada execução com entradas inalteradas, para que se combine perfeitamente com o CI. `--check` relata divergências sem gravar (sai com 1 se o arquivo README estiver desatualizado, 0 se estiver atual) — conecte-o ao CI de um repositório de consumo da mesma forma que `brand manifest --check` controla este. Esta é uma seção de **arquivo README dinâmico**: o conteúdo escrito manualmente em torno dos marcadores permanece inalterado; tudo entre eles é de propriedade da máquina e pode ser regenerado a qualquer momento. O prefixo `brand:gallery:` é nomeado para que tipos de bloco futuros (selos, estatísticas) possam compartilhar um arquivo README sem conflito.

`brand audit` também entende a diferença — um arquivo README com várias tags de galeria `<img>` para um único identificador não é mais sinalizado como um possível conflito de selos; se ainda não estiver conectado a um bloco de marcador, `audit` sugere `brand sync`.

## Adicionando um logotipo manualmente

1. Coloque o arquivo em `logos/<slug>/readme.png` (ou `.jpg`)
2. Execute `brand manifest` para atualizar os hashes de integridade
3. Confirme tanto o logotipo quanto `manifest.json` juntos
4. O CI verifica o manifesto no envio

O passo 2 é fácil de esquecer e nada localmente indicava isso — os logotipos são confirmados
sem problemas, o site ainda é construído, os testes ainda são aprovados e a falha só aparece
no CI após o envio. Portanto, um hook `pre-commit` agora faz isso por você: ele cria uma alteração
em `logos/` e regenera e cria `manifest.json` no mesmo commit.

Ele se instala em `npm install` (por meio de `prepare` → [`scripts/install-hooks.mjs`](scripts/install-hooks.mjs),
que aponta `core.hooksPath` para [`.githooks/`](.githooks/)). Para instalá-lo manualmente:

```bash
git config core.hooksPath .githooks
```

O hook precisa que `dist/` seja construído (`npm run build`), pois ele executa a CLI, e ele
não tenta adivinhar quando `logos/` tem alterações não confirmadas — o manifesto é calculado
a partir da árvore de trabalho, portanto, se isso não corresponder ao que você está confirmando, os
hashes que ele grava descreveriam bytes que o commit não contém. `git commit
--no-verify` ignora-o, e o CI ainda impõe a mesma invariante.

## Segurança

| Aspecto | Detalhe |
|--------|--------|
| **Data touched** | Arquivos de imagem de logotipo e galeria em `logos/` (leitura), `manifest.json` (leitura/gravação), arquivos README (leitura/gravação durante a migração e sincronização — `sync` reescreve apenas o conteúdo entre os marcadores `brand:gallery:start`/`end`) |
| **Data NOT touched** | Sem telemetria, sem análise, sem execução de código a partir de arquivos de logotipo/galeria |
| **Permissions** | Leitura: arquivos de logotipo/galeria, manifesto, arquivos README. Gravação: manifest.json, arquivos README (apenas migração/sincronização) e `logos/<slug>/` (`remove` apenas, o que requer `--yes`) |
| **Network** | Nenhum por padrão. `brand audit --remote` é a única exceção e é estritamente opcional — sem essa flag, nenhuma chamada de rede é feita. `sync`, `verify`, `manifest`, `stats`, `migrate`, `add-gallery`, `remove` e `history` são totalmente offline. |
| **Telemetry** | Nenhum coletado ou enviado |

Cada logotipo é rastreado pelo hash SHA-256 em `manifest.json`. O CI executa `brand manifest --check` em cada envio que toca `logos/` ou `manifest.json`. Apenas arquivos de imagem (`.png`, `.jpg`, `.jpeg`, `.svg`, `.webp`) são rastreados; arquivos não-imagem em `logos/` são ignorados.

**O que o hash demonstra e o que não demonstra.** Uma incompatibilidade detecta uma substituição acidental, um ficheiro corrompido ou uma divergência entre o disco e o manifesto — os erros comuns do dia a dia. Não impede uma adulteração deliberada: qualquer pessoa com permissões de escrita pode substituir um logótipo, executar `brand manifest` e confirmar ambos, após o que `verify` é aprovado. O hash demonstra que a árvore é internamente consistente, mas não que o seu conteúdo foi aprovado. O que realmente fecha essa lacuna são os controlos do repositório, juntamente com o mecanismo de deteção de divergências da sincronização diária, que verifica cruzadamente cada logótipo do registo com o seu repositório de origem — consulte [SECURITY.md](SECURITY.md#the-limit-of-the-manifest--read-this-before-trusting-it) e [`.github/SECURITY-CONTROLS.md`](.github/SECURITY-CONTROLS.md).

Os relatórios de vulnerabilidades são enviados para o [canal de comunicação privado](https://github.com/mcp-tool-shop-org/brand/security/advisories/new) de GitHub. Consulte [SECURITY.md](SECURITY.md) para obter a política completa e [docs/handbook.md](docs/handbook.md) para o guia de migração.

## Quadro de avaliação

| Categoria | Pontuação |
|----------|-------|
| A. Segurança | 10 |
| B. Tratamento de erros | 10 |
| C. Documentação para operadores | 10 |
| D. Boas práticas de distribuição | 10 |
| E. Identidade (suave) | 10 |
| **Overall** | **50/50** |

Todas as linhas D estão verdes — matriz Node 20/22/24, ações com SHA fixo, passo `npm audit`, Dependabot, conteúdo do tarball e total paridade de tag/lançamento/npm (resolvido em 2026-07-01 — v1.0.2/v1.0.3 nunca alcançou o npm; etiquetado retroativamente para paridade com git/CHANGELOG).

> Auditoria completa: [SHIP_GATE.md](SHIP_GATE.md) · [SCORECARD.md](SCORECARD.md)

## Licença

[MIT](LICENSE)

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
