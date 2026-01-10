+++
title = "mTLS to Upstreams"
description = "Configure mutual TLS (mTLS) for secure upstream connections with client certificate authentication."
template = "page.html"

[taxonomies]
tags = ["security", "tls", "configuration"]

[extra]
toc = true
+++

# mTLS to Upstreams

Mutual TLS (mTLS) enables Sentinel to present client certificates when connecting to backend servers. This allows upstreams to authenticate the proxy and is essential for zero-trust architectures.

## Overview

With mTLS configured, Sentinel will:

1. Present a client certificate during the TLS handshake with upstreams
2. Verify the upstream's server certificate against a trusted CA
3. Establish an encrypted, mutually authenticated connection

This is different from TLS termination at the listener level - mTLS to upstreams secures the connection **between Sentinel and your backend servers**.

## Configuration

### Basic mTLS Configuration

Add a `tls` block to your upstream configuration:

```kdl
upstreams {
    upstream "secure-backend" {
        target "10.0.0.1:8443"
        target "10.0.0.2:8443"

        load-balancing "round-robin"

        tls {
            // Server Name Indication for the upstream
            sni "backend.internal"

            // Client certificate for mTLS
            client-cert "/etc/sentinel/certs/client.crt"
            client-key "/etc/sentinel/certs/client.key"

            // CA certificate to verify upstream server
            ca-cert "/etc/sentinel/certs/ca.crt"
        }
    }
}
```

### Configuration Directives

| Directive | Type | Required | Description |
|-----------|------|----------|-------------|
| `sni` | string | No | Server Name Indication hostname sent during TLS handshake |
| `client-cert` | path | For mTLS | Path to PEM-encoded client certificate |
| `client-key` | path | For mTLS | Path to PEM-encoded client private key |
| `ca-cert` | path | No | Path to CA certificate for verifying upstream server |
| `insecure-skip-verify` | boolean | No | Skip server certificate verification (not recommended for production) |

### Minimal TLS Configuration

If you only need to verify the upstream server (one-way TLS):

```kdl
upstreams {
    upstream "tls-backend" {
        target "api.internal:443"

        tls {
            sni "api.internal"
            ca-cert "/etc/sentinel/certs/internal-ca.crt"
        }
    }
}
```

### Full mTLS Configuration

For complete mutual authentication:

```kdl
upstreams {
    upstream "zero-trust-backend" {
        target "10.0.0.1:8443"

        tls {
            sni "service.mesh.internal"

            // mTLS client authentication
            client-cert "/etc/sentinel/certs/sentinel-client.crt"
            client-key "/etc/sentinel/certs/sentinel-client.key"

            // Verify upstream server certificate
            ca-cert "/etc/sentinel/certs/mesh-ca.crt"

            // Never skip verification in production
            insecure-skip-verify #false
        }
    }
}
```

## Certificate Requirements

### Client Certificate

The client certificate presented to upstreams should:

- Be signed by a CA trusted by your backend servers
- Include the `TLS Web Client Authentication` extended key usage
- Be valid (not expired)
- Match the private key

### Certificate Chain

If your client certificate requires intermediate certificates, include them in the certificate file:

```
-----BEGIN CERTIFICATE-----
(Your client certificate)
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
(Intermediate CA certificate)
-----END CERTIFICATE-----
```

### File Permissions

Ensure proper file permissions for security:

```bash
# Certificate can be readable
chmod 644 /etc/sentinel/certs/client.crt

# Private key must be protected
chmod 600 /etc/sentinel/certs/client.key
chown sentinel:sentinel /etc/sentinel/certs/client.key
```

## Use Cases

### Zero-Trust Service Mesh

In a zero-trust architecture, every service must authenticate:

```kdl
upstreams {
    upstream "user-service" {
        target "user-service.mesh:8443"

        tls {
            sni "user-service.mesh"
            client-cert "/etc/sentinel/mesh/client.crt"
            client-key "/etc/sentinel/mesh/client.key"
            ca-cert "/etc/sentinel/mesh/ca.crt"
        }
    }

    upstream "order-service" {
        target "order-service.mesh:8443"

        tls {
            sni "order-service.mesh"
            client-cert "/etc/sentinel/mesh/client.crt"
            client-key "/etc/sentinel/mesh/client.key"
            ca-cert "/etc/sentinel/mesh/ca.crt"
        }
    }
}
```

### Internal APIs with Client Auth

Backend APIs that require client certificate authentication:

```kdl
upstreams {
    upstream "payment-gateway" {
        target "payments.internal:443"

        tls {
            sni "payments.internal"
            client-cert "/etc/sentinel/certs/payment-client.crt"
            client-key "/etc/sentinel/certs/payment-client.key"
            ca-cert "/etc/sentinel/certs/payment-ca.crt"
        }

        // Payment APIs may need longer timeouts
        timeouts {
            connect 5s
            read 30s
            write 10s
        }
    }
}
```

### Development with Self-Signed Certificates

> **Warning:** Only use `insecure-skip-verify` in development environments.

```kdl
upstreams {
    upstream "dev-backend" {
        target "localhost:8443"

        tls {
            insecure-skip-verify #true
        }
    }
}
```

## Combined PEM Files

If your certificate and key are in a single PEM file, you can reference the same file for both:

```kdl
tls {
    client-cert "/etc/sentinel/certs/client.pem"
    client-key "/etc/sentinel/certs/client.pem"
}
```

The file should contain both the certificate and private key:

```
-----BEGIN CERTIFICATE-----
(Certificate data)
-----END CERTIFICATE-----
-----BEGIN PRIVATE KEY-----
(Private key data)
-----END PRIVATE KEY-----
```

## Troubleshooting

### Certificate Verification Failed

If you see certificate verification errors:

1. **Check certificate chain**: Ensure all intermediate certificates are included
2. **Verify CA certificate**: Confirm the CA cert matches what signed the server certificate
3. **Check expiration**: Verify certificates haven't expired with `openssl x509 -in cert.crt -noout -dates`

### Client Certificate Rejected

If the upstream rejects your client certificate:

1. **Check key usage**: Ensure the certificate has `TLS Web Client Authentication` extension
2. **Verify CA trust**: Confirm the upstream trusts your client certificate's CA
3. **Check key match**: Verify cert and key match with:
   ```bash
   openssl x509 -noout -modulus -in client.crt | openssl md5
   openssl rsa -noout -modulus -in client.key | openssl md5
   # Both should output the same hash
   ```

### SNI Mismatch

If connections fail due to SNI:

1. Ensure `sni` matches what the upstream server expects
2. Check if the upstream requires a specific hostname
3. Verify DNS resolution if using hostnames in `target`

## Logging

When mTLS is configured, Sentinel logs connection details:

```
INFO mTLS client certificate configured upstream_id="secure-backend" target="10.0.0.1:8443" cert_path="/etc/sentinel/certs/client.crt"
```

Enable debug logging for detailed TLS handshake information:

```bash
RUST_LOG=sentinel_proxy::tls=debug sentinel --config config.kdl
```

## Related Features

- [TLS/SSL Termination](/features/#tls-ssl-termination) - TLS for incoming connections
- [Health Checking](/features/#health-checking) - Health checks work over mTLS connections
- [Load Balancing](/features/#load-balancing) - Distribute traffic across mTLS backends

## Source Code Reference

The mTLS implementation is located in:

- [`crates/proxy/src/tls.rs`](https://github.com/raskell-io/sentinel/blob/main/crates/proxy/src/tls.rs) - TLS configuration and certificate loading
- [`crates/proxy/src/upstream/mod.rs`](https://github.com/raskell-io/sentinel/blob/main/crates/proxy/src/upstream/mod.rs) - Upstream peer configuration with mTLS
- [`crates/config/src/kdl/upstreams.rs`](https://github.com/raskell-io/sentinel/blob/main/crates/config/src/kdl/upstreams.rs) - KDL configuration parsing
