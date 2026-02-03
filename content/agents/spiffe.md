+++
title = "SPIFFE"
weight = 180
description = "SPIFFE/SPIRE workload identity authentication agent for zero-trust service-to-service communication."
template = "agent.html"

[taxonomies]
tags = ["security", "auth", "zero-trust", "spiffe", "mtls", "identity"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Stable"
version = "0.2.0"
license = "Apache-2.0"
repo = "https://github.com/raskell-io/sentinel-agent-spiffe"
homepage = "https://sentinel.raskell.io/agents/spiffe/"
protocol_version = "v2"

# Installation methods
crate_name = "sentinel-agent-spiffe"
docker_image = ""

# Compatibility
min_sentinel_version = "26.01.0"
+++

## Protocol v2 Features

As of v0.2.0, the SPIFFE agent supports protocol v2 with:

- **Capability negotiation**: Reports supported features during handshake
- **Health reporting**: Exposes health status with SPIRE connectivity awareness
- **Metrics export**: Counter metrics for authentications succeeded/failed
- **gRPC transport**: Optional high-performance gRPC transport via `--grpc-address`
- **Lifecycle hooks**: Graceful shutdown and drain handling

## Overview

The SPIFFE agent provides zero-trust workload identity authentication using SPIFFE (Secure Production Identity Framework for Everyone) and SPIRE (SPIFFE Runtime Environment). It validates incoming requests by extracting and verifying X.509 SVIDs (SPIFFE Verifiable Identity Documents) from client certificates.

## Features

### Authentication
- **X.509 SVID Validation**: Verify SPIFFE identity from client certificates
- **Trust Bundle Verification**: Validate certificates against SPIRE trust bundles
- **Certificate Expiry Checking**: Reject expired SVIDs

### Allowlist Matching
- **Exact Match**: Allow specific SPIFFE IDs
- **Prefix Match**: Allow SPIFFE IDs starting with a pattern
- **Trust Domain Match**: Allow all workloads from a trust domain
- **Regex Match**: Flexible pattern matching for complex policies

### Identity Propagation
- **Header Injection**: Pass verified identity to upstream services
- **Audit Logging**: Log authentication decisions with SPIFFE context

### Failure Handling
- **Fail-Closed**: Reject requests when identity cannot be verified (default)
- **Fail-Open**: Allow requests when SPIRE is unavailable
- **Cache Mode**: Use cached trust bundles during SPIRE outages

## Installation

### Using Bundle (Recommended)

The easiest way to install this agent is via the Sentinel bundle command:

```bash
# Install just this agent
sentinel bundle install spiffe

# Or install all available agents
sentinel bundle install --all
```

The bundle command automatically downloads the correct binary for your platform and places it in `~/.sentinel/agents/`.

### Using Cargo

```bash
cargo install sentinel-agent-spiffe
```

### From Source

```bash
git clone https://github.com/raskell-io/sentinel-agent-spiffe
cd sentinel-agent-spiffe
cargo build --release
```

## Quick Start

### Command Line

```bash
# Basic usage with SPIRE agent
sentinel-spiffe-agent \
  --socket /var/run/sentinel/spiffe.sock \
  --spire-socket /run/spire/sockets/agent.sock

# With verbose logging
sentinel-spiffe-agent \
  --socket /var/run/sentinel/spiffe.sock \
  --spire-socket /run/spire/sockets/agent.sock \
  --verbose
```

### Environment Variables

```bash
export AGENT_SOCKET="/var/run/sentinel/spiffe.sock"
export SPIRE_AGENT_SOCKET="/run/spire/sockets/agent.sock"
export SPIFFE_VERBOSE="true"
```

## Configuration

### Sentinel Proxy Configuration

```kdl
agents {
    agent "spiffe" {
        type "custom"
        transport "unix_socket" {
            path "/var/run/sentinel/spiffe.sock"
        }
        events ["request_headers"]
        timeout-ms 100
        failure-mode "closed"

        config {
            // SPIRE Workload API configuration
            spire {
                socket "/run/spire/sockets/agent.sock"
                bundle-refresh-interval 300
                api-timeout-ms 5000
            }

            // TLS settings
            tls {
                require-mtls true
                client-cert-header "X-Forwarded-Client-Cert"
            }

            // SPIFFE ID allowlist
            allowlist {
                // Exact SPIFFE IDs
                exact [
                    "spiffe://example.org/frontend"
                    "spiffe://example.org/api-gateway"
                ]

                // Prefix matching
                prefix [
                    "spiffe://example.org/services/"
                    "spiffe://example.org/jobs/"
                ]

                // Allow entire trust domains
                trust-domains [
                    "example.org"
                    "staging.example.org"
                ]

                // Regex patterns
                patterns [
                    "spiffe://example\\.org/team-[a-z]+/.*"
                    "spiffe://.*\\.example\\.org/backend/.*"
                ]
            }

            // Failure handling
            failure {
                spire-unavailable "fail_closed"  // fail_closed, fail_open, cache
                validation-failure "reject"       // reject, log_and_allow
                cache-ttl 3600
            }

            // Headers to inject on successful auth
            headers {
                spiffe-id "X-SPIFFE-Id"
                trust-domain "X-SPIFFE-Trust-Domain"
                workload-id "X-SPIFFE-Workload-Id"
                auth-method "X-Auth-Method"
                auth-timestamp "X-Auth-Timestamp"
            }

            // Audit logging
            audit {
                log-success true
                log-failure true
                include-cert-info true
            }
        }
    }
}

routes {
    route "api" {
        matches { path-prefix "/api" }
        upstream "backend"
        agents ["spiffe"]
    }
}
```

### Command Line Options

| Option | Environment | Description | Default |
|--------|-------------|-------------|---------|
| `--socket` | `AGENT_SOCKET` | Unix socket path | `/tmp/sentinel-spiffe.sock` |
| `--grpc-address` | `AGENT_GRPC_ADDRESS` | gRPC listen address (e.g., `0.0.0.0:50051`) | - |
| `--spire-socket` | `SPIRE_AGENT_SOCKET` | SPIRE agent socket | `/run/spire/sockets/agent.sock` |
| `--verbose` | `SPIFFE_VERBOSE` | Enable debug logging | `false` |

## How It Works

### Authentication Flow

```
1. Client connects to Sentinel with mTLS
2. Sentinel terminates TLS, forwards cert via X-Forwarded-Client-Cert header
3. SPIFFE agent extracts certificate from header
4. Agent parses SPIFFE ID from certificate SAN URIs
5. Agent validates certificate against trust bundles (if connected to SPIRE)
6. Agent checks SPIFFE ID against allowlist
7. On success: inject identity headers, forward request
8. On failure: return 401/403 based on failure type
```

### SPIFFE ID Structure

```
spiffe://trust-domain/workload-path

Examples:
- spiffe://example.org/frontend
- spiffe://prod.example.org/services/orders
- spiffe://example.org/k8s/ns/default/sa/api-server
```

## Allowlist Configuration

### Exact Match

Allow specific SPIFFE IDs:

```kdl
allowlist {
    exact [
        "spiffe://example.org/frontend"
        "spiffe://example.org/backend"
    ]
}
```

### Prefix Match

Allow SPIFFE IDs starting with a pattern:

```kdl
allowlist {
    prefix [
        "spiffe://example.org/services/"  // Matches all services
        "spiffe://example.org/jobs/"      // Matches all jobs
    ]
}
```

### Trust Domain Match

Allow all workloads from specific trust domains:

```kdl
allowlist {
    trust-domains [
        "example.org"           // Production
        "staging.example.org"   // Staging
    ]
}
```

### Regex Match

Flexible pattern matching:

```kdl
allowlist {
    patterns [
        "spiffe://example\\.org/team-[a-z]+/.*"           // Team workloads
        "spiffe://.*\\.example\\.org/services/orders.*"   // Order services
    ]
}
```

## Failure Modes

### Fail-Closed (Default)

Reject requests when identity cannot be verified:

```kdl
failure {
    spire-unavailable "fail_closed"
}
```

### Fail-Open

Allow requests when SPIRE is unavailable (use with caution):

```kdl
failure {
    spire-unavailable "fail_open"
}
```

### Cache Mode

Use cached trust bundles during SPIRE outages:

```kdl
failure {
    spire-unavailable "cache"
    cache-ttl 3600  // Cache valid for 1 hour
}
```

## Headers Added

On successful authentication:

| Header | Description | Example |
|--------|-------------|---------|
| `X-SPIFFE-Id` | Full SPIFFE ID | `spiffe://example.org/frontend` |
| `X-SPIFFE-Trust-Domain` | Trust domain | `example.org` |
| `X-SPIFFE-Workload-Id` | Workload path | `/frontend` |
| `X-Auth-Method` | Authentication method | `spiffe` |
| `X-Auth-Timestamp` | Unix timestamp | `1704067200` |

## Response Codes

| Status | Condition |
|--------|-----------|
| 401 | No client certificate |
| 401 | Invalid certificate |
| 401 | No SPIFFE ID in certificate |
| 401 | Certificate expired |
| 403 | SPIFFE ID not in allowlist |
| (passthrough) | Valid identity, request forwarded |

## Kubernetes Deployment

### With SPIRE

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sentinel-spiffe-agent
spec:
  template:
    spec:
      containers:
        - name: spiffe-agent
          image: ghcr.io/raskell-io/sentinel-agent-spiffe:latest
          env:
            - name: AGENT_SOCKET
              value: /var/run/sentinel/spiffe.sock
            - name: SPIRE_AGENT_SOCKET
              value: /run/spire/sockets/agent.sock
          volumeMounts:
            - name: sentinel-socket
              mountPath: /var/run/sentinel
            - name: spire-socket
              mountPath: /run/spire/sockets
              readOnly: true
      volumes:
        - name: sentinel-socket
          emptyDir: {}
        - name: spire-socket
          hostPath:
            path: /run/spire/sockets
            type: Directory
```

### SPIRE Registration

Register workloads with SPIRE:

```bash
# Register the frontend service
spire-server entry create \
  -spiffeID spiffe://example.org/frontend \
  -parentID spiffe://example.org/node \
  -selector k8s:ns:default \
  -selector k8s:sa:frontend

# Register the backend service
spire-server entry create \
  -spiffeID spiffe://example.org/backend \
  -parentID spiffe://example.org/node \
  -selector k8s:ns:default \
  -selector k8s:sa:backend
```

## Bare Metal Deployment

### Systemd Service

```ini
[Unit]
Description=Sentinel SPIFFE Agent
After=network.target spire-agent.service
Requires=spire-agent.service

[Service]
Type=simple
ExecStart=/usr/local/bin/sentinel-spiffe-agent \
  --socket /var/run/sentinel/spiffe.sock \
  --spire-socket /run/spire/sockets/agent.sock
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## Integration with Sentinel Hub

The SPIFFE agent works with Sentinel Hub for centralized fleet management. Hub uses SPIFFE for agent-to-hub mTLS authentication:

```yaml
# Hub configuration
grpc:
  tls:
    enabled: true
    cert_file: "/etc/sentinel-hub/certs/server.crt"
    key_file: "/etc/sentinel-hub/certs/server.key"
    require_client_cert: true
    spiffe:
      enabled: true
      agent_socket: "/run/spire/sockets/agent.sock"
      allowed_trust_domains: ["prod.example.org"]
      allowed_patterns: ["spiffe://.*\\.example\\.org/sentinel-agent/.*"]
```

## Security Recommendations

1. **Use fail-closed mode** in production for security-critical paths
2. **Minimize trust domain scope** - only allow required trust domains
3. **Use specific allowlists** - prefer exact or prefix matches over wildcards
4. **Monitor SPIRE health** - set up alerts for SPIRE agent connectivity
5. **Rotate SVIDs regularly** - configure short SVID TTLs in SPIRE
6. **Audit authentication** - enable success/failure logging
7. **Use separate trust domains** for production vs staging
8. **Validate certificate chains** when possible

## Troubleshooting

### No SPIFFE ID in Certificate

Ensure the certificate has a SPIFFE ID in the SAN URI:

```bash
openssl x509 -in cert.pem -noout -text | grep URI
# Should show: URI:spiffe://example.org/workload
```

### SPIRE Agent Connection Failed

Check SPIRE agent socket permissions:

```bash
ls -la /run/spire/sockets/agent.sock
# Should be accessible by the sentinel-spiffe-agent process
```

### Certificate Validation Failed

Verify trust bundles are available:

```bash
# Check SPIRE agent is running
systemctl status spire-agent

# Fetch trust bundle manually
spire-agent api fetch -socketPath /run/spire/sockets/agent.sock
```

## Related Agents

| Agent | Integration |
|-------|-------------|
| **Auth** | Combine SPIFFE with JWT/OIDC for user authentication |
| **WAF** | Add attack detection after identity verification |
| **Audit Logger** | Enhanced logging with SPIFFE identity context |

## Resources

- [GitHub Repository](https://github.com/raskell-io/sentinel-agent-spiffe)
- [SPIFFE Specification](https://spiffe.io/docs/latest/spiffe-about/overview/)
- [SPIRE Documentation](https://spiffe.io/docs/latest/spire-about/)
- [Zero Trust Architecture](https://www.nist.gov/publications/zero-trust-architecture)
