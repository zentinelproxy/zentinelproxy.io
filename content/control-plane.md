+++
title = "Control Plane"
description = "Fleet management for Sentinel reverse proxies. Declarative configuration distribution with safe rollouts, real-time monitoring, and audit logging."
template = "page.html"
+++

# Control Plane

The [Sentinel Control Plane](https://github.com/raskell-io/sentinel-control-plane) is a fleet management system for Sentinel reverse proxies. It handles configuration distribution, rolling deployments, and real-time node monitoring — built with Elixir/Phoenix and LiveView.

## How It Works

```
KDL Config  →  Compile & Sign  →  Immutable Bundle  →  Rollout  →  Nodes Pull & Activate
```

1. **Define** services, upstreams, certificates, and middleware through the web UI or API
2. **Compile** into an immutable, signed bundle (`.tar.zst` with manifest, checksums, and SBOM)
3. **Create a rollout** targeting nodes by labels, groups, or environments
4. **Deploy** with batched progression, health gates, and automatic pause on failure
5. **Nodes pull** the bundle, verify the Ed25519 signature, and activate

Every mutation is recorded in a tamper-evident audit log.

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Control Plane (Phoenix)             │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ LiveView │  │ REST API │  │    GitOps     │  │
│  │    UI    │  │ GraphQL  │  │   Webhooks    │  │
│  └────┬─────┘  └─────┬────┘  └────────┬──────┘  │
│       │              │                │          │
│  ┌────┴──────────────┴────────────────┴───────┐  │
│  │           Contexts (Business Logic)        │  │
│  │  Bundles · Nodes · Rollouts · Audit · WAF  │  │
│  └────┬──────────────┬────────────────────────┘  │
│       │              │                           │
│  ┌────┴─────┐  ┌─────┴──────┐                    │
│  │ Postgres │  │  S3/MinIO  │                    │
│  │  (state) │  │ (bundles)  │                    │
│  └──────────┘  └────────────┘                    │
└─────────────────────────────────────────────────┘
         │                          ▲
         │  Rollout assigns bundle  │  Heartbeat + status
         ▼                          │
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Sentinel   │  │  Sentinel   │  │  Sentinel   │
│   Node A    │  │   Node B    │  │   Node C    │
└─────────────┘  └─────────────┘  └─────────────┘
```

## Features

### Configuration Management

- **Services** — Define routes with upstream targets, load balancing (round-robin, least-connections, IP hash, random, weighted, consistent hash), timeouts, retries, and caching
- **TLS Certificates** — Upload or auto-provision via ACME/Let's Encrypt with expiry tracking
- **Middlewares** — Rate limiting, CORS, caching, compression, request/response transforms, and more
- **Auth Policies** — JWT, API key, Basic, OAuth2, OIDC, and composite authentication
- **Secrets** — AES-256-GCM encrypted at rest with rotation and per-environment scoping
- **Service Topology** — Visual graph of services, upstreams, middlewares, and policies

### Bundle Pipeline

- **Immutable Bundles** — Content-addressed `.tar.zst` archives with SHA256 hashing
- **Ed25519 Signing** — Cryptographic bundle verification on every node
- **SBOM Generation** — CycloneDX 1.5 for supply chain visibility
- **Risk Scoring** — Automatic risk assessment comparing each bundle against its predecessor
- **Config Validation** — Custom rules (required fields, forbidden patterns, size limits, JSON Schema)
- **Promotion Pipeline** — Promote bundles through dev, staging, and production environments

### Deployment & Rollouts

- **Rolling** — Deploy in batches with health gates between steps
- **Canary** — Gradually shift traffic to the new configuration
- **Blue-Green** — Deploy to standby slot, shift traffic incrementally, then swap
- **All at Once** — Deploy to every node simultaneously
- **Health Gates** — Heartbeat checks, error rate thresholds, latency limits, and custom endpoints
- **Approval Workflows** — Require sign-off before rollouts execute
- **Freeze Windows** — Block deployments during sensitive periods
- **Scheduled Rollouts** — Deploy at a specific future time
- **Drift Detection** — Automatic detection and optional remediation when nodes diverge

### Node Management

- **Registration** — Nodes self-register and receive a unique key
- **JWT Authentication** — Exchange static keys for short-lived Ed25519 JWT tokens
- **Heartbeat Monitoring** — Real-time health tracking with automatic staleness detection
- **Labels & Groups** — Organize and target nodes by metadata
- **Version Pinning** — Pin nodes to specific bundles to exclude them from rollouts
- **Fleet Simulator** — Built-in GenServer fleet for testing without real nodes

### Security

- **WAF** — ~60 OWASP CRS rules with policy system, anomaly detection, and analytics
- **SSO** — OIDC (with PKCE) and SAML 2.0 with JIT provisioning and group-to-role mapping
- **TOTP MFA** — Time-based one-time passwords with recovery codes
- **API Keys** — Scoped keys with 9 permission categories
- **Audit Logging** — Tamper-evident HMAC chain with cryptographic checkpoints

### Observability

- **SLO/SLI Monitoring** — Define SLOs with error budget tracking and burn rate alerts
- **Alert Rules** — Threshold, anomaly, and SLO burn rate conditions with silencing
- **Prometheus Metrics** — Fleet gauges, counters, and standard BEAM/Phoenix/Ecto/Oban metrics
- **OpenTelemetry** — Distributed tracing across API, database, and compilation operations
- **Service Analytics** — Per-service request counts, error rates, latency percentiles, and top paths

### Integrations

- **GitOps** — Auto-compile bundles on push from GitHub, GitLab, Bitbucket, or Gitea
- **Notifications** — Route events to Slack, PagerDuty, Microsoft Teams, Email, or webhooks
- **GraphQL API** — Absinthe-powered with real-time subscriptions
- **Developer Portal** — Auto-generated API documentation from OpenAPI specs
- **REST API** — Full CRUD for all resources with scoped authentication

## Quick Start

```bash
git clone https://github.com/raskell-io/sentinel-control-plane.git
cd sentinel-control-plane
docker compose up
```

This starts the control plane, PostgreSQL, and MinIO. Migrations run automatically. Visit [localhost:4000](http://localhost:4000).

For local development with hot-reloading:

```bash
mise install && mise run setup && mise run dev
```

## Multi-Tenancy

The control plane supports multiple organizations, each with their own projects, members, and signing keys.

| Role | Permissions |
|------|-------------|
| **Admin** | Full org control, manage members, signing keys, SSO |
| **Operator** | Create/manage projects, bundles, rollouts, services |
| **Reader** | Read-only access to all resources |

## API

Nodes authenticate with registration keys or JWT tokens. Operators authenticate with scoped API keys.

```
# Node API
POST /api/v1/projects/:slug/nodes/register    # Register
POST /api/v1/nodes/:id/heartbeat              # Heartbeat
GET  /api/v1/nodes/:id/bundles/latest          # Poll for updates

# Operator API
POST /api/v1/projects/:slug/bundles            # Create bundle
POST /api/v1/projects/:slug/rollouts           # Create rollout
GET  /api/v1/projects/:slug/nodes/stats        # Fleet statistics
POST /api/v1/graphql                           # GraphQL endpoint
```

Full API reference and documentation available in the [docs](https://github.com/raskell-io/sentinel-control-plane/tree/main/docs).

## Tech Stack

- **Elixir / Phoenix 1.8** with LiveView for real-time UI
- **Oban** for reliable background job processing
- **Absinthe** for GraphQL with subscriptions
- **PostgreSQL** (production) / SQLite (development)
- **S3 / MinIO** for bundle storage
- **Ed25519 / JOSE** for signing
- **PromEx** + **OpenTelemetry** for observability

## Links

- [GitHub Repository](https://github.com/raskell-io/sentinel-control-plane)
- [Documentation](https://github.com/raskell-io/sentinel-control-plane/tree/main/docs)
- [Discussions](https://github.com/raskell-io/sentinel/discussions)
