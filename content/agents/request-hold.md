+++
title = "Request Hold"
description = "Pause suspicious requests mid-flight for async verification, human approval, or extended analysis using Pingora's sleepable architecture."
template = "agent.html"

[taxonomies]
tags = ["security", "async", "sleepable", "unique"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Planned"
version = ""
license = "Apache-2.0"
repo = ""
homepage = "https://sentinel.raskell.io/agents/request-hold/"
protocol_version = "0.1"

# Installation methods
crate_name = ""
docker_image = ""

# Compatibility
min_sentinel_version = ""
+++

## Overview

Request Hold leverages Sentinel's unique sleepable architecture (powered by Pingora) to **pause requests mid-flight** while performing extended verification. Unlike traditional proxies that must make instant decisions, Sentinel can hold a request for seconds or even minutes while waiting for async operations to complete.

This is a **game-changer** for security workflows that require:
- Human approval for sensitive operations
- Extended ML/AI analysis
- External verification systems
- Multi-factor authentication challenges

## Why This Matters

Traditional proxies face a hard choice: **block immediately or allow**. There's no middle ground. Request Hold introduces a third option: **wait and verify**.

```
Traditional Proxy:
    Request → Instant Decision (ms) → Block or Allow

Sentinel with Request Hold:
    Request → Initial Check → Hold (seconds/minutes) → Verify → Decide
                                      ↓
                             Async Verification
                             (Human / AI / External)
```

## Planned Features

- **Sleepable Requests**: Park requests without consuming threads (Pingora magic)
- **Human-in-the-Loop**: Route high-risk requests to security team for approval
- **Challenge-Response**: Present CAPTCHAs or MFA challenges inline
- **Webhook Verification**: Call external systems and wait for approval
- **Timeout Policies**: Configurable hold duration with fallback actions
- **Queue Management**: Fair queuing to prevent resource exhaustion

## Use Cases

- **High-Value Transactions**: Hold large financial transfers for manual approval
- **Admin Actions**: Require 2FA or team approval for destructive operations
- **Suspicious Logins**: Challenge unusual login attempts with verification
- **Data Exports**: Queue bulk data requests for compliance review
- **API Abuse**: Slow down suspected scrapers without blocking legitimate users

## How It Works

```
1. Request arrives at Sentinel
2. Request Hold agent flags it as "needs verification"
3. Sentinel parks the request (sleepable - no thread blocked)
4. Agent triggers async verification:
   - Webhook to approval system
   - Push notification to security team
   - CAPTCHA challenge to user
   - Extended AI analysis
5. Verification completes → Agent signals Sentinel
6. Sentinel resumes request → Forward or Block
```

## Configuration (Preview)

```kdl
agent "request-hold" {
    type "request_hold"
    transport "unix_socket" {
        path "/var/run/sentinel/request-hold.sock"
    }
    events ["request_headers" "request_body"]
    timeout-ms 300000  // 5 minute max hold
    failure-mode "closed"

    // Trigger conditions
    triggers {
        path-pattern "/api/admin/*"
        header "X-High-Risk" "true"
        risk-score-above 0.8
    }

    // Verification method
    verification "webhook" {
        url "https://approvals.internal/verify"
        timeout-secs 120
        include-request-context true
    }

    // Fallback if verification times out
    fallback "block" {
        status 403
        message "Request requires approval"
    }
}
```

## Status

This agent is currently in the planning phase. This feature is uniquely enabled by Pingora's async runtime. Follow the [GitHub repository](https://github.com/raskell-io/sentinel) for updates.
