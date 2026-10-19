+++
title = "It Parsed, and Did Nothing"
description = "Between August and October we fixed more than a dozen Zentinel features that were accepted, validated and logged as running, and had no effect. Timeouts, failure modes, TLS settings, health checks, agents, WAF rules. None of them produced an error, because none of them failed. Here is the shape they share, why ordinary testing cannot see it, and the checks that catch it now."
date = 2026-10-20
draft = true
[taxonomies]
tags = ["engineering", "configuration", "testing", "kdl", "waf"]
+++

Most bugs announce themselves. A request fails, a log line turns red, a test
breaks. This post is about the other kind, the kind we spent most of August,
September and October finding in Zentinel: a setting that parses, validates,
shows up in the startup log, and does nothing at all.

We found more than a dozen of them. They were in timeouts, route policies, TLS,
retries, health checks, agents, caching and the WAF engine. Most were in
configurations we ship ourselves. Every one had been accepted by every check we
had. This is an account of what they had in common, and of what we changed so
that the next one is caught by a machine instead of by luck.

The release-by-release detail is in the
[26.09–26.10 roundup](@/blog/zentinel-26-09-26-10.md) and the
[CHANGELOG](https://github.com/zentinelproxy/zentinel/blob/main/CHANGELOG.md).
This post is about the pattern.

## The inventory

A selection, all fixed and released:

| What the config said | What actually happened | Fixed in |
|---|---|---|
| `request-secs 300` on an upstream | The parser read `request`, so the 60s default applied | 26.08_4 |
| `failure-mode "open"` on a route | Never read; every route ran fail-closed | 26.08_4 |
| WAF rule `exclusions { … }` | Looked for one level too high; every exclusion dropped | 26.08_4 |
| `retry-policy { max-attempts 3 }` | Retried *backend selection*, not the request | 26.08_4 |
| Per-SNI certs, `client-auth`, `min-version` | Parsed, validated, then never reached the listener | 26.08_3 |
| An `mcp { tools { allow … } }` policy | Evaluator correct, never called from the request path | 26.08_5 |
| `tracing { enabled #false }` | Read by nothing; tracing stayed on | 26.08_10 |
| Upstream `discovery` blocks | Parsed into nothing; the upstream routed nowhere | 26.08_11 |
| `health-check { … }`, every type | The checker probed an empty backend set | 26.09_2 |
| An agent behind `failure-mode "open"` | Unreachable in the container images; traffic passed uninspected | 26.09_3, 26.09_4 |

Two things stand out. The first is that, in the configuration cases, the
**documentation was right**. `failure-mode "open"` was documented; the code
ignored it. Every one of these fixes moved the code toward the docs, never the
other way. Nothing was checking the two against each other.

The second is the direction of failure. Not one of them failed toward an error.
They all failed toward "your intent was discarded and a default was applied",
and the defaults were plausible enough that nobody noticed.

## Silent in both directions

The health-check bug is the cleanest example, and we have written about it
[before](@/blog/the-gateway-for-agentic-protocols.md#what-we-found-while-building-it),
so briefly. Until 26.09_2, this block was inert:

```kdl
health-check {
    type "http" {
        path "/healthz"
        expected-status 200
    }
    interval-secs 2
    timeout-secs 1
    unhealthy-threshold 2
    healthy-threshold 2
}
```

The runner started. It logged `Starting health check runner`. It ticked every
two seconds. It sent nothing, because the set of backends it iterated was never
populated. Measured against a real fixture: **0 probes in twelve seconds before
the fix, 29 after.**

"Silent in both directions" is the important part. A missing probe cannot fail,
so no error is ever raised. And no backend is ever marked unhealthy, so nothing
visible ever changes: traffic keeps flowing to every backend, which is exactly
what a healthy fleet looks like. The only way to tell "health checking works and
all backends are healthy" from "health checking does nothing" is to look at the
backend and count.

Agents had the same property, from a different angle. With
`failure-mode "open"`, an agent the proxy cannot reach means requests are
forwarded unprocessed. That is the documented, intended behaviour. It is also
indistinguishable, from the outside, from a working agent that found nothing
worth blocking.

## Why none of it showed up

We had tests. We had `zentinel validate`. We had startup logging. Each of them
was answering a slightly different question from the one that mattered.

**Defaults that look right.** The shipped config wrote
`idle-timeout-secs 60` while the parser read `idle-timeout`. The default is 60,
so reading the setting back gave the right answer while discarding it entirely.
The same happened with `memcached-ttl-secs 2` (default 2) and
`redis-fallback-local #true` (default true). The setting that mattered was
`redis-fallback-local #false`: an operator turning off local fallback, so that a
Redis outage does not quietly split one global rate limit into one limit per
proxy, got local fallback anyway.

**"It started" is not "it works".** A log line saying a subsystem started is
evidence that a constructor ran. The health checker, the agent pool and the
discovery code all started, logged and reported success.

**Tests that construct the thing under test.** The TLS SNI tests, 28 of them,
called the certificate resolver directly and passed. The bug was that the
listener never consulted the resolver, which no test that calls the resolver
can see. Our [MCP post](@/blog/header-says-read-body-says-delete.md#the-correction)
carries a correction for the same reason: seventy-three policy tests built a
policy object by hand and evaluated it, and production never built one.

**Tests that could not fail.** One container test checked that the echo agent
had run by grepping the response for `Correlation`. That matches the proxy's own
`X-Correlation-Id`, so it passed with the agent stopped. A regression test for
the `Cache-Status` fix (26.08_12, where a Zentinel in front of another cache
erased that cache's entry from the header) was first written against the helper
that builds the header value, and passed with the bug put back.

**A warning nobody reads.** Route parsing already warned about unrecognised
children. A `circuit-breaker` block inside a route, which only upstreams and
agents support, appeared in our own default config, so the warning fired on
every startup for months. A log line is not a guardrail.

## The WAF engine had it too

[zentinel-modsec](https://github.com/zentinelproxy/zentinel-modsec), our
pure-Rust ModSecurity engine, has run into this shape more than once; the
[June post](@/blog/pure-rust-modsecurity-crs-v4.md) was about the first round.
In August, the published 0.3.0 loaded stock OWASP CRS v4 without complaint and
then denied every request, including `GET /`.

Four defects, each hiding another
([#29](https://github.com/zentinelproxy/zentinel-modsec/issues/29)). The one
that blocked everything: `REQUEST_LINE` was not implemented, so it resolved to
nothing, and CRS rule 920100 tests it with a *negated* operator. "Nothing to
test", negated, became "matched", on every request. Underneath that,
`skipAfter` in phase 2 discarded the rest of the phase, so the anomaly-score
check that makes CRS's blocking decision could never run, and `TX` keys were
case-sensitive, so scores never accumulated.

What is instructive is why the upstream CRS regression corpus barely noticed.
It runs in `DetectionOnly` mode at paranoia level 4, which skips the blocking
decision entirely and keeps the paranoia gates from firing. It measures whether
individual rules *match*, not whether the WAF *decides*. Against the corpus,
the fix moved the pass rate from 81.1% to 81.5%. Run the same corpus in the
shape people deploy (blocking, paranoia 1) and it went from 19.9% to 54.4%.

All four are fixed in zentinel-modsec
[0.4.0](https://github.com/zentinelproxy/zentinel-modsec/releases/tag/v0.4.0),
released 31 August; 0.3.0 has been yanked from crates.io.
<!-- TODO: confirm whether a tagged zentinel-agent-zentinelsec release carrying modsec 0.4.0 exists before publishing; as of 2026-10-19 the latest tag is v0.3.0 (Feb 2026) and only main depends on 0.4.0. -->
The ZentinelSec agent depends on 0.4.0 on its main branch; a tagged agent
release that includes it has not been cut yet.

## What changed

None of the fixes above is interesting on its own; most were a line or two.
What we changed is how we look.

### Probe behaviour; do not grep

Grep is actively misleading for this class of bug. When we went looking for why
route `rate-limit` did nothing, the string `rate_limit` appeared four times in
the config parser. That reads like it is handled. None of the four was an
assignment.

What works is to parse a config and read the result back: what did the struct
end up holding? For runtime behaviour, it means measuring at the other end:
count probes arriving at a fixture, assert a header that only the agent emits
arrives at the upstream, time a retry to see whether the backoff happened. The
retry work found an off-by-one where the first retry ran with no delay. Behaviour
looked fine; only the 57ms that should have been 150ms gave it away.

### Test against a non-default value

If the value you test with equals the default, the test cannot distinguish "the
setting works" from "the setting is ignored". This is the single rule that would
have caught the most of these, and it is easy to break by accident, because the
natural thing to test is the value in the example config.

### Make every test able to fail

Before trusting a regression test, put the bug back and run it. If it still
passes, it was never testing the fix. For agents: stop the agent and re-run. For
the WAF: zentinel-modsec now has CI for the first time, with a conformance job
that ratchets the CRS corpus pass count upward, and a separate test that asserts
the *blocking decision* in deployed shape, since the corpus alone cannot see
that. Both gates were shown to fail before they were trusted.

### Lint the configuration for keys nothing reads

KDL is permissive by design, and Zentinel's parsers read the keys they know and
skip the rest. That is how `request-sec` (one letter short) or `failure_mode`
(underscore) disappear without a trace. This config validates:

```kdl
upstream "inference" {
    target "10.0.0.1:8000"
    target "10.0.0.2:8000"
    timeouts {
        connect-secs 2
        request-sec 300
    }
}
```

```kdl
route "chat" {
    matches {
        path-prefix "/v1/chat"
    }
    upstream "inference"
    policies {
        failure_mode "open"
    }
}
```

and runs with a 60-second request timeout and a fail-closed route. Since
[#365](https://github.com/zentinelproxy/zentinel/issues/365), `zentinel lint`
reports both:

```
'request-sec' is not a setting in the 'timeouts' block and is being ignored. Did you mean 'request-secs'?
'failure_mode' is not a setting in the 'policies' block and is being ignored. Did you mean 'failure-mode'?
```

It checks 43 blocks and catches three mechanisms. Unknown keys are the obvious
one. The second is a key written in the wrong one of two same-named blocks:
`backend "disk"` inside a route's `cache` block parses and does nothing, because
the storage backend is set in the top-level `cache` block, and the lint now says
so. The third surprised us. KDL treats everything up to a newline or `;` as one
node, so a block written on one line:

```kdl
listener "public" { address "0.0.0.0:8080" protocol "http" }
```

is a single `address` node with three arguments. The parser reads the first
argument and there is no `protocol` child to find. The lint reports it:

```
'protocol' is being read as an argument to 'address' rather than as a setting,
so it is ignored. In the 'listener' block, put each setting on its own line
(or separate them with ';').
```

Two design choices keep the lint honest. Each block's list of valid keys lives
next to its parser, not in a separate file, because two copies of a key list is
how this bug comes back. And a test runs the check over every config we ship and
fails the build if any of them uses a key nothing reads. On its first run, that
test found `verify #true` in an example config's upstream TLS block, where the
real key is `insecure-skip-verify`.

<!-- TODO: confirm playground lint PR merged, then add: "The [playground](/playground/) now flags unknown keys as you type." -->

### Validate every snippet in the docs

Configuration examples in documentation get copied into production, so they
are configuration. Since
[docs#71](https://github.com/zentinelproxy/zentinelproxy.io-docs/pull/71), CI
downloads a pinned Zentinel release, runs `zentinel validate` and
`zentinel lint` against every `kdl` block in the documentation, and fails the
deploy on any error or any "is being ignored" warning. At merge it checked 569
snippets, 0 failing; partial examples are marked as fragments and skipped
explicitly rather than by accident.

The previous version of this check is a cautionary tale in its own right. It
"helpfully" rewrote common mistakes before validating, mapping `cert-path` to
`cert-file`, `workers` to `worker-threads`, and four others. Each rewrite turned
a snippet that was wrong on the page into one that validated. `cert-path` sat
green on two pages for months, describing an HTTPS listener with no
certificate. Those rewrites were removed in
[docs#54](https://github.com/zentinelproxy/zentinelproxy.io-docs/pull/54). A
checker that corrects its input before checking it is checking its own
corrections.

## What is still open

This class is not closed, and it would undercut the point of this post to
pretend otherwise. As of 26.10_3, these are accepted without a lint warning:

<!-- TODO: file issues for each of these and link them before publishing. All four reproduced 2026-10-19 against the 0.6.46 playground WASM (validate + lint_config). -->

- `method "GET" "POST"` in a route's `matches` keeps only the first method.
- `load-balancing "least-connections"`, with a hyphen, falls back to round
  robin; only `least_connections` is recognised.
- A health check `type` that is not recognised becomes a TCP check.
- A run-together line inside `matches` is not reported, and the conditions
  after the first are dropped.

The docs checker already treats the first two as traps. And `zentinel lint`
exits 0 on warnings, so a CI step that wants to fail on ignored keys has to
look for them, as the docs job does.

## Checking your own deployment

If you run Zentinel, two things are worth doing after reading this:

1. Run `zentinel lint -c <your config>` and read every line containing
   "is being ignored". Each one is a setting you wrote that is not in effect.
2. For the features you rely on most, check them at the far end rather than in
   the config: count health-check requests at a backend, stop an agent and see
   whether anything changes, send a request that should be retried to an
   upstream that fails on purpose.

If either turns up something that lint did not flag, we would like to hear about
it in an [issue](https://github.com/zentinelproxy/zentinel/issues). That is how
most of the bugs above were found.
