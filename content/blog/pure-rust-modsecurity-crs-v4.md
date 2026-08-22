+++
title = "Parsing Isn't Running: Making Pure-Rust ModSecurity Pass Stock OWASP CRS v4"
description = "Our pure-Rust ModSecurity engine loaded 666 OWASP CRS v4 rules without complaint — and then blocked every single request, including GET /. A precise community bug report traced it to six SecLang semantics that parsed fine but executed wrong. Here's the anatomy of the fix, shipped in zentinel-modsec 0.1.3."
date = 2026-06-16
[taxonomies]
tags = ["security", "waf", "modsecurity", "owasp", "rust"]
+++

A rule engine that loads your rules is not the same as a rule engine that runs them.

We learned that the hard way with [zentinel-modsec](https://github.com/zentinelproxy/zentinel-modsec), the pure-Rust ModSecurity reimplementation behind our ZentinelSec WAF agent. Point it at the stock OWASP Core Rule Set v4 and it would happily parse hundreds of rules, report success, and start serving traffic. Then it blocked everything. A plain `GET /` with no query string, no suspicious headers, nothing — `403`. The anomaly score, the entire scoring model CRS is built around, never moved off zero.

The matcher core was fine. `@detectSQLi`, `@detectXSS`, `@contains`, `@rx` — all fast, all correct. The rules parsed. They just didn't *execute* the way SecLang says they should. This is the gap between "688 rules loaded" and "your WAF works," and it's exactly the gap a good test catches and a load-time rule counter misses.

## The bug report we wish every project got

The fix started with a [bug report](https://github.com/zentinelproxy/zentinel-modsec/issues/6) that did the hard part for us. It came with a self-contained reproduction, the exact CRS rule IDs that misfired, pointers to the offending source, and a clean separation of symptom from cause. Six distinct findings, every one reproducible. If you maintain an open-source security tool, this is the bug report you dream about.

Every finding had the same shape: the rule parsed without error, then evaluated incorrectly at runtime.

## Six ways to parse a rule and still get it wrong

**1. Macros in operator arguments were never resolved.** CRS gates its blocking decision on rules like `SecRule TX:ANOMALY_SCORE "@ge %{tx.inbound_anomaly_score_threshold}"`. Our comparison operators saw a `%{...}` in the argument, gave up, and returned no-match. The blocking-evaluation stage was effectively dead code — and the helper that would have provided an alternate threshold path was never called from the transaction either.

**2. A negated operator plus an unresolved macro blocked the world.** CRS rule 911100 enforces allowed HTTP methods with `SecRule REQUEST_METHOD "!@within %{tx.allowed_methods}"`. Because `@within` couldn't expand `%{tx.allowed_methods}`, it returned no-match — and the `!` flipped that into *always match*. Rule 911100 fired on every request in phase 1. That's your "everything is a 403."

**3. Quoted `setvar` increments counted as one.** CRS writes score increments in quoted form: `setvar:'tx.anomaly_score=+5'`. We stripped quotes for `logdata` but not for `setvar`, so the value parsed as `+5'` — the trailing quote broke the integer parse, and it fell back to `+1`. Worse, the deltas CRS actually uses are themselves macros (`+%{tx.critical_anomaly_score}`), which were interpreted at parse time, where they can't be resolved, and silently became `+1` as well. Scores never added up.

**4. Header selectors were case-sensitive.** `REQUEST_HEADERS:User-Agent` looked up `"User-Agent"` in a map that stored header names lowercased. HTTP header names are case-insensitive; the lookup wasn't. Header-targeted rules — a large slice of CRS — quietly never matched.

**5. Two parser gaps.** `@ipMatch 127.0.0.1,::1` split on whitespace only, so the comma-separated form CRS uses became one un-parseable token. And `MULTIPART_PART_HEADERS` wasn't a recognized variable, so the multipart rules file failed to load outright.

**6. `SecAction` never ran.** This one we found while testing. A variable-less `SecAction` — exactly how CRS sets up its thresholds and allowed-methods list in `crs-setup.conf` — short-circuited to "no match" because it had no variables to iterate. The entire initialization step was a no-op, which would have defeated the macro fixes even after we shipped them.

## The fix

The unifying problem was *when* macros get resolved. The fix was to resolve them where the transaction state actually exists — at evaluation time — rather than at parse time where it doesn't.

For operator arguments, that means: if a rule's operator argument contains `%{...}`, expand it against the live transaction's `TX` collection and recompile the operator before running it. After expansion the argument is a plain literal, so `@ge`, `@within`, `@ipMatch` and the rest work uniformly — no per-operator special casing. For `setvar`, macro-bearing values are kept as raw strings through parsing and resolved at apply time, where `+`/`-` deltas are then interpreted against the expanded value. An unresolved macro became a no-op rather than a phantom `+1`.

The rest were direct: strip quotes in `setvar` parsing, fold header selector keys to lowercase, split `@ipMatch` on commas, register `MULTIPART_PART_HEADERS`, and run variable-less `SecAction` rules unconditionally.

Then a second, smaller batch of loader fixes so the *whole* stock bundle would load: resolve `@pmFromFile` data files and `Include` globs relative to the including `.conf` (not the process working directory), and accept the British transformation spellings CRS uses (`t:normalisePath`).

## Before and after

Same engine, same stock CRS v4.7 init and rule text. Before, a benign request was a `403`. After:

```
$ zentinel-modsec test --rules crs-entry.conf --uri "/" --method GET
ALLOWED
  Anomaly score: 0

$ zentinel-modsec test --rules crs-entry.conf --uri "/" --method TRACE
BLOCKED (Phase 1)   # rule 911100 — method enforcement, correctly
  Status: 403

$ zentinel-modsec test --rules crs-entry.conf --uri "/?q=1' OR '1'='1" --method GET
BLOCKED (Phase 1)   # @detectSQLi scored +5, @ge threshold fired
  Status: 403
  Rules: ["949110"]
```

Benign traffic passes. Method enforcement works. A SQL injection scores against the anomaly model and trips the threshold. And the full stock CRS v4.7.0 bundle now loads — 666 rules — from any working directory.

## The honest part

We load 666 of roughly 688 rules in the v4.7 bundle. A handful of directives and transformations at the edges are still no-ops or unimplemented, and we're tracking the remaining loader robustness work in the open. "Runs stock CRS v4" is now true in the way that matters — initialization, scoring, blocking evaluation, and the common operator and variable surface all behave per spec — and we'd rather tell you the exact number than round it up to "full."

All of this shipped in **zentinel-modsec 0.1.3**. If you ran an earlier version against CRS v4 and concluded it was unusable, you were right, and it isn't anymore.

The natural next step is to put it back under [wafworth](https://github.com/zentinelproxy/wafworth), our open-source WAF test harness, and measure detection and false-positive rates with the full rule set live rather than the reduced baseline. That's a separate post with real confusion matrices — and this time the rules will actually be running.

## Postscript: one of these fixes had a second layer

Two months after this was written, a CRS compatibility review turned up
something uncomfortable. Look again at fix five above — "register
`MULTIPART_PART_HEADERS`."

That fixed the *loading* failure. `REQUEST-922-MULTIPART-ATTACK.conf` stopped
being rejected, the rules compiled, the bundle loaded. What it did not do was
populate the collection. Nothing ever wrote to it, so every multipart rule in
CRS evaluated against an empty variable and matched nothing, quietly, on every
request.

Which is this post's thesis one level further down. We fixed a variable that
parsed but did not run, by making it parse — and stopped there. A loaded
ruleset and a rule counter both looked healthy, exactly as before.

The collection is now populated from the multipart parser, keyed by part name,
in [zentinel-modsec #17](https://github.com/zentinelproxy/zentinel-modsec/pull/17).
Part *content* is deliberately excluded, with a test to keep it that way: an
uploaded text file containing a line like `Content-Type: application/x-httpd-php`
should not trip a multipart rule.

The same review found chained rules firing their disruptive action on a partial
match — a chain starter blocking before the rest of the chain was evaluated —
which is its own false-positive story, fixed in
[#18](https://github.com/zentinelproxy/zentinel-modsec/pull/18).

If there is a lesson beyond the obvious one, it is that "the rules load now" and
"the rules run now" need separate evidence, and that the second is much easier
to assume than to check. The benchmark we were quoting at the time turned out to
have the same problem, but that is
[a different story](https://github.com/zentinelproxy/zentinel-modsec/issues/15).
