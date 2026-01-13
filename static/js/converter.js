/**
 * Sentinel Config Converter - WebAssembly powered configuration converter
 * Converts nginx, HAProxy, Traefik, Caddy, and Envoy configs to Sentinel KDL
 */

import init, {
    convert,
    detect_format,
    validate,
    get_supported_formats,
    get_version,
    init_panic_hook
} from '../wasm/sentinel_convert_wasm.js';

// State
let wasmReady = false;
let lastConversion = null;

// DOM Elements
const sourceEditor = document.getElementById('source-editor');
const outputEditor = document.getElementById('output-editor');
const outputHighlight = document.getElementById('output-highlight');
const outputCode = document.getElementById('output-code');
const formatSelect = document.getElementById('format-select');
const sampleSelect = document.getElementById('sample-select');
const convertBtn = document.getElementById('convert-btn');
const copySourceBtn = document.getElementById('copy-source-btn');
const copyOutputBtn = document.getElementById('copy-output-btn');
const fullscreenSourceBtn = document.getElementById('fullscreen-source-btn');
const fullscreenOutputBtn = document.getElementById('fullscreen-output-btn');
const converterGrid = document.getElementById('converter-grid');
const validationStatus = document.getElementById('validation-status');
const statusIcon = document.getElementById('status-icon');
const statusText = document.getElementById('status-text');
const errorDisplay = document.getElementById('error-display');
const agentsPanel = document.getElementById('agents-panel');
const agentsContent = document.getElementById('agents-content');
const agentsCount = document.getElementById('agents-count');
const warningsPanel = document.getElementById('warnings-panel');
const warningsContent = document.getElementById('warnings-content');
const warningsCount = document.getElementById('warnings-count');
const wasmVersion = document.getElementById('wasm-version');
const cliInstallCmd = document.getElementById('cli-install-cmd');
const cliCopyBtn = document.getElementById('cli-copy-btn');
const cliInstallTabs = document.querySelectorAll('.cli-install-tab');

// Install commands for each method
const INSTALL_COMMANDS = {
    cargo: 'cargo install sentinel-convert',
    source: 'git clone https://github.com/raskell-io/sentinel && cd sentinel && cargo install --path crates/sentinel-convert'
};

// Sample configurations
const SAMPLES = {
    nginx: `http {
    upstream backend {
        server 10.0.0.1:8080 weight=5;
        server 10.0.0.2:8080 weight=3;
        server 10.0.0.3:8080 backup;
    }

    server {
        listen 80;
        server_name example.com;

        location /api/ {
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        location / {
            root /var/www/html;
            index index.html;
        }
    }
}`,

    'nginx-advanced': `http {
    # Rate limiting zone
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;

    upstream api_backend {
        least_conn;
        server 10.0.0.1:8080 weight=5 max_fails=3 fail_timeout=30s;
        server 10.0.0.2:8080 weight=3 max_fails=3 fail_timeout=30s;
        keepalive 32;
    }

    server {
        listen 443 ssl http2;
        server_name api.example.com;

        ssl_certificate /etc/ssl/certs/server.crt;
        ssl_certificate_key /etc/ssl/private/server.key;

        location /api/ {
            limit_req zone=api_limit burst=20 nodelay;

            auth_basic "API Access";
            auth_basic_user_file /etc/nginx/.htpasswd;

            proxy_pass http://api_backend;
            proxy_set_header Host $host;
            proxy_connect_timeout 30s;
            proxy_read_timeout 60s;
        }

        location /health {
            return 200 'OK';
            add_header Content-Type text/plain;
        }
    }
}`,

    haproxy: `global
    maxconn 10000
    log stdout local0

defaults
    mode http
    timeout connect 5s
    timeout client 30s
    timeout server 30s
    option httplog

frontend http_front
    bind *:80
    bind *:443 ssl crt /etc/haproxy/certs/
    http-request redirect scheme https unless { ssl_fc }

    acl is_api path_beg /api
    use_backend api_servers if is_api
    default_backend web_servers

backend api_servers
    balance roundrobin
    option httpchk GET /health
    http-check expect status 200
    server api1 10.0.0.1:8080 check weight 5
    server api2 10.0.0.2:8080 check weight 3

backend web_servers
    balance leastconn
    server web1 10.0.1.1:3000 check
    server web2 10.0.1.2:3000 check`,

    traefik: `entryPoints:
  web:
    address: ":80"
  websecure:
    address: ":443"

http:
  routers:
    api-router:
      rule: "Host(\`api.example.com\`) && PathPrefix(\`/api\`)"
      service: api-service
      entryPoints:
        - websecure
      middlewares:
        - rate-limit

    web-router:
      rule: "Host(\`example.com\`)"
      service: web-service
      entryPoints:
        - websecure

  services:
    api-service:
      loadBalancer:
        servers:
          - url: "http://10.0.0.1:8080"
          - url: "http://10.0.0.2:8080"
        healthCheck:
          path: /health
          interval: 10s

    web-service:
      loadBalancer:
        servers:
          - url: "http://10.0.1.1:3000"

  middlewares:
    rate-limit:
      rateLimit:
        average: 100
        burst: 50`,

    caddy: `example.com {
    reverse_proxy /api/* {
        to 10.0.0.1:8080 10.0.0.2:8080
        lb_policy round_robin
        health_uri /health
        health_interval 10s
    }

    reverse_proxy /* {
        to 10.0.1.1:3000
    }

    encode gzip

    log {
        output file /var/log/caddy/access.log
    }
}

api.example.com {
    reverse_proxy /* {
        to 10.0.0.1:8080 10.0.0.2:8080
        lb_policy least_conn
    }

    rate_limit {
        zone api_zone {
            key {remote_host}
            events 100
            window 1m
        }
    }
}`,

    envoy: `static_resources:
  listeners:
    - name: http_listener
      address:
        socket_address:
          address: 0.0.0.0
          port_value: 8080
      filter_chains:
        - filters:
            - name: envoy.filters.network.http_connection_manager
              typed_config:
                "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
                stat_prefix: ingress_http
                route_config:
                  name: local_route
                  virtual_hosts:
                    - name: api
                      domains:
                        - "api.example.com"
                      routes:
                        - match:
                            prefix: "/api"
                          route:
                            cluster: api_backend
                            timeout: 30s
                http_filters:
                  - name: envoy.filters.http.router

  clusters:
    - name: api_backend
      type: STRICT_DNS
      lb_policy: ROUND_ROBIN
      load_assignment:
        cluster_name: api_backend
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address:
                      address: 10.0.0.1
                      port_value: 8080
              - endpoint:
                  address:
                    socket_address:
                      address: 10.0.0.2
                      port_value: 8080
      health_checks:
        - timeout: 5s
          interval: 10s
          http_health_check:
            path: /health`
};

// Initialize WASM
async function initWasm() {
    try {
        await init();
        init_panic_hook();
        wasmReady = true;

        const version = get_version();
        wasmVersion.textContent = `v${version}`;

        convertBtn.disabled = false;

        // Auto-convert on load if there's content
        if (sourceEditor.value.trim()) {
            convertConfig();
        }
    } catch (e) {
        console.error('Failed to load WASM:', e);
        convertBtn.disabled = true;
    }
}

// Set status indicator
function setStatus(status, text) {
    if (!validationStatus) return;
    statusIcon.className = 'status-icon status-' + status;
    statusText.textContent = text;
    validationStatus.classList.toggle('visible', status !== 'hidden');
}

// Convert configuration
function convertConfig() {
    if (!wasmReady) return;

    const source = sourceEditor.value;
    if (!source.trim()) {
        outputEditor.value = '';
        outputCode.textContent = '';
        setStatus('hidden', '');
        hideAgentsPanel();
        hideWarningsPanel();
        return;
    }

    const format = formatSelect.value === 'auto' ? null : formatSelect.value;

    try {
        const result = convert(source, format);
        lastConversion = result;

        if (result.success) {
            outputEditor.value = result.kdl;
            outputCode.textContent = result.kdl;
            highlightKdl();

            setStatus('valid', 'Converted');
            hideError();

            // Show agents if any
            if (result.agents && result.agents.length > 0) {
                showAgentsPanel(result.agents);
            } else {
                hideAgentsPanel();
            }

            // Show warnings if any
            if (result.warnings && result.warnings.length > 0) {
                showWarningsPanel(result.warnings);
            } else {
                hideWarningsPanel();
            }
        } else {
            outputEditor.value = '';
            outputCode.textContent = '';
            setStatus('error', 'Error');
            showError(result.error);
            hideAgentsPanel();
            hideWarningsPanel();
        }
    } catch (e) {
        console.error('Conversion error:', e);
        setStatus('error', 'Error');
        showError(e.message || 'Unknown error');
        hideAgentsPanel();
        hideWarningsPanel();
    }
}

// Show error message
function showError(message) {
    errorDisplay.innerHTML = `<div class="error-item"><span class="error-icon">!</span> ${escapeHtml(message)}</div>`;
    errorDisplay.classList.add('visible');
}

// Hide error message
function hideError() {
    errorDisplay.classList.remove('visible');
}

// Show agents panel
function showAgentsPanel(agents) {
    agentsCount.textContent = `${agents.length} agent${agents.length !== 1 ? 's' : ''} detected`;

    agentsContent.innerHTML = agents.map(agent => `
        <div class="agent-card">
            <div class="agent-header">
                <span class="agent-type agent-type-${agent.agent_type}">${agent.agent_type}</span>
                <span class="agent-name">${escapeHtml(agent.name)}</span>
                <span class="agent-confidence confidence-${agent.confidence}">${agent.confidence}</span>
            </div>
            ${agent.patterns_matched.length > 0 ? `
                <div class="agent-patterns">
                    <span class="patterns-label">Detected from:</span>
                    ${agent.patterns_matched.map(p => `<code>${escapeHtml(p)}</code>`).join(', ')}
                </div>
            ` : ''}
        </div>
    `).join('');

    agentsPanel.style.display = 'block';
}

// Hide agents panel
function hideAgentsPanel() {
    agentsPanel.style.display = 'none';
}

// Show warnings panel
function showWarningsPanel(warnings) {
    warningsCount.textContent = `${warnings.length} note${warnings.length !== 1 ? 's' : ''}`;

    warningsContent.innerHTML = warnings.map(warning => `
        <div class="warning-item warning-${warning.severity}">
            <span class="warning-icon">${warning.severity === 'warning' ? '!' : 'i'}</span>
            <div class="warning-content">
                <span class="warning-message">${escapeHtml(warning.message)}</span>
                ${warning.source_directive ? `<code class="warning-source">${escapeHtml(warning.source_directive)}</code>` : ''}
                ${warning.suggestion ? `<span class="warning-suggestion">${escapeHtml(warning.suggestion)}</span>` : ''}
            </div>
        </div>
    `).join('');

    warningsPanel.style.display = 'block';
}

// Hide warnings panel
function hideWarningsPanel() {
    warningsPanel.style.display = 'none';
}

// Basic KDL syntax highlighting
function highlightKdl() {
    const code = outputEditor.value;
    if (!code) {
        outputCode.innerHTML = '';
        return;
    }

    // Simple tokenization for KDL
    let highlighted = escapeHtml(code);

    // Comments first (before anything else)
    highlighted = highlighted.replace(/(\/\/.*)/g, '<span class="cmt">$1</span>');

    // Strings (before keywords to avoid matching class names)
    highlighted = highlighted.replace(/"([^"\\]|\\.)*"/g, '<span class="str">$&</span>');

    // Booleans
    highlighted = highlighted.replace(/#(true|false)\b/g, '<span class="bool">#$1</span>');

    // Numbers (but not inside strings - already wrapped)
    highlighted = highlighted.replace(/\b(\d+)\b(?![^<]*<\/span>)/g, '<span class="num">$1</span>');

    // Keywords (but not inside strings - already wrapped)
    highlighted = highlighted.replace(/\b(schema-version|system|listeners|listener|routes|route|upstreams|upstream|agents|agent|filters|filter|matches|policies|tls|health-check|target|address|protocol|path-prefix|host|static-files|root|index|directory-listing|load-balancing|weight|backup)\b(?![^<]*<\/span>)/g, '<span class="kw">$1</span>');

    outputCode.innerHTML = highlighted;
}

// Load sample configuration
function loadSample(sampleId) {
    if (sampleId && SAMPLES[sampleId]) {
        sourceEditor.value = SAMPLES[sampleId];

        // Set format selector based on sample
        if (sampleId.startsWith('nginx')) {
            formatSelect.value = 'nginx';
        } else if (sampleId === 'haproxy') {
            formatSelect.value = 'haproxy';
        } else if (sampleId === 'traefik') {
            formatSelect.value = 'traefik';
        } else if (sampleId === 'caddy') {
            formatSelect.value = 'caddy';
        } else if (sampleId === 'envoy') {
            formatSelect.value = 'envoy';
        } else {
            formatSelect.value = 'auto';
        }

        convertConfig();
    }
}

// Copy to clipboard
async function copyToClipboard(text, button) {
    try {
        await navigator.clipboard.writeText(text);
        const originalHTML = button.innerHTML;
        button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
        button.style.color = 'var(--color-success)';
        setTimeout(() => {
            button.innerHTML = originalHTML;
            button.style.color = '';
        }, 2000);
    } catch (e) {
        console.error('Failed to copy:', e);
    }
}

// Toggle fullscreen split-pane view
function toggleFullscreen() {
    converterGrid.classList.toggle('fullscreen');
    document.body.style.overflow = converterGrid.classList.contains('fullscreen') ? 'hidden' : '';

    // Handle escape key to exit fullscreen
    if (converterGrid.classList.contains('fullscreen')) {
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                converterGrid.classList.remove('fullscreen');
                document.body.style.overflow = '';
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
    }
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Debounce helper
function debounce(fn, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, args), delay);
    };
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    initWasm();

    // Convert button
    convertBtn.addEventListener('click', convertConfig);

    // Auto-convert on input (debounced)
    const debouncedConvert = debounce(convertConfig, 500);
    sourceEditor.addEventListener('input', debouncedConvert);

    // Format change
    formatSelect.addEventListener('change', convertConfig);

    // Sample selector
    sampleSelect.addEventListener('change', (e) => {
        loadSample(e.target.value);
        e.target.value = ''; // Reset selector
    });

    // Copy buttons
    copySourceBtn.addEventListener('click', () => {
        copyToClipboard(sourceEditor.value, copySourceBtn);
    });

    copyOutputBtn.addEventListener('click', () => {
        copyToClipboard(outputEditor.value, copyOutputBtn);
    });

    // Fullscreen buttons (both toggle the split-pane view)
    fullscreenSourceBtn.addEventListener('click', toggleFullscreen);
    fullscreenOutputBtn.addEventListener('click', toggleFullscreen);

    // CLI install tabs
    cliInstallTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Update active tab
            cliInstallTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Update command
            const method = tab.dataset.method;
            if (INSTALL_COMMANDS[method]) {
                cliInstallCmd.textContent = INSTALL_COMMANDS[method];
            }
        });
    });

    // CLI copy button
    if (cliCopyBtn && cliInstallCmd) {
        cliCopyBtn.addEventListener('click', () => {
            copyToClipboard(cliInstallCmd.textContent, cliCopyBtn);
        });
    }

    // Keyboard shortcut: Ctrl/Cmd + Enter to convert
    sourceEditor.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            convertConfig();
        }
    });

    // Sync scroll between output textarea and highlight overlay
    outputEditor.addEventListener('scroll', () => {
        outputHighlight.scrollTop = outputEditor.scrollTop;
        outputHighlight.scrollLeft = outputEditor.scrollLeft;
    });
});
