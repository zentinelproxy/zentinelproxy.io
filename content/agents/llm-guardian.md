+++
title = "LLM Guardian"
description = "AI-powered threat analysis using LLM backends to make intelligent decisions on blocking, delaying, or allowing traffic."
template = "agent.html"

[taxonomies]
tags = ["ai", "security", "llm", "smart-filtering"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Planned"
version = ""
license = "Apache-2.0"
repo = ""
homepage = "https://sentinel.raskell.io/agents/llm-guardian/"
protocol_version = "0.1"

# Installation methods
crate_name = ""
docker_image = ""

# Compatibility
min_sentinel_version = ""
+++

## Overview

LLM Guardian leverages large language models to analyze request patterns and make intelligent security decisions in real-time. Unlike rule-based systems, it understands context and can detect novel attack patterns that traditional WAFs miss.

## Planned Features

- **Contextual Analysis**: Understands request intent, not just patterns
- **Adaptive Blocking**: Learns from traffic patterns to reduce false positives
- **Delayed Execution**: Can "hold" suspicious requests for deeper analysis using Sentinel's sleepable architecture
- **Multi-Model Support**: Connect to OpenAI, Anthropic, local models (Ollama), or custom endpoints
- **Explainable Decisions**: Provides reasoning for each block/allow decision
- **Cost-Aware**: Configurable analysis depth based on request risk score

## Use Cases

- **Zero-Day Detection**: Catch novel attacks that don't match known signatures
- **Semantic Analysis**: Understand if a request is genuinely malicious or a false positive
- **Prompt Injection Defense**: Protect AI-powered backends from prompt injection attacks
- **Fraud Detection**: Analyze user behavior patterns for anomalies

## Architecture

```
Request → Sentinel → LLM Guardian → LLM Backend
                          ↓              ↓
                    Risk Score    Context Analysis
                          ↓
                  Block / Allow / Delay
```

## Configuration (Preview)

```kdl
agent "llm-guardian" {
    type "llm_guardian"
    transport "unix_socket" {
        path "/var/run/sentinel/llm-guardian.sock"
    }
    events ["request_headers" "request_body"]
    timeout-ms 2000
    failure-mode "open"

    // LLM backend configuration
    backend "anthropic" {
        model "claude-3-haiku"
        api-key-env "ANTHROPIC_API_KEY"
    }

    // Analysis settings
    analysis {
        min-risk-score 0.7  // Only analyze high-risk requests
        cache-ttl-secs 300  // Cache similar request decisions
    }
}
```

## Status

This agent is currently in the planning phase. Follow the [GitHub repository](https://github.com/raskell-io/sentinel) for updates.
