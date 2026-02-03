+++
title = "Data Masking"
weight = 20
description = "PII protection agent with reversible tokenization, format-preserving encryption, and pattern-based masking for JSON, XML, and form data."
template = "agent.html"

[taxonomies]
tags = ["security", "privacy", "compliance", "pii", "tokenization", "encryption"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Beta"
version = "0.2.4"
license = "Apache-2.0"
repo = "https://github.com/raskell-io/sentinel"
homepage = "https://sentinel.raskell.io/agents/data-masking/"
protocol_version = "1.0"

# Installation methods
crate_name = "sentinel-data-masking-agent"
docker_image = ""

# Compatibility
min_sentinel_version = "0.2.4"
+++

## Overview

A comprehensive data masking agent for Sentinel that protects sensitive data in API traffic through tokenization, format-preserving encryption, and pattern-based masking. Designed for organizations requiring GDPR, PCI DSS, and HIPAA compliance.

The agent intercepts request and response bodies, detects sensitive fields using configured paths or automatic pattern matching, and applies reversible or irreversible masking transformations.

## Features

- **Reversible Tokenization**: Replace sensitive values with UUID tokens, detokenize on response
- **Format-Preserving Encryption**: Encrypt credit cards, SSNs while maintaining format (all-digits output)
- **Pattern Detection**: Automatic detection of credit cards (Luhn), SSNs, emails, phone numbers
- **Content Type Support**: JSON, XML, and form-urlencoded bodies
- **Header Masking**: Mask sensitive headers (Authorization, API keys)
- **Character Masking**: Partially mask values (e.g., `4111****1111`)
- **Per-Request Token Lifecycle**: Tokens scoped to request correlation ID with automatic cleanup
- **Configurable Actions**: Tokenize, FPE, mask, redact, or hash

## Installation

### Using Cargo

```bash
cargo install sentinel-data-masking-agent
```

### From Source

```bash
git clone https://github.com/raskell-io/sentinel
cd sentinel/agents/data-masking
cargo build --release
```

## Configuration

Create a JSON configuration file or pass configuration through Sentinel's agent config:

```json
{
  "store": {
    "type": "memory",
    "ttl_seconds": 300,
    "max_entries": 100000
  },
  "fields": [
    {
      "path": "$.payment.card_number",
      "action": {
        "type": "fpe",
        "alphabet": "credit_card"
      },
      "direction": "both"
    },
    {
      "path": "$.user.ssn",
      "action": {
        "type": "tokenize",
        "format": "uuid"
      },
      "direction": "both"
    },
    {
      "path": "$.user.email",
      "action": {
        "type": "mask",
        "char": "*",
        "preserve_start": 2,
        "preserve_end": 0
      },
      "direction": "response"
    }
  ],
  "headers": [
    {
      "name": "Authorization",
      "action": {
        "type": "redact",
        "replacement": "[REDACTED]"
      },
      "direction": "request"
    }
  ],
  "patterns": {
    "builtins": {
      "credit_card": true,
      "ssn": true,
      "email": false,
      "phone": false
    },
    "custom": [
      {
        "name": "api_key",
        "regex": "sk_[a-zA-Z0-9]{24,}",
        "action": {
          "type": "redact",
          "replacement": "sk_[REDACTED]"
        }
      }
    ]
  },
  "fpe": {
    "key_env": "DATA_MASKING_FPE_KEY"
  },
  "buffering": {
    "max_buffer_bytes": 10485760
  }
}
```

## Sentinel Configuration

Add to your Sentinel proxy configuration:

```kdl
agents {
    data-masking socket="/tmp/data-masking-agent.sock" {
        events "request_headers" "request_body" "response_headers" "response_body" "request_complete"
        timeout_ms 5000
        max_request_body_bytes 10485760
        max_response_body_bytes 10485760
        failure_mode "fail_open"

        config {
            // Agent-specific config passed as JSON
        }
    }
}
```

## Masking Actions

### Tokenization (Reversible)

Replace values with UUID tokens. The original value is stored in memory and restored on the response path.

```json
{
  "path": "$.user.ssn",
  "action": {
    "type": "tokenize",
    "format": "uuid"
  }
}
```

**Input:** `{"user": {"ssn": "123-45-6789"}}`
**Masked:** `{"user": {"ssn": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"}}`
**Response:** Original value restored automatically

Token formats:
- `uuid` - Standard UUID v4
- `prefixed` - Custom prefix (e.g., `tok_abc123...`)

### Format-Preserving Encryption (Reversible)

Encrypt values while preserving their format. Useful for credit cards and SSNs where downstream systems expect specific formats.

```json
{
  "path": "$.payment.card_number",
  "action": {
    "type": "fpe",
    "alphabet": "credit_card"
  }
}
```

**Input:** `{"payment": {"card_number": "4111111111111111"}}`
**Masked:** `{"payment": {"card_number": "8472619305847261"}}`

Requires `DATA_MASKING_FPE_KEY` environment variable (64 hex chars / 32 bytes).

Alphabets:
- `digits` - 0-9
- `alphanumeric` - 0-9, a-z, A-Z
- `alphanumeric_lower` - 0-9, a-z
- `credit_card` - 16 digits
- `ssn` - 9 digits

### Character Masking (Irreversible)

Partially mask values while preserving some characters for identification.

```json
{
  "path": "$.payment.card_number",
  "action": {
    "type": "mask",
    "char": "*",
    "preserve_start": 4,
    "preserve_end": 4
  }
}
```

**Input:** `4111111111111111`
**Output:** `4111********1111`

### Redaction (Irreversible)

Replace the entire value with a fixed string.

```json
{
  "path": "$.secrets.api_key",
  "action": {
    "type": "redact",
    "replacement": "[REDACTED]"
  }
}
```

### Hashing (Irreversible)

Replace with a SHA-256 hash (useful for correlation without exposing values).

```json
{
  "path": "$.user.email",
  "action": {
    "type": "hash",
    "algorithm": "sha256",
    "truncate": 16
  }
}
```

## Pattern Detection

The agent can automatically detect and mask sensitive data using built-in patterns:

### Built-in Patterns

| Pattern | Detection | Default Action |
|---------|-----------|----------------|
| `credit_card` | Regex + Luhn validation | Mask first/last 4 |
| `ssn` | `XXX-XX-XXXX` or 9 digits | Mask, preserve last 4 |
| `email` | Standard email regex | Mask, preserve first 2 |
| `phone` | US phone formats | Mask, preserve last 4 |

### Custom Patterns

```json
{
  "patterns": {
    "custom": [
      {
        "name": "aws_access_key",
        "regex": "AKIA[0-9A-Z]{16}",
        "action": {
          "type": "redact",
          "replacement": "[AWS_KEY]"
        }
      }
    ]
  }
}
```

## Direction Control

Control when masking is applied:

- `request` - Only mask on request path (to upstream)
- `response` - Only mask on response path (to client)
- `both` - Mask on request, unmask on response (for tokenization/FPE)

```json
{
  "path": "$.user.ssn",
  "action": { "type": "tokenize", "format": "uuid" },
  "direction": "both"
}
```

## Content Types

The agent supports multiple content types:

### JSON

Use JSONPath-like syntax:
- `$.user.email` - Exact path
- `ssn` - Match field name anywhere in document

### XML

Use simple XPath:
- `/root/user/email` - Exact path

### Form Data

Use field names directly:
- `email` - Form field name
- `credit_card` - Form field name

## CLI Options

```bash
sentinel-data-masking-agent [OPTIONS]

Options:
  -s, --socket <PATH>      Unix socket path [default: /tmp/data-masking-agent.sock]
  -g, --grpc <ADDR>        gRPC address (e.g., "0.0.0.0:50051")
  -c, --config <PATH>      Configuration file (JSON)
  -l, --log-level <LEVEL>  Log level [default: info]
  -h, --help               Print help
  -V, --version            Print version
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATA_MASKING_FPE_KEY` | 64 hex character key for format-preserving encryption |
| `DATA_MASKING_SOCKET` | Default socket path |
| `DATA_MASKING_LOG_LEVEL` | Log level (trace, debug, info, warn, error) |

## Usage Examples

### PCI DSS Compliance

Protect credit card data while maintaining format for downstream validation:

```json
{
  "fields": [
    {
      "path": "$.payment.card_number",
      "action": { "type": "fpe", "alphabet": "credit_card" },
      "direction": "both"
    },
    {
      "path": "$.payment.cvv",
      "action": { "type": "redact", "replacement": "***" },
      "direction": "request"
    }
  ],
  "patterns": {
    "builtins": { "credit_card": true }
  }
}
```

### GDPR Data Minimization

Tokenize personal data so upstream services only see tokens:

```json
{
  "fields": [
    {
      "path": "$.user.email",
      "action": { "type": "tokenize", "format": "uuid" },
      "direction": "both"
    },
    {
      "path": "$.user.phone",
      "action": { "type": "tokenize", "format": "uuid" },
      "direction": "both"
    },
    {
      "path": "$.user.address",
      "action": { "type": "tokenize", "format": "uuid" },
      "direction": "both"
    }
  ]
}
```

### Logging-Safe Responses

Mask sensitive data in responses before they reach logging systems:

```json
{
  "fields": [
    {
      "path": "ssn",
      "action": {
        "type": "mask",
        "char": "*",
        "preserve_start": 0,
        "preserve_end": 4
      },
      "direction": "response"
    }
  ],
  "headers": [
    {
      "name": "Set-Cookie",
      "action": { "type": "redact", "replacement": "[COOKIE]" },
      "direction": "response"
    }
  ]
}
```

### XML API Protection

```json
{
  "fields": [
    {
      "path": "/Envelope/Body/GetUserResponse/SSN",
      "path_type": "xpath",
      "action": { "type": "tokenize", "format": "uuid" },
      "direction": "both"
    }
  ]
}
```

## Token Store

The in-memory token store provides:

- **Per-request scoping**: Tokens are associated with correlation IDs
- **Automatic cleanup**: Tokens removed when request completes
- **TTL expiration**: Background cleanup of stale tokens (default: 5 minutes)
- **Capacity limits**: LRU eviction when max entries reached

```json
{
  "store": {
    "type": "memory",
    "ttl_seconds": 300,
    "max_entries": 100000
  }
}
```

## Best Practices

1. **Use tokenization for reversible masking** - Prefer tokenization over FPE when format preservation isn't required
2. **Set appropriate TTLs** - Match token TTL to your request timeout settings
3. **Enable pattern detection judiciously** - Only enable patterns you need to reduce false positives
4. **Use direction control** - Apply masking only where needed (request vs response)
5. **Set FPE key securely** - Use environment variables or secrets management, never hardcode
6. **Monitor buffer sizes** - Adjust `max_buffer_bytes` based on your payload sizes
7. **Test with production-like data** - Validate patterns against real data before deployment

## Limitations

- Body masking requires buffering the complete body (not streaming)
- FPE key must be 32 bytes (64 hex characters)
- XML support uses simple XPath (no complex expressions)
- Pattern detection may have false positives with certain data formats
