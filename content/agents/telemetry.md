+++
title = "Telemetry"
description = "Fire-and-forget observability agent that enriches traffic data with metadata for AI-powered analytics and big data pipelines."
template = "agent.html"

[taxonomies]
tags = ["observability", "analytics", "logging", "ai"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Planned"
version = ""
license = "Apache-2.0"
repo = ""
homepage = "https://sentinel.raskell.io/agents/telemetry/"
protocol_version = "0.1"

# Installation methods
crate_name = ""
docker_image = ""

# Compatibility
min_sentinel_version = ""
+++

## Overview

Telemetry is a non-blocking, fire-and-forget agent designed for high-volume traffic analysis. It captures request/response data, enriches it with contextual metadata, and streams it to your analytics backend without impacting request latency.

## Planned Features

- **Zero Latency Impact**: Asynchronous processing never blocks the request path
- **Rich Metadata Enrichment**: GeoIP, ASN, device fingerprinting, user agent parsing
- **AI-Ready Format**: Structured output optimized for ML pipelines and LLM analysis
- **Multiple Sinks**: Stream to Kafka, ClickHouse, BigQuery, S3, or custom endpoints
- **Sampling Controls**: Intelligent sampling for high-traffic environments
- **PII Redaction**: Automatic detection and masking of sensitive data

## Use Cases

- **Security Analytics**: Feed traffic data to SIEM systems for threat detection
- **Business Intelligence**: Understand traffic patterns, user behavior, API usage
- **ML Training Data**: Generate labeled datasets for anomaly detection models
- **Compliance Auditing**: Maintain detailed access logs with full context
- **Cost Attribution**: Track API usage per customer, endpoint, or service

## Data Enrichment

Each request is enriched with:

| Field | Description |
|-------|-------------|
| `geo.*` | Country, region, city, coordinates |
| `asn.*` | Autonomous system number, organization |
| `device.*` | Device type, OS, browser parsed from UA |
| `threat.*` | Known bad IP, Tor exit node, proxy detection |
| `timing.*` | TTFB, total duration, upstream latency |
| `sentinel.*` | Agent decisions, risk scores, matched rules |

## Architecture

```
Request → Sentinel → Telemetry Agent
              ↓              ↓ (async)
         Response      Enrich + Buffer
                             ↓
                    Analytics Backend
                    (Kafka/ClickHouse/S3)
```

## Configuration (Preview)

```kdl
agent "telemetry" {
    type "telemetry"
    transport "unix_socket" {
        path "/var/run/sentinel/telemetry.sock"
    }
    events ["request_headers" "response_headers"]
    timeout-ms 10  // Fire and forget
    failure-mode "open"

    // Enrichment options
    enrichment {
        geoip true
        asn true
        device-detection true
        threat-intel true
    }

    // Output sink
    sink "kafka" {
        brokers ["kafka:9092"]
        topic "sentinel-telemetry"
        batch-size 1000
        flush-interval-ms 5000
    }

    // Sampling for high traffic
    sampling {
        rate 0.1  // 10% of requests
        always-sample-errors true
    }
}
```

## Status

This agent is currently in the planning phase. Follow the [GitHub repository](https://github.com/raskell-io/sentinel) for updates.
