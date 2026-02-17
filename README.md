# zentinelproxy.io

Marketing site and agent registry for [Zentinel](https://github.com/zentinelproxy/zentinel).

**Live:** https://zentinelproxy.io

## Quick Start

```bash
# Install tools
mise install

# Start dev server
mise run serve
```

Visit http://127.0.0.1:1111

## Tasks

| Task | Description |
|------|-------------|
| `mise run serve` | Dev server with live reload |
| `mise run build` | Build for production |
| `mise run convert-images` | Convert images to AVIF |

## Structure

```
zentinelproxy.io/
├── config.toml          # Zola configuration
├── content/
│   ├── _index.md        # Homepage
│   └── agents/          # Agent registry pages
├── sass/style.scss      # Styles (Catppuccin palette)
├── static/              # Images, fonts, favicon
└── templates/           # Zola templates
```

## Adding Agents

Create `content/agents/your-agent.md`:

```markdown
+++
title = "Agent Name"
description = "Short description"
template = "agent.html"

[extra]
official = false
author = "Your Name"
status = "Stable"
version = "1.0.0"
repo = "https://github.com/..."
+++

Documentation content...
```

## Tech Stack

- [Zola](https://www.getzola.org/) — Static site generator
- [mise](https://mise.jdx.dev/) — Task runner
- [Catppuccin](https://catppuccin.com/) — Color palette
- [Geist](https://vercel.com/font) — Typeface

## Related

- [zentinel](https://github.com/zentinelproxy/zentinel) — Main repository
- [zentinelproxy.io-docs](https://github.com/zentinelproxy/zentinelproxy.io-docs) — Documentation site
- [Discussions](https://github.com/zentinelproxy/zentinel/discussions) — Questions and ideas

## License

MIT
