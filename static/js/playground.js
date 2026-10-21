// =============================================================================
// Zentinel Playground
// Validate a configuration and run a request through the real engine (the
// zentinel-playground WASM build). The pipeline shows only stages the engine
// reports: route matching, policies, agent hooks and decisions, upstream
// selection. Nothing here contacts an upstream.
// =============================================================================

import init, {
    validate,
    lint_config,
    simulate,
    simulate_with_agents,
    create_sample_request,
    init_panic_hook,
    get_version
} from '../wasm/zentinel_playground_wasm.js';

// Template Configurations
const TEMPLATES = {
    'basic': `// Vanilla Setup Configuration
// Simple reverse proxy with multiple routes and load balancing

system {
    worker-threads 4
}

listeners {
    listener "http" {
        address "0.0.0.0:8080"
        protocol "http"
    }
}

routes {
    route "api" {
        priority "high"
        matches {
            path-prefix "/api"
        }
        upstream "backend"
        policies {
            timeout-secs 30
            failure-mode "open"
        }
    }
    route "static" {
        priority "normal"
        matches {
            path-prefix "/static"
        }
        upstream "backend"
    }
    route "default" {
        priority "low"
        matches {
            path-prefix "/"
        }
        upstream "backend"
    }
}

upstreams {
    upstream "backend" {
        target "127.0.0.1:8081" weight=1
        target "127.0.0.1:8082" weight=2
        load-balancing "round_robin"
    }
}`,

    'agents': `// Agent Pipeline Configuration
// A WAF and a rate limiter run as agents in front of the API route.
// Set their mock decisions in the Agents tab, then run a request.

system {
    worker-threads 4
}

listeners {
    listener "http" {
        address "0.0.0.0:8080"
        protocol "http"
    }
}

agents {
    agent "waf" {
        type "waf"
        unix-socket path="/run/zentinel/waf.sock"
        events "request_headers"
        timeout-ms 50
    }
    agent "ratelimit" {
        type "custom"
        unix-socket path="/run/zentinel/ratelimit.sock"
        events "request_headers"
        timeout-ms 20
    }
}

filters {
    filter "waf" {
        type "agent"
        agent "waf"
        failure-mode "closed"
    }
    filter "ratelimit" {
        type "agent"
        agent "ratelimit"
        failure-mode "open"
    }
}

routes {
    route "api" {
        priority "high"
        matches {
            path-prefix "/api"
        }
        upstream "api-pool"
        filters "waf" "ratelimit"
        policies {
            timeout-secs 30
        }
    }
    route "default" {
        priority "low"
        matches {
            path-prefix "/"
        }
        upstream "web-pool"
    }
}

upstreams {
    upstream "api-pool" {
        target "10.0.0.2:8080" weight=1
        target "10.0.0.3:8080" weight=1
        load-balancing "round_robin"
    }
    upstream "web-pool" {
        target "10.0.1.2:8080"
        target "10.0.1.3:8080"
    }
}
`,

    'ai-gateway': `// AI Gateway Configuration
// LLM inference proxy with token-based rate limiting

system {
    worker-threads 4
}

// Listener for the inference API
listeners {
    listener "inference-api" {
        address "0.0.0.0:8080"
        protocol "http"
    }
}

// Inference route with token-based rate limiting
routes {
    route "openai-proxy" {
        priority 100
        matches {
            path-prefix "/v1/"
        }
        service-type "inference"
        upstream "llm-pool"

        inference {
            provider "openai"

            rate-limit {
                tokens-per-minute 100000
                requests-per-minute 500
                burst-tokens 20000
                estimation-method "chars"
            }

            routing {
                strategy "least_tokens_queued"
            }
        }

        policies {
            timeout-secs 120
            request-headers {
                set {
                    "Authorization" "Bearer \${OPENAI_API_KEY}"
                }
            }
        }
    }
}

// Upstream pool with inference health checks
upstreams {
    upstream "llm-pool" {
        target "gpu-1.internal:8080"
        target "gpu-2.internal:8080"
        target "gpu-3.internal:8080"
        load-balancing "least_tokens_queued"
    }
}`,

    'api-gateway': `// API Gateway Configuration
// Multi-version REST API with schema validation

system {
    worker-threads 4
}

listeners {
    listener "https" {
        address "0.0.0.0:8443"
        protocol "https"
        tls {
            cert-file "/etc/zentinel/certs/api.crt"
            key-file "/etc/zentinel/certs/api.key"
        }
    }
}

routes {
    // API v2 (current)
    route "api-v2" {
        priority 200
        matches {
            path-prefix "/api/v2/"
        }
        service-type "api"
        upstream "api-v2-backend"
        policies {
            timeout-secs 30
            max-body-size "5MB"
        }
    }

    // API v1 (legacy, read-only)
    route "api-v1" {
        priority 200
        matches {
            path-prefix "/api/v1/"
        }
        service-type "api"
        upstream "api-v1-backend"
        policies {
            timeout-secs 30
            max-body-size "1MB"
        }
    }

    // Health check
    route "health" {
        priority 1000
        matches { path "/health" }
        service-type "builtin"
        builtin-handler "health"
    }
}

upstreams {
    upstream "api-v2-backend" {
        target "127.0.0.1:8001"
        target "127.0.0.1:8002"
        load-balancing "round_robin"
    }

    upstream "api-v1-backend" {
        target "127.0.0.1:7001"
    }
}`,

    'microservices': `// Service Mesh Configuration
// Service-to-service routing with health checks

system {
    worker-threads 4
}

listeners {
    listener "http" {
        address "0.0.0.0:8080"
        protocol "http"
    }
}

routes {
    // Auth service
    route "auth" {
        priority 300
        matches {
            path-prefix "/auth/"
        }
        upstream "auth-service"
        policies {
            timeout-secs 10
        }
    }

    // Users service
    route "users" {
        priority 300
        matches {
            path-prefix "/users/"
        }
        upstream "users-service"
        policies {
            timeout-secs 15
        }
    }

    // Orders service
    route "orders" {
        priority 300
        matches {
            path-prefix "/orders/"
        }
        upstream "orders-service"
        policies {
            timeout-secs 30
        }
    }

    // Inventory service
    route "inventory" {
        priority 300
        matches {
            path-prefix "/inventory/"
        }
        upstream "inventory-service"
        policies {
            timeout-secs 20
        }
    }
}

upstreams {
    upstream "auth-service" {
        target "auth-1.local:3000"
        target "auth-2.local:3000"
        load-balancing "round_robin"
    }

    upstream "users-service" {
        target "users-1.local:3001"
        target "users-2.local:3001"
        load-balancing "least_connections"
    }

    upstream "orders-service" {
        target "orders-1.local:3002"
    }

    upstream "inventory-service" {
        target "inventory-1.local:3003"
        target "inventory-2.local:3003"
        load-balancing "round_robin"
    }
}`,

    'static-cdn': `// Varnish-type Caching (CDN) Configuration
// High-performance static file delivery with caching

system {
    worker-threads 4
}

listeners {
    listener "https" {
        address "0.0.0.0:8443"
        protocol "https"
        tls {
            cert-file "/etc/zentinel/certs/cdn.crt"
            key-file "/etc/zentinel/certs/cdn.key"
        }
    }

    listener "http" {
        address "0.0.0.0:8080"
        protocol "http"
    }
}

routes {
    // Static assets
    route "assets" {
        priority 500
        matches {
            path-prefix "/assets/"
        }
        service-type "static"
        static-files {
            root "/var/www/static"
            index "index.html"
            compression {
                gzip #true
                brotli #true
            }
        }
        policies {
            response-headers {
                set {
                    "Cache-Control" "public, max-age=31536000, immutable"
                    "X-Content-Type-Options" "nosniff"
                }
            }
        }
    }

    // Images
    route "images" {
        priority 500
        matches {
            path-prefix "/images/"
        }
        service-type "static"
        static-files {
            root "/var/www/images"
            compression {
                gzip #true
            }
        }
        policies {
            response-headers {
                set {
                    "Cache-Control" "public, max-age=604800"
                }
            }
        }
    }

    // Main site (SPA)
    route "webapp" {
        priority 100
        matches {
            path-prefix "/"
        }
        service-type "static"
        static-files {
            root "/var/www/app"
            index "index.html"
            fallback "index.html"
            compression {
                gzip #true
                brotli #true
            }
        }
    }
}`,

    'websocket': `// WebSocket Proxy Configuration
// Real-time connection handling with upgrade support

system {
    worker-threads 4
}

listeners {
    listener "https" {
        address "0.0.0.0:8443"
        protocol "https"
        tls {
            cert-file "/etc/zentinel/certs/ws.crt"
            key-file "/etc/zentinel/certs/ws.key"
        }
    }
}

routes {
    // WebSocket chat
    route "chat-ws" {
        priority 300
        matches {
            path-prefix "/ws/chat"
        }
        upstream "chat-backend"
        policies {
            timeout-secs 3600
        }
    }

    // WebSocket notifications
    route "notifications-ws" {
        priority 300
        matches {
            path-prefix "/ws/notifications"
        }
        upstream "notifications-backend"
        policies {
            timeout-secs 3600
        }
    }

    // HTTP API fallback
    route "api" {
        priority 200
        matches {
            path-prefix "/api/"
        }
        service-type "api"
        upstream "api-backend"
        policies {
            timeout-secs 30
        }
    }

    // Web interface
    route "webapp" {
        priority 100
        matches {
            path-prefix "/"
        }
        service-type "web"
        upstream "web-backend"
    }
}

upstreams {
    upstream "chat-backend" {
        target "127.0.0.1:9001"
        target "127.0.0.1:9002"
        load-balancing "least_connections"
    }

    upstream "notifications-backend" {
        target "127.0.0.1:9003"
    }

    upstream "api-backend" {
        target "127.0.0.1:8001"
    }

    upstream "web-backend" {
        target "127.0.0.1:8000"
    }
}`,

    'security': `// Security Gateway Configuration
// WAF, rate limiting, and security headers

system {
    worker-threads 4
}

listeners {
    listener "https" {
        address "0.0.0.0:8443"
        protocol "https"
        tls {
            cert-file "/etc/zentinel/certs/secure.crt"
            key-file "/etc/zentinel/certs/secure.key"
            min-version "TLS1.2"
        }
    }
}

routes {
    // Health check (no security)
    route "health" {
        priority 1000
        matches { path "/health" }
        service-type "builtin"
        builtin-handler "health"
    }

    // Public API (WAF + rate limit)
    route "public-api" {
        priority 500
        matches {
            path-prefix "/public/"
        }
        upstream "backend"
        policies {
            response-headers {
                set {
                    "X-Content-Type-Options" "nosniff"
                    "X-Frame-Options" "DENY"
                    "X-XSS-Protection" "1; mode=block"
                    "Strict-Transport-Security" "max-age=31536000"
                }
                remove "Server" "X-Powered-By"
            }
        }
    }

    // Protected API (WAF + auth + strict rate limit)
    route "protected-api" {
        priority 600
        matches {
            path-prefix "/api/"
        }
        service-type "api"
        upstream "backend"
        policies {
            timeout-secs 30
            max-body-size "5MB"
            response-headers {
                set {
                    "X-Content-Type-Options" "nosniff"
                    "Cache-Control" "no-store"
                }
                remove "Server" "X-Powered-By"
            }
        }
    }

    // Admin (strictest security)
    route "admin" {
        priority 700
        matches {
            path-prefix "/admin/"
        }
        upstream "backend"
        policies {
            failure-mode "closed"
            response-headers {
                set {
                    "X-Content-Type-Options" "nosniff"
                    "X-Frame-Options" "DENY"
                    "Cache-Control" "no-store, no-cache, must-revalidate"
                }
            }
        }
    }
}

upstreams {
    upstream "backend" {
        target "127.0.0.1:3000"
    }
}

observability {
    metrics {
        enabled #true
        address "0.0.0.0:9090"
    }
    logging {
        level "info"
        format "json"
    }
}`,

    'canary': `// Canary Deployment Configuration
// Gradual rollout with weighted traffic splitting

system {
    worker-threads 4
}

listeners {
    listener "http" {
        address "0.0.0.0:8080"
        protocol "http"
    }
}

routes {
    // Canary release - 10% traffic to new version
    route "api-canary" {
        priority 300
        matches {
            path-prefix "/api/"
            header "X-Canary-User" "true"
        }
        upstream "api-v2-canary"
    }

    // Main API - 90% traffic to stable version
    route "api-stable" {
        priority 200
        matches {
            path-prefix "/api/"
        }
        upstream "api-v1-stable"
    }
}

upstreams {
    // New version (10% traffic)
    upstream "api-v2-canary" {
        target "127.0.0.1:8002"
        target "127.0.0.1:8003"
        load-balancing "round_robin"
    }

    // Stable version (90% traffic)
    upstream "api-v1-stable" {
        target "127.0.0.1:8001"
        target "127.0.0.1:8004"
        target "127.0.0.1:8005"
        load-balancing "least_connections"
    }
}`,

    'content-routing': `// Content Router Configuration
// Header-based and path-based intelligent routing

system {
    worker-threads 4
}

listeners {
    listener "http" {
        address "0.0.0.0:8080"
        protocol "http"
    }
}

routes {
    // Mobile API (special handling for mobile clients)
    route "mobile-api" {
        priority 500
        matches {
            path-prefix "/api/"
            header "User-Agent" ".*Mobile.*"
        }
        upstream "mobile-backend"
        policies {
            timeout-secs 60
        }
    }

    // JSON API
    route "json-api" {
        priority 400
        matches {
            path-prefix "/api/"
            header "Accept" "application/json"
        }
        upstream "json-backend"
        policies {
            timeout-secs 30
        }
    }

    // XML API (legacy)
    route "xml-api" {
        priority 400
        matches {
            path-prefix "/api/"
            header "Accept" "application/xml"
        }
        upstream "xml-backend"
        policies {
            timeout-secs 30
        }
    }

    // Default API
    route "default-api" {
        priority 100
        matches {
            path-prefix "/api/"
        }
        upstream "default-backend"
    }
}

upstreams {
    upstream "mobile-backend" {
        target "127.0.0.1:9001"
        target "127.0.0.1:9002"
        load-balancing "least_connections"
    }

    upstream "json-backend" {
        target "127.0.0.1:8001"
        target "127.0.0.1:8002"
        load-balancing "round_robin"
    }

    upstream "xml-backend" {
        target "127.0.0.1:7001"
    }

    upstream "default-backend" {
        target "127.0.0.1:8000"
    }
}`,

    'grpc': `// gRPC Gateway Configuration
// HTTP/2 gRPC service proxy with load balancing

system {
    worker-threads 4
}

listeners {
    listener "grpc" {
        address "0.0.0.0:8080"
        protocol "h2"
    }
}

routes {
    // User service
    route "user-service" {
        priority 300
        matches {
            path-prefix "/user.UserService/"
        }
        upstream "user-grpc"
        policies {
            timeout-secs 30
        }
    }

    // Order service
    route "order-service" {
        priority 300
        matches {
            path-prefix "/order.OrderService/"
        }
        upstream "order-grpc"
        policies {
            timeout-secs 45
        }
    }

    // Inventory service
    route "inventory-service" {
        priority 300
        matches {
            path-prefix "/inventory.InventoryService/"
        }
        upstream "inventory-grpc"
        policies {
            timeout-secs 30
        }
    }
}

upstreams {
    upstream "user-grpc" {
        target "user-1.svc.local:9090"
        target "user-2.svc.local:9090"
        load-balancing "round_robin"
    }

    upstream "order-grpc" {
        target "order-1.svc.local:9090"
        target "order-2.svc.local:9090"
        load-balancing "least_connections"
    }

    upstream "inventory-grpc" {
        target "inventory.svc.local:9090"
    }
}`,

    'multi-region': `// Multi-Region Configuration
// Geographic routing with failover across regions

system {
    worker-threads 4
}

listeners {
    listener "http" {
        address "0.0.0.0:8080"
        protocol "http"
    }
}

routes {
    // US East traffic
    route "api-us-east" {
        priority 400
        matches {
            path-prefix "/api/"
            header "X-Region" "us-east"
        }
        upstream "us-east-backend"
    }

    // US West traffic
    route "api-us-west" {
        priority 400
        matches {
            path-prefix "/api/"
            header "X-Region" "us-west"
        }
        upstream "us-west-backend"
    }

    // EU traffic
    route "api-eu" {
        priority 400
        matches {
            path-prefix "/api/"
            header "X-Region" "eu"
        }
        upstream "eu-backend"
    }

    // Asia-Pacific traffic
    route "api-apac" {
        priority 400
        matches {
            path-prefix "/api/"
            header "X-Region" "apac"
        }
        upstream "apac-backend"
    }

    // Default (nearest region)
    route "api-default" {
        priority 100
        matches {
            path-prefix "/api/"
        }
        upstream "us-east-backend"
    }
}

upstreams {
    upstream "us-east-backend" {
        target "us-east-1.example.com:8080"
        target "us-east-2.example.com:8080"
        load-balancing "least_connections"
    }

    upstream "us-west-backend" {
        target "us-west-1.example.com:8080"
        target "us-west-2.example.com:8080"
        load-balancing "least_connections"
    }

    upstream "eu-backend" {
        target "eu-central-1.example.com:8080"
        target "eu-west-1.example.com:8080"
        load-balancing "least_connections"
    }

    upstream "apac-backend" {
        target "apac-east-1.example.com:8080"
        target "apac-southeast-1.example.com:8080"
        load-balancing "least_connections"
    }
}
`
};


// =============================================================================
// DOM
// =============================================================================

const $ = (id) => document.getElementById(id);
const configEditor = $('config-editor');
const highlightPre = $('editor-highlight');
const highlightCode = $('highlight-code');
const gutter = $('pg-gutter');
const marks = $('pg-marks');
const statusEl = $('validation-status');
const statusIcon = $('status-icon');
const statusText = $('status-text');
const problemsEl = $('error-display');
const runBtn = $('simulate-btn');
const pipelineEl = $('flow-diagram');
const detailEl = $('pg-detail');
const warningsEl = $('pg-warnings');
const rawOut = $('trace-content');
const announceEl = $('pg-announce');
const headersList = $('headers-list');
const presetSelect = $('pg-preset');
const presetDesc = $('pg-preset-desc');
const agentsEmpty = $('agents-empty');
const agentsList = $('agents-list');
const agentsCount = $('agents-count');
const configPanel = $('config-panel');

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
document.querySelectorAll('[data-mod]').forEach((el) => { el.textContent = isMac ? '⌘' : 'Ctrl'; });

// State
let wasmReady = false;
let lastValidation = null;
let debounceTimer = null;
let lastRaw = null;
let stages = [];
let selectedStage = null;
let runToken = 0;
const agentMocks = new Map(); // agent id -> mock response settings, kept across edits

// =============================================================================
// Small helpers
// =============================================================================

function escapeHtml(str) {
    if (typeof str !== 'string') str = String(str);
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

const code = (s) => `<code>${escapeHtml(s)}</code>`;

function announce(text) {
    announceEl.textContent = '';
    // a new text node each time so repeated messages are read again
    requestAnimationFrame(() => { announceEl.textContent = text; });
}

const ICON = {
    pass: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>',
    blocked: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><line x1="5.6" y1="5.6" x2="18.4" y2="18.4"/></svg>',
    redirect: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h12"/><path d="m13 6 6 6-6 6"/></svg>',
    error: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    unreached: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="6" y1="12" x2="18" y2="12"/></svg>',
    loading: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.2-8.6"/></svg>',
    copy: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>',
    check: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>',
    remove: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
};

// Words for each outcome, so state is never carried by colour alone.
const STATE_WORD = {
    pass: 'passed', blocked: 'stopped', redirect: 'redirected', error: 'error',
    info: 'noted', unreached: 'not reached', pending: 'waiting',
};

// Copy text and confirm on the button (data-copied) and to screen readers.
async function copyWithFeedback(btn, text, label = 'Copied') {
    try {
        await navigator.clipboard.writeText(text);
    } catch (e) {
        announce('Copy failed: the browser blocked clipboard access.');
        return false;
    }
    const before = btn.innerHTML;
    btn.setAttribute('data-copied', '');
    btn.innerHTML = `${ICON.check}<span>${label}</span>`;
    announce(label);
    clearTimeout(btn._copyTimer);
    btn._copyTimer = setTimeout(() => {
        btn.removeAttribute('data-copied');
        btn.innerHTML = before;
    }, 1800);
    return true;
}

// =============================================================================
// Editor: highlighting, line numbers, line marks, keys
// =============================================================================

const kdlKeywords = new Set([
    'system', 'listeners', 'listener', 'routes', 'route', 'upstreams', 'upstream',
    'matches', 'policies', 'target', 'health-check', 'agents', 'agent', 'limits',
    'tls', 'cache', 'rate-limit', 'circuit-breaker', 'retry', 'timeout', 'filters', 'filter'
]);

function highlightKDL(src) {
    let out = '';
    let i = 0;
    const len = src.length;
    while (i < len) {
        const ch = src[i];
        if (ch === '/' && src[i + 1] === '/') {
            const end = src.indexOf('\n', i);
            const c = end === -1 ? src.slice(i) : src.slice(i, end);
            out += `<span class="hl-comment">${escapeHtml(c)}</span>`;
            i += c.length;
            continue;
        }
        if (ch === '/' && src[i + 1] === '*') {
            const end = src.indexOf('*/', i + 2);
            const c = end === -1 ? src.slice(i) : src.slice(i, end + 2);
            out += `<span class="hl-comment">${escapeHtml(c)}</span>`;
            i += c.length;
            continue;
        }
        if (ch === '"') {
            let j = i + 1;
            while (j < len && src[j] !== '"' && src[j] !== '\n') {
                if (src[j] === '\\') j++;
                j++;
            }
            const s = src.slice(i, j + 1);
            out += `<span class="hl-string">${escapeHtml(s)}</span>`;
            i = j + 1;
            continue;
        }
        if (/[0-9]/.test(ch) || (ch === '-' && /[0-9]/.test(src[i + 1]))) {
            let j = i + (ch === '-' ? 1 : 0);
            while (j < len && /[0-9._eE+-]/.test(src[j])) j++;
            out += `<span class="hl-number">${escapeHtml(src.slice(i, j))}</span>`;
            i = j;
            continue;
        }
        if (/[a-zA-Z_]/.test(ch)) {
            let j = i;
            while (j < len && /[a-zA-Z0-9_-]/.test(src[j])) j++;
            const w = src.slice(i, j);
            const cls = src[j] === '=' ? 'hl-property'
                : kdlKeywords.has(w) ? 'hl-keyword'
                : (w === 'true' || w === 'false' || w === 'null') ? 'hl-constant' : 'hl-node';
            out += `<span class="${cls}">${escapeHtml(w)}</span>`;
            i = j;
            continue;
        }
        if (ch === '{' || ch === '}') { out += `<span class="hl-brace">${ch}</span>`; i++; continue; }
        if (ch === '=' || ch === ';') { out += `<span class="hl-operator">${ch}</span>`; i++; continue; }
        out += escapeHtml(ch);
        i++;
    }
    return out;
}

let lastLineCount = 0;
function refreshEditor() {
    const src = configEditor.value;
    highlightCode.innerHTML = highlightKDL(src) + '\n';
    const n = src.split('\n').length;
    if (n !== lastLineCount) {
        let html = '';
        for (let k = 1; k <= n; k++) html += `<span>${k}</span>`;
        gutter.innerHTML = html;
        lastLineCount = n;
    }
    syncScroll();
}

function syncScroll() {
    const { scrollTop, scrollLeft } = configEditor;
    highlightPre.style.transform = `translate(${-scrollLeft}px, ${-scrollTop}px)`;
    marks.style.transform = `translateY(${-scrollTop}px)`;
    gutter.style.transform = `translateY(${-scrollTop}px)`;
}

function lineHeightPx() {
    return parseFloat(getComputedStyle(configEditor).lineHeight) || 22;
}

// Mark editor lines [from, to] (1-based) and bring the first into view.
function markLines(ranges, { scroll = true } = {}) {
    marks.innerHTML = '';
    gutter.querySelectorAll('.is-marked').forEach((el) => el.classList.remove('is-marked'));
    if (!ranges || ranges.length === 0) return;
    const lh = lineHeightPx();
    const padTop = parseFloat(getComputedStyle(configEditor).paddingTop) || 0;
    for (const [from, to] of ranges) {
        const m = document.createElement('div');
        m.className = 'pg-mark';
        m.style.top = `${padTop + (from - 1) * lh}px`;
        m.style.height = `${(to - from + 1) * lh}px`;
        marks.appendChild(m);
        for (let k = from; k <= to; k++) gutter.children[k - 1]?.classList.add('is-marked');
    }
    if (scroll) {
        const first = ranges[0][0];
        const top = padTop + (first - 1) * lh;
        const view = configEditor.clientHeight;
        if (top < configEditor.scrollTop || top > configEditor.scrollTop + view - lh * 2) {
            configEditor.scrollTop = Math.max(0, top - lh * 2);
            syncScroll();
        }
    }
}

function goToLine(line) {
    const lines = configEditor.value.split('\n');
    const idx = lines.slice(0, line - 1).reduce((a, l) => a + l.length + 1, 0);
    configEditor.focus();
    configEditor.setSelectionRange(idx, idx + (lines[line - 1] || '').length);
    markLines([[line, line]]);
}

// Find a block such as `route "api" { … }` and return its [first, last] line.
// Only names written as quoted node arguments are found; that is how every
// block the engine reports by id is declared.
function findBlock(keyword, name, within) {
    const lines = configEditor.value.split('\n');
    const lo = within ? within[0] - 1 : 0;
    const hi = within ? within[1] : lines.length;
    const re = name == null
        ? new RegExp(`^\\s*${keyword}\\s*\\{`)
        : new RegExp(`^\\s*${keyword}\\s+"${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`);
    for (let k = lo; k < hi; k++) {
        if (!re.test(lines[k])) continue;
        let depth = 0;
        let opened = false;
        for (let j = k; j < hi; j++) {
            const text = lines[j].replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/\/\/.*$/, '');
            for (const c of text) {
                if (c === '{') { depth++; opened = true; }
                else if (c === '}') depth--;
            }
            if (opened && depth <= 0) return [k + 1, j + 1];
            if (!opened && j > k) break;
        }
        return [k + 1, k + 1];
    }
    return null;
}

configEditor.addEventListener('input', () => {
    refreshEditor();
    markLines(null);
    if (presetSelect.value !== 'custom' && configEditor.value !== TEMPLATES[presetSelect.value]) {
        presetSelect.value = 'custom';
        presetDesc.textContent = 'Edited. Reset restores the last example.';
    }
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(validateConfig, 250);
});
configEditor.addEventListener('scroll', syncScroll);

// Tab inserts four spaces (Shift+Tab outdents). Esc releases Tab for one
// keystroke so keyboard users can leave the editor.
let tabReleased = false;
configEditor.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { tabReleased = true; return; }
    if (e.key !== 'Tab' || tabReleased || e.ctrlKey || e.metaKey || e.altKey) {
        if (e.key !== 'Tab') tabReleased = false;
        return;
    }
    e.preventDefault();
    const { selectionStart: s, selectionEnd: t, value: v } = configEditor;
    const lineStart = v.lastIndexOf('\n', s - 1) + 1;
    if (e.shiftKey) {
        const lead = v.slice(lineStart, lineStart + 4).match(/^ {1,4}/);
        if (!lead) return;
        configEditor.setRangeText('', lineStart, lineStart + lead[0].length, 'preserve');
    } else if (s !== t && v.slice(s, t).includes('\n')) {
        // indent every selected line
        const block = v.slice(lineStart, t);
        const indented = block.replace(/^/gm, '    ');
        configEditor.setRangeText(indented, lineStart, t, 'select');
    } else {
        configEditor.setRangeText('    ', s, t, 'end');
    }
    configEditor.dispatchEvent(new Event('input'));
});
configEditor.addEventListener('blur', () => { tabReleased = false; });

// Ctrl/Cmd+Enter runs from anywhere on the page.
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        runSimulation();
    }
});

// =============================================================================
// Engine
// =============================================================================

function setStatus(type, text) {
    statusText.textContent = text;
    statusEl.dataset.state = type;
    statusIcon.innerHTML = type === 'valid' ? ICON.pass
        : type === 'invalid' ? ICON.blocked
        : type === 'warning' ? ICON.error
        : type === 'loading' ? ICON.loading : '';
}

async function initWasm() {
    setStatus('loading', 'Loading the engine…');
    runBtn.disabled = true;
    try {
        await init();
        init_panic_hook();
        wasmReady = true;
        try {
            const v = $('wasm-version');
            if (v) v.textContent = get_version();
        } catch (e) { /* version is cosmetic */ }
        runBtn.disabled = false;
        validateConfig();
    } catch (e) {
        console.error('WASM init error:', e);
        setStatus('invalid', 'Engine failed to load');
        const v = $('wasm-version');
        if (v) v.textContent = 'Load failed';
        let why = 'Please refresh the page or try another browser.';
        if (/CompileError|instantiate/.test(e.message || '')) why = 'Your browser may not support WebAssembly, or an extension is blocking it.';
        else if (/NetworkError|fetch/.test(e.message || '')) why = 'The module could not be downloaded. Check your connection.';
        problemsEl.innerHTML = `<div class="pg-problem" data-severity="error">${ICON.blocked}<div><strong>The WebAssembly engine did not load.</strong> ${escapeHtml(why)}</div></div>`;
    }
}

// Run the checks `zentinel validate` and `zentinel lint` would. `validate`
// does not look for settings nothing reads (a typo'd key parses, is dropped,
// and the page said "Valid"), so lint's unknown-key findings are shown as
// warnings; its best-practice advice is left out, every example would carry it.
// A route naming an upstream that does not exist stops the proxy from
// starting, but payloads up to 0.6.46 report it only as a warning, so it is
// treated as an error here; newer payloads already fail validation for it.
const FATAL_WARNINGS = new Set(['UNDEFINED_UPSTREAM']);

function checkConfig(config) {
    const result = validate(config);
    if (!result.valid) return result;
    const fatal = (result.warnings || []).filter((w) => FATAL_WARNINGS.has(w.code));
    if (fatal.length > 0) {
        return { ...result, valid: false, errors: [...new Set(fatal.map((w) => w.message))].map((message) => ({ message, severity: 'error' })) };
    }
    const lint = lint_config(config);
    const ignored = ((lint && lint.warnings) || []).filter((w) => w.code === 'unknown-key');
    return { ...result, warnings: [...(result.warnings || []), ...ignored] };
}

// The engine's parse errors carry "--> at line N, column M".
function errorLine(message) {
    const m = /at line (\d+)(?:, column (\d+))?/.exec(message || '');
    return m ? Number(m[1]) : null;
}

function renderProblems(items, severity) {
    if (!items || items.length === 0) {
        problemsEl.innerHTML = '';
        return;
    }
    problemsEl.innerHTML = items.map((p) => {
        const line = errorLine(p.message);
        const [first, ...rest] = String(p.message).split('\n');
        return `<div class="pg-problem" data-severity="${severity}">
            ${severity === 'error' ? ICON.blocked : ICON.error}
            <div class="pg-problem-body">
                <span class="pg-problem-kind">${severity === 'error' ? 'Error' : 'Warning'}</span>
                <span>${escapeHtml(first)}</span>
                ${line ? `<button type="button" class="pg-linkbtn" data-goto="${line}">Go to line ${line}</button>` : ''}
                ${rest.length ? `<details><summary>Details</summary><pre>${escapeHtml(rest.join('\n'))}</pre></details>` : ''}
            </div>
        </div>`;
    }).join('');
}

problemsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-goto]');
    if (b) goToLine(Number(b.dataset.goto));
});

function validateConfig() {
    if (!wasmReady) return;
    try {
        lastValidation = checkConfig(configEditor.value);
    } catch (e) {
        lastValidation = { valid: false, errors: [{ message: e.message || String(e), severity: 'error' }] };
    }
    if (lastValidation.valid) {
        const n = (lastValidation.warnings || []).length;
        if (n) {
            setStatus('warning', `Valid, ${n} warning${n > 1 ? 's' : ''}`);
            renderProblems(lastValidation.warnings, 'warning');
        } else {
            setStatus('valid', 'Valid');
            renderProblems([]);
        }
    } else {
        const n = lastValidation.errors.length;
        setStatus('invalid', `${n} error${n > 1 ? 's' : ''}`);
        renderProblems(lastValidation.errors, 'error');
        const line = errorLine(lastValidation.errors[0]?.message);
        markLines(line ? [[line, line]] : null, { scroll: false });
    }
    renderAgentMocks();
}

// =============================================================================
// Request input
// =============================================================================

function addHeaderRow(key = '', value = '') {
    const row = document.createElement('div');
    row.className = 'pg-header-row';
    const n = headersList.children.length + 1;
    row.innerHTML = `
        <input class="z-input z-input--sm z-input--mono header-key" type="text" placeholder="Name" aria-label="Header ${n} name" value="${escapeHtml(key)}" spellcheck="false">
        <input class="z-input z-input--sm z-input--mono header-value" type="text" placeholder="Value" aria-label="Header ${n} value" value="${escapeHtml(value)}" spellcheck="false">
        <button type="button" class="z-btn z-btn--ghost z-btn--sm z-btn--icon" aria-label="Remove header ${n}">${ICON.remove}</button>`;
    row.querySelector('button').addEventListener('click', () => {
        const next = row.nextElementSibling || row.previousElementSibling;
        row.remove();
        (next?.querySelector('input') || $('add-header-btn')).focus();
    });
    headersList.appendChild(row);
    return row;
}
$('add-header-btn').addEventListener('click', () => addHeaderRow().querySelector('input').focus());

function parseRawRequest(rawText) {
    const lines = rawText.replace(/\r/g, '').trim().split('\n');
    const m = /^(\w+)\s+(\S+)(?:\s+HTTP\/[\d.]+)?$/i.exec((lines[0] || '').trim());
    if (!m) return { error: 'The first line must look like: GET /path HTTP/1.1' };
    const headers = {};
    let host = 'example.com';
    for (let k = 1; k < lines.length; k++) {
        const line = lines[k].trim();
        if (line === '') break;
        const c = line.indexOf(':');
        if (c <= 0) return { error: `Line ${k + 1} is not a header ("Name: value").` };
        const key = line.slice(0, c).trim();
        const value = line.slice(c + 1).trim();
        if (key.toLowerCase() === 'host') host = value;
        else headers[key] = value;
    }
    return { method: m[1].toUpperCase(), host, path: m[2].split('?')[0], headers };
}

function activeTab() {
    return document.querySelector('.pg-tabs [aria-selected="true"]').id.replace('tab-btn-', '');
}

function collectRequest() {
    if (activeTab() === 'raw') return parseRawRequest($('raw-request').value);
    const path = $('request-path').value.trim() || '/';
    const headers = {};
    headersList.querySelectorAll('.pg-header-row').forEach((row) => {
        const k = row.querySelector('.header-key').value.trim();
        if (k) headers[k] = row.querySelector('.header-value').value.trim();
    });
    const pathInput = $('request-path');
    if (!path.startsWith('/')) {
        pathInput.setAttribute('aria-invalid', 'true');
        return { error: 'The path must start with "/".', field: pathInput };
    }
    pathInput.removeAttribute('aria-invalid');
    return { method: $('request-method').value, host: $('request-host').value.trim() || 'example.com', path, headers };
}

// Tabs (roving tabindex, arrow keys)
const tabButtons = [...document.querySelectorAll('.pg-tabs [role="tab"]')];
function selectTab(btn, focus = false) {
    tabButtons.forEach((b) => {
        const on = b === btn;
        b.setAttribute('aria-selected', String(on));
        b.tabIndex = on ? 0 : -1;
        $(b.getAttribute('aria-controls')).hidden = !on;
    });
    if (focus) btn.focus();
}
tabButtons.forEach((b, k) => {
    b.addEventListener('click', () => selectTab(b));
    b.addEventListener('keydown', (e) => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (e.key === 'Home') { e.preventDefault(); selectTab(tabButtons[0], true); }
        else if (e.key === 'End') { e.preventDefault(); selectTab(tabButtons[tabButtons.length - 1], true); }
        else if (d) { e.preventDefault(); selectTab(tabButtons[(k + d + tabButtons.length) % tabButtons.length], true); }
    });
});

// =============================================================================
// Agent mocks (the Agents tab)
// =============================================================================

// Agents declared in the config: `agent "name" { type "…" … }` inside `agents { }`.
function declaredAgents() {
    const block = findBlock('agents', null);
    if (!block) return [];
    const lines = configEditor.value.split('\n').slice(block[0] - 1, block[1]);
    const out = [];
    lines.forEach((l, k) => {
        const m = /^\s*agent\s+"([^"]+)"/.exec(l);
        if (!m) return;
        const range = findBlock('agent', m[1], block);
        const body = range ? configEditor.value.split('\n').slice(range[0] - 1, range[1]).join('\n') : '';
        const type = (/^\s*type\s+"([^"]+)"/m.exec(body) || [])[1] || '';
        out.push({ id: m[1], type, line: block[0] + k });
    });
    return out;
}

function mockFor(id) {
    if (!agentMocks.has(id)) agentMocks.set(id, { decision: 'allow', status: 403, body: '', url: '', redirectStatus: 302, headers: [], ruleIds: '', tags: '' });
    return agentMocks.get(id);
}

function renderAgentMocks() {
    const agents = lastValidation?.valid ? declaredAgents() : [];
    agentsCount.hidden = agents.length === 0;
    agentsCount.textContent = agents.length;
    agentsEmpty.hidden = agents.length > 0;
    const ids = agents.map((a) => a.id).join('|');
    if (agentsList.dataset.ids === ids) return; // keep focus and edits while typing
    agentsList.dataset.ids = ids;
    agentsList.innerHTML = agents.map((a) => {
        const m = mockFor(a.id);
        const name = `mock-${a.id}`;
        return `<fieldset class="pg-agent" data-agent="${escapeHtml(a.id)}">
            <legend><span class="pg-agent-name">${escapeHtml(a.id)}</span>${a.type ? ` <span class="pg-agent-type">${escapeHtml(a.type)}</span>` : ''}</legend>
            <div class="z-segmented" role="radiogroup" aria-label="Mock decision for ${escapeHtml(a.id)}">
                ${['allow', 'block', 'redirect'].map((d) => `<label><input type="radio" name="${escapeHtml(name)}" value="${d}" ${m.decision === d ? 'checked' : ''}>${d[0].toUpperCase() + d.slice(1)}</label>`).join('')}
            </div>
            <div class="pg-agent-fields" data-for="block" ${m.decision === 'block' ? '' : 'hidden'}>
                <label class="z-field"><span class="z-label">Status</span><input class="z-input z-input--sm" type="number" min="400" max="599" data-k="status" value="${m.status}"></label>
                <label class="z-field"><span class="z-label">Body</span><input class="z-input z-input--sm" type="text" data-k="body" placeholder="Blocked by agent" value="${escapeHtml(m.body)}"></label>
            </div>
            <div class="pg-agent-fields" data-for="redirect" ${m.decision === 'redirect' ? '' : 'hidden'}>
                <label class="z-field"><span class="z-label">Location</span><input class="z-input z-input--sm" type="url" data-k="url" placeholder="https://example.com/login" value="${escapeHtml(m.url)}"></label>
                <label class="z-field"><span class="z-label">Status</span><input class="z-input z-input--sm" type="number" min="300" max="399" data-k="redirectStatus" value="${m.redirectStatus}"></label>
            </div>
            <details class="pg-agent-more">
                <summary>Header changes and audit</summary>
                <div class="pg-agent-fields">
                    <label class="z-field"><span class="z-label">Set request headers</span><input class="z-input z-input--sm z-input--mono" type="text" data-k="headers" placeholder="x-waf-score: 3, x-user: alice" value="${escapeHtml(m.headers.map((h) => `${h.name}: ${h.value}`).join(', '))}"></label>
                    <label class="z-field"><span class="z-label">Rule IDs</span><input class="z-input z-input--sm" type="text" data-k="ruleIds" placeholder="942100, 941100" value="${escapeHtml(m.ruleIds)}"></label>
                    <label class="z-field"><span class="z-label">Tags</span><input class="z-input z-input--sm" type="text" data-k="tags" placeholder="sql-injection" value="${escapeHtml(m.tags)}"></label>
                </div>
            </details>
        </fieldset>`;
    }).join('');
}

agentsList.addEventListener('input', (e) => {
    const card = e.target.closest('.pg-agent');
    if (!card) return;
    const m = mockFor(card.dataset.agent);
    if (e.target.type === 'radio') {
        m.decision = e.target.value;
        card.querySelectorAll('[data-for]').forEach((el) => { el.hidden = el.dataset.for !== m.decision; });
        return;
    }
    const k = e.target.dataset.k;
    if (!k) return;
    if (k === 'headers') {
        m.headers = e.target.value.split(',').map((p) => p.trim()).filter(Boolean).map((p) => {
            const c = p.indexOf(':');
            return c > 0 ? { name: p.slice(0, c).trim(), value: p.slice(c + 1).trim() } : { name: p, value: '' };
        });
    } else if (k === 'status' || k === 'redirectStatus') {
        m[k] = parseInt(e.target.value, 10) || (k === 'status' ? 403 : 302);
    } else {
        m[k] = e.target.value;
    }
});

function agentResponses(ids) {
    const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
    return ids.map((id) => {
        const m = mockFor(id);
        const decision = { type: m.decision };
        if (m.decision === 'block') { decision.status = m.status; if (m.body) decision.body = m.body; }
        if (m.decision === 'redirect') { decision.url = m.url || 'https://example.com/'; decision.status = m.redirectStatus; }
        return {
            agent_id: id,
            decision,
            request_headers: m.headers.map((h) => ({ op: 'set', name: h.name, value: h.value })),
            response_headers: [],
            audit: { rule_ids: list(m.ruleIds), tags: list(m.tags) },
        };
    });
}

document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-load-preset]');
    if (b) {
        loadPreset(b.dataset.loadPreset);
        presetSelect.focus();
    }
});

// =============================================================================
// Pipeline: built only from what the engine returned
// =============================================================================

function kv(rows) {
    return `<dl class="pg-kv">${rows.filter(Boolean).map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
}

function buildStages(req, sim, agents) {
    const out = [];
    const routeBlock = sim.matched_route ? findBlock('route', sim.matched_route.id) : null;

    // 1. The request as sent
    const hdrs = Object.entries(req.headers || {});
    out.push({
        id: 'request', title: 'Request', state: 'pass',
        summary: `${req.method} ${req.host}${req.path}`,
        details: kv([
            ['Method', code(req.method)], ['Host', code(req.host)], ['Path', code(req.path)],
            ['Headers', hdrs.length ? hdrs.map(([k, v]) => code(`${k}: ${v}`)).join('<br>') : '<span class="pg-muted">none</span>'],
        ]),
    });

    // 2. Route matching (match_trace)
    const trace = sim.match_trace || [];
    const traceTable = trace.length ? `<table class="pg-table"><thead><tr><th>Route</th><th>Result</th><th>Why</th></tr></thead><tbody>${trace.map((t) => {
        const why = (t.condition_details || []).map((c) => escapeHtml(c.explanation)).join('<br>') || escapeHtml(t.reason);
        const word = t.result === 'match' ? 'matched' : t.result === 'skipped' ? 'skipped' : 'no match';
        return `<tr data-result="${escapeHtml(t.result)}"><td>${code(t.route_id)}</td><td>${word}</td><td>${why}</td></tr>`;
    }).join('')}</tbody></table>` : '<p class="pg-muted">No routes were evaluated.</p>';
    if (sim.matched_route) {
        const r = sim.matched_route;
        out.push({
            id: 'route', title: 'Route matching', state: 'pass',
            summary: `route "${r.id}" (priority ${r.priority})`,
            details: kv([['Matched', code(r.id)], ['Priority', escapeHtml(r.priority)], r.service_type && ['Service type', escapeHtml(r.service_type)], r.upstream && ['Upstream', code(r.upstream)]]) + traceTable,
            lines: routeBlock ? [routeBlock] : null,
        });
    } else {
        out.push({
            id: 'route', title: 'Route matching', state: 'blocked',
            summary: trace.length ? `no route matched (${trace.length} checked)` : 'no routes defined',
            details: `<p>No route's conditions matched this request, so it goes no further.</p>${traceTable}`,
            lines: findBlock('routes', null) ? [findBlock('routes', null)] : null,
            stop: 'Not routed',
        });
        return out;
    }

    // 3. Policies the route applies
    const pol = sim.applied_policies || {};
    // Options the engine leaves unset come back as undefined; skip them.
    const polKeys = Object.keys(pol).filter((k) => pol[k] !== undefined && pol[k] !== null);
    if (polKeys.length) {
        const nice = { timeout_secs: (v) => `timeout ${v}s`, failure_mode: (v) => `failure ${v}`, max_body_size: (v) => `body ≤ ${v}` };
        const polBlock = routeBlock && findBlock('policies', null, routeBlock);
        out.push({
            id: 'policies', title: 'Policies', state: 'pass',
            summary: polKeys.slice(0, 2).map((k) => (nice[k] ? nice[k](pol[k]) : `${k.replace(/_/g, '-')} ${pol[k]}`)).join(' · ') + (polKeys.length > 2 ? ` +${polKeys.length - 2}` : ''),
            details: kv(polKeys.map((k) => [k.replace(/_/g, '-'), code(typeof pol[k] === 'object' ? JSON.stringify(pol[k]) : String(pol[k]))])),
            lines: polBlock ? [polBlock] : routeBlock ? [routeBlock] : null,
        });
    }

    // 4. Agents: hooks from simulate, decisions from the mocks via simulate_with_agents
    const hooks = sim.agent_hooks || [];
    let stopped = null;
    if (hooks.length) {
        const chain = agents?.agent_chain || [];
        const hookById = new Map(hooks.map((h) => [h.agent_id, h]));
        const ordered = chain.length ? chain : hooks.map((h) => ({ agent_id: h.agent_id, hook: h.hook }));
        for (const step of ordered) {
            const hook = hookById.get(step.agent_id) || {};
            const audit = (agents?.audit_trail || []).filter((a) => a.agent_id === step.agent_id);
            const agentBlock = findBlock('agent', step.agent_id);
            const filterBlock = findBlock('filter', step.agent_id);
            const base = kv([
                ['Agent', code(step.agent_id)], step.agent_type && ['Type', escapeHtml(step.agent_type)],
                ['Hook', code(step.hook || hook.hook || '')], hook.timeout_ms != null && ['Timeout', `${hook.timeout_ms} ms`],
                hook.failure_mode && ['If unavailable', `fail ${escapeHtml(hook.failure_mode)}`],
                step.decision && ['Mock decision', escapeHtml(step.decision)],
                step.mutations_applied != null && ['Header changes', String(step.mutations_applied)],
                audit.length && ['Audit', audit.map((a) => [...a.rule_ids.map((r) => code(r)), ...a.tags.map((t) => escapeHtml(t))].join(' ')).join('<br>')],
            ]) + '<p class="pg-muted">The decision comes from the mock you set in the Agents tab; the engine applies it as the proxy would.</p>';
            const st = { id: `agent-${step.agent_id}`, title: `Agent · ${step.agent_id}`, details: base, lines: [agentBlock, filterBlock].filter(Boolean) };
            if (stopped) {
                Object.assign(st, { state: 'unreached', summary: 'the request stopped earlier' });
            } else if (!step.decision) {
                Object.assign(st, { state: 'info', summary: `called on ${hook.hook || 'request'}` });
            } else if (step.decision === 'block') {
                const b = agents.block_response || {};
                Object.assign(st, { state: 'blocked', summary: `blocked ${b.status || ''} by ${step.agent_id}`.replace('  ', ' ') });
                stopped = { kind: 'block', agent: step.agent_id, status: b.status, body: b.body };
            } else if (step.decision === 'redirect') {
                Object.assign(st, { state: 'redirect', summary: `redirect ${agents.redirect_status || ''}`.trim() });
                stopped = { kind: 'redirect', agent: step.agent_id, status: agents.redirect_status, url: agents.redirect_url };
            } else {
                const n = step.mutations_applied || 0;
                Object.assign(st, { state: 'pass', summary: `${step.decision === 'allow' ? 'allowed' : step.decision}${n ? `, ${n} header change${n > 1 ? 's' : ''}` : ''}` });
            }
            out.push(st);
        }
    }

    // 5. Upstream selection
    const us = sim.upstream_selection;
    if (us) {
        const block = findBlock('upstream', us.upstream_id, findBlock('upstreams', null));
        out.push({
            id: 'upstream', title: 'Upstream', state: stopped ? 'unreached' : 'pass',
            summary: stopped ? 'the request stopped earlier' : `${us.upstream_id} → ${us.selected_target}`,
            details: kv([['Upstream', code(us.upstream_id)], ['Target', code(us.selected_target)], ['Balancing', escapeHtml(us.load_balancer)], us.health_status && ['Health', escapeHtml(us.health_status)], us.selection_reason && ['Why', escapeHtml(us.selection_reason)]]),
            lines: block ? [block] : null,
        });
    }

    // 6. Outcome
    const fr = agents?.final_request;
    const changes = fr ? [
        fr.added_headers?.length && ['Added', fr.added_headers.map(code).join(' ')],
        fr.removed_headers?.length && ['Removed', fr.removed_headers.map(code).join(' ')],
        fr.modified_headers?.length && ['Modified', fr.modified_headers.map(code).join(' ')],
    ].filter(Boolean) : [];
    if (stopped?.kind === 'block') {
        out.push({ id: 'outcome', title: 'Response', state: 'blocked', summary: `${stopped.status || 'error'} from ${stopped.agent}`,
            details: kv([['Status', code(String(stopped.status || ''))], ['Sent by', code(stopped.agent)], stopped.body && ['Body', code(stopped.body)]]) + '<p class="pg-muted">The agent answered the client; the upstream was never contacted.</p>' });
    } else if (stopped?.kind === 'redirect') {
        out.push({ id: 'outcome', title: 'Response', state: 'redirect', summary: `${stopped.status || 302} → ${stopped.url || ''}`,
            details: kv([['Status', code(String(stopped.status || ''))], ['Location', code(stopped.url || '')], ['Sent by', code(stopped.agent)]]) });
    } else if (us) {
        out.push({ id: 'outcome', title: 'Forwarded', state: 'pass', summary: `to ${us.selected_target}`,
            details: kv([['Proxied to', code(us.selected_target)], ...changes]) + '<p class="pg-muted">The response status comes from the upstream; the playground does not contact one.</p>' });
    } else {
        out.push({ id: 'outcome', title: 'Handled', state: 'info', summary: `by route "${sim.matched_route.id}"`,
            details: '<p>The route matched but the engine reported no upstream selection for it.</p>' });
    }
    return out;
}

function stageHtml(s, k, n) {
    const word = STATE_WORD[s.state] || s.state;
    return `<li class="pg-stage" data-state="pending" data-final-state="${s.state}" style="--i:${k}">
        <button type="button" class="pg-node" aria-pressed="false" aria-controls="pg-detail" data-stage="${k}">
            <span class="pg-node-step" aria-hidden="true">${k + 1}</span>
            <span class="pg-node-title">${escapeHtml(s.title)}</span>
            <span class="pg-node-outcome"><span class="pg-node-icon">${ICON[s.state] || ICON.info}</span><span class="pg-node-word">${escapeHtml(word)}</span></span>
            <span class="pg-node-summary">${escapeHtml(s.summary)}</span>
        </button>
        ${k < n - 1 ? '<span class="pg-link" aria-hidden="true"></span>' : ''}
    </li>`;
}

function selectStage(k, { focus = false } = {}) {
    selectedStage = k;
    const s = stages[k];
    pipelineEl.querySelectorAll('.pg-node').forEach((b, j) => b.setAttribute('aria-pressed', String(j === k)));
    if (!s) { detailEl.hidden = true; markLines(null); return; }
    detailEl.hidden = false;
    detailEl.dataset.state = s.state;
    detailEl.innerHTML = `<h3 class="pg-detail-title">${ICON[s.state] || ICON.info}<span>${k + 1}. ${escapeHtml(s.title)}</span><span class="pg-detail-word">${escapeHtml(STATE_WORD[s.state])}: ${escapeHtml(s.summary)}</span></h3>
        ${s.details || ''}
        ${s.lines?.length ? `<p class="pg-detail-lines">Config: ${s.lines.map(([a, b]) => `<button type="button" class="pg-linkbtn" data-goto="${a}">line${a === b ? '' : 's'} ${a}${a === b ? '' : `–${b}`}</button>`).join(', ')}</p>` : ''}`;
    markLines(s.lines);
    if (focus) pipelineEl.querySelectorAll('.pg-node')[k]?.focus();
}

detailEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-goto]');
    if (b) goToLine(Number(b.dataset.goto));
});

pipelineEl.addEventListener('click', (e) => {
    const b = e.target.closest('.pg-node');
    if (b) selectStage(Number(b.dataset.stage));
});
pipelineEl.addEventListener('focusin', (e) => {
    const b = e.target.closest('.pg-node');
    if (b && Number(b.dataset.stage) !== selectedStage) selectStage(Number(b.dataset.stage));
});
pipelineEl.addEventListener('keydown', (e) => {
    const b = e.target.closest('.pg-node');
    if (!b) return;
    const k = Number(b.dataset.stage);
    const d = ['ArrowRight', 'ArrowDown'].includes(e.key) ? 1 : ['ArrowLeft', 'ArrowUp'].includes(e.key) ? -1 : 0;
    if (d && stages[k + d]) { e.preventDefault(); selectStage(k + d, { focus: true }); }
});

function renderPipeline(list) {
    stages = list;
    const token = ++runToken;
    pipelineEl.innerHTML = list.map((s, k) => stageHtml(s, k, list.length)).join('');
    pipelineEl.dataset.count = list.length;
    const items = [...pipelineEl.children];
    const last = list.length - 1;
    const stopAt = list.findIndex((s) => s.state === 'blocked' || s.state === 'redirect' || s.state === 'error');
    const focusIdx = stopAt >= 0 ? stopAt : last;
    const finish = () => {
        if (token !== runToken) return;
        items.forEach((li) => { li.dataset.state = li.dataset.finalState; });
        selectStage(focusIdx);
        const end = list[focusIdx];
        announce(`${list.length} stages. ${end.title}: ${STATE_WORD[end.state]}, ${end.summary}.`);
    };
    if (reduceMotion.matches) { finish(); return; }
    // The request travels stage by stage; a stage it never reaches stays "not reached".
    let k = 0;
    const step = () => {
        if (token !== runToken) return;
        if (k >= items.length) { finish(); return; }
        const li = items[k];
        li.dataset.state = li.dataset.finalState === 'unreached' ? 'unreached' : 'active';
        setTimeout(() => {
            if (token !== runToken) return;
            li.dataset.state = li.dataset.finalState;
            k++;
            step();
        }, 150);
    };
    step();
}

function renderError(title, message, line, focusEl) {
    stages = [{ id: 'error', title, state: 'error', summary: message.split('\n')[0],
        details: `<p>${escapeHtml(message.split('\n')[0])}</p>${line ? `<p><button type="button" class="pg-linkbtn" data-goto="${line}">Go to line ${line}</button></p>` : ''}`,
        lines: line ? [[line, line]] : null }];
    runToken++;
    pipelineEl.innerHTML = stageHtml(stages[0], 0, 1);
    pipelineEl.firstElementChild.dataset.state = 'error';
    selectStage(0);
    announce(`${title}: ${message.split('\n')[0]}`);
    if (focusEl) focusEl.focus();
}

function renderWarnings(list) {
    warningsEl.innerHTML = list.length ? list.map((w) => `<div class="pg-problem" data-severity="warning">${ICON.error}<div class="pg-problem-body">${w.code ? `<span class="pg-problem-kind">${escapeHtml(w.code)}</span>` : ''}<span>${escapeHtml(w.message)}</span></div></div>`).join('') : '';
}

// =============================================================================
// Run
// =============================================================================

async function runSimulation() {
    if (!wasmReady || runBtn.getAttribute('aria-busy') === 'true') return;
    validateConfig();
    if (!lastValidation?.valid) {
        const first = lastValidation?.errors?.[0]?.message || 'The configuration is not valid.';
        renderError('Configuration', first, errorLine(first));
        showView('pipeline');
        return;
    }
    const req = collectRequest();
    if (req.error) {
        renderError('Request', req.error, null, req.field);
        showView('pipeline');
        return;
    }

    runBtn.setAttribute('aria-busy', 'true');
    runBtn.disabled = true;
    // let the busy state paint before the (synchronous) engine call
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    try {
        const config = configEditor.value;
        const request = create_sample_request(req.method, req.host, req.path);
        request.headers = req.headers;
        const reqJson = JSON.stringify(request);
        const sim = simulate(config, reqJson);
        let agents = null;
        if ((sim.agent_hooks || []).length) {
            const ids = [...new Set(sim.agent_hooks.map((h) => h.agent_id))];
            agents = simulate_with_agents(config, reqJson, JSON.stringify(agentResponses(ids)));
        }
        lastRaw = { request, simulate: sim, ...(agents ? { simulate_with_agents: agents } : {}) };
        rawOut.innerHTML = `<code>${escapeHtml(JSON.stringify(lastRaw, null, 2))}</code>`;
        renderWarnings([...(sim.warnings || []), ...((agents && agents.warnings) || [])]);
        renderPipeline(buildStages(req, sim, agents));
    } catch (e) {
        console.error('Simulation error:', e);
        renderError('Engine', e.message || String(e));
    } finally {
        runBtn.removeAttribute('aria-busy');
        runBtn.disabled = false;
    }
}
runBtn.addEventListener('click', runSimulation);

// Pipeline / Raw view toggle
const viewButtons = [...document.querySelectorAll('[data-view]')];
function showView(view) {
    viewButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
    $('pg-view-pipeline').hidden = view !== 'pipeline';
    $('pg-view-raw').hidden = view !== 'raw';
}
viewButtons.forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));
$('pg-copy-raw').addEventListener('click', (e) => {
    if (lastRaw) copyWithFeedback(e.currentTarget, JSON.stringify(lastRaw, null, 2));
});

// =============================================================================
// Presets, reset, share, copy, fullscreen
// =============================================================================

let lastPreset = 'basic';
function loadPreset(key) {
    const cfg = TEMPLATES[key];
    if (!cfg) return;
    lastPreset = key;
    presetSelect.value = key;
    presetDesc.textContent = presetSelect.selectedOptions[0]?.dataset.desc || '';
    configEditor.value = cfg;
    configEditor.scrollTop = 0;
    refreshEditor();
    markLines(null);
    validateConfig();
    if (key === 'agents') selectTab($('tab-btn-agents'));
}
presetSelect.addEventListener('change', () => {
    if (presetSelect.value !== 'custom') loadPreset(presetSelect.value);
});
$('pg-reset').addEventListener('click', () => {
    loadPreset(lastPreset);
    announce('Example restored.');
});

// Share: the config travels in the URL fragment (never sent to a server).
const toB64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const fromB64 = (b) => new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0)));
$('pg-share').addEventListener('click', (e) => {
    const url = `${location.origin}${location.pathname}#config=${encodeURIComponent(toB64(configEditor.value))}`;
    history.replaceState(null, '', url);
    copyWithFeedback(e.currentTarget, url, 'Link copied');
});

function loadConfigFromHash() {
    if (!location.hash.startsWith('#config=')) return false;
    try {
        configEditor.value = fromB64(decodeURIComponent(location.hash.slice(8)));
        presetSelect.value = 'custom';
        presetDesc.textContent = 'Opened from a shared link.';
        return true;
    } catch (e) {
        console.error('Failed to read the config from the URL:', e);
        return false;
    }
}

$('copy-config-btn').addEventListener('click', (e) => copyWithFeedback(e.currentTarget, configEditor.value, 'Copied'));

const fsBtn = $('fullscreen-config-btn');
function setFullscreen(on) {
    configPanel.classList.toggle('is-fullscreen', on);
    fsBtn.setAttribute('aria-pressed', String(on));
    fsBtn.setAttribute('aria-label', on ? 'Exit expanded editor' : 'Expand editor');
    document.body.style.overflow = on ? 'hidden' : '';
    syncScroll();
}
fsBtn.addEventListener('click', () => setFullscreen(!configPanel.classList.contains('is-fullscreen')));
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && configPanel.classList.contains('is-fullscreen') && document.activeElement !== configEditor) {
        setFullscreen(false);
        fsBtn.focus();
    }
});

// "Run locally" disclosure on the version badge
const versionBtn = $('version-badge-btn');
const versionMenu = $('version-dropdown');
if (versionBtn && versionMenu) {
    versionBtn.setAttribute('aria-expanded', 'false');
    versionBtn.setAttribute('aria-controls', 'version-dropdown');
    const set = (on) => {
        versionBtn.classList.toggle('active', on);
        versionMenu.classList.toggle('active', on);
        versionBtn.setAttribute('aria-expanded', String(on));
    };
    versionBtn.addEventListener('click', (e) => { e.stopPropagation(); set(!versionMenu.classList.contains('active')); });
    document.addEventListener('click', (e) => { if (!versionMenu.contains(e.target)) set(false); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && versionMenu.classList.contains('active')) { set(false); versionBtn.focus(); }
    });
}

// =============================================================================
// Start
// =============================================================================

if (!loadConfigFromHash()) {
    configEditor.value = TEMPLATES.basic;
    presetDesc.textContent = presetSelect.selectedOptions[0]?.dataset.desc || '';
}
refreshEditor();
initWasm();
