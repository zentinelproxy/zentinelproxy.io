+++
title = "Introducing the Zentinel Control Plane: Fleet Management Built on Elixir"
description = "The Zentinel Control Plane is a fleet management system for Zentinel reverse proxies — built with Elixir/Phoenix and LiveView. It handles configuration distribution, deployment orchestration, and real-time node monitoring. Here's what we built, why we chose Elixir, and how the internals work."
date = 2026-02-16
[taxonomies]
tags = ["control-plane", "elixir", "fleet-management", "release"]
+++

Managing one Zentinel proxy is straightforward. A KDL config file, a binary, a `systemd` unit. But as deployments grow — multiple regions, staging environments, dozens of nodes — the operational questions multiply. How do you push a config change to 30 nodes without taking everything down at once? How do you know which nodes are actually running which configuration? How do you roll back when a bad config makes it past review?

These questions started arriving from the community. [Issue #36](https://github.com/zentinelproxy/zentinel/issues/36) captured what several users were asking for: a dashboard for monitoring routes and upstreams, a way to manage configuration through a UI, health status at a glance, and safe deployment workflows. The request was clear — Zentinel needed a control plane.

Today we're announcing the [Zentinel Control Plane](https://github.com/zentinelproxy/zentinel-control-plane), a fleet management system purpose-built for Zentinel reverse proxies. It handles configuration distribution, rolling deployments with health gates, real-time node monitoring, and audit logging — with a real-time web UI and a full API.

## Why Elixir and Phoenix

The control plane is written in Elixir, running on the BEAM virtual machine with Phoenix 1.8. This wasn't the obvious choice for a project whose core proxy is written in Rust. We considered Go and Rust-based web frameworks. We chose Elixir for three reasons.

**Concurrency is the default, not an afterthought.** A control plane is fundamentally a coordination system. It needs to track heartbeats from dozens of nodes, drive rollout state machines on independent timers, compile and sign bundles in the background, deliver notifications to Slack and PagerDuty, and push real-time updates to every open browser tab — all simultaneously. On the BEAM, each of these is a lightweight process with its own mailbox. There's no thread pool to tune, no async runtime to configure, no callback hell. The supervision tree restarts crashed processes automatically. This is what the BEAM was built for.

**LiveView eliminates the frontend/backend split.** Phoenix LiveView renders server-side HTML and pushes diffs over WebSocket. The dashboard updates in real-time — node heartbeats, rollout progress, bundle compilation status — without a single line of JavaScript framework code. No React, no Redux, no API serialization layer. When a node sends a heartbeat, the server broadcasts via PubSub, and every connected LiveView re-renders the affected component. The result is a real-time UI with the development speed of a server-rendered app.

**Oban gives us reliable workflows out of the box.** Bundle compilation, rollout progression, drift detection, certificate renewal, notification delivery, WAF anomaly detection — these are all background jobs that need retries, scheduling, uniqueness constraints, and observability. [Oban](https://github.com/oban-bg/oban) provides all of this as a library, backed by the same database. No Redis, no RabbitMQ, no separate infrastructure to operate. A rollout tick is an Oban job. A bundle compilation is an Oban job. Drift detection is a periodic Oban job. The pattern is consistent and the failure modes are well-understood.

The Elixir community is smaller than Go or Rust, but it's deeply focused on exactly the kind of system we're building: real-time web applications with complex concurrent workflows. Phoenix, Ecto, Oban, Absinthe — these are mature, well-documented libraries maintained by active teams. For a control plane, the ecosystem fit is excellent.

## The core workflow

The control plane operates on a simple lifecycle:

```
KDL Config  →  Compile & Sign  →  Immutable Bundle  →  Rollout  →  Nodes Pull & Activate
```

1. **Define** services, upstreams, certificates, and middleware through the LiveView UI or API
2. **Compile** into an immutable, signed bundle (`.tar.zst` with manifest, checksums, and SBOM)
3. **Create a rollout** targeting nodes by labels, groups, or environments
4. **Deploy** with batched progression, health gates, and automatic pause on failure
5. **Nodes pull** the bundle, verify the Ed25519 signature, and activate

Every mutation is recorded in a tamper-evident audit log. Let's look at each stage.

## Bundle compilation pipeline

When an operator uploads a KDL configuration — through the UI, API, or a GitOps webhook — the control plane creates a bundle record and enqueues compilation as an Oban job:

```elixir
defmodule ZentinelCp.Bundles.CompileWorker do
  use Oban.Worker, queue: :default, max_attempts: 3

  def perform(%Oban.Job{args: %{"bundle_id" => bundle_id}}) do
    Tracer.trace_compilation(bundle_id, fn ->
      bundle = Bundles.get_bundle!(bundle_id)
      {:ok, bundle} = Bundles.update_status(bundle, "compiling")

      case compile_bundle(bundle) do
        {:ok, result} ->
          {signature, signing_key_id} = Signing.sign_bundle(result.archive_data)
          {risk_level, risk_reasons} =
            Risk.score_against_previous(bundle.config_source, bundle.project_id)

          Bundles.update_compilation(bundle, %{
            status: "compiled",
            checksum: result.checksum,
            size_bytes: result.size,
            storage_key: result.storage_key,
            signature: signature,
            signing_key_id: signing_key_id,
            risk_level: risk_level,
            risk_reasons: risk_reasons
          })

          Phoenix.PubSub.broadcast(
            ZentinelCp.PubSub,
            "bundles:#{bundle.project_id}",
            {:bundle_compiled, bundle_id}
          )

        {:error, reason} ->
          Bundles.update_compilation(bundle, %{
            status: "failed",
            compiler_output: reason
          })
      end
    end)
  end
end
```

The compilation pipeline does several things in sequence:

1. **Validates** the KDL config by calling the actual `zentinel validate` binary — the same parser the proxy uses
2. **Assembles** a tar.zst archive containing the config, manifest with per-file SHA256 checksums, internal CA certificates (if configured), and plugin files
3. **Uploads** the archive to S3/MinIO at a content-addressed path
4. **Signs** the archive with Ed25519 if signing is enabled — nodes verify this signature before activating
5. **Scores risk** by comparing the new config against the previous bundle, flagging changes as low/medium/high risk
6. **Broadcasts** the result via PubSub so every open LiveView updates immediately

The signing module is deliberately simple — thin wrappers around Erlang's `:crypto`:

```elixir
defmodule ZentinelCp.Bundles.Signing do
  def sign(data, private_key) when is_binary(data) and is_binary(private_key) do
    :crypto.sign(:eddsa, :none, data, [private_key, :ed25519])
  end

  def verify(data, signature, public_key) do
    :crypto.verify(:eddsa, :none, data, signature, [public_key, :ed25519])
  end

  def sign_bundle(bundle_data) do
    config = Application.get_env(:zentinel_cp, :bundle_signing, [])

    if config[:enabled] do
      private_key = load_private_key(config)
      signature = sign(bundle_data, private_key)
      {signature, config[:key_id] || "default"}
    else
      {nil, nil}
    end
  end
end
```

No external signing service. No HSM abstraction layer. Ed25519 is fast, the keys are small, and Erlang's crypto module is OpenSSL underneath. If you need signing, set the config. If you don't, bundles flow unsigned. The decision is explicit.

## Deployment orchestration

This is the heart of the control plane. The rollout system is a state machine driven by a self-scheduling Oban worker that ticks every 5 seconds:

```elixir
defmodule ZentinelCp.Rollouts.TickWorker do
  use Oban.Worker,
    queue: :rollouts,
    max_attempts: 3,
    unique: [keys: [:rollout_id], period: 10]

  @tick_interval_seconds 5

  def perform(%Oban.Job{args: %{"rollout_id" => rollout_id}}) do
    case Rollouts.get_rollout(rollout_id) do
      %{state: "running"} = rollout ->
        result = Rollouts.tick_rollout(rollout)
        handle_tick_result(result, rollout_id)

      %{state: state} ->
        Logger.info("Rollout #{rollout_id} in state #{state}, stopping ticks")
        :ok
    end
  end

  defp handle_tick_result({:ok, result}, rollout_id)
       when result in ~w(step_started step_verifying step_completed waiting)a do
    reschedule(rollout_id)
  end

  defp handle_tick_result({:ok, %{state: "completed"}}, _rollout_id), do: :ok
  defp handle_tick_result({:ok, :deadline_exceeded}, _rollout_id), do: :ok
end
```

The `unique` constraint on Oban ensures that only one tick runs per rollout at a time — even if the previous tick took longer than 5 seconds. No race conditions, no duplicate state transitions. When the rollout completes, fails, or is paused, the worker simply stops rescheduling itself.

### Four deployment strategies

The rollout system supports four strategies, each with different batching and health-check behavior:

| Strategy | How it works | Best for |
|----------|-------------|----------|
| **Rolling** | Deploy in configurable batches with health gates between steps | Standard production deployments |
| **Canary** | Gradually shift traffic (5% → 25% → 50% → 100%) with metric analysis at each step | High-risk config changes |
| **Blue-Green** | Deploy to standby slot, shift traffic incrementally, swap | Zero-downtime with instant rollback |
| **All at Once** | Deploy to every node simultaneously | Dev/staging environments |

### Canary analysis

The canary strategy doesn't just shift traffic — it compares canary node metrics against baseline nodes and makes automated promotion/rollback decisions:

```elixir
defmodule ZentinelCp.Rollouts.CanaryAnalysis do
  @default_config %{
    "error_rate_threshold" => 5.0,
    "latency_p99_threshold_ms" => 500,
    "analysis_window_minutes" => 5,
    "steps" => [5, 25, 50, 100]
  }

  def analyze(rollout, canary_node_ids, baseline_node_ids) do
    config = Map.merge(@default_config, rollout.canary_analysis_config || %{})
    since = DateTime.utc_now() |> DateTime.add(-config["analysis_window_minutes"] * 60, :second)

    canary_metrics = aggregate_metrics(canary_node_ids, since)
    baseline_metrics = aggregate_metrics(baseline_node_ids, since)

    decision = make_decision(canary_metrics, baseline_metrics, config)
    {decision, %{canary: canary_metrics, baseline: baseline_metrics}}
  end

  defp make_decision(canary, baseline, config) do
    cond do
      canary.total_requests < 10 -> :extend
      canary.error_rate > config["error_rate_threshold"] -> :rollback
      canary.avg_latency_p99 > config["latency_p99_threshold_ms"] -> :rollback
      baseline.total_requests > 10 and canary.error_rate > baseline.error_rate * 2 -> :rollback
      baseline.total_requests > 10 and canary.avg_latency_p99 > baseline.avg_latency_p99 * 1.5 -> :rollback
      true -> :promote
    end
  end
end
```

Three possible decisions: `:promote` (advance to the next traffic step), `:rollback` (abort and revert), or `:extend` (not enough data yet, keep observing). The analysis runs automatically at each canary step. If canary error rates exceed the threshold or are 2x worse than baseline, the rollout rolls back without operator intervention.

### Health gates

Every strategy supports optional health gates — conditions that must pass before a rollout step advances:

| Gate | What it checks |
|------|---------------|
| `heartbeat_healthy` | All nodes in the batch are reporting healthy heartbeats |
| `max_error_rate` | Error rate from latest heartbeat metrics stays below threshold |
| `max_latency_ms` | P99 latency stays below threshold |
| `max_cpu_percent` | CPU utilization stays below threshold |
| `max_memory_percent` | Memory utilization stays below threshold |

Gates are combined with AND logic. If any gate fails for more than 50 seconds and auto-rollback is enabled, the rollout pauses and triggers a rollback to the previous bundle.

## Node management

Zentinel proxy nodes interact with the control plane through a simple lifecycle:

1. **Register** — `POST /api/v1/projects/:slug/nodes/register` — the node gets a unique key
2. **Heartbeat** — `POST /api/v1/nodes/:id/heartbeat` — sent every 10 seconds with status, metrics, and health info
3. **Poll** — `GET /api/v1/nodes/:id/bundles/latest` — check for new bundles to activate
4. **Token exchange** — optionally swap the static key for short-lived Ed25519 JWT tokens

Nodes are organized with labels and groups. A rollout can target `env=prod, region=us-west-2` and the control plane resolves that to the matching set of nodes. Nodes can also be pinned to specific bundle versions to exclude them from rollouts — useful for canary nodes running a known-good config.

### Drift detection

A periodic Oban worker checks every node's active bundle against its expected bundle. When they diverge — maybe someone manually restarted a node with an old config — the control plane records a drift event:

If auto-remediation is enabled for the project, the control plane creates a targeted rollout to bring the drifted node back into compliance. If not, the drift event appears in the dashboard and triggers notifications.

## Tamper-evident audit logging

Every mutation in the control plane — bundle creation, rollout start, node registration, config change — is recorded in an audit log with HMAC chain linking:

```elixir
defmodule ZentinelCp.Audit do
  def log(attrs) do
    previous_hash = ChainVerifier.get_latest_hash()
    entry_hash = ChainVerifier.compute_entry_hash(attrs, previous_hash)

    attrs =
      attrs
      |> Map.put(:previous_hash, previous_hash)
      |> Map.put(:entry_hash, entry_hash)

    %AuditLog{}
    |> AuditLog.changeset(attrs)
    |> Repo.insert()
  end
end
```

Each entry's hash depends on the previous entry's hash, forming a chain. If any entry is modified or deleted after the fact, the chain breaks and `ChainVerifier.verify_chain/1` reports the tampering. This is the same principle behind Git commit hashes and blockchain ledgers, applied to an audit trail.

The audit log records the actor (user, API key, node, or system), the action, the resource, and a before/after diff of the changes. For compliance-heavy environments, the full audit trail can be exported.

## Fleet simulator

Testing rollout strategies against production nodes is risky. The control plane includes a built-in fleet simulator — GenServer processes that behave like real Zentinel nodes:

```elixir
# Spawn 10 simulated nodes
{:ok, pid} = ZentinelCp.Simulator.Fleet.spawn_nodes("my-project", 10, %{
  failure_rate: 0.05,       # 5% chance of activation failure
  heartbeat_interval_ms: 5_000,
  apply_delay_ms: 2_000    # Simulate 2s activation time
})

# Watch them register, heartbeat, and pull bundles
ZentinelCp.Simulator.Fleet.get_summary(pid)
# => %{total: 10, online: 10, activating: 3, active: 7}

# Trigger random failures to test rollback behavior
ZentinelCp.Simulator.Fleet.trigger_random_failures(pid, 3)
```

Each simulated node registers with the control plane, sends periodic heartbeats with synthetic metrics, polls for bundle updates, and simulates activation with a configurable failure rate. You can test canary analysis, health gate behavior, and auto-rollback without deploying anything.

## The supervision tree

The entire system starts under a single OTP supervisor:

```elixir
children = [
  ZentinelCpWeb.Telemetry,
  ZentinelCp.Repo,
  {Phoenix.PubSub, name: ZentinelCp.PubSub},
  ZentinelCp.PromEx,                              # Prometheus metrics
  ZentinelCp.RateLimit,                            # ETS-backed token bucket
  ZentinelCp.Services.Acme.ChallengeStore,         # ACME challenge tokens
  {Oban, Application.fetch_env!(:zentinel_cp, Oban)},
  ZentinelCpWeb.Endpoint,                          # Phoenix HTTP/WS
  {Absinthe.Subscription, ZentinelCpWeb.Endpoint}  # GraphQL subscriptions
]
```

After the supervisor starts, periodic workers initialize themselves: rollout scheduler, drift detection, certificate expiry tracking, WAF anomaly detection, analytics pruning, service discovery sync. Each is an Oban cron-like job that reschedules itself. If any crashes, Oban retries it. If the whole application restarts, the supervisor brings everything back up in order.

This is what the BEAM gives you for free. No process manager, no service mesh, no container orchestrator needed to keep background workers alive. The runtime handles it.

## Beyond the basics

The control plane includes several features we haven't covered in detail:

- **WAF management** — ~60 OWASP CRS rules with per-project policies, anomaly detection, and baseline tracking
- **SSO** — OIDC (with PKCE) and SAML 2.0 with JIT provisioning and group-to-role mapping
- **TOTP MFA** — time-based one-time passwords with recovery codes
- **SLO/SLI monitoring** — define SLOs with error budget tracking and burn rate alerts
- **GraphQL API** — Absinthe-powered with real-time subscriptions for node status and rollout progress
- **GitOps** — auto-compile bundles on push from GitHub, GitLab, Bitbucket, or Gitea via webhooks
- **Notifications** — route events to Slack, PagerDuty, Microsoft Teams, email, or custom webhooks
- **Multi-tenancy** — organizations with projects, roles (admin/operator/reader), and scoped API keys
- **Service topology** — visual graph of services, upstreams, middlewares, and auth policies
- **Approval workflows** — require sign-off before rollouts execute, with configurable approval count
- **Freeze windows** — block deployments during sensitive periods
- **Federation** — multi-region bundle replication with hub-and-spoke storage

## Try it

Docker Compose gets everything running in one command:

```bash
git clone https://github.com/zentinelproxy/zentinel-control-plane.git
cd zentinel-control-plane
docker compose up
```

This starts the control plane, PostgreSQL, and MinIO. Migrations run automatically. Visit [localhost:4000](http://localhost:4000).

For local development with hot-reloading:

```bash
mise install && mise run setup && mise run dev
```

The fleet simulator lets you test the full workflow without real Zentinel nodes. Create a project, upload a KDL config, watch it compile, spawn simulated nodes, create a rollout, and observe the deployment progress in real-time through the LiveView dashboard.

---

The control plane is open source and available at [github.com/zentinelproxy/zentinel-control-plane](https://github.com/zentinelproxy/zentinel-control-plane). Documentation covers [architecture](https://github.com/zentinelproxy/zentinel-control-plane/tree/main/docs), [deployment strategies](https://github.com/zentinelproxy/zentinel-control-plane/tree/main/docs), [API reference](https://github.com/zentinelproxy/zentinel-control-plane/tree/main/docs), and [node management](https://github.com/zentinelproxy/zentinel-control-plane/tree/main/docs). Feature requests and bug reports go to [GitHub Issues](https://github.com/zentinelproxy/zentinel-control-plane/issues). For broader discussion, join us on [GitHub Discussions](https://github.com/zentinelproxy/zentinel/discussions).

The [control plane page](/control-plane/) has a complete feature overview. If you're evaluating Zentinel for fleet deployment, start there.
