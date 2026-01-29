// Sentinel Benchmark Charts
// Renders interactive Chart.js charts from benchmark-results.json

(function () {
  'use strict';

  // Color palette - Sentinel uses primary/mauve, others muted
  const PROXY_COLORS = {
    sentinel: { bg: 'rgba(203, 166, 247, 0.8)', border: 'rgb(203, 166, 247)' },
    envoy:    { bg: 'rgba(137, 180, 250, 0.6)', border: 'rgb(137, 180, 250)' },
    haproxy:  { bg: 'rgba(166, 227, 161, 0.6)', border: 'rgb(166, 227, 161)' },
    nginx:    { bg: 'rgba(249, 226, 175, 0.6)', border: 'rgb(249, 226, 175)' },
    caddy:    { bg: 'rgba(245, 194, 231, 0.6)', border: 'rgb(245, 194, 231)' },
  };

  const PROXY_LABELS = {
    sentinel: 'Sentinel',
    envoy: 'Envoy',
    haproxy: 'HAProxy',
    nginx: 'Nginx',
    caddy: 'Caddy',
  };

  function isDarkMode() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ||
      getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim().startsWith('#1') ||
      getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim().startsWith('#2') ||
      window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function getTextColor() {
    return isDarkMode() ? 'rgba(205, 214, 244, 0.8)' : 'rgba(30, 30, 46, 0.8)';
  }

  function getGridColor() {
    return isDarkMode() ? 'rgba(108, 112, 134, 0.2)' : 'rgba(108, 112, 134, 0.15)';
  }

  function chartDefaults() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: getTextColor(), font: { family: "'JetBrains Mono', monospace", size: 12 } },
        },
        tooltip: {
          backgroundColor: isDarkMode() ? 'rgba(30, 30, 46, 0.95)' : 'rgba(255, 255, 255, 0.95)',
          titleColor: isDarkMode() ? '#cdd6f4' : '#1e1e2e',
          bodyColor: isDarkMode() ? '#bac2de' : '#313244',
          borderColor: isDarkMode() ? 'rgba(108, 112, 134, 0.3)' : 'rgba(108, 112, 134, 0.2)',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12,
          bodyFont: { family: "'JetBrains Mono', monospace", size: 12 },
          titleFont: { family: "'JetBrains Mono', monospace", size: 13, weight: 'bold' },
        },
      },
      scales: {
        x: {
          ticks: { color: getTextColor(), font: { family: "'JetBrains Mono', monospace", size: 11 } },
          grid: { color: getGridColor() },
        },
        y: {
          ticks: { color: getTextColor(), font: { family: "'JetBrains Mono', monospace", size: 11 } },
          grid: { color: getGridColor() },
        },
      },
    };
  }

  // -------------------------------------------------------------------------
  // Chart: Requests Per Second (horizontal bar)
  // -------------------------------------------------------------------------
  function renderRpsChart(data) {
    var el = document.getElementById('chart-rps');
    if (!el) return;
    var ctx = el.getContext('2d');
    var proxies = Object.keys(data.proxies);
    var labels = proxies.map(function (p) { return PROXY_LABELS[p] || p; });
    var values = proxies.map(function (p) { return data.proxies[p].rps; });
    var bgColors = proxies.map(function (p) { return (PROXY_COLORS[p] || PROXY_COLORS.sentinel).bg; });
    var borderColors = proxies.map(function (p) { return (PROXY_COLORS[p] || PROXY_COLORS.sentinel).border; });

    // Sort by RPS descending
    var indices = proxies.map(function (_, i) { return i; });
    indices.sort(function (a, b) { return values[b] - values[a]; });
    labels = indices.map(function (i) { return labels[i]; });
    values = indices.map(function (i) { return values[i]; });
    bgColors = indices.map(function (i) { return bgColors[i]; });
    borderColors = indices.map(function (i) { return borderColors[i]; });

    var opts = chartDefaults();
    opts.indexAxis = 'y';
    opts.plugins.tooltip.callbacks = {
      label: function (ctx) { return ctx.parsed.x.toLocaleString() + ' req/s'; },
    };
    opts.scales.x.title = { display: true, text: 'Requests per Second', color: getTextColor() };
    delete opts.scales.y.title;

    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'RPS',
          data: values,
          backgroundColor: bgColors,
          borderColor: borderColors,
          borderWidth: 2,
          borderRadius: 6,
        }],
      },
      options: opts,
    });
  }

  // -------------------------------------------------------------------------
  // Chart: Latency Percentiles (grouped bar)
  // -------------------------------------------------------------------------
  function renderLatencyChart(data) {
    var el = document.getElementById('chart-latency');
    if (!el) return;
    var ctx = el.getContext('2d');
    var percentiles = ['p50_ms', 'p75_ms', 'p90_ms', 'p95_ms', 'p99_ms'];
    var pLabels = ['p50', 'p75', 'p90', 'p95', 'p99'];
    var proxies = Object.keys(data.proxies);

    var datasets = proxies.map(function (p) {
      var color = PROXY_COLORS[p] || PROXY_COLORS.sentinel;
      return {
        label: PROXY_LABELS[p] || p,
        data: percentiles.map(function (pct) { return data.proxies[p].latency[pct]; }),
        backgroundColor: color.bg,
        borderColor: color.border,
        borderWidth: 2,
        borderRadius: 4,
      };
    });

    var opts = chartDefaults();
    opts.plugins.tooltip.callbacks = {
      label: function (ctx) { return ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(2) + ' ms'; },
    };
    opts.scales.y.title = { display: true, text: 'Latency (ms)', color: getTextColor() };

    new Chart(ctx, {
      type: 'bar',
      data: { labels: pLabels, datasets: datasets },
      options: opts,
    });
  }

  // -------------------------------------------------------------------------
  // Chart: Memory Over Time (line)
  // -------------------------------------------------------------------------
  function renderMemoryTimelineChart(data) {
    var el = document.getElementById('chart-memory-timeline');
    if (!el) return;
    var ctx = el.getContext('2d');
    var proxies = Object.keys(data.proxies);

    var datasets = proxies.map(function (p) {
      var color = PROXY_COLORS[p] || PROXY_COLORS.sentinel;
      var ts = data.proxies[p].memory.timeseries || [];
      return {
        label: PROXY_LABELS[p] || p,
        data: ts.map(function (point) { return { x: point[0], y: point[1] }; }),
        borderColor: color.border,
        backgroundColor: color.bg.replace(/[\d.]+\)$/, '0.1)'),
        borderWidth: 2,
        fill: false,
        tension: 0.3,
        pointRadius: 0,
        pointHitRadius: 8,
      };
    });

    var opts = chartDefaults();
    opts.scales.x.type = 'linear';
    opts.scales.x.title = { display: true, text: 'Time (seconds)', color: getTextColor() };
    opts.scales.y.title = { display: true, text: 'Memory (MB)', color: getTextColor() };
    opts.plugins.tooltip.callbacks = {
      label: function (ctx) { return ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(1) + ' MB'; },
    };

    new Chart(ctx, {
      type: 'line',
      data: { datasets: datasets },
      options: opts,
    });
  }

  // -------------------------------------------------------------------------
  // Chart: CPU Over Time (line)
  // -------------------------------------------------------------------------
  function renderCpuTimelineChart(data) {
    var el = document.getElementById('chart-cpu-timeline');
    if (!el) return;
    var ctx = el.getContext('2d');
    var proxies = Object.keys(data.proxies);

    var datasets = proxies.map(function (p) {
      var color = PROXY_COLORS[p] || PROXY_COLORS.sentinel;
      var ts = data.proxies[p].cpu.timeseries || [];
      return {
        label: PROXY_LABELS[p] || p,
        data: ts.map(function (point) { return { x: point[0], y: point[1] }; }),
        borderColor: color.border,
        backgroundColor: color.bg.replace(/[\d.]+\)$/, '0.1)'),
        borderWidth: 2,
        fill: false,
        tension: 0.3,
        pointRadius: 0,
        pointHitRadius: 8,
      };
    });

    var opts = chartDefaults();
    opts.scales.x.type = 'linear';
    opts.scales.x.title = { display: true, text: 'Time (seconds)', color: getTextColor() };
    opts.scales.y.title = { display: true, text: 'CPU (%)', color: getTextColor() };
    opts.scales.y.max = 100;
    opts.plugins.tooltip.callbacks = {
      label: function (ctx) { return ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(1) + '%'; },
    };

    new Chart(ctx, {
      type: 'line',
      data: { datasets: datasets },
      options: opts,
    });
  }

  // -------------------------------------------------------------------------
  // Chart: Memory Footprint (grouped bar: initial, peak, final)
  // -------------------------------------------------------------------------
  function renderMemoryFootprintChart(data) {
    var el = document.getElementById('chart-memory-footprint');
    if (!el) return;
    var ctx = el.getContext('2d');
    var proxies = Object.keys(data.proxies);
    var labels = proxies.map(function (p) { return PROXY_LABELS[p] || p; });

    var initialData = proxies.map(function (p) { return data.proxies[p].memory.initial_mb; });
    var peakData = proxies.map(function (p) { return data.proxies[p].memory.peak_mb; });
    var finalData = proxies.map(function (p) { return data.proxies[p].memory.final_mb; });

    var opts = chartDefaults();
    opts.plugins.tooltip.callbacks = {
      label: function (ctx) { return ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(1) + ' MB'; },
    };
    opts.scales.y.title = { display: true, text: 'Memory (MB)', color: getTextColor() };

    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Initial',
            data: initialData,
            backgroundColor: 'rgba(166, 227, 161, 0.6)',
            borderColor: 'rgb(166, 227, 161)',
            borderWidth: 2,
            borderRadius: 4,
          },
          {
            label: 'Peak',
            data: peakData,
            backgroundColor: 'rgba(249, 226, 175, 0.6)',
            borderColor: 'rgb(249, 226, 175)',
            borderWidth: 2,
            borderRadius: 4,
          },
          {
            label: 'Final',
            data: finalData,
            backgroundColor: 'rgba(137, 180, 250, 0.6)',
            borderColor: 'rgb(137, 180, 250)',
            borderWidth: 2,
            borderRadius: 4,
          },
        ],
      },
      options: opts,
    });
  }

  // -------------------------------------------------------------------------
  // Populate metadata and summary tables
  // -------------------------------------------------------------------------
  function populateMetadata(data) {
    var meta = data.metadata;
    var els = {
      'bench-date': meta.date,
      'bench-duration': meta.duration_secs + 's',
      'bench-connections': meta.connections,
      'bench-rps': meta.target_rps.toLocaleString(),
      'bench-cpu': meta.system.cpu,
      'bench-cores': meta.system.cores,
      'bench-ram': meta.system.ram_gb + ' GB',
      'bench-os': meta.system.os + ' ' + meta.system.arch,
      'bench-tool': meta.load_generator.tool + ' ' + meta.load_generator.version,
    };
    Object.keys(els).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.textContent = els[id];
    });

    // Populate summary table
    var tbody = document.getElementById('bench-summary-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    var proxies = Object.keys(data.proxies);
    // Sort by RPS descending
    proxies.sort(function (a, b) { return data.proxies[b].rps - data.proxies[a].rps; });

    proxies.forEach(function (p) {
      var d = data.proxies[p];
      var row = document.createElement('tr');
      var isSentinel = p === 'sentinel';
      row.innerHTML =
        '<td>' + (isSentinel ? '<strong>' : '') + (PROXY_LABELS[p] || p) + ' ' + d.version + (isSentinel ? '</strong>' : '') + '</td>' +
        '<td>' + (isSentinel ? '<strong>' : '') + Math.round(d.rps).toLocaleString() + (isSentinel ? '</strong>' : '') + '</td>' +
        '<td>' + d.latency.p50_ms.toFixed(1) + ' ms</td>' +
        '<td>' + d.latency.p99_ms.toFixed(1) + ' ms</td>' +
        '<td>' + d.memory.peak_mb.toFixed(1) + ' MB</td>' +
        '<td>' + d.cpu.avg_pct.toFixed(1) + '%</td>' +
        '<td>' + (d.success_rate * 100).toFixed(2) + '%</td>';
      tbody.appendChild(row);
    });
  }

  // -------------------------------------------------------------------------
  // Init
  // -------------------------------------------------------------------------
  function init() {
    fetch('/data/benchmark-results.json')
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load benchmark data');
        return res.json();
      })
      .then(function (data) {
        populateMetadata(data);
        renderRpsChart(data);
        renderLatencyChart(data);
        renderMemoryTimelineChart(data);
        renderCpuTimelineChart(data);
        renderMemoryFootprintChart(data);
      })
      .catch(function (err) {
        console.error('Benchmark chart error:', err);
        var container = document.querySelector('.benchmark-charts');
        if (container) {
          container.innerHTML = '<p style="color: var(--color-text-muted); text-align: center;">Benchmark data not available.</p>';
        }
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
