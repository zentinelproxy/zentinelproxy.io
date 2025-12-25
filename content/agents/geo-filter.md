+++
title = "Geo Filter"
description = "Block or allow requests based on geographic location using IP geolocation databases."
template = "agent.html"

[taxonomies]
tags = ["security", "filtering"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Planned"
version = ""
license = "MIT"
repo = "https://github.com/raskell-io/sentinel"
protocol_version = "0.1"

# Not yet available
# crate_name = "sentinel-agent-geo"
# docker_image = "ghcr.io/raskell-io/sentinel-agent-geo"
+++

## Overview

> **Status: Planned** - This agent is on the roadmap but not yet available.

The Geo Filter agent will provide geographic-based access control using MaxMind GeoIP or similar databases. Block requests from specific countries, regions, or allow only specific locations.

## Planned Features

- **Country/Region Blocking**: Allow or deny by ISO country codes
- **MaxMind Integration**: Support for GeoLite2 and GeoIP2 databases
- **IP Override Headers**: Respect X-Forwarded-For for proxied requests
- **Location Forwarding**: Add geo headers for upstream services

## Proposed Configuration

```kdl
agent "geo-filter" {
    socket "/var/run/sentinel/geo.sock"
    timeout 50ms
    fail-open true

    config {
        database "/etc/sentinel/GeoLite2-Country.mmdb"

        // Default action: allow or deny
        default-action "allow"

        // Block specific countries
        deny-countries ["RU" "CN" "KP"]

        // Or allow only specific countries
        // allow-countries ["US" "CA" "GB" "DE"]

        // Headers to check for real IP (in order)
        ip-headers ["CF-Connecting-IP" "X-Forwarded-For" "X-Real-IP"]

        // Forward location to upstream
        forward-headers {
            "X-Geo-Country" "country_code"
            "X-Geo-Region" "region"
            "X-Geo-City" "city"
        }
    }
}
```

## Response

When a request is blocked:

```http
HTTP/1.1 403 Forbidden
X-Blocked-By: geo-filter
Content-Type: application/json

{"error": "access_denied", "reason": "geo_blocked", "country": "XX"}
```

## Contribute

Interested in helping build this agent? Check out the [agent template](https://github.com/raskell-io/sentinel-agent-template) and [open an issue](https://github.com/raskell-io/sentinel/issues) to discuss!
