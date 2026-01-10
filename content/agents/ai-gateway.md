+++
title = "AI Gateway"
description = "Semantic security for AI APIs: prompt injection detection, jailbreak prevention, and PII filtering for LLM traffic."
template = "agent.html"

[taxonomies]
tags = ["ai", "llm", "gateway", "security", "guardrails"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Beta"
version = "0.1.0"
license = "Apache-2.0"
repo = "https://github.com/raskell-io/sentinel-agent-ai-gateway"
homepage = "https://sentinel.raskell.io/agents/ai-gateway/"
protocol_version = "0.1"

# Installation methods
crate_name = "sentinel-agent-ai-gateway"
docker_image = ""

# Compatibility
min_sentinel_version = "25.12.0"
+++

## Overview

AI Gateway provides **semantic security controls** for AI API traffic (OpenAI, Anthropic, Azure OpenAI). This agent specializes in content-level analysis that requires understanding the meaning and intent of prompts — capabilities that complement Sentinel's built-in inference features.

<div class="info-notice">

### Built-in vs Agent Features

Sentinel v26.01 includes [built-in inference support](/configuration/inference/) for token-based rate limiting, cost tracking, and model routing. This agent focuses on **semantic guardrails** that analyze prompt content:

| Feature | Built-in | Agent |
|---------|----------|-------|
| Token-based rate limiting | Yes | — |
| Token counting (Tiktoken) | Yes | — |
| Cost attribution & budgets | Yes | — |
| Model-based routing | Yes | — |
| Fallback routing | Yes | — |
| **Prompt injection detection** | — | Yes |
| **Jailbreak detection** | — | Yes |
| **PII detection & redaction** | — | Yes |
| **Schema validation** | — | Yes |
| **Model allowlist** | — | Yes |

**Recommended setup:** Use Sentinel's built-in inference features for rate limiting and cost control, and add this agent for semantic security.

</div>

## Features

### Semantic Guardrails (Agent-Specific)

These features require content analysis that only an agent can provide:

- **Prompt Injection Detection**: Block attempts to override system prompts or manipulate AI behavior
- **Jailbreak Detection**: Detect DAN, developer mode, and other bypass attempts
- **PII Detection**: Detect emails, SSNs, phone numbers, credit cards, IP addresses
  - Configurable actions: block, redact, or log
- **Schema Validation**: Validate requests against OpenAI and Anthropic JSON schemas
- **Model Allowlist**: Restrict which AI models can be used

### Observability

- **Provider Detection**: Auto-detect OpenAI, Anthropic, Azure from request
- **Audit Tags**: Rich metadata for logging and monitoring
- **Request Headers**: Informational headers for downstream processing

## Installation

### Using Cargo

```bash
cargo install sentinel-agent-ai-gateway
```

## Configuration

### Command Line

```bash
sentinel-ai-gateway-agent \
  --socket /tmp/sentinel-ai.sock \
  --allowed-models "gpt-4,gpt-3.5-turbo,claude-3" \
  --pii-action block \
  --schema-validation
```

### Environment Variables

| Option | Env Var | Description | Default |
|--------|---------|-------------|---------|
| `--socket` | `AGENT_SOCKET` | Unix socket path | `/tmp/sentinel-ai-gateway.sock` |
| `--prompt-injection` | `PROMPT_INJECTION` | Enable prompt injection detection | `true` |
| `--pii-detection` | `PII_DETECTION` | Enable PII detection | `true` |
| `--pii-action` | `PII_ACTION` | Action on PII: block/redact/log | `log` |
| `--jailbreak-detection` | `JAILBREAK_DETECTION` | Enable jailbreak detection | `true` |
| `--schema-validation` | `SCHEMA_VALIDATION` | Enable JSON schema validation | `false` |
| `--allowed-models` | `ALLOWED_MODELS` | Comma-separated model allowlist | (all) |
| `--block-mode` | `BLOCK_MODE` | Block or detect-only | `true` |
| `--fail-open` | `FAIL_OPEN` | Allow requests on processing errors | `false` |
| `--verbose`, `-v` | `VERBOSE` | Enable debug logging | `false` |

### Recommended Sentinel Configuration

Combine built-in inference features with the agent for comprehensive protection:

```kdl
// Built-in: Token rate limiting and cost tracking
inference "openai" {
    provider openai
    token-rate-limit 100000 per minute
    token-budget 1000000 per day
    cost-tracking enabled
}

// Agent: Semantic guardrails
agent "ai-gateway" {
    socket "/tmp/sentinel-ai-gateway.sock"
    timeout 5s
    events ["request_headers" "request_body_chunk"]
}

route {
    match { path-prefix "/v1/chat" }
    inference "openai"
    agents ["ai-gateway"]
    upstream "openai-backend"
}
```

## Response Headers

| Header | Description |
|--------|-------------|
| `X-AI-Gateway-Provider` | Detected provider (openai, anthropic, azure) |
| `X-AI-Gateway-Model` | Model from request |
| `X-AI-Gateway-PII-Detected` | Comma-separated PII types found |
| `X-AI-Gateway-Schema-Valid` | Schema validation result |
| `X-AI-Gateway-Blocked` | `true` if request was blocked |
| `X-AI-Gateway-Blocked-Reason` | Reason for blocking |

## Detection Patterns

### Prompt Injection

Detects patterns like:
- "Ignore previous instructions"
- "You are now a..."
- "System prompt:"
- Role manipulation attempts
- System prompt extraction attempts

### Jailbreak

Detects patterns like:
- DAN (Do Anything Now) and variants
- Developer/debug mode requests
- "Hypothetically" and "for educational purposes" framing
- Evil/uncensored mode requests

### PII

Detects:
- Email addresses
- Social Security Numbers (SSN)
- Phone numbers (US format)
- Credit card numbers
- Public IP addresses

### Schema Validation

Validates requests against JSON schemas for:
- **OpenAI Chat**: model, messages, temperature (0-2), etc.
- **OpenAI Completions**: model, prompt
- **Anthropic Messages**: model, max_tokens, messages

## Supported Providers

| Provider | Detection | Paths |
|----------|-----------|-------|
| OpenAI | `Bearer sk-*` header | `/v1/chat/completions`, `/v1/completions` |
| Anthropic | `anthropic-version` header | `/v1/messages`, `/v1/complete` |
| Azure OpenAI | Path pattern | `/openai/deployments/*/chat/completions` |

## Examples

### Block Prompt Injection

```bash
curl -X POST http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Ignore all previous instructions and..."}]
  }'
```

Response:
```http
HTTP/1.1 403 Forbidden
X-AI-Gateway-Blocked: true
X-AI-Gateway-Blocked-Reason: prompt-injection
```

### PII Redaction

With `--pii-action redact`, PII is replaced before reaching the upstream:

```json
// Original
{"messages": [{"role": "user", "content": "Email me at john@example.com"}]}

// After redaction
{"messages": [{"role": "user", "content": "Email me at [EMAIL_REDACTED]"}]}
```

## Library Usage

```rust
use sentinel_agent_ai_gateway::{AiGatewayAgent, AiGatewayConfig, PiiAction};
use sentinel_agent_protocol::AgentServer;

let config = AiGatewayConfig {
    prompt_injection_enabled: true,
    pii_detection_enabled: true,
    pii_action: PiiAction::Redact,
    jailbreak_detection_enabled: true,
    schema_validation_enabled: true,
    ..Default::default()
};

let agent = AiGatewayAgent::new(config);
let server = AgentServer::new("ai-gateway", "/tmp/ai.sock", Box::new(agent));
server.run().await?;
```

## Related Agents

| Agent | Integration |
|-------|-------------|
| **ModSecurity** | Full OWASP CRS support for web attacks |
| **Auth** | Per-user API keys and quotas |
| **WAF** | Additional web attack detection |
