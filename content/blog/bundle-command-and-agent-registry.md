+++
title = "How zentinel bundle Works: A Static API, a Lock File, and 26 Agents"
description = "The zentinel bundle command installs agents from a static JSON API served by Zola. No database, no package manager runtime, no registry service to operate. Here's how api.zentinelproxy.io generates the metadata and how the CLI consumes it."
date = 2026-02-23
[taxonomies]
tags = ["architecture", "agents", "bundle", "registry"]
+++

Zentinel ships 26 agents — WAF, bot management, rate limiting, GraphQL security, SPIFFE, and more. Each agent is a separate binary, built from its own repository, released on its own schedule. Getting all 26 installed, version-compatible, and configured is the kind of problem that usually ends with someone building a package manager.

We didn't build a package manager. We built a static JSON API that a Zola site generates at build time, a lock file embedded in the Zentinel binary, and a CLI command that downloads tarballs from GitHub Releases. No registry service to operate, no database to maintain, no daemon to keep running.

## The API: Zola templates that output JSON

[api.zentinelproxy.io](https://api.zentinelproxy.io) is a Zola static site. The content files are agent metadata in TOML frontmatter. The templates output JSON instead of HTML.

A content file looks like this:

```toml
# content/v1/agents/waf.md
+++
title = "waf"
template = "api/agent-detail.html"

[extra]
name = "waf"
version = "0.3.0"
repository = "zentinelproxy/zentinel-agent-waf"
binary_name = "zentinel-waf-agent"
description = "Pure Rust WAF with 285 detection rules, anomaly scoring, and API security."
author = "Zentinel Core Team"
license = "Apache-2.0"
status = "stable"
category = "security"
tags = ["security", "waf", "core", "api-security"]
protocol_version = "v2"
min_zentinel_version = "26.01.0"
bundle_included = true
bundle_group = "Core agents"
+++
```

The template renders it as JSON, computing download URLs for four platforms:

```
GET /v1/agents/waf/

{
  "schema_version": 1,
  "agent": {
    "name": "waf",
    "version": "0.3.0",
    "repository": "zentinelproxy/zentinel-agent-waf",
    "binary_name": "zentinel-waf-agent",
    "description": "Pure Rust WAF with 285 detection rules...",
    "status": "stable",
    "category": "security",
    "tags": ["security", "waf", "core", "api-security"],
    "download_urls": {
      "linux-x86_64": "https://github.com/zentinelproxy/zentinel-agent-waf/releases/download/v0.3.0/zentinel-waf-agent-0.3.0-linux-x86_64.tar.gz",
      "linux-aarch64": "https://github.com/zentinelproxy/zentinel-agent-waf/releases/download/v0.3.0/zentinel-waf-agent-0.3.0-linux-aarch64.tar.gz",
      "darwin-x86_64": "https://github.com/zentinelproxy/zentinel-agent-waf/releases/download/v0.3.0/zentinel-waf-agent-0.3.0-darwin-x86_64.tar.gz",
      "darwin-aarch64": "https://github.com/zentinelproxy/zentinel-agent-waf/releases/download/v0.3.0/zentinel-waf-agent-0.3.0-darwin-aarch64.tar.gz"
    },
    "checksums": {}
  }
}
```

The download URLs follow a deterministic pattern — `https://github.com/{repository}/releases/download/v{version}/{binary_name}-{version}-{os}-{arch}.tar.gz` — so the template can compute them from the frontmatter without querying GitHub.

### Four endpoints

| Endpoint | What it returns |
|----------|----------------|
| `GET /v1/` | API version, endpoint list, agent count |
| `GET /v1/agents/` | All agents with name, version, status, category, description |
| `GET /v1/agents/{name}/` | Full metadata for one agent including download URLs |
| `GET /v1/bundle/` | All bundle-included agents with versions and download URLs |

The bundle endpoint is the one the CLI cares about most. It filters to only agents where `bundle_included = true` and returns a single JSON object with every agent's version and download URLs:

```
GET /v1/bundle/

{
  "schema_version": 1,
  "bundle": {
    "version": "26.02_11",
    "generated_at": "2026-02-23T20:06:00Z"
  },
  "agents": {
    "waf": {
      "version": "0.3.0",
      "binary_name": "zentinel-waf-agent",
      "download_urls": { ... }
    },
    "bot-management": {
      "version": "0.4.0",
      "binary_name": "zentinel-bot-management-agent",
      "download_urls": { ... }
    }
  }
}
```

All of this is static. `zola build` runs, the templates iterate over content files, the JSON files land in `public/`. Cloudflare Pages serves them. No application server, no runtime dependencies.

### Schema versioning

Every response includes `schema_version: 1`. The CLI checks this before parsing:

```rust
const MAX_SCHEMA_VERSION: u32 = 1;

if response.schema_version > MAX_SCHEMA_VERSION {
    return Err(LockError::UnsupportedSchema {
        version: response.schema_version,
        max: MAX_SCHEMA_VERSION,
    });
}
```

If we need to make breaking changes to the API response format, we increment the schema version. Older CLIs refuse to parse responses they don't understand and tell the user to update. This is simpler than API versioning in the URL path because it lets us add non-breaking fields without bumping versions — older clients ignore fields they don't know about, newer clients use them.

## The lock file: compile-time truth

Every Zentinel release embeds a `bundle-versions.lock` file. It's compiled into the binary — you can't lose it, and it doesn't depend on network access.

```toml
[bundle]
version = "26.02_11"

[agents]
waf = "0.3.0"
ratelimit = "0.3.0"
denylist = "0.3.0"
zentinelsec = "0.3.0"
bot-management = "0.4.0"
graphql-security = "0.4.0"
ai-gateway = "0.2.0"
auth = "0.2.0"
# ... 18 more agents

[repositories]
waf = "zentinelproxy/zentinel-agent-waf"
ratelimit = "zentinelproxy/zentinel-agent-ratelimit"
# ... mapping for each agent

[checksums]
# SHA256 checksums, populated by release CI
```

The lock file pins exact versions. When you run `zentinel bundle install`, you get the versions that were tested together for that Zentinel release. No surprises from a rolling latest tag.

### How `bundle update` works

The embedded lock file is immutable — it was compiled in. But `zentinel bundle update` can fetch the latest metadata from the API to check for newer versions:

```rust
pub async fn fetch_latest() -> Result<Self, LockError> {
    let client = reqwest::Client::builder()
        .user_agent("zentinel-bundle")
        .timeout(std::time::Duration::from_secs(15))
        .build()?;

    // 1. Check ZENTINEL_API_URL env var (self-hosted registries)
    // 2. Try api.zentinelproxy.io/v1/bundle/
    // 3. Fall back to raw GitHub lock file
    let api_url = std::env::var("ZENTINEL_API_URL")
        .unwrap_or_else(|_| API_BUNDLE_URL.to_string());

    match Self::fetch_from_api(&client, &api_url).await {
        Ok(lock) => return Ok(lock),
        Err(e) => {
            tracing::debug!(error = %e, "API fetch failed, trying legacy");
        }
    }

    Self::fetch_from_legacy(&client).await
}
```

Three fallback levels: environment variable override (for air-gapped or self-hosted setups), the API endpoint, and a raw GitHub URL pointing at the lock file in the zentinel repo. If all three fail, you still have the embedded lock file.

## The bundle command

```bash
zentinel bundle install          # Install all 26 bundled agents
zentinel bundle install waf      # Install just one
zentinel bundle install --dry-run    # Preview without installing
zentinel bundle status           # Compare installed vs expected versions
zentinel bundle update           # Check API for newer versions
zentinel bundle update --apply   # Apply available updates
```

### What `bundle install` does

```
zentinel bundle install
├── Load embedded lock file
├── Detect platform (linux/darwin × x86_64/aarch64)
├── Determine install paths
│   ├── Root:  /usr/local/bin, /etc/zentinel/agents
│   ├── User:  ~/.local/bin, ~/.config/zentinel/agents
│   └── Custom: {prefix}/bin, {prefix}/etc/zentinel/agents
├── For each agent:
│   ├── Download .tar.gz from GitHub Releases
│   ├── Verify SHA256 checksum (if available)
│   ├── Extract binary
│   ├── Install to bin directory (chmod 755)
│   ├── Generate default config (if not exists)
│   └── Install systemd service (if --systemd)
└── Report: Installed: 26 | Skipped: 0 | Failed: 0
```

Downloads are async (tokio). The download URL is either precomputed from the API response or constructed from the lock file:

```
https://github.com/{repository}/releases/download/v{version}/{binary_name}-{version}-{os}-{arch}.tar.gz
```

Binary extraction searches three locations in the tarball: top level, `bin/` subdirectory, and recursively. This accommodates different release packaging conventions across agent repositories.

### Installation paths

The command auto-detects whether you're running as root:

| Context | Binaries | Configs | Systemd |
|---------|----------|---------|---------|
| Root | `/usr/local/bin` | `/etc/zentinel/agents` | `/etc/systemd/system` |
| User | `~/.local/bin` | `~/.config/zentinel/agents` | `~/.config/systemd/user` |
| `--prefix /opt/zentinel` | `/opt/zentinel/bin` | `/opt/zentinel/etc/zentinel/agents` | `/opt/zentinel/lib/systemd/system` |

The `--prefix` flag exists for containerized deployments where you want everything under one directory tree.

### Systemd integration

Pass `--systemd` and the installer generates a service file for each agent:

```bash
zentinel bundle install --systemd
sudo systemctl daemon-reload
sudo systemctl start zentinel.target
```

Each agent gets its own service unit, managed by a `zentinel.target` that starts them all.

## The data flow

Adding or updating an agent version touches two places:

```
1. Update frontmatter in api.zentinelproxy.io
   content/v1/agents/waf.md → version = "0.4.0"

2. Update lock file in zentinel repo
   bundle-versions.lock → waf = "0.4.0"

3. Zola rebuilds, Cloudflare deploys
   api.zentinelproxy.io/v1/bundle/ now returns 0.4.0

4. Next zentinel release embeds the new lock file
   zentinel bundle install now installs 0.4.0
```

Between Zentinel releases, `zentinel bundle update` can fetch the latest versions from the API. This lets users get agent updates without waiting for a new Zentinel release — the embedded lock file defines the baseline, and the API provides the latest.

## The registry: human-readable companion

[registry.zentinelproxy.io](https://registry.zentinelproxy.io) is the browsable counterpart to the API. Same 26 agents, same metadata, rendered as HTML instead of JSON. Category filtering, search, installation instructions, full documentation for each agent.

The API serves machines. The registry serves humans. Both are static Zola sites. Both are built from agent metadata in TOML frontmatter. The source of truth for agent versions is the API site — the registry mirrors it.

```
api.zentinelproxy.io        → JSON for the CLI
registry.zentinelproxy.io   → HTML for humans
bundle-versions.lock        → Embedded baseline for offline install
```

## Why static

A package registry is usually a service — a database of package metadata, an upload endpoint, an auth layer, a storage backend for artifacts. You operate it, monitor it, scale it, and when it goes down, nobody can install anything.

We don't need any of that. The artifacts live on GitHub Releases, which GitHub operates. The metadata is 26 TOML files. The download URLs are deterministic. A static site generator and a CDN do the rest.

The bundle command works offline with the embedded lock file. It works with network access by fetching from the API. It works in air-gapped environments by pointing `ZENTINEL_API_URL` at an internal mirror. The only hard dependency is GitHub Releases being reachable — and if you need to remove that dependency, you can host the tarballs anywhere and override the URLs.

26 agents, four platforms each, 104 download URLs — all generated at build time from 26 Markdown files.
