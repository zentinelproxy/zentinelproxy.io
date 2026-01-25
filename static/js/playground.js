// =============================================================================
// Sentinel Playground
// Interactive configuration validation and request simulation
// =============================================================================

import init, {
    validate,
    simulate,
    simulate_with_agents,
    create_sample_request,
    init_panic_hook,
    get_version
} from '../wasm/sentinel_playground_wasm.js';

// State
let wasmReady = false;
let lastValidation = null;
let debounceTimer = null;
let detectedAgents = [];

// Template Configurations
const TEMPLATES = {
    'basic': `// Vanilla Setup Configuration
// Simple reverse proxy with multiple routes and load balancing

system {
    worker-threads 4
    max-connections 10000
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
        priority "medium"
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

    'ai-gateway': `// AI Gateway Configuration
// LLM inference proxy with token-based rate limiting

system {
    worker-threads 4
    max-connections 10000
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
    max-connections 10000
}

listeners {
    listener "https" {
        address "0.0.0.0:8443"
        protocol "https"
        tls {
            cert-file "/etc/sentinel/certs/api.crt"
            key-file "/etc/sentinel/certs/api.key"
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
        error-pages {
            default-format "json"
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
        error-pages {
            default-format "json"
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
    max-connections 10000
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
    max-connections 10000
}

listeners {
    listener "https" {
        address "0.0.0.0:8443"
        protocol "https"
        tls {
            cert-file "/etc/sentinel/certs/cdn.crt"
            key-file "/etc/sentinel/certs/cdn.key"
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
        error-pages {
            default-format "html"
            pages {
                "404" {
                    format "html"
                    message "Page not found"
                }
            }
        }
    }
}`,

    'websocket': `// WebSocket Proxy Configuration
// Real-time connection handling with upgrade support

system {
    worker-threads 4
    max-connections 10000
}

listeners {
    listener "https" {
        address "0.0.0.0:8443"
        protocol "https"
        tls {
            cert-file "/etc/sentinel/certs/ws.crt"
            key-file "/etc/sentinel/certs/ws.key"
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
        service-type "websocket"
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
        service-type "websocket"
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
        error-pages {
            default-format "json"
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
    max-connections 10000
}

listeners {
    listener "https" {
        address "0.0.0.0:8443"
        protocol "https"
        tls {
            cert-file "/etc/sentinel/certs/secure.crt"
            key-file "/etc/sentinel/certs/secure.key"
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
        error-pages {
            default-format "json"
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
    max-connections 10000
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
    max-connections 10000
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
    max-connections 10000
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
        service-type "grpc"
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
        service-type "grpc"
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
        service-type "grpc"
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
    max-connections 10000
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

// DOM Elements
const configEditor = document.getElementById('config-editor');
const highlightCode = document.getElementById('highlight-code');
const statusIcon = document.getElementById('status-icon');
const statusText = document.getElementById('status-text');
const errorDisplay = document.getElementById('error-display');
const simulateBtn = document.getElementById('simulate-btn');
const flowDiagram = document.getElementById('flow-diagram');
const traceContent = document.getElementById('trace-content');
const headersList = document.getElementById('headers-list');
const addHeaderBtn = document.getElementById('add-header-btn');
const configPanel = document.getElementById('config-panel');
const copyConfigBtn = document.getElementById('copy-config-btn');
const fullscreenConfigBtn = document.getElementById('fullscreen-config-btn');
const responseFlowDiagram = document.getElementById('response-flow-diagram');
const agentsEmpty = document.getElementById('agents-empty');
const agentsList = document.getElementById('agents-list');
const simulateAgentsBtn = document.getElementById('simulate-agents-btn');

// =============================================================================
// KDL Syntax Highlighting
// =============================================================================

// KDL keywords and node names commonly used in Sentinel config
const kdlKeywords = new Set([
    'system', 'listeners', 'listener', 'routes', 'route', 'upstreams', 'upstream',
    'matches', 'policies', 'target', 'health-check', 'agents', 'agent', 'limits',
    'tls', 'cache', 'rate-limit', 'circuit-breaker', 'retry', 'timeout'
]);

function highlightKDL(code) {
    let result = '';
    let i = 0;
    const len = code.length;

    while (i < len) {
        const char = code[i];

        // Comments (// and /*)
        if (char === '/' && code[i + 1] === '/') {
            const end = code.indexOf('\n', i);
            const comment = end === -1 ? code.slice(i) : code.slice(i, end);
            result += `<span class="hl-comment">${escapeHtml(comment)}</span>`;
            i += comment.length;
            continue;
        }

        if (char === '/' && code[i + 1] === '*') {
            const end = code.indexOf('*/', i + 2);
            const comment = end === -1 ? code.slice(i) : code.slice(i, end + 2);
            result += `<span class="hl-comment">${escapeHtml(comment)}</span>`;
            i += comment.length;
            continue;
        }

        // Strings (double-quoted)
        if (char === '"') {
            let j = i + 1;
            while (j < len && code[j] !== '"') {
                if (code[j] === '\\') j++; // Skip escaped char
                j++;
            }
            const str = code.slice(i, j + 1);
            result += `<span class="hl-string">${escapeHtml(str)}</span>`;
            i = j + 1;
            continue;
        }

        // Raw strings (r#"..."#)
        if (char === 'r' && code[i + 1] === '#') {
            let hashes = 0;
            let j = i + 1;
            while (code[j] === '#') { hashes++; j++; }
            if (code[j] === '"') {
                const endPattern = '"' + '#'.repeat(hashes);
                const endIdx = code.indexOf(endPattern, j + 1);
                if (endIdx !== -1) {
                    const str = code.slice(i, endIdx + endPattern.length);
                    result += `<span class="hl-string">${escapeHtml(str)}</span>`;
                    i = endIdx + endPattern.length;
                    continue;
                }
            }
        }

        // Numbers
        if (/[0-9]/.test(char) || (char === '-' && /[0-9]/.test(code[i + 1]))) {
            let j = i;
            if (char === '-') j++;
            while (j < len && /[0-9._eE+-]/.test(code[j])) j++;
            const num = code.slice(i, j);
            result += `<span class="hl-number">${escapeHtml(num)}</span>`;
            i = j;
            continue;
        }

        // Identifiers and keywords
        if (/[a-zA-Z_]/.test(char)) {
            let j = i;
            while (j < len && /[a-zA-Z0-9_-]/.test(code[j])) j++;
            const word = code.slice(i, j);

            // Check for property assignment (word=)
            if (code[j] === '=') {
                result += `<span class="hl-property">${escapeHtml(word)}</span>`;
            } else if (kdlKeywords.has(word)) {
                result += `<span class="hl-keyword">${escapeHtml(word)}</span>`;
            } else if (word === 'true' || word === 'false' || word === 'null') {
                result += `<span class="hl-constant">${escapeHtml(word)}</span>`;
            } else {
                result += `<span class="hl-node">${escapeHtml(word)}</span>`;
            }
            i = j;
            continue;
        }

        // Punctuation
        if (char === '{' || char === '}') {
            result += `<span class="hl-brace">${char}</span>`;
            i++;
            continue;
        }

        if (char === '=' || char === ';') {
            result += `<span class="hl-operator">${char}</span>`;
            i++;
            continue;
        }

        // Default: output as-is
        result += escapeHtml(char);
        i++;
    }

    return result;
}

function updateHighlight() {
    if (!highlightCode) return;
    try {
        const code = configEditor.value;
        // Add a trailing newline to match textarea behavior
        highlightCode.innerHTML = highlightKDL(code) + '\n';
    } catch (e) {
        console.error('Highlight error:', e);
    }
}

function syncScroll() {
    const highlight = document.getElementById('editor-highlight');
    if (highlight) {
        highlight.scrollTop = configEditor.scrollTop;
        highlight.scrollLeft = configEditor.scrollLeft;
    }
}

// Icons
const icons = {
    valid: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    invalid: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    loading: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>',
    warning: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
};

// Initialize WASM
async function initWasm() {
    setStatus('loading', 'Loading...');
    try {
        await init();
        init_panic_hook();
        wasmReady = true;

        // Display version
        try {
            const version = get_version();
            const versionEl = document.getElementById('wasm-version');
            if (versionEl) {
                versionEl.textContent = version;
            }
        } catch (e) {
            console.warn('Could not get WASM version:', e);
        }

        validateConfig();
    } catch (e) {
        setStatus('error', 'Failed to load');
        console.error('WASM init error:', e);

        // Update version display with error
        const versionEl = document.getElementById('wasm-version');
        if (versionEl) {
            versionEl.textContent = 'Load failed';
        }

        // Show helpful error message in the config panel
        const errorDisplay = document.getElementById('error-display');
        if (errorDisplay) {
            let errorMsg = 'Failed to load WebAssembly module. ';
            if (e.message?.includes('CompileError') || e.message?.includes('instantiate')) {
                errorMsg += 'Your browser may not support WebAssembly, or it may be blocked by an extension.';
            } else if (e.message?.includes('NetworkError') || e.message?.includes('fetch')) {
                errorMsg += 'Could not download the module. Check your network connection.';
            } else {
                errorMsg += 'Please try refreshing the page or using a different browser.';
            }
            errorDisplay.innerHTML = `
                <div class="error-item error-error">
                    <span class="error-icon">${icons.invalid}</span>
                    <div class="error-content">
                        <span class="error-message">${errorMsg}</span>
                        <span class="error-hint">Supported browsers: Chrome 57+, Firefox 52+, Safari 11+, Edge 16+</span>
                    </div>
                </div>
            `;
            errorDisplay.classList.add('visible');
        }
    }
}

// Set validation status
function setStatus(type, text) {
    statusText.textContent = text;
    statusIcon.innerHTML = type === 'valid' ? icons.valid :
                           type === 'invalid' ? icons.invalid :
                           type === 'loading' ? icons.loading :
                           type === 'warning' ? icons.warning : '';
    statusIcon.className = 'status-icon status-' + type;
}

// Validate configuration
function validateConfig() {
    console.log('validateConfig called, wasmReady:', wasmReady);
    if (!wasmReady) return;

    const config = configEditor.value;
    console.log('Validating config length:', config.length);
    try {
        lastValidation = validate(config);

        if (lastValidation.valid) {
            if (lastValidation.warnings && lastValidation.warnings.length > 0) {
                setStatus('warning', `Valid (${lastValidation.warnings.length} warning${lastValidation.warnings.length > 1 ? 's' : ''})`);
                showWarnings(lastValidation.warnings);
            } else {
                setStatus('valid', 'Valid');
                errorDisplay.innerHTML = '';
                errorDisplay.classList.remove('visible');
            }
            simulateBtn.disabled = false;
            // Detect agents when config is valid
            detectAgentsFromConfig();
        } else {
            setStatus('invalid', 'Invalid');
            showErrors(lastValidation.errors);
            simulateBtn.disabled = true;
            // Clear agents when config is invalid
            detectedAgents = [];
            updateAgentsUI();
        }
    } catch (e) {
        setStatus('invalid', 'Parse Error');
        showErrors([{ message: e.message || String(e), severity: 'error' }]);
        simulateBtn.disabled = true;
    }
}

// Show errors
function showErrors(errors) {
    errorDisplay.innerHTML = errors.map(e => `
        <div class="error-item error-${e.severity || 'error'}">
            <span class="error-icon">${icons.invalid}</span>
            <pre class="error-message">${escapeHtml(e.message)}</pre>
        </div>
    `).join('');
    errorDisplay.classList.add('visible');
}

// Show warnings
function showWarnings(warnings) {
    errorDisplay.innerHTML = warnings.map(w => `
        <div class="error-item error-warning">
            <span class="error-icon">${icons.warning}</span>
            <pre class="error-message">${escapeHtml(w.message)}</pre>
        </div>
    `).join('');
    errorDisplay.classList.add('visible');
}

// Run simulation
function runSimulation() {
    if (!wasmReady || !lastValidation?.valid) return;

    const config = configEditor.value;
    const method = document.getElementById('request-method').value;
    const host = document.getElementById('request-host').value;
    const path = document.getElementById('request-path').value;

    // Collect headers
    const headers = {};
    document.querySelectorAll('.header-row').forEach(row => {
        const key = row.querySelector('.header-key')?.value?.trim();
        const value = row.querySelector('.header-value')?.value?.trim();
        if (key) headers[key] = value || '';
    });

    try {
        const request = create_sample_request(method, host, path);
        request.headers = headers;

        const result = simulate(config, JSON.stringify(request));
        renderFlowDiagram(result, { method, host, path });
        renderResponseFlowDiagram(result);
        renderTrace(result);
    } catch (e) {
        console.error('Simulation error:', e);
        flowDiagram.innerHTML = `<div class="flow-error">Simulation failed: ${escapeHtml(e.message || String(e))}</div>`;
        responseFlowDiagram.innerHTML = `<div class="flow-error">Simulation failed: ${escapeHtml(e.message || String(e))}</div>`;
    }
}

// Render flow diagram
function renderFlowDiagram(result, request) {
    const matched = result.matched_route;
    const upstream = result.upstream_selection;
    const policies = result.applied_policies || {};

    const nodes = [
        { id: 'client', label: 'Client', sublabel: `${request.method} ${request.path}`, type: 'client' },
        { id: 'route', label: matched ? `Route: ${matched.id}` : 'No Match', sublabel: matched ? `priority: ${matched.priority}` : '', type: matched ? 'route' : 'nomatch' },
    ];

    if (matched) {
        if (Object.keys(policies).length > 0) {
            const policyLabels = [];
            if (policies.timeout_secs) policyLabels.push(`timeout: ${policies.timeout_secs}s`);
            if (policies.failure_mode) policyLabels.push(`mode: ${policies.failure_mode}`);
            nodes.push({ id: 'policies', label: 'Policies', sublabel: policyLabels.join(', ') || 'default', type: 'policies' });
        }

        if (upstream) {
            nodes.push({
                id: 'upstream',
                label: `Upstream: ${upstream.upstream_id}`,
                sublabel: upstream.selected_target || '',
                type: 'upstream'
            });
        }
    }

    flowDiagram.innerHTML = `
        <div class="flow-nodes">
            ${nodes.map((node, i) => `
                <div class="flow-node flow-node-${node.type}" data-node="${node.id}" data-index="${i}">
                    <div class="flow-node-label">${escapeHtml(node.label)}</div>
                    ${node.sublabel ? `<div class="flow-node-sublabel">${escapeHtml(node.sublabel)}</div>` : ''}
                </div>
                ${i < nodes.length - 1 ? `<div class="flow-arrow" data-index="${i}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div>` : ''}
            `).join('')}
        </div>
    `;

    // Animate nodes appearing
    requestAnimationFrame(() => {
        document.querySelectorAll('.flow-node, .flow-arrow').forEach((el, i) => {
            el.style.animationDelay = `${i * 0.1}s`;
            el.classList.add('flow-animate');
        });
    });
}

// Render response flow diagram (reverse direction)
function renderResponseFlowDiagram(result) {
    const matched = result.matched_route;
    const upstream = result.upstream_selection;
    const policies = result.applied_policies || {};

    const nodes = [];

    // Build response flow in reverse order
    if (matched) {
        if (upstream) {
            nodes.push({
                id: 'upstream',
                label: `Upstream: ${upstream.upstream_id}`,
                sublabel: upstream.selected_target || '',
                type: 'upstream'
            });
        }

        // Response transformations (if any policies modify response)
        if (Object.keys(policies).length > 0) {
            const responseTransforms = [];
            if (policies.response_headers) responseTransforms.push('headers modified');
            if (policies.response_body) responseTransforms.push('body transformed');

            if (responseTransforms.length > 0) {
                nodes.push({
                    id: 'transform',
                    label: 'Response Transform',
                    sublabel: responseTransforms.join(', '),
                    type: 'policies'
                });
            }
        }

        nodes.push({
            id: 'proxy',
            label: 'Sentinel Proxy',
            sublabel: 'response processing',
            type: 'route'
        });
    } else {
        // No match - return error response
        nodes.push({
            id: 'proxy',
            label: 'Sentinel Proxy',
            sublabel: '404 - no route matched',
            type: 'nomatch'
        });
    }

    nodes.push({
        id: 'client',
        label: 'Client',
        sublabel: matched ? '200 OK' : '404 Not Found',
        type: 'client'
    });

    responseFlowDiagram.innerHTML = `
        <div class="flow-nodes">
            ${nodes.map((node, i) => `
                <div class="flow-node flow-node-${node.type}" data-node="${node.id}" data-index="${i}">
                    <div class="flow-node-label">${escapeHtml(node.label)}</div>
                    ${node.sublabel ? `<div class="flow-node-sublabel">${escapeHtml(node.sublabel)}</div>` : ''}
                </div>
                ${i < nodes.length - 1 ? `<div class="flow-arrow" data-index="${i}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div>` : ''}
            `).join('')}
        </div>
    `;

    // Animate nodes appearing
    requestAnimationFrame(() => {
        responseFlowDiagram.querySelectorAll('.flow-node, .flow-arrow').forEach((el, i) => {
            el.style.animationDelay = `${i * 0.1}s`;
            el.classList.add('flow-animate');
        });
    });
}

// Render detailed trace
function renderTrace(result) {
    const sections = [];

    // Route matching trace
    if (result.match_trace && result.match_trace.length > 0) {
        sections.push(`
            <details class="trace-section" open>
                <summary class="trace-summary">
                    <span class="trace-icon">${icons.valid}</span>
                    Route Matching
                </summary>
                <div class="trace-details">
                    ${result.match_trace.map(step => `
                        <div class="trace-step trace-step-${step.result}">
                            <span class="trace-step-route">${escapeHtml(step.route_id)}</span>
                            <span class="trace-step-result">${step.result === 'match' ? '✓ Match' : '✗ No match'}</span>
                            <span class="trace-step-reason">${escapeHtml(step.reason)}</span>
                        </div>
                    `).join('')}
                </div>
            </details>
        `);
    }

    // Applied policies
    const policies = result.applied_policies || {};
    if (Object.keys(policies).length > 0) {
        sections.push(`
            <details class="trace-section">
                <summary class="trace-summary">
                    <span class="trace-icon">${icons.valid}</span>
                    Applied Policies
                </summary>
                <div class="trace-details">
                    <div class="trace-policies">
                        ${Object.entries(policies).map(([key, value]) => `
                            <div class="trace-policy">
                                <span class="policy-key">${escapeHtml(key)}</span>
                                <span class="policy-value">${escapeHtml(JSON.stringify(value))}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </details>
        `);
    }

    // Upstream selection
    if (result.upstream_selection) {
        const us = result.upstream_selection;
        sections.push(`
            <details class="trace-section">
                <summary class="trace-summary">
                    <span class="trace-icon">${icons.valid}</span>
                    Upstream Selection
                </summary>
                <div class="trace-details">
                    <div class="trace-upstream">
                        <div><strong>Upstream:</strong> ${escapeHtml(us.upstream_id)}</div>
                        <div><strong>Target:</strong> ${escapeHtml(us.selected_target)}</div>
                        <div><strong>Algorithm:</strong> ${escapeHtml(us.load_balancer)}</div>
                        ${us.selection_reason ? `<div><strong>Reason:</strong> ${escapeHtml(us.selection_reason)}</div>` : ''}
                    </div>
                </div>
            </details>
        `);
    }

    // Agent hooks
    if (result.agent_hooks && result.agent_hooks.length > 0) {
        sections.push(`
            <details class="trace-section">
                <summary class="trace-summary">
                    <span class="trace-icon">${icons.valid}</span>
                    Agent Hooks (${result.agent_hooks.length})
                </summary>
                <div class="trace-details">
                    ${result.agent_hooks.map(hook => `
                        <div class="trace-hook">
                            <span class="hook-agent">${escapeHtml(hook.agent_id)}</span>
                            <span class="hook-phase">${escapeHtml(hook.hook)}</span>
                            <span class="hook-timeout">${hook.timeout_ms}ms</span>
                            <span class="hook-mode ${hook.failure_mode}">${escapeHtml(hook.failure_mode)}</span>
                        </div>
                    `).join('')}
                </div>
            </details>
        `);
    }

    // Warnings
    if (result.warnings && result.warnings.length > 0) {
        sections.push(`
            <details class="trace-section trace-section-warning">
                <summary class="trace-summary">
                    <span class="trace-icon">${icons.warning}</span>
                    Warnings (${result.warnings.length})
                </summary>
                <div class="trace-details">
                    ${result.warnings.map(w => `
                        <div class="trace-warning">
                            ${w.code ? `<span class="warning-code">${escapeHtml(w.code)}</span>` : ''}
                            <span class="warning-message">${escapeHtml(w.message)}</span>
                        </div>
                    `).join('')}
                </div>
            </details>
        `);
    }

    if (sections.length === 0) {
        traceContent.innerHTML = '<div class="trace-empty">No routing decision (config may be incomplete)</div>';
    } else {
        traceContent.innerHTML = sections.join('');
    }
}

// =============================================================================
// Agent Simulation
// =============================================================================

// Detect agents from configuration
function detectAgentsFromConfig() {
    if (!wasmReady || !lastValidation?.valid) {
        detectedAgents = [];
        updateAgentsUI();
        return;
    }

    const config = configEditor.value;
    try {
        // Run a basic simulate to get agent_hooks
        const request = create_sample_request('GET', 'example.com', '/');
        const result = simulate(config, JSON.stringify(request));
        detectedAgents = result.agent_hooks || [];
        updateAgentsUI();
    } catch (e) {
        console.warn('Agent detection failed:', e);
        detectedAgents = [];
        updateAgentsUI();
    }
}

// Update agents UI based on detected agents
function updateAgentsUI() {
    if (!agentsEmpty || !agentsList || !simulateAgentsBtn) return;

    if (detectedAgents.length === 0) {
        agentsEmpty.style.display = 'flex';
        agentsList.style.display = 'none';
        simulateAgentsBtn.disabled = true;
    } else {
        agentsEmpty.style.display = 'none';
        agentsList.style.display = 'flex';
        simulateAgentsBtn.disabled = false;
        renderAgentCards();
    }
}

// Render agent cards
function renderAgentCards() {
    if (!agentsList) return;

    // Group agents by ID to avoid duplicates
    const uniqueAgents = new Map();
    detectedAgents.forEach(agent => {
        if (!uniqueAgents.has(agent.agent_id)) {
            uniqueAgents.set(agent.agent_id, agent);
        }
    });

    agentsList.innerHTML = Array.from(uniqueAgents.values()).map(agent => `
        <div class="agent-card" data-agent-id="${escapeHtml(agent.agent_id)}" data-decision="allow">
            <div class="agent-card-header">
                <div class="agent-header-left">
                    <span class="agent-collapse-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                    </span>
                    <span class="agent-name">${escapeHtml(agent.agent_id)}</span>
                    <span class="agent-type">${escapeHtml(agent.hook)}</span>
                </div>
                <select class="agent-decision-quick" onchange="updateAgentDecision(this)">
                    <option value="allow" selected>Allow</option>
                    <option value="block">Block</option>
                    <option value="redirect">Redirect</option>
                </select>
            </div>
            <div class="agent-card-body">
                <div class="agent-section">
                    <label class="agent-label">Decision</label>
                    <select class="agent-decision" onchange="updateAgentDecisionFromBody(this)">
                        <option value="allow" selected>Allow - Let request pass</option>
                        <option value="block">Block - Return error response</option>
                        <option value="redirect">Redirect - Send to different URL</option>
                    </select>
                </div>

                <div class="decision-details decision-block">
                    <div class="decision-row">
                        <label>Status Code</label>
                        <input type="number" class="block-status" value="403" min="400" max="599">
                    </div>
                    <div class="decision-row">
                        <label>Response Body</label>
                        <input type="text" class="block-body" placeholder="Blocked by agent">
                    </div>
                </div>

                <div class="decision-details decision-redirect">
                    <div class="decision-row">
                        <label>Redirect URL</label>
                        <input type="text" class="redirect-url" placeholder="https://example.com/blocked">
                    </div>
                    <div class="decision-row">
                        <label>Status Code</label>
                        <input type="number" class="redirect-status" value="302" min="300" max="399">
                    </div>
                </div>

                <div class="agent-section">
                    <label class="agent-label">Request Header Mutations</label>
                    <div class="header-mutations">
                        <!-- Mutations populated here -->
                    </div>
                    <button type="button" class="btn btn-ghost btn-small add-mutation-btn" onclick="addHeaderMutation(this)">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Add Header Mutation
                    </button>
                </div>

                <div class="agent-section">
                    <label class="agent-label">Audit (optional)</label>
                    <div class="audit-fields">
                        <div class="audit-row">
                            <label>Rule IDs</label>
                            <input type="text" class="audit-rule-ids" placeholder="942100, 941100">
                        </div>
                        <div class="audit-row">
                            <label>Tags</label>
                            <input type="text" class="audit-tags" placeholder="sql-injection, xss">
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `).join('');

    // Add click handlers for collapse
    agentsList.querySelectorAll('.agent-card-header').forEach(header => {
        header.addEventListener('click', (e) => {
            // Don't toggle if clicking on select
            if (e.target.tagName === 'SELECT') return;
            const card = header.closest('.agent-card');
            card.classList.toggle('collapsed');
        });
    });
}

// Update agent decision from quick select
window.updateAgentDecision = function(select) {
    const card = select.closest('.agent-card');
    const decision = select.value;
    card.dataset.decision = decision;

    // Sync with body select
    const bodySelect = card.querySelector('.agent-decision');
    if (bodySelect) bodySelect.value = decision;

    updateDecisionDetails(card, decision);
};

// Update agent decision from body select
window.updateAgentDecisionFromBody = function(select) {
    const card = select.closest('.agent-card');
    const decision = select.value;
    card.dataset.decision = decision;

    // Sync with quick select
    const quickSelect = card.querySelector('.agent-decision-quick');
    if (quickSelect) quickSelect.value = decision;

    updateDecisionDetails(card, decision);
};

// Show/hide decision details based on type
function updateDecisionDetails(card, decision) {
    const blockDetails = card.querySelector('.decision-block');
    const redirectDetails = card.querySelector('.decision-redirect');

    if (blockDetails) {
        blockDetails.classList.toggle('visible', decision === 'block');
    }
    if (redirectDetails) {
        redirectDetails.classList.toggle('visible', decision === 'redirect');
    }
}

// Add header mutation row
window.addHeaderMutation = function(btn) {
    const mutationsContainer = btn.previousElementSibling;
    const row = document.createElement('div');
    row.className = 'header-mutation-row';
    row.innerHTML = `
        <select class="mutation-op">
            <option value="set">Set</option>
            <option value="add">Add</option>
            <option value="remove">Remove</option>
        </select>
        <input type="text" class="mutation-name" placeholder="Header name">
        <input type="text" class="mutation-value" placeholder="Value">
        <button type="button" class="mutation-remove" onclick="this.parentElement.remove()">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
    `;

    // Toggle value field based on operation
    const opSelect = row.querySelector('.mutation-op');
    const valueInput = row.querySelector('.mutation-value');
    opSelect.addEventListener('change', () => {
        valueInput.style.display = opSelect.value === 'remove' ? 'none' : '';
    });

    mutationsContainer.appendChild(row);
};

// Collect agent response from a card
function getAgentResponseFromCard(card) {
    const agentId = card.dataset.agentId;
    const decision = card.dataset.decision || 'allow';

    let decisionObj = { type: decision };

    if (decision === 'block') {
        const status = parseInt(card.querySelector('.block-status')?.value) || 403;
        const body = card.querySelector('.block-body')?.value || null;
        decisionObj.status = status;
        if (body) decisionObj.body = body;
    } else if (decision === 'redirect') {
        const url = card.querySelector('.redirect-url')?.value || '';
        const status = parseInt(card.querySelector('.redirect-status')?.value) || 302;
        decisionObj.url = url;
        decisionObj.status = status;
    }

    // Collect header mutations
    const requestHeaders = [];
    card.querySelectorAll('.header-mutation-row').forEach(row => {
        const op = row.querySelector('.mutation-op')?.value;
        const name = row.querySelector('.mutation-name')?.value?.trim();
        const value = row.querySelector('.mutation-value')?.value;
        if (name) {
            if (op === 'remove') {
                requestHeaders.push({ op, name });
            } else {
                requestHeaders.push({ op, name, value: value || '' });
            }
        }
    });

    // Collect audit info
    const ruleIdsRaw = card.querySelector('.audit-rule-ids')?.value || '';
    const tagsRaw = card.querySelector('.audit-tags')?.value || '';
    const ruleIds = ruleIdsRaw.split(',').map(s => s.trim()).filter(Boolean);
    const tags = tagsRaw.split(',').map(s => s.trim()).filter(Boolean);

    return {
        agent_id: agentId,
        decision: decisionObj,
        request_headers: requestHeaders,
        response_headers: [],
        audit: { rule_ids: ruleIds, tags: tags }
    };
}

// Run agent simulation
function runAgentSimulation() {
    if (!wasmReady || !lastValidation?.valid) return;

    const config = configEditor.value;
    const method = document.getElementById('request-method').value;
    const host = document.getElementById('request-host').value;
    const path = document.getElementById('request-path').value;

    // Collect headers from builder tab
    const headers = {};
    document.querySelectorAll('.header-row').forEach(row => {
        const key = row.querySelector('.header-key')?.value?.trim();
        const value = row.querySelector('.header-value')?.value?.trim();
        if (key) headers[key] = value || '';
    });

    // Collect agent responses
    const agentResponses = [];
    document.querySelectorAll('.agent-card').forEach(card => {
        agentResponses.push(getAgentResponseFromCard(card));
    });

    try {
        const request = create_sample_request(method, host, path);
        request.headers = headers;

        const result = simulate_with_agents(
            config,
            JSON.stringify(request),
            JSON.stringify(agentResponses)
        );

        renderAgentFlowDiagram(result, { method, host, path });
        renderAgentResponseFlow(result);
        renderAgentTrace(result);
    } catch (e) {
        console.error('Agent simulation error:', e);
        flowDiagram.innerHTML = `<div class="flow-error">Agent simulation failed: ${escapeHtml(e.message || String(e))}</div>`;
        responseFlowDiagram.innerHTML = `<div class="flow-error">Agent simulation failed</div>`;
    }
}

// Render flow diagram with agents
function renderAgentFlowDiagram(result, request) {
    const matched = result.matched_route;
    const upstream = result.upstream_selection;
    const agentChain = result.agent_chain || [];

    const nodes = [
        { id: 'client', label: 'Client', sublabel: `${request.method} ${request.path}`, type: 'client' },
    ];

    if (matched) {
        nodes.push({
            id: 'route',
            label: `Route: ${matched.id}`,
            sublabel: `priority: ${matched.priority}`,
            type: 'route'
        });

        // Add agent nodes
        agentChain.forEach((step, i) => {
            const decision = step.decision.toLowerCase();
            nodes.push({
                id: `agent-${i}`,
                label: step.agent_id,
                sublabel: decision.toUpperCase(),
                type: `agent-${decision}`,
                shortCircuited: step.short_circuited
            });

            // If this agent blocked/redirected, don't add more nodes
            if (step.short_circuited) return;
        });

        // Add upstream if not short-circuited
        const wasShortCircuited = agentChain.some(s => s.short_circuited);
        if (!wasShortCircuited && upstream) {
            nodes.push({
                id: 'upstream',
                label: `Upstream: ${upstream.upstream_id}`,
                sublabel: upstream.selected_target || '',
                type: 'upstream'
            });
        }
    } else {
        nodes.push({
            id: 'route',
            label: 'No Match',
            sublabel: '',
            type: 'nomatch'
        });
    }

    flowDiagram.innerHTML = `
        <div class="flow-nodes">
            ${nodes.map((node, i) => `
                <div class="flow-node flow-node-${node.type}${node.shortCircuited ? ' flow-node-short-circuit' : ''}" data-node="${node.id}" data-index="${i}">
                    <div class="flow-node-label">${escapeHtml(node.label)}</div>
                    ${node.sublabel ? `<div class="flow-node-sublabel">${escapeHtml(node.sublabel)}</div>` : ''}
                </div>
                ${i < nodes.length - 1 ? `<div class="flow-arrow${node.shortCircuited ? ' flow-arrow-blocked' : ''}" data-index="${i}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div>` : ''}
            `).join('')}
        </div>
    `;

    // Animate nodes appearing
    requestAnimationFrame(() => {
        flowDiagram.querySelectorAll('.flow-node, .flow-arrow').forEach((el, i) => {
            el.style.animationDelay = `${i * 0.1}s`;
            el.classList.add('flow-animate');
        });
    });
}

// Render response flow for agent simulation
function renderAgentResponseFlow(result) {
    const matched = result.matched_route;
    const upstream = result.upstream_selection;
    const agentChain = result.agent_chain || [];
    const wasShortCircuited = agentChain.some(s => s.short_circuited);
    const blockingAgent = agentChain.find(s => s.short_circuited);

    const nodes = [];

    if (matched) {
        if (wasShortCircuited && blockingAgent) {
            // Show the blocking response
            const decision = blockingAgent.decision.toLowerCase();
            nodes.push({
                id: 'block-response',
                label: decision === 'block' ? 'Block Response' : 'Redirect',
                sublabel: `from ${blockingAgent.agent_id}`,
                type: `agent-${decision}`
            });
        } else if (upstream) {
            nodes.push({
                id: 'upstream',
                label: `Upstream: ${upstream.upstream_id}`,
                sublabel: upstream.selected_target || '',
                type: 'upstream'
            });
        }

        nodes.push({
            id: 'proxy',
            label: 'Sentinel Proxy',
            sublabel: wasShortCircuited ? 'short-circuited' : 'response processing',
            type: wasShortCircuited ? 'agent-block' : 'route'
        });
    } else {
        nodes.push({
            id: 'proxy',
            label: 'Sentinel Proxy',
            sublabel: '404 - no route matched',
            type: 'nomatch'
        });
    }

    nodes.push({
        id: 'client',
        label: 'Client',
        sublabel: wasShortCircuited ?
            (blockingAgent?.decision === 'redirect' ? '302 Redirect' : '403 Blocked') :
            (matched ? '200 OK' : '404 Not Found'),
        type: 'client'
    });

    responseFlowDiagram.innerHTML = `
        <div class="flow-nodes">
            ${nodes.map((node, i) => `
                <div class="flow-node flow-node-${node.type}" data-node="${node.id}" data-index="${i}">
                    <div class="flow-node-label">${escapeHtml(node.label)}</div>
                    ${node.sublabel ? `<div class="flow-node-sublabel">${escapeHtml(node.sublabel)}</div>` : ''}
                </div>
                ${i < nodes.length - 1 ? `<div class="flow-arrow" data-index="${i}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div>` : ''}
            `).join('')}
        </div>
    `;

    // Animate nodes appearing
    requestAnimationFrame(() => {
        responseFlowDiagram.querySelectorAll('.flow-node, .flow-arrow').forEach((el, i) => {
            el.style.animationDelay = `${i * 0.1}s`;
            el.classList.add('flow-animate');
        });
    });
}

// Render trace with agent chain
function renderAgentTrace(result) {
    const sections = [];

    // Agent chain section (show first if agents were involved)
    const agentChain = result.agent_chain || [];
    if (agentChain.length > 0) {
        sections.push(`
            <details class="trace-section" open>
                <summary class="trace-summary">
                    <span class="trace-icon">${icons.valid}</span>
                    Agent Chain (${agentChain.length} agent${agentChain.length > 1 ? 's' : ''})
                </summary>
                <div class="trace-details">
                    ${agentChain.map(step => `
                        <div class="trace-agent trace-agent-${step.decision.toLowerCase()}">
                            <span class="agent-id">${escapeHtml(step.agent_id)}</span>
                            <span class="agent-decision decision-${step.decision.toLowerCase()}">${step.decision.toUpperCase()}</span>
                            ${step.mutations_applied > 0 ? `<span class="agent-mutations">${step.mutations_applied} mutation${step.mutations_applied > 1 ? 's' : ''}</span>` : ''}
                            ${step.short_circuited ? `<span class="agent-short-circuit">short-circuited</span>` : ''}
                        </div>
                    `).join('')}
                </div>
            </details>
        `);
    }

    // Transformed request section
    if (result.final_request) {
        const req = result.final_request;
        const changes = [];

        if (req.added_headers && req.added_headers.length > 0) {
            req.added_headers.forEach(h => changes.push({ type: 'add', text: h }));
        }
        if (req.modified_headers && req.modified_headers.length > 0) {
            req.modified_headers.forEach(h => changes.push({ type: 'modify', text: h }));
        }
        if (req.removed_headers && req.removed_headers.length > 0) {
            req.removed_headers.forEach(h => changes.push({ type: 'remove', text: h }));
        }

        if (changes.length > 0) {
            sections.push(`
                <details class="trace-section">
                    <summary class="trace-summary">
                        <span class="trace-icon">${icons.valid}</span>
                        Request Transformations (${changes.length})
                    </summary>
                    <div class="trace-details">
                        <div class="trace-transforms">
                            ${changes.map(c => `
                                <div class="transform-item transform-${c.type}">
                                    <span class="transform-op">${c.type === 'add' ? '+' : c.type === 'remove' ? '-' : '~'}</span>
                                    <span class="transform-text">${escapeHtml(c.text)}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </details>
            `);
        }
    }

    // Audit trail section
    if (result.audit_trail && result.audit_trail.length > 0) {
        sections.push(`
            <details class="trace-section">
                <summary class="trace-summary">
                    <span class="trace-icon">${icons.valid}</span>
                    Audit Trail (${result.audit_trail.length})
                </summary>
                <div class="trace-details">
                    ${result.audit_trail.map(entry => `
                        <div class="trace-audit">
                            <span class="audit-agent">${escapeHtml(entry.agent_id)}</span>
                            ${entry.rule_ids && entry.rule_ids.length > 0 ? `<span class="audit-rules">Rules: ${entry.rule_ids.join(', ')}</span>` : ''}
                            ${entry.tags && entry.tags.length > 0 ? `<span class="audit-tags">Tags: ${entry.tags.join(', ')}</span>` : ''}
                        </div>
                    `).join('')}
                </div>
            </details>
        `);
    }

    // Route matching trace
    if (result.match_trace && result.match_trace.length > 0) {
        sections.push(`
            <details class="trace-section">
                <summary class="trace-summary">
                    <span class="trace-icon">${icons.valid}</span>
                    Route Matching
                </summary>
                <div class="trace-details">
                    ${result.match_trace.map(step => `
                        <div class="trace-step trace-step-${step.result}">
                            <span class="trace-step-route">${escapeHtml(step.route_id)}</span>
                            <span class="trace-step-result">${step.result === 'match' ? '✓ Match' : '✗ No match'}</span>
                            <span class="trace-step-reason">${escapeHtml(step.reason)}</span>
                        </div>
                    `).join('')}
                </div>
            </details>
        `);
    }

    // Upstream selection
    if (result.upstream_selection) {
        const us = result.upstream_selection;
        sections.push(`
            <details class="trace-section">
                <summary class="trace-summary">
                    <span class="trace-icon">${icons.valid}</span>
                    Upstream Selection
                </summary>
                <div class="trace-details">
                    <div class="trace-upstream">
                        <div><strong>Upstream:</strong> ${escapeHtml(us.upstream_id)}</div>
                        <div><strong>Target:</strong> ${escapeHtml(us.selected_target)}</div>
                        <div><strong>Algorithm:</strong> ${escapeHtml(us.load_balancer)}</div>
                        ${us.selection_reason ? `<div><strong>Reason:</strong> ${escapeHtml(us.selection_reason)}</div>` : ''}
                    </div>
                </div>
            </details>
        `);
    }

    // Warnings
    if (result.warnings && result.warnings.length > 0) {
        sections.push(`
            <details class="trace-section trace-section-warning">
                <summary class="trace-summary">
                    <span class="trace-icon">${icons.warning}</span>
                    Warnings (${result.warnings.length})
                </summary>
                <div class="trace-details">
                    ${result.warnings.map(w => `
                        <div class="trace-warning">
                            ${w.code ? `<span class="warning-code">${escapeHtml(w.code)}</span>` : ''}
                            <span class="warning-message">${escapeHtml(w.message)}</span>
                        </div>
                    `).join('')}
                </div>
            </details>
        `);
    }

    if (sections.length === 0) {
        traceContent.innerHTML = '<div class="trace-empty">No simulation results</div>';
    } else {
        traceContent.innerHTML = sections.join('');
    }
}

// Add header row
function addHeaderRow(key = '', value = '') {
    const row = document.createElement('div');
    row.className = 'header-row';
    row.innerHTML = `
        <input type="text" class="header-key" placeholder="Header name" value="${escapeHtml(key)}">
        <input type="text" class="header-value" placeholder="Value" value="${escapeHtml(value)}">
        <button type="button" class="header-remove" aria-label="Remove header">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
    `;
    row.querySelector('.header-remove').addEventListener('click', () => row.remove());
    headersList.appendChild(row);
}

// Parse URL hash for pre-loaded config
function loadConfigFromHash() {
    const hash = window.location.hash;
    if (hash.startsWith('#config=')) {
        try {
            const encoded = hash.slice(8);
            const config = atob(decodeURIComponent(encoded));
            configEditor.value = config;
        } catch (e) {
            console.error('Failed to parse config from URL:', e);
        }
    }
}

// Escape HTML
function escapeHtml(str) {
    if (typeof str !== 'string') return String(str);
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
}

// Debounced validation
function debouncedValidate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        console.log('Debounce triggered, validating...');
        validateConfig();
    }, 300);
}

// Event listeners
configEditor.addEventListener('input', (e) => {
    console.log('Input event fired');
    updateHighlight();
    debouncedValidate();
});
configEditor.addEventListener('scroll', syncScroll);
simulateBtn.addEventListener('click', runSimulation);
addHeaderBtn.addEventListener('click', () => addHeaderRow());
if (simulateAgentsBtn) {
    simulateAgentsBtn.addEventListener('click', runAgentSimulation);
}

// Copy configuration button
copyConfigBtn.addEventListener('click', async () => {
    const config = configEditor.value;
    try {
        await navigator.clipboard.writeText(config);
        // Visual feedback
        const originalHTML = copyConfigBtn.innerHTML;
        copyConfigBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
        copyConfigBtn.style.color = 'var(--color-success)';
        setTimeout(() => {
            copyConfigBtn.innerHTML = originalHTML;
            copyConfigBtn.style.color = '';
        }, 2000);
    } catch (err) {
        console.error('Failed to copy:', err);
    }
});

// Fullscreen toggle button
fullscreenConfigBtn.addEventListener('click', () => {
    configPanel.classList.toggle('fullscreen');

    // Handle escape key to exit fullscreen
    if (configPanel.classList.contains('fullscreen')) {
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                configPanel.classList.remove('fullscreen');
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
    }
});

// Also listen for keyup to catch paste events and other input methods
configEditor.addEventListener('keyup', () => {
    updateHighlight();
    debouncedValidate();
});

// =============================================================================
// Request Tabs
// =============================================================================

const requestTabs = document.querySelectorAll('.request-tab');
const tabContents = document.querySelectorAll('.request-tab-content');
const rawRequestTextarea = document.getElementById('raw-request');
const simulateRawBtn = document.getElementById('simulate-raw-btn');

// Tab switching
requestTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;

        // Update tab buttons
        requestTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // Update tab content
        tabContents.forEach(content => {
            content.classList.remove('active');
            if (content.id === `tab-${targetTab}`) {
                content.classList.add('active');
            }
        });
    });
});

// Parse raw HTTP request
function parseRawRequest(rawText) {
    const lines = rawText.trim().split('\n');
    if (lines.length === 0) return null;

    // Parse request line: METHOD /path HTTP/1.1
    const requestLine = lines[0].trim();
    const requestMatch = requestLine.match(/^(\w+)\s+(\S+)(?:\s+HTTP\/[\d.]+)?$/i);
    if (!requestMatch) return null;

    const method = requestMatch[1].toUpperCase();
    const pathWithQuery = requestMatch[2];
    const path = pathWithQuery.split('?')[0]; // Remove query string for routing

    // Parse headers
    const headers = {};
    let host = 'example.com';

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === '') break; // Empty line ends headers

        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
            const key = line.substring(0, colonIndex).trim();
            const value = line.substring(colonIndex + 1).trim();
            headers[key] = value;

            if (key.toLowerCase() === 'host') {
                host = value;
            }
        }
    }

    return { method, host, path, headers };
}

// Run simulation from raw request
function runRawSimulation() {
    if (!wasmReady || !lastValidation?.valid) return;

    const rawText = rawRequestTextarea.value;
    const parsed = parseRawRequest(rawText);

    if (!parsed) {
        flowDiagram.innerHTML = `<div class="flow-error">Invalid request format. Expected: METHOD /path HTTP/1.1</div>`;
        responseFlowDiagram.innerHTML = `<div class="flow-error">Invalid request format</div>`;
        return;
    }

    const config = configEditor.value;

    try {
        const request = create_sample_request(parsed.method, parsed.host, parsed.path);
        request.headers = parsed.headers;

        const result = simulate(config, JSON.stringify(request));
        renderFlowDiagram(result, parsed);
        renderResponseFlowDiagram(result);
        renderTrace(result);
    } catch (e) {
        console.error('Simulation error:', e);
        flowDiagram.innerHTML = `<div class="flow-error">Simulation failed: ${escapeHtml(e.message || String(e))}</div>`;
        responseFlowDiagram.innerHTML = `<div class="flow-error">Simulation failed: ${escapeHtml(e.message || String(e))}</div>`;
    }
}

// Raw simulate button
if (simulateRawBtn) {
    simulateRawBtn.addEventListener('click', runRawSimulation);
}

// =============================================================================
// Expand/Collapse All Trace Sections
// =============================================================================

const toggleTraceBtn = document.getElementById('toggle-trace-btn');
let allExpanded = false;

if (toggleTraceBtn) {
    toggleTraceBtn.addEventListener('click', () => {
        const details = traceContent.querySelectorAll('details');
        allExpanded = !allExpanded;

        details.forEach(detail => {
            detail.open = allExpanded;
        });

        // Update button text
        toggleTraceBtn.innerHTML = allExpanded
            ? `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg> Collapse All`
            : `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg> Expand All`;
    });
}

// =============================================================================
// Template Selector
// =============================================================================

function loadTemplate(templateKey) {
    const template = TEMPLATES[templateKey];
    if (!template) {
        console.error(`Template not found: ${templateKey}`);
        return;
    }

    // Load template into editor
    configEditor.value = template;

    // Update syntax highlighting
    updateHighlight();

    // Trigger validation
    if (wasmReady) {
        validateConfig();
    }

    // Scroll to top of editor
    configEditor.scrollTop = 0;

    // Visual feedback: highlight the selected template button
    document.querySelectorAll('.template-card').forEach(card => {
        card.classList.remove('active');
    });
    const selectedCard = document.querySelector(`.template-card[data-template="${templateKey}"]`);
    if (selectedCard) {
        selectedCard.classList.add('active');
    }
}

// Add click handlers to template cards
document.querySelectorAll('.template-card').forEach(card => {
    card.addEventListener('click', () => {
        const templateKey = card.getAttribute('data-template');
        loadTemplate(templateKey);
    });
});

// Version badge dropdown toggle
const versionBadgeBtn = document.getElementById('version-badge-btn');
const versionDropdown = document.getElementById('version-dropdown');

if (versionBadgeBtn && versionDropdown) {
    versionBadgeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        versionBadgeBtn.classList.toggle('active');
        versionDropdown.classList.toggle('active');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!versionDropdown.contains(e.target) && !versionBadgeBtn.contains(e.target)) {
            versionBadgeBtn.classList.remove('active');
            versionDropdown.classList.remove('active');
        }
    });

    // Close dropdown on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && versionDropdown.classList.contains('active')) {
            versionBadgeBtn.classList.remove('active');
            versionDropdown.classList.remove('active');
        }
    });
}

// Initialize
loadConfigFromHash();
updateHighlight(); // Initial syntax highlighting
initWasm();

// Debug: log that the script loaded
console.log('Playground initialized');
