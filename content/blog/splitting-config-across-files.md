+++
title = "One Config, Many Files: Merging Included KDL in Zentinel"
description = "Zentinel has always let you split configuration across files with `include`. But until recently, each top-level block could only live in one file — a second `routes {}` silently won. As of 26.06_3, blocks merge across includes, with duplicate IDs caught at parse time. Here's how it works and the per-vhost pattern it unlocks."
date = 2026-06-23
[taxonomies]
tags = ["configuration", "operations", "kdl"]
+++

A single `zentinel.kdl` is fine until it isn't. Add a few dozen routes, a handful of upstreams, an agent or two per service, and one file becomes a place where merge conflicts happen and nobody can find anything. The usual answer is to split configuration into smaller files — one per virtual host, one per team, one per environment overlay — and stitch them together.

Zentinel has supported that split for a long time through the `include` directive. What it *didn't* do until release `26.06_3` was let the same top-level block appear in more than one file. If `api.kdl` defined a `routes {}` block and `web.kdl` defined another, only one of them survived — silently. This post covers how includes actually work, the sharp edge that bit people, and what changed.

## How `include` works

The directive takes a glob pattern:

```kdl
# zentinel.kdl
schema-version "1.0"

system {
    worker-threads 4
}

listeners {
    listener "http" {
        address "0.0.0.0:8080"
        protocol "http"
    }
}

include "vhosts/*.kdl"
```

A few properties worth knowing, because they're easy to get wrong with file-stitching schemes:

- **Patterns resolve relative to the including file's directory**, not the process working directory. `include "vhosts/*.kdl"` from `/etc/zentinel/zentinel.kdl` matches `/etc/zentinel/vhosts/*.kdl` regardless of where you launched the proxy.
- **Matches are sorted before inlining**, so include order is deterministic — `vhosts/01-api.kdl` always loads before `vhosts/02-web.kdl`. No dependence on filesystem readdir order.
- **Includes are recursive.** An included file can include further files; Zentinel tracks canonical paths and **rejects circular includes** with a clear error rather than looping forever.
- **An empty match is a warning, not an error.** `include "vhosts/*.kdl"` against an empty directory logs a warning and moves on, so a fresh deployment doesn't fail to boot just because no vhosts exist yet.
- `include` is a file-loading feature: it works through `Config::from_file()`. Parsing a raw KDL string has no filesystem to resolve against, so includes aren't expanded there.

Mechanically, expansion is textual: each matched file's contents are inlined in place of the `include` node, recursively, producing one combined KDL document that then gets parsed. That detail is exactly where the old sharp edge came from.

## The sharp edge: last block wins

Because includes were inlined and *then* parsed, two files that each declared a `routes {}` block produced a document with two `routes {}` blocks. The parser walked top-level blocks and, for `routes`, did the equivalent of `routes = parse(node)` — an assignment. The second `routes {}` overwrote the first.

So this looked completely reasonable:

```kdl
# vhosts/api.kdl
upstreams {
    upstream "api-backend" { target "127.0.0.1:3000" }
}
routes {
    route "api" {
        matches { path-prefix "/api" }
        upstream "api-backend"
    }
}
```

```kdl
# vhosts/web.kdl
upstreams {
    upstream "web-backend" { target "127.0.0.1:3001" }
}
routes {
    route "web" {
        matches { path-prefix "/" }
        upstream "web-backend"
    }
}
```

…and quietly did the wrong thing. After `web.kdl` loaded, the `api` route was gone — overwritten by the `web` block — and so was the `api-backend` upstream. No error, no warning. Your `/api` traffic just started falling through to the catch-all, and you found out from a dashboard, not from the config loader.

The only workaround was to keep every block type confined to a single file: all routes in one file, all upstreams in another. That defeats the point of per-vhost splitting, where the natural unit is "this service's routes *and* its upstreams *and* its agents, together."

## What changed in 26.06_3

Top-level **collection blocks now merge across files** instead of overwriting, and **duplicate IDs are rejected at parse time** instead of silently clobbering. The two files above now do exactly what they look like they do: both routes (`api`, `web`) and both upstreams (`api-backend`, `web-backend`) end up in the running configuration, regardless of which file loaded last.

If two files accidentally define the same ID, you get a hard error that names the collision and points you at the cause, instead of a silent overwrite:

```
Error: Duplicate route ID 'api' found. Each route ID must be unique
across all config files.
```

That check spans the entire include tree — two separate include directories, nested includes, doesn't matter. The first definition wins the name; the second is an error, not an override.

### Which blocks merge, and which don't

Not everything is a collection. A proxy has exactly one `system` block and one `waf` configuration; merging those makes no sense. The rule follows the data:

| Block | Behavior across files | On conflict |
|-------|----------------------|-------------|
| `listeners` | **Merge** by `id` | Duplicate `id` → error |
| `routes` | **Merge** by `id` | Duplicate `id` → error |
| `upstreams` | **Merge** by `id` | Duplicate `id` → error |
| `filters` | **Merge** by `id` | Duplicate `id` → error |
| `agents` | **Merge** by `id` | Duplicate `id` → error |
| `system` / `server` | Singleton (last-wins) | Warns on duplicate |
| `waf` | Singleton (last-wins) | Warns on duplicate |
| `observability`, `limits`, `cache`, `rate-limits` | Singleton (last-wins) | — |

Collection blocks accumulate; singleton blocks keep last-wins semantics, and the two you're most likely to fat-finger into two files — `system` and `waf` — now emit a warning when that happens, so an accidental second copy doesn't override the first in silence.

## The pattern this unlocks

The clean layout was always the obvious one; now it actually works:

```
/etc/zentinel/
├── zentinel.kdl          # system, listeners, include "vhosts/*.kdl"
└── vhosts/
    ├── api.kdl           # api routes + upstreams + agents
    ├── web.kdl           # web routes + upstreams
    └── internal.kdl      # internal routes + upstreams
```

Each vhost file is self-contained: its routes, the upstreams those routes point at, and any per-service agents all live together. Adding a service is a new file, not a merge conflict in a 2,000-line monolith. Removing one is a file deletion. Reviews are scoped to the service that changed. And because include order is sorted and deterministic, what you see locally is what runs in production.

A couple of operational notes:

- **Validate before you reload.** `zentinel --test --config zentinel.kdl` expands the full include tree and runs validation, exiting non-zero on a duplicate ID or a typo'd glob — so it surfaces in CI, not at reload time. (`zentinel validate` goes further and adds upstream/agent/certificate connectivity checks.)
- **Globs that match nothing only warn.** Templating a deployment with an always-present `include "conf.d/*.kdl"` is safe even when `conf.d/` starts empty.
- **IDs are your namespace.** Since duplicate IDs are now hard errors across the whole tree, a light prefix convention (`api-`, `web-`) keeps independent files from colliding as they grow.

## Get it

This shipped in **Zentinel 26.06_3**. Pull the image or grab a signed binary:

```bash
docker pull ghcr.io/zentinelproxy/zentinel:26.06_3
```

See the [configuration reference](https://docs.zentinelproxy.io/configuration/) for the full block list, and the [changelog](https://github.com/zentinelproxy/zentinel/blob/main/CHANGELOG.md) for everything else in the release.
