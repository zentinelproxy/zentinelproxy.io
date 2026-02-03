+++
title = "AI Gateway"
weight = 20
description = "Semantic security for AI APIs: prompt injection detection, jailbreak prevention, and PII filtering for LLM traffic."
template = "agent.html"

[taxonomies]
tags = ["ai", "llm", "gateway", "security", "guardrails"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Stable"
version = "0.2.0"
license = "Apache-2.0"
repo = "https://github.com/raskell-io/sentinel-agent-ai-gateway"
homepage = "https://sentinel.raskell.io/agents/ai-gateway/"
protocol_version = "v2"

# Installation methods
crate_name = "sentinel-agent-ai-gateway"
docker_image = ""

# Compatibility
min_sentinel_version = "26.01.0"
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
| **Input PII detection & redaction** | — | Yes |
| **Output PII detection** | — | Yes |
| **Toxicity detection** | — | Yes |
| **Topic guardrails** | — | Yes |
| **Schema validation** | — | Yes |
| **Model allowlist** | — | Yes |

**Recommended setup:** Use Sentinel's built-in inference features for rate limiting and cost control, and add this agent for semantic security.

</div>

## Protocol v2 Features

As of v0.2.0, the AI Gateway agent supports protocol v2 with:

- **Capability negotiation**: Reports supported features during handshake
- **Health reporting**: Exposes health status with detection metrics
- **Metrics export**: Counter metrics for detections (prompt injection, jailbreak, PII)
- **gRPC transport**: Optional high-performance gRPC transport via `--grpc-address`
- **Lifecycle hooks**: Graceful shutdown and drain handling

## Features

### Input Guardrails

Analyze and filter prompts before they reach the LLM:

- **Prompt Injection Detection**: Block attempts to override system prompts or manipulate AI behavior
- **Jailbreak Detection**: Detect DAN, developer mode, and other bypass attempts
- **Input PII Detection**: Detect emails, SSNs, phone numbers, credit cards, IP addresses
  - Configurable actions: block, redact, or log
- **Schema Validation**: Validate requests against OpenAI and Anthropic JSON schemas
- **Model Allowlist**: Restrict which AI models can be used

### Output Guardrails

Analyze and filter LLM responses before they reach the client:

- **Response PII Detection**: Detect PII leaked in LLM responses
  - Configurable actions: block, redact, or log
  - Prevents models from exposing training data or user information
- **Toxicity Detection**: Block harmful, offensive, or inappropriate content
  - Hate speech, harassment, violence, self-harm
  - Configurable severity threshold
- **Topic Guardrails**: Restrict responses to allowed topics
  - Block off-topic responses
  - Enforce domain-specific constraints (e.g., only discuss products, not competitors)
- **Hallucination Markers**: Flag responses with low-confidence indicators
  - Detect hedging language ("I think", "possibly", "might be")
  - Add confidence headers for downstream processing
- **Response Schema Validation**: Validate structured outputs (JSON mode)
  - Ensure responses match expected schema
  - Block malformed structured responses

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
  --output-pii-action redact \
  --toxicity-detection \
  --schema-validation
```

### Environment Variables

#### General Options

| Option | Env Var | Description | Default |
|--------|---------|-------------|---------|
| `--socket` | `AGENT_SOCKET` | Unix socket path | `/tmp/sentinel-ai-gateway.sock` |
| `--grpc-address` | `GRPC_ADDRESS` | gRPC listen address (e.g., `0.0.0.0:50051`) | - |
| `--allowed-models` | `ALLOWED_MODELS` | Comma-separated model allowlist | (all) |
| `--block-mode` | `BLOCK_MODE` | Block or detect-only | `true` |
| `--fail-open` | `FAIL_OPEN` | Allow requests on processing errors | `false` |
| `--verbose`, `-v` | `VERBOSE` | Enable debug logging | `false` |

#### Input Guardrails

| Option | Env Var | Description | Default |
|--------|---------|-------------|---------|
| `--prompt-injection` | `PROMPT_INJECTION` | Enable prompt injection detection | `true` |
| `--jailbreak-detection` | `JAILBREAK_DETECTION` | Enable jailbreak detection | `true` |
| `--pii-detection` | `PII_DETECTION` | Enable input PII detection | `true` |
| `--pii-action` | `PII_ACTION` | Action on input PII: block/redact/log | `log` |
| `--schema-validation` | `SCHEMA_VALIDATION` | Enable request schema validation | `false` |

#### Output Guardrails

| Option | Env Var | Description | Default |
|--------|---------|-------------|---------|
| `--output-pii-detection` | `OUTPUT_PII_DETECTION` | Enable response PII detection | `false` |
| `--output-pii-action` | `OUTPUT_PII_ACTION` | Action on output PII: block/redact/log | `log` |
| `--toxicity-detection` | `TOXICITY_DETECTION` | Enable toxicity detection | `false` |
| `--toxicity-threshold` | `TOXICITY_THRESHOLD` | Toxicity score threshold (0.0-1.0) | `0.7` |
| `--toxicity-categories` | `TOXICITY_CATEGORIES` | Categories to detect (comma-separated) | `hate,harassment,violence,self-harm` |
| `--topic-guardrails` | `TOPIC_GUARDRAILS` | Enable topic restriction | `false` |
| `--allowed-topics` | `ALLOWED_TOPICS` | Allowed topic keywords (comma-separated) | (all) |
| `--blocked-topics` | `BLOCKED_TOPICS` | Blocked topic keywords (comma-separated) | (none) |
| `--hallucination-detection` | `HALLUCINATION_DETECTION` | Enable hallucination markers | `false` |
| `--output-schema` | `OUTPUT_SCHEMA` | Path to JSON Schema for response validation | - |

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

// Agent: Input and output guardrails
agent "ai-gateway" {
    socket "/tmp/sentinel-ai-gateway.sock"
    timeout 5s
    // Include response events for output guardrails
    events ["request_headers" "request_body_chunk" "response_headers" "response_body_chunk"]
}

route {
    match { path-prefix "/v1/chat" }
    inference "openai"
    agents ["ai-gateway"]
    upstream "openai-backend"
}
```

> **Note:** Output guardrails require `response_headers` and `response_body_chunk` events to inspect LLM responses.

## Response Headers

### Input Guardrail Headers

| Header | Description |
|--------|-------------|
| `X-AI-Gateway-Provider` | Detected provider (openai, anthropic, azure) |
| `X-AI-Gateway-Model` | Model from request |
| `X-AI-Gateway-Input-PII-Detected` | Comma-separated PII types found in prompt |
| `X-AI-Gateway-Schema-Valid` | Request schema validation result |
| `X-AI-Gateway-Blocked` | `true` if request was blocked |
| `X-AI-Gateway-Blocked-Reason` | Reason for blocking |

### Output Guardrail Headers

| Header | Description |
|--------|-------------|
| `X-AI-Gateway-Output-PII-Detected` | Comma-separated PII types found in response |
| `X-AI-Gateway-Output-PII-Redacted` | `true` if response PII was redacted |
| `X-AI-Gateway-Toxicity-Score` | Toxicity score (0.0-1.0) if detection enabled |
| `X-AI-Gateway-Toxicity-Categories` | Detected toxicity categories |
| `X-AI-Gateway-Topic-Violation` | `true` if topic guardrail triggered |
| `X-AI-Gateway-Hallucination-Markers` | Count of hedging phrases detected |
| `X-AI-Gateway-Output-Schema-Valid` | Response schema validation result |

## Detection Patterns

### Input Detection

#### Prompt Injection

Detects patterns like:
- "Ignore previous instructions"
- "You are now a..."
- "System prompt:"
- Role manipulation attempts
- System prompt extraction attempts

#### Jailbreak

Detects patterns like:
- DAN (Do Anything Now) and variants
- Developer/debug mode requests
- "Hypothetically" and "for educational purposes" framing
- Evil/uncensored mode requests

### PII Detection (Input & Output)

Detects in both prompts and responses:
- Email addresses
- Social Security Numbers (SSN)
- Phone numbers (US format)
- Credit card numbers
- Public IP addresses
- API keys and secrets (common patterns)

### Output Detection

#### Toxicity Categories

| Category | Examples |
|----------|----------|
| `hate` | Slurs, discriminatory language, dehumanization |
| `harassment` | Threats, bullying, targeted attacks |
| `violence` | Graphic violence, instructions for harm |
| `self-harm` | Suicide, self-injury encouragement |
| `sexual` | Explicit sexual content |
| `dangerous` | Instructions for illegal activities |

#### Hallucination Markers

Detects hedging and uncertainty phrases:
- "I think", "I believe", "probably"
- "might be", "could be", "possibly"
- "I'm not sure", "I don't know exactly"
- "As far as I know", "To the best of my knowledge"

#### Topic Detection

Keyword and semantic matching for:
- Allowed topics (whitelist mode)
- Blocked topics (blacklist mode)
- Competitor mentions
- Off-brand content

### Schema Validation (Input & Output)

#### Input Schema
Validates requests against JSON schemas for:
- **OpenAI Chat**: model, messages, temperature (0-2), etc.
- **OpenAI Completions**: model, prompt
- **Anthropic Messages**: model, max_tokens, messages

#### Output Schema
Validates structured responses:
- JSON mode responses
- Function call outputs
- Tool use responses

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

### Input PII Redaction

With `--pii-action redact`, PII is replaced before reaching the upstream:

```json
// Original
{"messages": [{"role": "user", "content": "Email me at john@example.com"}]}

// After redaction
{"messages": [{"role": "user", "content": "Email me at [EMAIL_REDACTED]"}]}
```

### Output PII Redaction

With `--output-pii-action redact`, PII in LLM responses is redacted before reaching the client:

```json
// Original LLM response
{"choices": [{"message": {"content": "The customer's email is john.doe@company.com and SSN is 123-45-6789"}}]}

// After redaction
{"choices": [{"message": {"content": "The customer's email is [EMAIL_REDACTED] and SSN is [SSN_REDACTED]"}}]}
```

Response headers:
```http
X-AI-Gateway-Output-PII-Detected: email,ssn
X-AI-Gateway-Output-PII-Redacted: true
```

### Block Toxic Response

With `--toxicity-detection --toxicity-threshold 0.7`:

```http
HTTP/1.1 403 Forbidden
X-AI-Gateway-Blocked: true
X-AI-Gateway-Blocked-Reason: toxicity
X-AI-Gateway-Toxicity-Score: 0.85
X-AI-Gateway-Toxicity-Categories: harassment,hate
```

### Topic Guardrails

Block responses mentioning competitors with `--blocked-topics "competitor-a,competitor-b"`:

```http
HTTP/1.1 403 Forbidden
X-AI-Gateway-Blocked: true
X-AI-Gateway-Blocked-Reason: topic-violation
X-AI-Gateway-Topic-Violation: true
```

### Hallucination Detection

With `--hallucination-detection`, responses are annotated with confidence markers:

```http
HTTP/1.1 200 OK
X-AI-Gateway-Hallucination-Markers: 3
```

The response passes through but downstream systems can use the header to flag low-confidence responses for review.

### Full Protection Example

Run with comprehensive input and output guardrails:

```bash
sentinel-ai-gateway-agent \
  --socket /tmp/sentinel-ai.sock \
  --allowed-models "gpt-4,gpt-4-turbo,claude-3-opus" \
  --prompt-injection true \
  --jailbreak-detection true \
  --pii-action redact \
  --output-pii-detection true \
  --output-pii-action redact \
  --toxicity-detection true \
  --toxicity-threshold 0.7 \
  --toxicity-categories "hate,harassment,violence,self-harm,dangerous" \
  --topic-guardrails true \
  --blocked-topics "competitor-x,competitor-y,internal-project-name" \
  --hallucination-detection true
```

## Library Usage

```rust
use sentinel_agent_ai_gateway::{AiGatewayAgent, AiGatewayConfig, PiiAction, ToxicityCategory};
use sentinel_agent_protocol::AgentServer;

let config = AiGatewayConfig {
    // Input guardrails
    prompt_injection_enabled: true,
    jailbreak_detection_enabled: true,
    pii_detection_enabled: true,
    pii_action: PiiAction::Redact,
    schema_validation_enabled: true,

    // Output guardrails
    output_pii_detection_enabled: true,
    output_pii_action: PiiAction::Redact,
    toxicity_detection_enabled: true,
    toxicity_threshold: 0.7,
    toxicity_categories: vec![
        ToxicityCategory::Hate,
        ToxicityCategory::Harassment,
        ToxicityCategory::Violence,
        ToxicityCategory::SelfHarm,
    ],
    topic_guardrails_enabled: true,
    blocked_topics: vec!["competitor-x".to_string()],
    hallucination_detection_enabled: true,

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
