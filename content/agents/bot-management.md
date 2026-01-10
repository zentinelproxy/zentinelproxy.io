+++
title = "Bot Management"
description = "Comprehensive bot detection with multi-signal analysis, known bot verification, and behavioral tracking."
template = "agent.html"

[taxonomies]
tags = ["security", "bot-detection", "core"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Beta"
version = "0.1.0"
license = "Apache-2.0"
repo = "https://github.com/raskell-io/sentinel-agent-bot-management"
homepage = "https://sentinel.raskell.io/agents/bot-management/"
protocol_version = "0.1"

# Installation methods
crate_name = "sentinel-agent-bot-management"
docker_image = ""

# Compatibility
min_sentinel_version = "25.12.0"
+++

## Overview

A comprehensive bot detection and management agent for Sentinel. Analyzes multiple signals to classify traffic as human, good bot (search engines, monitors), or bad bot (scrapers, attackers), returning a bot score with configurable ALLOW/BLOCK/CHALLENGE decisions.

## Features

- **Multi-Signal Detection**: Combines header analysis, User-Agent validation, known bot lookup, and behavioral patterns
- **Known Bot Database**: Identifies legitimate bots (Googlebot, Bingbot, etc.) with reverse DNS verification
- **Bad Bot Patterns**: Detects security scanners (sqlmap, nikto, nuclei) and scrapers
- **Behavioral Analysis**: Tracks session patterns, request rates, and timing regularity
- **Challenge System**: HMAC-signed challenge tokens for suspicious traffic
- **Bot Score**: 0-100 score with confidence level and category classification
- **Configurable Thresholds**: Tune ALLOW/CHALLENGE/BLOCK decision boundaries

## Installation

### Using Cargo

```bash
cargo install sentinel-agent-bot-management
```

### From Source

```bash
git clone https://github.com/raskell-io/sentinel-agent-bot-management
cd sentinel-agent-bot-management
cargo build --release
```

## Configuration

### Command Line

```bash
sentinel-agent-bot-management \
    --socket /var/run/sentinel/bot-management.sock \
    --config /etc/sentinel/bot-management.yaml
```

### Sentinel Configuration

```kdl
agent "bot-management" {
    socket "/var/run/sentinel/bot-management.sock"
    timeout 50ms
    events ["request_headers"]
}

route {
    match { path-prefix "/" }
    agents ["bot-management"]
    upstream "backend"
}
```

### Agent Configuration (YAML)

```yaml
thresholds:
  allow_threshold: 30      # Score below which to allow
  block_threshold: 80      # Score above which to block
  min_confidence: 0.5      # Minimum confidence to act

detection:
  header_analysis: true
  user_agent_validation: true
  known_bot_lookup: true
  behavioral_analysis: true
  weights:
    header: 0.20
    user_agent: 0.25
    known_bot: 0.35
    behavioral: 0.20

allow_list:
  search_engines: true     # Allow Googlebot, Bingbot, etc.
  social_media: true       # Allow Facebook, Twitter crawlers
  monitoring: true         # Allow UptimeRobot, Pingdom, etc.
  seo_tools: false         # Block SEO crawlers by default
  verify_identity: true    # Verify bots via reverse DNS

challenge:
  default_type: javascript
  token_validity_seconds: 300
  cookie_name: "_sentinel_bot_check"

behavioral:
  max_sessions: 100000
  session_timeout_seconds: 3600
  rpm_threshold: 60        # Requests per minute threshold
  min_requests_for_scoring: 5
```

## Detection Methods

### Header Analysis

Detects bot characteristics from HTTP headers:

| Signal | Score Impact | Description |
|--------|-------------|-------------|
| Missing `Accept-Language` | +15 | Browsers always send this |
| Missing `Accept-Encoding` | +15 | Browsers always send this |
| Missing `sec-ch-ua` (Chrome) | +20 | Chrome 89+ sends Client Hints |
| Automation headers | +30 | `X-Selenium`, `X-Puppeteer`, etc. |
| Generic Accept (`*/*`) | +10 | Browsers send specific types |

### User-Agent Analysis

Parses and validates User-Agent strings:

| Signal | Score Impact | Description |
|--------|-------------|-------------|
| Bot keywords | +40 | `bot`, `crawler`, `spider` in UA |
| Outdated browser | +25 | Chrome < 90 (suspicious in 2026) |
| Impossible UA | +50 | Conflicting browser identifiers |
| Security scanner | +60 | sqlmap, nikto, nuclei, etc. |
| Missing UA | +30 | No User-Agent header |

### Known Bot Database

Identifies and verifies known bots:

**Good Bots (Verified):**
- Googlebot (reverse DNS: `.googlebot.com`)
- Bingbot (reverse DNS: `.search.msn.com`)
- DuckDuckBot (IP range verification)
- Facebookbot, Twitterbot, LinkedInBot
- UptimeRobot, Pingdom, Datadog

**Bad Patterns:**
- sqlmap, nikto, nessus (security scanners)
- masscan, zgrab (port/service scanners)
- gobuster, dirbuster (directory scanners)
- nuclei, wfuzz (vulnerability scanners)
- hydra (brute forcer)
- scrapy, httrack (scrapers/copiers)

### Behavioral Analysis

Tracks session patterns over time:

| Signal | Score Impact | Description |
|--------|-------------|-------------|
| High request rate | +30 | >60 requests per minute |
| Regular timing | +20 | Suspiciously consistent intervals |
| Low path diversity | +15 | Hitting same paths repeatedly |
| No resource requests | +10 | Missing CSS/JS/image requests |

## Decision Flow

```
Score ≤ 30  →  ALLOW (add bot headers)
Score > 80  →  BLOCK (403 Forbidden)
30 < Score ≤ 80  →  CHALLENGE (JS/CAPTCHA)
```

For verified good bots (Googlebot, etc.), the request is immediately allowed regardless of other signals.

## Response Headers

| Header | Description |
|--------|-------------|
| `X-Bot-Score` | Bot likelihood score (0-100) |
| `X-Bot-Category` | Classification: `human`, `search_engine`, `social_media`, `monitoring`, `malicious`, `unknown` |
| `X-Bot-Confidence` | Detection confidence (0.00-1.00) |
| `X-Bot-Verified` | Verified bot name (e.g., "Googlebot") |
| `X-Bot-Challenge` | `passed` if challenge token validated |

## Challenge System

When a request falls in the CHALLENGE range (30-80), the agent returns a challenge decision. Sentinel can be configured to:

1. **JavaScript Challenge**: Require JS execution proof
2. **CAPTCHA Challenge**: Redirect to CAPTCHA page
3. **Proof of Work**: Require computational proof

Once passed, a signed cookie token allows subsequent requests through.

## Test Examples

### Browser Request (Low Score)

```bash
curl -i http://localhost:8080/api/data \
  -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
  -H "Accept: text/html,application/xhtml+xml" \
  -H "Accept-Language: en-US,en;q=0.9" \
  -H "Accept-Encoding: gzip, deflate, br" \
  -H "sec-ch-ua: \"Chromium\";v=\"120\""
```

Expected: `X-Bot-Score: 0-20`, `X-Bot-Category: human`

### curl Request (Medium Score)

```bash
curl -i http://localhost:8080/api/data
```

Expected: `X-Bot-Score: 40-60`, likely CHALLENGE decision

### Security Scanner (High Score)

```bash
curl -i http://localhost:8080/api/data \
  -H "User-Agent: sqlmap/1.5"
```

Expected: `X-Bot-Score: 95`, BLOCK decision

### Verified Googlebot (Allowed)

```bash
# From verified Googlebot IP with proper UA
curl -i http://localhost:8080/api/data \
  -H "User-Agent: Googlebot/2.1 (+http://www.google.com/bot.html)"
```

Expected: `X-Bot-Score: 0`, `X-Bot-Verified: Googlebot`

## Performance

- **Latency**: <5ms typical detection time
- **Memory**: ~50MB for 100k tracked sessions
- **Throughput**: >50k requests/second

## Related Agents

| Agent | Integration |
|-------|-------------|
| **WAF** | Combine with attack detection |
| **Auth** | Bot detection before authentication |
| **AI Gateway** | Protect AI endpoints from scraping |

## Comparison with Other Solutions

| Feature | Bot Management | Cloudflare Bot | AWS WAF Bot |
|---------|---------------|----------------|-------------|
| Self-hosted | Yes | No | No |
| Open source | Yes | No | No |
| Custom rules | Yes | Limited | Limited |
| Reverse DNS verification | Yes | Yes | No |
| Behavioral analysis | Yes | Yes | Limited |
| Challenge types | 3 | 1 | 1 |
| Latency | <5ms | 10-50ms | 10-50ms |
