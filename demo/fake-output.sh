#!/bin/bash
# Simulated outputs for the VHS demo
# Called with: source fake-output.sh <section>

case "$1" in
  install)
    echo ""
    echo "  ╭─────────────────────────────────────╮"
    echo "  │       Zentinel Installer v0.6.1      │"
    echo "  ╰─────────────────────────────────────╯"
    echo ""
    echo "  ✓ Detected platform: aarch64-apple-darwin"
    echo "  ✓ Downloading zentinel v0.6.1..."
    echo "  ✓ Verifying signature (cosign)..."
    echo "  ✓ Installed to /usr/local/bin/zentinel"
    echo ""
    echo "  Run: zentinel --config zentinel.kdl"
    echo ""
    ;;
  version)
    echo "zentinel 0.6.1 (release 26.03_2, commit 5c23fe7)"
    ;;
  validate)
    echo "  INFO Testing configuration file: zentinel.kdl"
    echo "  INFO Configuration is valid ✓"
    ;;
  start)
    echo "  INFO Zentinel v0.6.1 starting"
    echo "  INFO Listener http bound to 0.0.0.0:8080"
    echo "  INFO Upstream backend -> 127.0.0.1:3000 (round_robin)"
    echo "  INFO Metrics available at 0.0.0.0:9090/metrics"
    echo "  INFO Ready - serving traffic"
    ;;
  curl)
    echo "{"
    echo '  "status": "ok",'
    echo '  "upstream": "127.0.0.1:3000",'
    echo '  "latency_ms": 0.42'
    echo "}"
    ;;
esac
