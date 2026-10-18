+++
title = "Contributing"
description = "How to contribute to Zentinel: where to start, what belongs in the core, and where to ask questions."
template = "page.html"
updated = 2026-10-18
+++

Zentinel sits at the edge of the web, so changes affect availability, security and someone's on-call. The bar is intentionally high, but small contributions are genuinely welcome: a clearer error message is a real improvement.

## Start here

- **Read [`CONTRIBUTING.md`](https://github.com/zentinelproxy/zentinel/blob/main/CONTRIBUTING.md)** in the main repository. It explains what belongs in the core, what should be an agent instead, and what a change needs (limits, observability, tests, docs).
- **Read the [manifesto](/manifesto/).** Proposals are judged against it: bounded, observable, explicit.
- **Pick an issue.** Issues labelled [`good-first-issue`](https://github.com/zentinelproxy/zentinel/labels/good-first-issue) are scoped tasks that do not need deep knowledge of the proxy internals; [`help-wanted`](https://github.com/zentinelproxy/zentinel/labels/help-wanted) marks issues where outside help is particularly welcome.

Good places to begin, even without a labelled issue: crate documentation, configuration error messages, tests for edge cases in `zentinel-config`, and KDL examples in `config/examples/`.

## Build an agent instead

Policy engines, scripting runtimes and business-specific logic do not belong in the core proxy; they belong in **agents**, external processes the proxy calls over a bounded protocol. If your idea is one of those, an agent is usually the faster path, and it can live in its own repository on its own release schedule.

SDKs are available for:

- [Rust](https://github.com/zentinelproxy/zentinel-agent-rust-sdk)
- [Go](https://github.com/zentinelproxy/zentinel-agent-go-sdk)
- [Python](https://github.com/zentinelproxy/zentinel-agent-python-sdk)
- [TypeScript](https://github.com/zentinelproxy/zentinel-agent-typescript-sdk)
- [Elixir](https://github.com/zentinelproxy/zentinel-agent-elixir-sdk)
- [Kotlin](https://github.com/zentinelproxy/zentinel-agent-kotlin-sdk)
- [Haskell](https://github.com/zentinelproxy/zentinel-agent-haskell-sdk)

The protocol is documented in the [agent docs](https://docs.zentinelproxy.io/agents/), and published agents are listed in the [agent registry](https://registry.zentinelproxy.io).

## Ask questions

- **[GitHub Discussions](https://github.com/zentinelproxy/zentinel/discussions)** for questions, ideas and design discussion before you write code.
- **[GitHub Issues](https://github.com/zentinelproxy/zentinel/issues)** for bugs and concrete feature requests.
- **Security issues** go through the private process on the [security page](/security/), never a public issue.

## Other repositories

The website (this site) lives in [zentinelproxy/zentinelproxy.io](https://github.com/zentinelproxy/zentinelproxy.io) and the documentation in [zentinelproxy/zentinelproxy.io-docs](https://github.com/zentinelproxy/zentinelproxy.io-docs). Corrections to either are welcome as pull requests.

Please follow the [Code of Conduct](https://github.com/zentinelproxy/zentinel/blob/main/CODE_OF_CONDUCT.md).
