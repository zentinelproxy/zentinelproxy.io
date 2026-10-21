<p align="center">
  <a href="https://zentinelproxy.io">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/zentinelproxy/design/main/marks/lockup/zentinel-lockup-dark.svg">
      <img alt="Zentinel" src="https://raw.githubusercontent.com/zentinelproxy/design/main/marks/lockup/zentinel-lockup-light.svg" height="52">
    </picture>
  </a>
</p>

<h3 align="center">zentinelproxy.io</h3>

<p align="center">The Zentinel website: what the proxy is, how it compares, the blog, and the in-browser playground and config converter.</p>

<p align="center">
  <a href="https://github.com/zentinelproxy/zentinelproxy.io/actions/workflows/content-checks.yml"><img alt="CI" src="https://github.com/zentinelproxy/zentinelproxy.io/actions/workflows/content-checks.yml/badge.svg"></a>
  <img alt="License" src="https://img.shields.io/badge/license-MIT-9b4d8a?style=flat&labelColor=1f161e">
</p>

<p align="center">
  <a href="https://zentinelproxy.io">zentinelproxy.io</a> &middot;
  <a href="https://docs.zentinelproxy.io">Docs</a> &middot;
  <a href="https://github.com/zentinelproxy">All repositories</a>
</p>

A [Zola](https://www.getzola.org/) site: the home page, features, manifesto,
benchmarks, comparison, supply chain, control plane, support, the blog, and two
pages that run Zentinel code in the browser as WebAssembly: the
[playground](https://zentinelproxy.io/playground/) (validates a KDL config) and
the [converter](https://zentinelproxy.io/converter/) (nginx, HAProxy, Traefik,
Caddy and Envoy to KDL). The documentation and the agent registry are separate
sites with their own repositories (see [Related](#related)).

## Quick start

```bash
mise install        # zola 0.19, pinned in mise.toml
mise run serve      # zola serve --drafts, on http://127.0.0.1:1111
```

## Development

| Task | What it does |
|---|---|
| `mise run serve` | dev server with live reload, drafts included |
| `mise run build` | regenerate `static/llms.txt` and `static/llms-full.txt`, then `zola build` into `public/` |
| `mise run llms` | regenerate the two llms files only (`scripts/llms.py`); commit the result |
| `mise run check-version` | check `software_version` in `config.toml` against the latest zentinel release (needs network) |
| `mise run convert-images` | convert PNG/JPG under `static/` to AVIF (needs ImageMagick) |
| `mise run clean` | remove `public/` |
| `python3 scripts/check_links.py content` | check internal links; `zola check` does not see absolute-path links, and `/docs/...` links fail because the docs are served at the root of docs.zentinelproxy.io |

**Zola version.** `mise.toml` pins zola 0.19, and production builds with 0.19
too, but `config.toml` uses zola 0.22's highlighting block
(`[markdown.highlighting] style = "class"`), which 0.19 ignores: code blocks on
the live site are not highlighted. `sass/_syntax.scss` already styles the 0.22
output. Moving both mise and the Cloudflare Pages `ZOLA_VERSION` to 0.22 is
tracked in [#51](https://github.com/zentinelproxy/zentinelproxy.io/issues/51);
until then, build with the mise-pinned 0.19 so what you see locally is what
ships.

**Design tokens are vendored, not edited.** These files are copied from
[zentinelproxy/design](https://github.com/zentinelproxy/design) by its
`deno task sync` and must not be edited by hand here: `sass/_tokens.scss`,
`sass/_fonts.scss`, `sass/_frame.scss` and `static/fonts/`. Change
`tokens.json` in the design repository, rebuild, sync, and commit the copies.
The site's own styles (`sass/style.scss` and the other partials) use the
`var(--z-*)` roles from those files.

**WebAssembly payloads.** `static/wasm/` holds the playground module built from
the zentinel release named in `static/wasm/PAYLOAD_VERSION`, and the converter
module. The weekly `payload-staleness.yml` workflow compares `PAYLOAD_VERSION`
with the latest `zentinel-proxy` on crates.io, builds a new payload from the
matching release tag, and opens a pull request, or a tracking issue when it
cannot.

**Release-tied content.** `content-checks.yml` fails when `software_version` in
`config.toml` is behind the latest zentinel release (on `main` and daily; a red
scheduled run means "bump it") or when the committed llms files no longer match
the content (`mise run llms`).

## Deploy

Cloudflare Pages builds and serves the site from this repository: every merge
to `main` deploys to zentinelproxy.io, and every pull request gets a preview
deployment. The Zola version and build command are set in the Cloudflare
dashboard, not in this repository. Redirects live in `static/_redirects`.
After a payload merge, check that the live site serves the new
`PAYLOAD_VERSION`: a merge landing within a minute of another one has been
skipped by Cloudflare Pages.

`deploy.yml` also builds the site on every push to `main` and publishes it to
GitHub Pages; that copy is not what serves zentinelproxy.io.

## Related

- [zentinel](https://github.com/zentinelproxy/zentinel): the proxy
- [zentinelproxy.io-docs](https://github.com/zentinelproxy/zentinelproxy.io-docs): docs.zentinelproxy.io
- [registry.zentinelproxy.io](https://github.com/zentinelproxy/registry.zentinelproxy.io): the agent registry
- [api.zentinelproxy.io](https://github.com/zentinelproxy/api.zentinelproxy.io): the JSON API behind `zentinel bundle`
- [design](https://github.com/zentinelproxy/design): the design tokens this site vendors
- [Discussions](https://github.com/zentinelproxy/zentinel/discussions): questions and ideas

## License

MIT, see [`LICENSE`](LICENSE). The typefaces in `static/fonts/` are under the
SIL Open Font License 1.1 (the `*-OFL.txt` files next to them).

---

<p align="center">
  <sub>Part of <a href="https://zentinelproxy.io">Zentinel</a>, the security-first reverse proxy. The shisa guards the gate.</sub>
</p>
