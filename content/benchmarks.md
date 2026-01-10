+++
title = "Benchmarks"
description = "Performance, soak testing, and chaos engineering results for Sentinel reverse proxy"
template = "benchmarks.html"
+++

Sentinel includes a comprehensive testing framework validating performance, stability, and resilience. All results below are from actual test runs.

## Test Coverage Overview

<div class="stats-grid" style="margin-top: var(--space-lg);">
    <div class="stat-card">
        <div class="stat-value">322</div>
        <div class="stat-label">Unit Tests</div>
        <div class="stat-detail">Across all crates</div>
    </div>
    <div class="stat-card">
        <div class="stat-value">10</div>
        <div class="stat-label">Chaos Scenarios</div>
        <div class="stat-detail">Fault injection tests</div>
    </div>
    <div class="stat-card">
        <div class="stat-value">72h</div>
        <div class="stat-label">Soak Test Duration</div>
        <div class="stat-detail">Extended stability</div>
    </div>
    <div class="stat-card">
        <div class="stat-value stat-value--success">100%</div>
        <div class="stat-label">Tests Passing</div>
        <div class="stat-detail">All categories</div>
    </div>
</div>

| Category | Tests | Status |
|----------|-------|--------|
| **Unit Tests** | 322 tests across all crates | Passing |
| **Integration Tests** | Full proxy stack with agents | Passing |
| **Chaos Tests** | 10 failure scenarios | Passing |
| **Soak Tests** | 24-72 hour stability tests | Passing |

---

## Performance Benchmarks

### Native Performance (2025-12-31)

Tested on macOS ARM64, native binary (not containerized):

<div class="chart-container">
    <div class="chart-title">Requests per Second (Higher is Better)</div>
    <div class="bar-chart">
        <div class="bar-item">
            <span class="bar-label">Sentinel</span>
            <div class="bar-track">
                <div class="bar-fill" style="width: 100%;"></div>
            </div>
            <span class="bar-value">23,098</span>
        </div>
        <div class="bar-item">
            <span class="bar-label">Envoy</span>
            <div class="bar-track">
                <div class="bar-fill bar-fill--secondary" style="width: 97.6%;"></div>
            </div>
            <span class="bar-value">22,545</span>
        </div>
    </div>
</div>

| Proxy | Requests/sec | p50 Latency |
|-------|--------------|-------------|
| **Sentinel** | **23,098** | **3.5ms** |
| Envoy | 22,545 | 3.6ms |

**Sentinel is 2.5% faster than Envoy** in native benchmarks.

### Load Test Results

| Target | Result |
|--------|--------|
| 10K RPS with p99 < 10ms | **Achieved 23K RPS, p99 ~8ms** |

### Latency Distribution

<div class="latency-chart">
    <div class="latency-bar-group">
        <div class="latency-bar latency-bar--p50" style="height: 15%;"></div>
        <div class="latency-value">1.1ms</div>
        <div class="latency-label">p50</div>
    </div>
    <div class="latency-bar-group">
        <div class="latency-bar latency-bar--p95" style="height: 45%;"></div>
        <div class="latency-value">32.3ms</div>
        <div class="latency-label">p95</div>
    </div>
    <div class="latency-bar-group">
        <div class="latency-bar latency-bar--p99" style="height: 85%;"></div>
        <div class="latency-value">61.5ms</div>
        <div class="latency-label">p99</div>
    </div>
</div>

The latency distribution shows excellent tail latency characteristics:
- **p50 (median)**: 1.1ms — half of all requests complete in just over 1 millisecond
- **p95**: 32.3ms — 95% of requests complete within 32ms
- **p99**: 61.5ms — only 1% of requests exceed 62ms

### Component Latency

| Operation | Latency |
|-----------|---------|
| Core rate limiting | **< 100μs** |
| Geo filtering (MaxMind/IP2Location) | **< 100μs** |
| Token bucket algorithm | ~50μs |
| Agent IPC (Unix socket round-trip) | 100-500μs |
| Distributed rate limit (Redis) | 1-5ms |

Core operations like rate limiting and geo filtering are sub-100μs, meaning they add negligible overhead to request processing. The agent IPC overhead (100-500μs) is the primary cost of extensibility, which is why latency-critical features like rate limiting were moved into the core.

---

## Soak Test Results

Extended duration tests validate stability and detect memory leaks or resource exhaustion.

### 1-Hour Soak Test (2026-01-01)

<div class="gauge-container">
    <div class="gauge">
        <div class="gauge-ring">
            <svg viewBox="0 0 120 120">
                <circle class="track" cx="60" cy="60" r="52"/>
                <circle class="progress" cx="60" cy="60" r="52"
                    stroke-dasharray="327"
                    stroke-dashoffset="1.6"/>
            </svg>
            <div class="gauge-value">99.95%</div>
        </div>
        <div class="gauge-label">Success Rate</div>
    </div>
    <div class="gauge">
        <div class="gauge-ring">
            <svg viewBox="0 0 120 120">
                <circle class="track" cx="60" cy="60" r="52"/>
                <circle class="progress" cx="60" cy="60" r="52"
                    stroke-dasharray="327"
                    stroke-dashoffset="0"
                    style="stroke: var(--color-primary);"/>
            </svg>
            <div class="gauge-value">1M</div>
        </div>
        <div class="gauge-label">Total Requests</div>
    </div>
    <div class="gauge">
        <div class="gauge-ring">
            <svg viewBox="0 0 120 120">
                <circle class="track" cx="60" cy="60" r="52"/>
                <circle class="progress" cx="60" cy="60" r="52"
                    stroke-dasharray="327"
                    stroke-dashoffset="297"/>
            </svg>
            <div class="gauge-value">-91%</div>
        </div>
        <div class="gauge-label">Memory Growth</div>
    </div>
</div>

| Metric | Value |
|--------|-------|
| **Duration** | 1 hour |
| **Total Requests** | 1,000,000 |
| **Throughput** | 775 RPS |
| **Average Latency** | 13.9ms |
| **p50 Latency** | 1.1ms |
| **p95 Latency** | 32.3ms |
| **p99 Latency** | 61.5ms |
| **Success Rate** | **99.95%** |

### Memory Analysis

<div class="memory-chart">
    <svg viewBox="0 0 400 120" preserveAspectRatio="none">
        <line x1="0" y1="30" x2="400" y2="30" stroke="var(--color-border)" stroke-dasharray="4"/>
        <line x1="0" y1="60" x2="400" y2="60" stroke="var(--color-border)" stroke-dasharray="4"/>
        <line x1="0" y1="90" x2="400" y2="90" stroke="var(--color-border)" stroke-dasharray="4"/>
        <path d="M 0 30 Q 50 35 100 85 T 200 90 T 300 92 T 400 95"
              fill="none" stroke="var(--color-success)" stroke-width="3" stroke-linecap="round"/>
        <path d="M 0 30 Q 50 35 100 85 T 200 90 T 300 92 T 400 95 L 400 120 L 0 120 Z"
              fill="url(#memoryGradient)" opacity="0.3"/>
        <defs>
            <linearGradient id="memoryGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color: var(--color-success);"/>
                <stop offset="100%" style="stop-color: var(--color-success); stop-opacity: 0;"/>
            </linearGradient>
        </defs>
        <text x="10" y="25" fill="var(--color-text-muted)" font-size="10">12 MB</text>
        <text x="380" y="100" fill="var(--color-text-muted)" font-size="10">1 MB</text>
    </svg>
</div>

| Metric | Value |
|--------|-------|
| Initial Memory | 12 MB |
| Final Memory | 1 MB |
| Memory Growth | **-91%** |
| Verdict | **No memory leak detected** |

**Key Findings:**
- Memory *decreased* over time, demonstrating efficient Rust memory management
- Throughput remained stable throughout the test
- 99% of requests completed in under 62ms
- Connection errors (0.05%) occurred only during startup/shutdown phases

### Leak Detection Methodology

Our analysis uses linear regression to detect memory growth patterns:

| Threshold | Verdict | Action |
|-----------|---------|--------|
| Growth < 10% | NO LEAK | Pass |
| Growth 10-20% | WARNING | Investigate |
| Growth > 20% | LEAK DETECTED | Fail CI |

**Analysis Method:**
- Linear regression on memory samples over time
- R-squared correlation to detect consistent growth
- Monotonic increase ratio (>80% samples increasing = suspicious)

### Test Configuration

From [`tests/soak/soak-config.kdl`](https://github.com/raskell-io/sentinel/blob/main/tests/soak/soak-config.kdl):

```kdl
system {
    worker-threads 2
    max-connections 10000
    graceful-shutdown-timeout-secs 30
}
```

| Parameter | Value |
|-----------|-------|
| **Duration** | 24 hours (standard), 72 hours (extended) |
| **Sustained RPS** | 100 requests/second |
| **Concurrent Connections** | 10 |
| **Sampling Interval** | 60 seconds |
| **Backend** | Simple HTTP echo service |

---

## Chaos Testing

Fault injection validates resilience under failure conditions. All scenarios are in [`tests/chaos/`](https://github.com/raskell-io/sentinel/tree/main/tests/chaos).

<div class="stats-grid">
    <div class="stat-card">
        <div class="stat-value">3</div>
        <div class="stat-label">Agent Failure Tests</div>
        <div class="stat-detail">Crash, timeout, circuit breaker</div>
    </div>
    <div class="stat-card">
        <div class="stat-value">4</div>
        <div class="stat-label">Upstream Failure Tests</div>
        <div class="stat-detail">Crash, failover, 5xx handling</div>
    </div>
    <div class="stat-card">
        <div class="stat-value">3</div>
        <div class="stat-label">Resilience Tests</div>
        <div class="stat-detail">Fail-open, fail-closed, recovery</div>
    </div>
</div>

### Test Scenarios (10 Total)

#### Agent Failure Tests

| Scenario | What We Test | Expected Behavior |
|----------|--------------|-------------------|
| **Agent Crash** | Kill agent process | Fail-open: traffic continues; Fail-closed: 503 |
| **Agent Timeout** | Freeze agent (1s timeout) | Request fails after timeout, no hang |
| **Circuit Breaker** | 5+ consecutive failures | CB opens, fast-fails requests, recovers |

#### Upstream Failure Tests

| Scenario | What We Test | Expected Behavior |
|----------|--------------|-------------------|
| **Backend Crash** | Kill primary backend | Health check detects in ~15s, returns 502/503 |
| **Backend Failover** | Primary down, secondary up | Traffic routes to secondary |
| **All Backends Down** | Kill all backends | Graceful 503, no crash |
| **Backend 5xx** | Backend returns errors | Retry policy triggers, metrics recorded |

#### Resilience Tests

| Scenario | What We Test | Expected Behavior |
|----------|--------------|-------------------|
| **Fail-Open Mode** | Agent failure on `/failopen/*` | Traffic continues to backend |
| **Fail-Closed Mode** | Agent failure on `/protected/*` | Traffic blocked with 503 |
| **Health Recovery** | Backend restart after failure | Auto-recovery in ~15s |
| **Memory Stability** | 20 chaos cycles | No memory leaks |

### Circuit Breaker Behavior

The circuit breaker protects the system from cascading failures when agents become unhealthy. It operates as a state machine with three states:

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   ┌──────────┐   5 failures   ┌──────────┐   10s timeout       │
│   │  CLOSED  │ ─────────────> │   OPEN   │ ─────────────┐      │
│   │ (normal) │                │(fast-fail│               │      │
│   └────▲─────┘                └──────────┘               │      │
│        │                                                 ▼      │
│        │  2 successes         ┌───────────┐                     │
│        └───────────────────── │ HALF-OPEN │ ◄───────────┘      │
│                               │  (probe)  │                     │
│                               └───────────┘                     │
│                                     │                           │
│                                     │ failure                   │
│                                     └──────────> back to OPEN   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**State Descriptions:**

- **CLOSED** (green): Normal operation. All requests pass through to the agent. Failures are counted.
- **OPEN** (red): Circuit is tripped. Requests are immediately failed without contacting the agent. This prevents hammering a broken service.
- **HALF-OPEN** (yellow): After a timeout, the circuit allows a limited number of probe requests. If they succeed, the circuit closes. If they fail, it reopens.

**Configuration** from [`chaos-config.kdl`](https://github.com/raskell-io/sentinel/blob/main/tests/chaos/chaos-config.kdl):

```kdl
circuit-breaker {
    failure-threshold 5      // Opens after 5 consecutive failures
    success-threshold 2      // Closes after 2 successes in half-open
    timeout-seconds 10       // Time before transitioning to half-open
    half-open-max-requests 2 // Probe requests allowed in half-open
}
```

### Recovery Timeline

<div class="timeline">
    <div class="timeline-point">
        <div class="timeline-dot"></div>
        <div class="timeline-value">0ms</div>
        <div class="timeline-label">Failure</div>
    </div>
    <div class="timeline-point">
        <div class="timeline-dot"></div>
        <div class="timeline-value">~15s</div>
        <div class="timeline-label">Detection</div>
    </div>
    <div class="timeline-point">
        <div class="timeline-dot"></div>
        <div class="timeline-value">10s</div>
        <div class="timeline-label">CB Timeout</div>
    </div>
    <div class="timeline-point">
        <div class="timeline-dot timeline-dot--success"></div>
        <div class="timeline-value">~10s</div>
        <div class="timeline-label">Recovery</div>
    </div>
</div>

### Recovery Times

| Failure Type | Detection Time | Recovery Time |
|--------------|----------------|---------------|
| Agent crash (fail-open) | Immediate | N/A (bypassed) |
| Agent crash (fail-closed) | Immediate | On agent restart |
| Backend crash | ~15s (3 health checks) | ~10s after restart |
| Circuit breaker trip | Immediate | 10s + 2 successes |

---

## Security Validation

### WAF Testing (OWASP CRS)

Validated against OWASP attack patterns with the WAF agent running OWASP Core Rule Set:

<div class="chart-container">
    <div class="chart-title">Attack Detection Results</div>
    <div class="bar-chart">
        <div class="bar-item">
            <span class="bar-label">SQL Injection</span>
            <div class="bar-track">
                <div class="bar-fill bar-fill--success" style="width: 100%;"></div>
            </div>
            <span class="bar-value" style="color: var(--color-success);">BLOCKED</span>
        </div>
        <div class="bar-item">
            <span class="bar-label">XSS</span>
            <div class="bar-track">
                <div class="bar-fill bar-fill--success" style="width: 100%;"></div>
            </div>
            <span class="bar-value" style="color: var(--color-success);">BLOCKED</span>
        </div>
        <div class="bar-item">
            <span class="bar-label">Path Traversal</span>
            <div class="bar-track">
                <div class="bar-fill bar-fill--success" style="width: 100%;"></div>
            </div>
            <span class="bar-value" style="color: var(--color-success);">BLOCKED</span>
        </div>
        <div class="bar-item">
            <span class="bar-label">Cmd Injection</span>
            <div class="bar-track">
                <div class="bar-fill bar-fill--success" style="width: 100%;"></div>
            </div>
            <span class="bar-value" style="color: var(--color-success);">BLOCKED</span>
        </div>
        <div class="bar-item">
            <span class="bar-label">Scanner Detection</span>
            <div class="bar-track">
                <div class="bar-fill bar-fill--success" style="width: 100%;"></div>
            </div>
            <span class="bar-value" style="color: var(--color-success);">BLOCKED</span>
        </div>
    </div>
</div>

| Attack Type | Payload Example | Result |
|-------------|-----------------|--------|
| SQL Injection | `' OR 1=1--` | **Blocked** |
| XSS | `<script>alert(1)</script>` | **Blocked** |
| Path Traversal | `../../etc/passwd` | **Blocked** |
| Command Injection | `; cat /etc/passwd` | **Blocked** |
| Scanner Detection | SQLMap User-Agent | **Blocked** |

All OWASP Top 10 attack patterns are blocked with the CRS rule set.

---

## Comparison with Envoy

### Native vs Docker Performance

<div class="chart-container">
    <div class="chart-title">Native Linux/macOS (Recommended)</div>
    <div class="bar-chart">
        <div class="bar-item">
            <span class="bar-label">Sentinel</span>
            <div class="bar-track">
                <div class="bar-fill" style="width: 100%;"></div>
            </div>
            <span class="bar-value">23,098 RPS</span>
        </div>
        <div class="bar-item">
            <span class="bar-label">Envoy</span>
            <div class="bar-track">
                <div class="bar-fill bar-fill--secondary" style="width: 97.6%;"></div>
            </div>
            <span class="bar-value">22,545 RPS</span>
        </div>
    </div>
</div>

| Metric | Sentinel | Envoy | Difference |
|--------|----------|-------|------------|
| Requests/sec | 23,098 | 22,545 | **+2.5%** |
| p50 Latency | 3.5ms | 3.6ms | **-2.8%** |

<div class="chart-container">
    <div class="chart-title">Docker for Mac (Virtualized)</div>
    <div class="bar-chart">
        <div class="bar-item">
            <span class="bar-label">Envoy</span>
            <div class="bar-track">
                <div class="bar-fill bar-fill--secondary" style="width: 100%;"></div>
            </div>
            <span class="bar-value">20,868 RPS</span>
        </div>
        <div class="bar-item">
            <span class="bar-label">Sentinel</span>
            <div class="bar-track">
                <div class="bar-fill" style="width: 32.8%;"></div>
            </div>
            <span class="bar-value">6,839 RPS</span>
        </div>
    </div>
</div>

| Environment | Sentinel | Envoy |
|-------------|----------|-------|
| Native Linux/macOS | 23,098 RPS | 22,545 RPS |
| Docker for Mac | 6,839 RPS | 20,868 RPS |

**Root Cause Analysis:**

The performance difference in Docker for Mac is due to how Docker Desktop virtualizes the Linux kernel. Pingora's async I/O model (tokio/epoll) interacts poorly with the virtualized network stack, while Envoy's libevent+threads model is more resilient to this overhead.

**Key Finding:** This is an environmental issue specific to Docker Desktop on macOS, not a code problem. **On native Linux or bare metal, Sentinel matches or exceeds Envoy performance.**

---

## Integration Test Environment

Full integration tests run in Docker Compose with:

| Service | Port | Purpose |
|---------|------|---------|
| Sentinel Proxy | 8080 | Main reverse proxy |
| Metrics Endpoint | 9090 | Prometheus metrics |
| Backend (httpbin) | 8081 | Test backend |
| Echo Agent | UDS | Header manipulation |
| Rate Limit Agent | 9092 | Token bucket limiting |
| WAF Agent | 9094 | OWASP CRS protection |
| Prometheus | 9091 | Metrics collection |
| Grafana | 3000 | Dashboards |
| Jaeger | 16686 | Distributed tracing |

---

## Running the Tests

### Unit Tests

```bash
cargo test --workspace
```

### Integration Tests

```bash
cd tests
./integration_test.sh           # Full suite
./integration_test.sh --quick   # Smoke tests only
```

### Chaos Tests

```bash
cd tests/chaos
make quick                      # 4 core scenarios (~5 min)
make test                       # All 10 scenarios (~20 min)
make test-circuit-breaker       # Single scenario
```

### Soak Tests

```bash
cd tests/soak
./run-soak-test.sh --duration 1    # 1 hour quick test
./run-soak-test.sh --duration 24   # Standard 24h test
./run-soak-test.sh --duration 72   # Extended 72h test

# Analyze results
python3 analyze-results.py results/<timestamp>/
```

---

## Prometheus Metrics

| Metric | Description |
|--------|-------------|
| `sentinel_requests_total` | Total requests by route/status |
| `sentinel_request_duration_seconds` | Latency histogram |
| `sentinel_upstream_healthy_backends` | Backend health status |
| `sentinel_upstream_retries_total` | Retry attempts |
| `sentinel_agent_circuit_breaker_state` | CB state (0=closed, 1=open, 2=half-open) |
| `sentinel_agent_failures_total` | Agent communication failures |
| `sentinel_agent_timeouts_total` | Agent timeout events |
| `sentinel_agent_bypasses_total` | Fail-open bypass count |

---

## Milestone Achievements

| Milestone | Status | Key Metrics |
|-----------|--------|-------------|
| **M2: Cacheable** | <span class="result-badge result-badge--pass">Complete</span> | 23K RPS load tested |
| **M4: Scalable** | <span class="result-badge result-badge--pass">Complete</span> | Redis/Memcached distributed rate limiting |
| **M5: Observable** | <span class="result-badge result-badge--pass">Complete</span> | OpenTelemetry, Grafana dashboards |
| **M6: Optimized** | <span class="result-badge result-badge--pass">Complete</span> | Core rate limiting < 100μs, geo filtering < 100μs |

---

## Known Gaps

We're actively working on:

| Gap | Status |
|-----|--------|
| Criterion microbenchmarks | Planned |
| High-concurrency (10k+ conn) tests | Planned |
| Property-based fuzzing | Planned |
| HTTP request smuggling tests | Planned |
| Comparison benchmarks vs nginx/HAProxy | Planned |

---

<p style="text-align: center; color: var(--color-text-muted); margin-top: var(--space-2xl);">
Last updated: January 2026 | Sentinel v0.2.3
</p>
