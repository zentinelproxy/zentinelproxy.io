+++
title = "Sentinel Is Now Zentinel"
description = "We've rebranded from Sentinel to Zentinel and moved to a new home at zentinelproxy.io. Here's what changed, what didn't, and what you need to do."
date = 2026-02-18
[taxonomies]
tags = ["announcement", "migration"]
+++

Today we're completing the rebrand from **Sentinel** to **Zentinel** — same proxy, same team, new name and new home at [zentinelproxy.io](https://zentinelproxy.io).

## Why the rename?

"Sentinel" is a common name in the software world. It collides with dozens of other projects, making it harder to find us, harder to claim package names, and harder to build a distinct identity. Zentinel gives us a unique name that's still recognizable — Zen + Sentinel.

## What changed

**New domain:** [zentinelproxy.io](https://zentinelproxy.io) (docs at [docs.zentinelproxy.io](https://docs.zentinelproxy.io))

**New GitHub org:** [github.com/zentinelproxy](https://github.com/zentinelproxy) — all 41 repositories transferred with full history

**New crate names on crates.io:**
- `zentinel-proxy`, `zentinel-common`, `zentinel-config`, `zentinel-agent-protocol`
- `zentinel-agent-sdk`, `zentinel-agent-sdk-macros`, `zentinel-modsec`

**New install command:**
```bash
curl -fsSL https://get.zentinelproxy.io | sh
```

## What didn't change

- The proxy itself — same code, same performance, same features
- The configuration format — your existing configs work as-is
- The binary name — `zentinel` (was `sentinel`, but functionally identical)
- The agent protocol — existing agents are compatible
- Your data — nothing to migrate

## What you need to do

**If you install via the script:** Use the new URL. The old `getsentinel.raskell.io` URL still works and redirects automatically.

**If you use `cargo install`:** Switch to `cargo install zentinel-proxy`. The old `sentinel-proxy` crate is deprecated with a pointer to the new name.

**If you use Docker:** Images will be published under `ghcr.io/zentinelproxy/zentinel` going forward.

**If you link to docs or repos:** All old `sentinel.raskell.io` URLs redirect to `zentinelproxy.io`. All old `github.com/raskell-io/sentinel*` URLs redirect to the new org. These redirects are permanent.

**If you depend on sentinel crates:** Update your `Cargo.toml` to use `zentinel-*` crate names. The old crates have deprecation notices pointing to the replacements.

## Redirects

All old URLs continue to work:

| Old URL | Redirects to |
|---------|-------------|
| `sentinel.raskell.io/*` | `zentinelproxy.io/*` |
| `getsentinel.raskell.io` | `get.zentinelproxy.io` |
| `github.com/raskell-io/sentinel*` | `github.com/zentinelproxy/zentinel*` |
| `crates.io/crates/sentinel-*` | Deprecation notice → `zentinel-*` |

These redirects will remain active indefinitely.

## What's next

We're continuing to ship features and improvements under the Zentinel name. The rename doesn't slow anything down — it just gives us a clearer identity as the project grows.

If you run into any issues with the migration, [open an issue](https://github.com/zentinelproxy/zentinel/issues) or reach out on the [discussions board](https://github.com/zentinelproxy/zentinel/discussions).
