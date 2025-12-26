+++
title = "Adaptive Shield"
description = "Self-learning threat detection that builds custom security rules from your traffic patterns using edge ML inference."
template = "agent.html"

[taxonomies]
tags = ["ai", "ml", "security", "adaptive", "unique"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Planned"
version = ""
license = "Apache-2.0"
repo = ""
homepage = "https://sentinel.raskell.io/agents/adaptive-shield/"
protocol_version = "0.1"

# Installation methods
crate_name = ""
docker_image = ""

# Compatibility
min_sentinel_version = ""
+++

## Overview

Adaptive Shield brings **edge ML inference** to your reverse proxy. Instead of relying on static rules that attackers can study and evade, it learns what "normal" looks like for *your* application and detects anomalies in real-time.

No cloud dependencies. No data leaving your infrastructure. Just lightweight models running at wire speed.

## Why This Matters

Static WAF rules are a losing game:
- Attackers study public rule sets and craft bypasses
- Generic rules cause false positives on legitimate traffic
- New attack patterns slip through until rules are updated

Adaptive Shield flips the script:
- Learns your application's unique traffic patterns
- Detects *deviations from normal*, not just known attacks
- Continuously adapts as your application evolves

## Planned Features

- **Edge Inference**: Sub-millisecond predictions using optimized ONNX models
- **Baseline Learning**: Automatically builds traffic profiles per endpoint
- **Anomaly Detection**: Statistical and ML-based outlier detection
- **Auto-Generated Rules**: Converts learned patterns into exportable rules
- **Feedback Loop**: Mark false positives to improve model accuracy
- **Zero External Calls**: All inference runs locally at the edge

## Detection Capabilities

| Category | What It Learns |
|----------|---------------|
| **Request Shape** | Normal parameter counts, sizes, types per endpoint |
| **Timing Patterns** | Expected request rates, time-of-day patterns |
| **Behavioral Sequences** | Typical user journeys, API call ordering |
| **Content Profiles** | Expected payload structures, character distributions |
| **Client Fingerprints** | Normal device/browser combinations |

## Architecture

```
                    ┌─────────────────────────┐
                    │   Adaptive Shield       │
                    │  ┌─────────────────┐    │
Request ──────────► │  │  ONNX Runtime   │    │ ──► Normal
                    │  │  (Edge ML)      │    │
                    │  └────────┬────────┘    │
                    │           │             │
                    │  ┌────────▼────────┐    │
                    │  │ Traffic Profile │    │ ──► Anomaly
                    │  │   (Learned)     │    │     (Block/Alert)
                    │  └─────────────────┘    │
                    └─────────────────────────┘
```

## Learning Modes

1. **Passive Learning**: Observes traffic without blocking, builds baseline
2. **Shadow Mode**: Logs what *would* be blocked, validates accuracy
3. **Active Protection**: Blocks anomalies with learned confidence thresholds

## Configuration (Preview)

```kdl
agent "adaptive-shield" {
    type "adaptive_shield"
    transport "unix_socket" {
        path "/var/run/sentinel/adaptive-shield.sock"
    }
    events ["request_headers" "request_body"]
    timeout-ms 5  // Edge inference is fast
    failure-mode "open"

    // Learning configuration
    learning {
        mode "active"  // passive | shadow | active
        baseline-period-hours 168  // 1 week to learn
        model-update-interval-hours 24
    }

    // Anomaly thresholds
    detection {
        min-confidence 0.85
        block-threshold 0.95
        alert-threshold 0.80
    }

    // Model storage
    model-path "/var/lib/sentinel/adaptive-shield/"

    // Endpoint-specific overrides
    endpoints {
        "/api/upload" {
            // Higher variance expected for file uploads
            sensitivity 0.7
        }
        "/api/auth/login" {
            // Strict protection for auth
            sensitivity 0.95
        }
    }
}
```

## Status

This agent is currently in the planning phase. Follow the [GitHub repository](https://github.com/raskell-io/sentinel) for updates.
