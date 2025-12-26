+++
title = "AI Gateway"
description = "Unified control plane for LLM traffic with cost management, intelligent routing, semantic caching, and prompt security."
template = "agent.html"

[taxonomies]
tags = ["ai", "llm", "gateway", "cost-control", "caching"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Planned"
version = ""
license = "Apache-2.0"
repo = ""
homepage = "https://sentinel.raskell.io/agents/ai-gateway/"
protocol_version = "0.1"

# Installation methods
crate_name = ""
docker_image = ""

# Compatibility
min_sentinel_version = ""
+++

## Overview

AI Gateway transforms Sentinel into a comprehensive control plane for LLM and AI API traffic. Manage costs, enforce security policies, cache responses, and route intelligently across multiple providers—all at the edge.

## Why an AI Gateway?

LLM APIs are expensive, unpredictable, and security-sensitive:

- **Costs spiral quickly**: A single runaway script can burn through thousands in API credits
- **Providers go down**: OpenAI outages shouldn't mean your app goes down
- **Security is critical**: Prompt injection, data leakage, and jailbreaks are real threats
- **Observability is lacking**: Hard to track usage, costs, and quality across providers

AI Gateway solves all of this at the proxy layer.

## Planned Features

### Cost & Usage Control

- **Token Counting**: Pre-flight token estimation before requests hit the provider
- **Budget Enforcement**: Per-user, per-team, and per-org spending caps
- **Rate Limiting**: Requests per minute, tokens per hour, concurrent calls
- **Quota Management**: Monthly allowances with configurable overage policies
- **Cost Attribution**: Track spending by customer, endpoint, or application

### Intelligent Routing

- **Multi-Provider Support**: OpenAI, Anthropic, Google, Cohere, Azure, local (Ollama)
- **Automatic Failover**: Provider down? Seamlessly route to backup
- **Cost-Optimized Routing**: Automatically select the cheapest capable model
- **Latency-Based Routing**: Route to the fastest responding provider
- **Complexity-Based Routing**: Simple queries → cheap models, complex → powerful
- **A/B Testing**: Compare model quality on live traffic with holdout groups

### Caching & Optimization

- **Semantic Cache**: Similar prompts return cached responses (embedding similarity)
- **Exact Match Cache**: Identical requests served instantly
- **Streaming Cache**: Cache and replay streaming responses
- **Request Deduplication**: Collapse identical concurrent requests into one

### Security & Compliance

- **Prompt Injection Detection**: Block attempts to hijack system prompts
- **PII Redaction**: Automatically strip sensitive data before sending to LLMs
- **Output Filtering**: Block harmful, biased, or policy-violating responses
- **Jailbreak Prevention**: Detect prompt manipulation and refuse-to-answer bypasses
- **Topic Blocking**: Enforce content policies on inputs and outputs
- **Audit Logging**: Complete request/response logging for compliance

### Transformation & Normalization

- **Unified API**: Single interface across all providers
- **Prompt Templates**: Inject system prompts, guardrails, output formatting
- **Response Schemas**: Enforce JSON Schema on structured outputs
- **Provider Translation**: Automatic format conversion between provider APIs

## Architecture

```
                         ┌─────────────────────────────────────┐
                         │           AI Gateway Agent          │
                         │                                     │
   ┌─────────┐          │  ┌─────────┐  ┌─────────────────┐   │
   │  App    │──────────┼─►│ Security │─►│ Router/Balancer │   │
   └─────────┘          │  │  Layer   │  └────────┬────────┘   │
                         │  └─────────┘           │             │
                         │                        ▼             │
                         │  ┌─────────────────────────────────┐ │
                         │  │         Provider Pool           │ │
                         │  │  ┌────────┐ ┌────────┐ ┌──────┐ │ │
                         │  │  │ OpenAI │ │Anthropic│ │Ollama│ │ │
                         │  │  └────────┘ └────────┘ └──────┘ │ │
                         │  └─────────────────────────────────┘ │
                         │                                     │
                         │  ┌──────────┐  ┌───────────────┐    │
                         │  │  Cache   │  │ Cost Tracker  │    │
                         │  │(Semantic)│  │  & Quotas     │    │
                         │  └──────────┘  └───────────────┘    │
                         └─────────────────────────────────────┘
```

## Configuration (Preview)

```kdl
agent "ai-gateway" {
    type "ai_gateway"
    transport "unix_socket" {
        path "/var/run/sentinel/ai-gateway.sock"
    }
    events ["request_headers" "request_body" "response_body"]
    timeout-ms 120000
    failure-mode "closed"

    // Provider backends
    providers {
        provider "openai" {
            base-url "https://api.openai.com/v1"
            api-key-env "OPENAI_API_KEY"
            models ["gpt-4o" "gpt-4o-mini"]
            priority 1
        }
        provider "anthropic" {
            base-url "https://api.anthropic.com/v1"
            api-key-env "ANTHROPIC_API_KEY"
            models ["claude-sonnet-4-20250514" "claude-haiku"]
            priority 2
        }
        provider "ollama" {
            base-url "http://localhost:11434"
            models ["llama3.2" "mistral"]
            priority 3  // Local fallback
        }
    }

    // Routing strategy
    routing {
        strategy "cost-optimized"
        fallback-chain ["openai" "anthropic" "ollama"]
        health-check-interval-secs 30
    }

    // Cost controls
    budget {
        global-limit-usd 10000.0
        default-user-limit-usd 100.0
        period "monthly"
        alert-threshold 0.8
        hard-limit true
        overage-action "block"  // or "alert" | "throttle"
    }

    // Rate limits
    rate-limits {
        requests-per-minute 60
        tokens-per-minute 100000
        concurrent-requests 10
    }

    // Security
    security {
        prompt-injection-detection true
        pii-redaction true
        pii-fields ["email" "phone" "ssn" "credit_card"]
        output-filtering true
        blocked-topics ["illegal_activity" "self_harm"]
        max-input-tokens 8000
        max-output-tokens 4000
    }

    // Caching
    cache {
        enabled true
        type "semantic"
        embedding-model "text-embedding-3-small"
        similarity-threshold 0.92
        ttl-secs 3600
        max-entries 10000
    }

    // Observability
    metrics {
        export-prometheus true
        track-costs true
        track-latency true
        track-tokens true
    }
}
```

## Integration with Other Agents

AI Gateway composes beautifully with other Sentinel agents:

| Agent | Integration |
|-------|-------------|
| **Request Hold** | Pause high-cost requests for human approval |
| **LLM Guardian** | Deep analysis of suspicious prompts |
| **Telemetry** | Stream AI usage data to analytics pipelines |
| **Auth** | Per-user API keys and quotas |
| **Rate Limiter** | Additional rate limiting layers |

## Metrics & Observability

```
# Prometheus metrics exposed
sentinel_ai_gateway_requests_total{provider="openai", model="gpt-4o", status="success"}
sentinel_ai_gateway_tokens_total{provider="openai", direction="input"}
sentinel_ai_gateway_cost_usd_total{provider="openai", user="alice"}
sentinel_ai_gateway_latency_seconds{provider="openai", quantile="0.99"}
sentinel_ai_gateway_cache_hits_total{type="semantic"}
sentinel_ai_gateway_security_blocks_total{reason="prompt_injection"}
```

## Status

This agent is currently in the planning phase. Follow the [GitHub repository](https://github.com/raskell-io/sentinel) for updates.
