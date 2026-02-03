+++
title = "Audit Logger"
weight = 120
description = "Structured audit logging agent with PII redaction, multiple formats (JSON, CEF, LEEF), and compliance templates for SOC2, HIPAA, PCI, and GDPR."
template = "agent.html"

[taxonomies]
tags = ["logging", "compliance", "security", "audit"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Stable"
version = "0.2.0"
license = "Apache-2.0"
repo = "https://github.com/raskell-io/sentinel-agent-audit-logger"
homepage = "https://sentinel.raskell.io/agents/audit-logger/"
protocol_version = "v2"

# Installation methods
crate_name = "sentinel-agent-audit-logger"
docker_image = ""

# Compatibility
min_sentinel_version = "25.12.0"
+++

## Overview

A comprehensive audit logging agent for Sentinel that captures detailed API traffic logs with built-in PII redaction and compliance support. Designed for organizations that need structured, security-focused logging for regulatory compliance.

The agent supports multiple output formats for SIEM integration, automatic detection and masking of sensitive data, and pre-configured templates for common compliance standards.

## Protocol v2 Features

As of v0.2.0, the Audit Logger agent supports protocol v2 with:

- **Capability negotiation**: Reports supported features during handshake
- **Health reporting**: Exposes health status with error rate monitoring
- **Metrics export**: Counter metrics for requests, events logged/filtered, output errors
- **gRPC transport**: Optional high-performance gRPC transport via `--grpc-address`
- **Lifecycle hooks**: Graceful shutdown and drain handling

## Features

- **Multiple Log Formats**: JSON, CEF (ArcSight), LEEF (IBM QRadar)
- **PII Redaction**: Automatic detection and masking of sensitive data
  - Email addresses, credit cards, SSNs, phone numbers
  - JWT tokens, API keys, AWS access keys
  - Custom regex patterns with named replacements
- **Compliance Templates**: Pre-configured for SOC2, HIPAA, PCI DSS, GDPR
- **Flexible Outputs**: Stdout, file (with rotation), syslog (UDP/TCP), HTTP webhooks
- **Conditional Logging**: Filter by path, method, status code, or headers
- **Request Sampling**: Configurable sample rate for high-traffic environments
- **Header Filtering**: Include/exclude specific headers from logs
- **Body Logging**: Optional request/response body capture with size limits

## Installation

### Using Bundle (Recommended)

The easiest way to install this agent is via the Sentinel bundle command:

```bash
# Install just this agent
sentinel bundle install audit-logger

# Or install all available agents
sentinel bundle install --all
```

The bundle command automatically downloads the correct binary for your platform and places it in `~/.sentinel/agents/`.

### Using Cargo

```bash
cargo install sentinel-agent-audit-logger
```

### From Source

```bash
git clone https://github.com/raskell-io/sentinel-agent-audit-logger
cd sentinel-agent-audit-logger
cargo build --release
```

## Configuration

Create `audit-logger.yaml`:

```yaml
# Log format (json, cef, leef)
format:
  format_type: json
  pretty: false
  include_timestamp: true
  timestamp_format: "%Y-%m-%dT%H:%M:%S%.3fZ"

# Fields to include
fields:
  correlation_id: true
  timestamp: true
  client_ip: true
  method: true
  path: true
  status_code: true
  duration_ms: true
  user_id: true
  user_id_header: "x-user-id"

# Output destinations
outputs:
  - type: stdout
  - type: file
    path: /var/log/sentinel/audit.log
    max_size: 104857600  # 100MB
    max_files: 10

# PII redaction
redaction:
  enabled: true
  patterns:
    - email
    - credit_card
    - ssn
    - phone
  replacement: "[REDACTED]"
  redact_headers:
    - authorization
    - cookie
    - x-api-key

# Sampling (1.0 = 100%)
sample_rate: 1.0
```

## Sentinel Configuration

Add to your Sentinel proxy configuration:

```kdl
agents {
    audit-logger socket="/tmp/sentinel-audit-logger.sock"
}
```

## Usage Examples

### Basic JSON Logging

```yaml
format:
  format_type: json
outputs:
  - type: stdout
```

Output:
```json
{
  "@timestamp": "2024-01-15T10:30:45.123Z",
  "correlation_id": "req-abc123",
  "client_ip": "192.168.1.1",
  "method": "POST",
  "path": "/api/users",
  "status_code": 201,
  "duration_ms": 45
}
```

### CEF Format for ArcSight

```yaml
format:
  format_type: cef
  device_vendor: "MyCompany"
  device_product: "API Gateway"
outputs:
  - type: syslog
    address: "siem.example.com:514"
    protocol: udp
    facility: local0
```

Output:
```
CEF:0|MyCompany|API Gateway|1.0|POST-201|POST /api/users|1|rt=2024-01-15T10:30:45.123Z src=192.168.1.1 request=/api/users outcome=201
```

### HIPAA Compliance

```yaml
compliance_template: hipaa
outputs:
  - type: file
    path: /var/log/hipaa-audit.log
    max_size: 52428800
    max_files: 30
```

HIPAA template automatically:
- Disables body logging
- Enables hash-based redaction for correlation
- Redacts PHI patterns (SSN, phone, email)

### High-Traffic Sampling

```yaml
sample_rate: 0.1  # Log 10% of requests
filters:
  - name: always-log-errors
    condition:
      type: status_code
      min: 500
      max: 599
    action: include  # Override sampling for errors
```

### Custom PII Patterns

```yaml
redaction:
  enabled: true
  patterns:
    - email
    - credit_card
  custom_patterns:
    - name: account_id
      pattern: "ACC-\\d{8}"
      replacement: "[ACCOUNT]"
    - name: mrn
      pattern: "MRN-[A-Z0-9]{10}"
      replacement: "[MRN]"
```

## Compliance Templates

### SOC2
Focus on access control and change management:
- Full request metadata
- User identification
- Agent decisions
- Standard PII redaction

### HIPAA
Strict PHI protection:
- No body logging
- Hash-based identifiers for correlation
- Aggressive PII redaction
- PHI-specific patterns

### PCI DSS
Card data protection:
- No body logging (prevents card data capture)
- Credit card pattern redaction
- API key protection

### GDPR
Personal data minimization:
- IP address anonymization
- No user ID logging by default
- Hash-based correlation

## Filter Conditions

```yaml
filters:
  # Exclude health checks
  - name: exclude-health
    condition:
      type: path_prefix
      prefix: /health
    action: exclude

  # Verbose logging for errors
  - name: verbose-errors
    condition:
      type: status_code
      min: 500
      max: 599
    action: verbose

  # Exclude specific methods
  - name: exclude-options
    condition:
      type: method
      values: ["OPTIONS", "HEAD"]
    action: exclude

  # Log based on header
  - name: debug-requests
    condition:
      type: header
      name: x-debug
      value: "true"
    action: verbose
```

## CLI Options

```bash
sentinel-agent-audit-logger [OPTIONS]

Options:
  -c, --config <PATH>        Configuration file [default: audit-logger.yaml]
  -s, --socket <PATH>        Unix socket path [default: /tmp/sentinel-audit-logger.sock]
      --grpc-address <ADDR>  gRPC listen address (e.g., 0.0.0.0:50051)
  -L, --log-level <LEVEL>    Log level [default: info]
      --print-config       Print default configuration
      --validate           Validate configuration and exit
  -h, --help              Print help
  -V, --version           Print version
```

## Output Destinations

### File with Rotation
```yaml
outputs:
  - type: file
    path: /var/log/audit.log
    max_size: 104857600  # Rotate at 100MB
    max_files: 10        # Keep 10 rotated files
```

### Syslog (UDP)
```yaml
outputs:
  - type: syslog
    address: "localhost:514"
    protocol: udp
    facility: local0
```

### Syslog (TCP)
```yaml
outputs:
  - type: syslog
    address: "siem.example.com:1514"
    protocol: tcp
    facility: auth
```

### HTTP Webhook
```yaml
outputs:
  - type: http
    url: "https://logs.example.com/ingest"
    method: POST
    headers:
      Authorization: "Bearer ${LOG_API_KEY}"
    batch_size: 100
    flush_interval_secs: 5
    timeout_secs: 30
    retries: 3
```

## Integration with SIEM

### Splunk
Use HTTP webhook output with HEC (HTTP Event Collector):
```yaml
outputs:
  - type: http
    url: "https://splunk.example.com:8088/services/collector/event"
    headers:
      Authorization: "Splunk ${SPLUNK_HEC_TOKEN}"
```

### Elasticsearch
Direct HTTP ingestion:
```yaml
format:
  format_type: json
outputs:
  - type: http
    url: "https://es.example.com:9200/audit-logs/_doc"
    headers:
      Content-Type: "application/json"
```

### IBM QRadar
Use LEEF format with syslog:
```yaml
format:
  format_type: leef
outputs:
  - type: syslog
    address: "qradar.example.com:514"
    protocol: tcp
    facility: local0
```

## Best Practices

1. **Start with compliance templates** - They provide secure defaults
2. **Use hash_original for correlation** - Enables investigation without exposing PII
3. **Filter health checks** - Reduce noise from monitoring
4. **Sample in production** - 10-20% sampling often suffices for analytics
5. **Always log errors** - Override sampling for 4xx/5xx responses
6. **Rotate log files** - Prevent disk exhaustion
7. **Use TCP for critical logs** - UDP can drop packets under load
