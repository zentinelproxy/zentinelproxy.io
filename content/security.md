+++
title = "Security"
description = "How to report a vulnerability in Zentinel, which versions receive fixes, and how to verify what you deploy."
template = "page.html"
updated = 2026-10-18
+++

Zentinel sits at the edge of the network, so we treat security reports as the highest-priority work we have. This page summarises the project's [security policy](https://github.com/zentinelproxy/zentinel/blob/main/SECURITY.md); where the two differ, `SECURITY.md` in the repository is authoritative.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Report them privately via GitHub:

- **[GitHub private vulnerability reporting](https://github.com/zentinelproxy/zentinel/security/advisories/new)** on the `zentinelproxy/zentinel` repository, or
- contact **[@raffaelschneider](https://github.com/raffaelschneider)** directly via GitHub.

Please include:

1. **Description** — what is the vulnerability?
2. **Impact** — what can an attacker do with it?
3. **Reproduction** — steps to reproduce the issue
4. **Affected versions** — which versions are affected?
5. **Suggested fix** — if you have one

### What to expect

- **Acknowledgment** within 48 hours
- **Initial assessment** within 7 days
- **Resolution**, depending on severity: critical 24–48 hours, high 7 days, medium 30 days, low in the next release

We follow coordinated disclosure, credit reporters unless you prefer to remain anonymous, and publish a security advisory once a fix is available.

A machine-readable contact file is published at [`/.well-known/security.txt`](/.well-known/security.txt) ([RFC 9116](https://www.rfc-editor.org/rfc/rfc9116)).

## Supported versions

Security fixes are shipped as a new release on the latest line. **Only the latest release is supported**; there are no long-term-support branches. Releases use [CalVer](https://docs.zentinelproxy.io/appendix/versioning/) (`YY.MM_PATCH`), and the corresponding crates are published on the 0.6.x line on crates.io. The [CHANGELOG](https://github.com/zentinelproxy/zentinel/blob/main/CHANGELOG.md) maps each release to its crate version and lists the advisories it addresses.

If you run an older release, upgrade to the latest one; the [upgrade guide](https://docs.zentinelproxy.io/operations/upgrade-guide/) describes the procedure.

## Verifying releases

Every release binary is signed with Sigstore cosign (keyless, tied to the project's GitHub Actions identity), container images on GHCR are signed and carry an SBOM attestation, and each release ships SBOMs in CycloneDX and SPDX formats along with SLSA provenance. The [supply chain security](/supply-chain/) page has the exact verification commands.

## Advisories and security updates

Published advisories are listed on the repository's [GitHub Security Advisories](https://github.com/zentinelproxy/zentinel/security/advisories) page. Security-relevant dependency updates, including RUSTSEC and GHSA identifiers, are recorded in the *Security* section of each [CHANGELOG](https://github.com/zentinelproxy/zentinel/blob/main/CHANGELOG.md) entry and announced with each [GitHub release](https://github.com/zentinelproxy/zentinel/releases).

## Security design

Zentinel's approach follows the [manifesto](/manifesto/): explicit limits and timeouts instead of hidden defaults, bounded resources, security logic isolated in external agents rather than the core, and every decision observable in logs and metrics. Two known limitations are worth stating plainly:

- WASM agents run **in-process**, sandboxed by Wasmtime, so a Wasmtime vulnerability can affect the proxy process itself (see the wasmtime 49 update in 26.10_3). Out-of-process agents do not share that exposure.
- Agent traffic over Unix domain sockets is not encrypted; use gRPC with TLS for agents in sensitive environments.
