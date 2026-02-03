+++
title = "Content Scanner"
weight = 160
description = "Malware scanning agent using ClamAV daemon for file upload protection"
template = "agent.html"

[taxonomies]
tags = ["content-scanner", "malware", "clamav", "security", "file-upload"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Stable"
version = "0.2.0"
license = "Apache-2.0"
repo = "https://github.com/raskell-io/sentinel-agent-content-scanner"
homepage = "https://sentinel.raskell.io/agents/content-scanner/"
protocol_version = "v2"
+++

# Content Scanner Agent

## Protocol v2 Features

As of v0.2.0, the Content Scanner agent supports protocol v2 with:

- **Capability negotiation**: Reports supported features during handshake
- **Health reporting**: Exposes health status with draining awareness
- **Metrics export**: Counter metrics for scans, blocks, errors, and bytes processed
- **gRPC transport**: High-performance gRPC transport via `--grpc-address`
- **Lifecycle hooks**: Graceful shutdown and drain handling

## Overview

The Content Scanner agent scans uploaded files and request bodies for malware using ClamAV daemon. It provides protection against malicious file uploads by integrating with the industry-standard ClamAV antivirus engine.

## Features

| Feature | Description |
|---------|-------------|
| ClamAV Integration | Connects to clamd via Unix socket using INSTREAM protocol |
| Content-Type Filtering | Only scan specific content types using glob patterns |
| Path Exclusions | Skip scanning for health checks and static paths |
| Method Filtering | Configure which HTTP methods to scan (POST, PUT, PATCH) |
| Size Limits | Skip scanning for bodies exceeding configured size |
| Fail-Open/Closed | Configurable behavior when ClamAV is unavailable |
| Scan Metrics | Headers include scan time and detection status |

## Installation

### Using Bundle (Recommended)

The easiest way to install this agent is via the Sentinel bundle command:

```bash
# Install just this agent
sentinel bundle install content-scanner

# Or install all available agents
sentinel bundle install --all
```

The bundle command automatically downloads the correct binary for your platform and places it in `~/.sentinel/agents/`.

### From Source

```bash
git clone https://github.com/raskell-io/sentinel-agent-content-scanner
cd sentinel-agent-content-scanner
cargo build --release
```

### ClamAV Setup

The agent requires ClamAV daemon (clamd) to be running:

```bash
# macOS (Homebrew)
brew install clamav
freshclam && clamd

# Ubuntu/Debian
sudo apt-get install clamav-daemon
sudo systemctl start clamav-daemon

# RHEL/CentOS
sudo yum install clamav-server clamav-update
sudo freshclam
sudo systemctl start clamd@scan
```

## Configuration

Create a `config.yaml` file:

```yaml
settings:
  enabled: true
  fail_action: allow           # allow or block when ClamAV unavailable
  log_detections: true
  log_clean: false

body:
  max_size: 52428800           # 50MB max body to scan
  content_types:               # Only scan these content types (empty = all)
    - "application/octet-stream"
    - "application/zip"
    - "application/x-zip-compressed"
    - "application/gzip"
    - "application/pdf"
    - "application/msword"
    - "application/vnd.openxmlformats-officedocument.*"
    - "multipart/form-data"

clamd:
  enabled: true
  socket_path: "/var/run/clamav/clamd.ctl"
  timeout_ms: 30000            # 30 second scan timeout
  chunk_size: 65536            # 64KB chunks to clamd

skip_paths:
  - "/health"
  - "/ready"
  - "/metrics"

scan_methods:
  - "POST"
  - "PUT"
  - "PATCH"
```

## Configuration Reference

### Settings

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | bool | `true` | Master enable/disable switch |
| `fail_action` | string | `"allow"` | Action when ClamAV unavailable: `allow` or `block` |
| `log_detections` | bool | `true` | Log malware detections |
| `log_clean` | bool | `false` | Log clean scan results |

### Body Configuration

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `max_size` | int | `52428800` | Maximum body size to scan (bytes, 50MB default) |
| `content_types` | list | `[]` | Content types to scan (empty = all) |

### ClamAV Configuration

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | bool | `true` | Enable ClamAV scanning |
| `socket_path` | string | `/var/run/clamav/clamd.ctl` | Path to clamd Unix socket |
| `timeout_ms` | int | `30000` | Scan timeout in milliseconds |
| `chunk_size` | int | `65536` | Chunk size for streaming to clamd |

### Path and Method Filtering

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `skip_paths` | list | `[]` | Paths to skip scanning (prefix match) |
| `scan_methods` | list | `["POST", "PUT", "PATCH"]` | HTTP methods to scan |

## Response Headers

| Header | Value | Description |
|--------|-------|-------------|
| `x-content-scanned` | `"true"` | Body was scanned successfully |
| `x-scan-time-ms` | `"123"` | Scan duration in milliseconds |
| `x-malware-detected` | `"true"` | Malware was detected (blocked) |
| `x-malware-name` | `"Eicar-Test-Signature"` | Name of detected malware |
| `x-scan-skipped` | `"size-exceeded"` | Reason scan was skipped |

## Content-Type Matching

The agent supports flexible content-type patterns:

| Pattern | Matches |
|---------|---------|
| `application/json` | Exact match only |
| `application/*` | Any application type |
| `application/vnd.*` | Vendor-specific types like `application/vnd.ms-excel` |

## Usage

### Start the Agent

```bash
./sentinel-agent-content-scanner -c config.yaml -s /tmp/content-scanner.sock
```

### CLI Options

| Option | Description |
|--------|-------------|
| `-c, --config` | Path to configuration file (default: `config.yaml`) |
| `--grpc-address` | gRPC listen address (e.g., `0.0.0.0:50051`) |
| `--example-config` | Print example configuration and exit |
| `--validate` | Validate configuration and exit |

## Sentinel Configuration

Add the agent to your Sentinel route:

```kdl
route "/api/upload" {
    agents "content-scanner" {
        socket "/tmp/content-scanner.sock"
        timeout_ms 35000
        fail_mode "open"
        phases "request_body"
    }
    upstream "upload-service"
}
```

## Testing

Test with the EICAR standard antivirus test string:

```bash
# Clean file (should return 200)
echo "Hello World" | curl -X POST \
  -H "Content-Type: application/octet-stream" \
  -d @- http://localhost:8080/upload

# EICAR test file (should return 403)
echo 'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' \
  | curl -X POST \
  -H "Content-Type: application/octet-stream" \
  -d @- http://localhost:8080/upload
```

## Use Cases

### File Upload Protection

Scan all uploaded files for malware:

```yaml
body:
  content_types:
    - "application/octet-stream"
    - "application/zip"
    - "multipart/form-data"

scan_methods:
  - "POST"
  - "PUT"
```

### Document Scanning

Scan office documents and PDFs:

```yaml
body:
  content_types:
    - "application/pdf"
    - "application/msword"
    - "application/vnd.openxmlformats-officedocument.*"
    - "application/vnd.ms-excel"
    - "application/vnd.ms-powerpoint"
```

### API Payload Scanning

Scan all API payloads with fail-closed mode:

```yaml
settings:
  fail_action: block

body:
  max_size: 10485760           # 10MB for API payloads
  content_types: []            # Scan all content types
```

## Performance Considerations

- **Body Size Limits**: Set appropriate `max_size` to avoid scanning very large files
- **Timeouts**: Ensure `timeout_ms` is sufficient for your expected file sizes
- **Chunk Size**: Default 64KB is optimal for most use cases
- **Skip Paths**: Exclude health check endpoints to reduce overhead

## Source Code

[GitHub Repository](https://github.com/raskell-io/sentinel-agent-content-scanner)
