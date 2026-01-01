+++
title = "AI Gateway"
description = "Security controls for AI API requests including prompt injection detection, PII filtering, rate limiting, and schema validation."
template = "agent.html"

[taxonomies]
tags = ["ai", "llm", "gateway", "security", "rate-limiting"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Beta"
version = "0.1.0"
license = "MIT"
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

AI Gateway provides comprehensive security controls for AI API traffic (OpenAI, Anthropic, Azure OpenAI). Detect prompt injections, filter PII, enforce rate limits, and validate request schemas at the edge.

## Features

### Security Controls

- **Prompt Injection Detection**: Block attempts to override system prompts or manipulate AI behavior
- **Jailbreak Detection**: Detect DAN, developer mode, and other bypass attempts
- **PII Detection**: Detect emails, SSNs, phone numbers, credit cards, IP addresses
  - Configurable actions: block, redact, or log
- **Schema Validation**: Validate requests against OpenAI and Anthropic JSON schemas

### Usage Control

- **Rate Limiting**: Per-client limits for requests and tokens per minute
- **Token Limits**: Enforce maximum tokens per request
- **Cost Estimation**: Add headers with estimated cost based on model pricing
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
  --max-tokens 4000 \
  --pii-action block \
  --rate-limit-requests 60 \
  --rate-limit-tokens 100000 \
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
| `--max-tokens` | `MAX_TOKENS` | Max tokens per request | `0` (unlimited) |
| `--rate-limit-requests` | `RATE_LIMIT_REQUESTS` | Requests per minute per client | `0` (unlimited) |
| `--rate-limit-tokens` | `RATE_LIMIT_TOKENS` | Tokens per minute per client | `0` (unlimited) |
| `--add-cost-headers` | `ADD_COST_HEADERS` | Add cost estimation headers | `true` |
| `--block-mode` | `BLOCK_MODE` | Block or detect-only | `true` |
| `--fail-open` | `FAIL_OPEN` | Allow requests on processing errors | `false` |
| `--verbose`, `-v` | `VERBOSE` | Enable debug logging | `false` |

### Sentinel Configuration

```kdl
agent "ai-gateway" {
    socket "/tmp/sentinel-ai-gateway.sock"
    timeout 5s
    events ["request_headers" "request_body_chunk"]
}

route {
    match { hosts ["api.openai.com" "api.anthropic.com"] }
    agents ["ai-gateway"]
    upstream "ai-backend"
}
```

## Response Headers

| Header | Description |
|--------|-------------|
| `X-AI-Gateway-Provider` | Detected provider (openai, anthropic, azure) |
| `X-AI-Gateway-Model` | Model from request |
| `X-AI-Gateway-Tokens-Estimated` | Estimated token count |
| `X-AI-Gateway-Cost-Estimated` | Estimated cost in USD |
| `X-AI-Gateway-PII-Detected` | Comma-separated PII types found |
| `X-AI-Gateway-Schema-Valid` | Schema validation result |
| `X-AI-Gateway-Blocked` | `true` if request was blocked |
| `X-AI-Gateway-Blocked-Reason` | Reason for blocking |
| `X-RateLimit-Limit-Requests` | Request limit per minute |
| `X-RateLimit-Remaining-Requests` | Requests remaining in window |
| `X-RateLimit-Reset` | Seconds until window resets |
| `Retry-After` | Seconds to wait (when rate limited) |

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

### Rate Limited Response

```http
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit-Requests: 60
X-RateLimit-Remaining-Requests: 0
X-RateLimit-Reset: 45
Retry-After: 45
```

## Library Usage

```rust
use sentinel_agent_ai_gateway::{AiGatewayAgent, AiGatewayConfig, PiiAction};
use sentinel_agent_protocol::AgentServer;

let config = AiGatewayConfig {
    prompt_injection_enabled: true,
    pii_detection_enabled: true,
    pii_action: PiiAction::Block,
    jailbreak_detection_enabled: true,
    schema_validation_enabled: true,
    rate_limit_requests: 60,
    rate_limit_tokens: 100000,
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
| **Rate Limiter** | Additional rate limiting layers |
