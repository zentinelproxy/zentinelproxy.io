+++
title = "Benchmarks Should Be Able to Fail"
description = "If the work your benchmark measures is conditional, the benchmark can silently measure nothing — and it will report that as your best result. Here's the guard we added to zentinel-modsec's WAF benchmarks, why transaction setup overhead is easy to mistake for rule-engine throughput, and the figures we now stand behind: 4-11x faster than libmodsecurity."
date = 2026-08-22
aliases = ["/blog/benchmark-measured-nothing/"]
[taxonomies]
tags = ["benchmarks", "waf", "modsecurity", "engineering", "rust"]
+++

Most performance regressions announce themselves. A number goes up, CI complains, someone bisects. The dangerous case is the opposite: the code under test quietly stops doing its job, and the benchmark gets *faster*. Nothing complains, because from the harness's point of view everything is fine.

This is a structural risk in any benchmark where the interesting work is conditional — a rule engine, a parser, a validator, a policy evaluator. If the condition silently stops being met, you are timing an empty loop and publishing it as throughput.

We hit this in zentinel-modsec, our pure-Rust ModSecurity engine, and the fix generalizes.

## The shape of the problem

A WAF transaction runs in phases. Request headers are phase 1, request body is phase 2, and a `SecRule` declares which phase it belongs to:

```apache
SecRule REQUEST_URI|ARGS|ARGS_NAMES "@rx (?i)(?:union.*select|select.*from|insert.*into)" \
    "id:942101,phase:2,deny,status:403,\
    msg:'SQL Injection Attack',\
    severity:'CRITICAL',\
    t:lowercase,t:urlDecodeUni"
```

Now a benchmark that drives a transaction:

```rust
let mut tx = engine.new_transaction();
tx.process_uri(black_box(uri), method, "HTTP/1.1").unwrap();
tx.add_request_header("Host", "example.com").unwrap();
tx.process_request_headers().unwrap();   // phase 1 ends here
tx.intervention().is_some()
```

That harness never reaches phase 2. Point it at a phase 2 ruleset and every iteration walks an empty rule list. The measurement is real, repeatable, and low-variance. It is also not measuring rule evaluation.

Ours did exactly this, in two of four benchmark groups, and we did not notice because the numbers looked plausible.

## What it was actually measuring

The subtlety is what fills the time instead.

Both engines in our comparison — ours and the C++ libmodsecurity — ran the same phase 1 harness. Neither evaluated a rule. So the benchmark reduced to transaction setup and teardown: allocate a transaction, parse a couple of headers, tear it down. Ours is a struct and a few allocations. libmodsecurity's crosses an FFI boundary and does considerably more bookkeeping.

That difference is real, and it is large. It is also not what anyone means by "WAF performance." We were reporting setup overhead as rule-engine throughput, which produced a headline of 10-30x.

Add real rule evaluation and the picture changes shape. Our per-request cost grows roughly eightfold, because evaluation is now most of the work. libmodsecurity's grows about 17%, because setup already dominated its total. The gap narrows to 4.2x on clean traffic. Nothing got slower; the denominator finally included the work.

Two of our benchmark groups were never affected, and the reason is diagnostic. `body_comparison` called `append_request_body` and `process_request_body` on both engines from the start, so phase 2 always ran and the rule always fired. Rule parsing never involved transactions at all. Those two moved by a few percent when corrected — 10.4x to 8.9x, 3.6x to 3.9x — while the phase 1 groups collapsed. When one subset of a benchmark suite is stable and another moves by 7x, the suite is telling you something about itself.

## Finding it

We did not find this ourselves. Laurin opened [an issue](https://github.com/zentinelproxy/zentinel-modsec/issues/15) with a four-sentence observation:

> When comparing throughput, the `COMPLEX_RULE` is used. It corresponds to phase 2. However, when the benchmark is performed, only phase 1 rules are executed. As far as I understand, the result is that no rule is executed during the benchmark.

Confirming it turned up a second fault sitting underneath. The benchmark's attack traffic was:

```rust
const SQLI_PAYLOADS: &[&str] = &[
    "/api/users?id=1' OR '1'='1",
    "/api/users?id=1; DROP TABLE users--",
    "/search?q=' OR 1=1--",
];
```

Recognisable SQL injection, and none of it matches `union.*select|select.*from|insert.*into`. So even running the correct phase would have measured a no-match path:

| payload | phase 1 only | phases 1 and 2 |
|---|---|---|
| `?id=1' OR '1'='1` | not blocked | **not blocked** |
| `?id=1 UNION SELECT * FROM passwords--` | not blocked | blocked |

Two independent faults, each sufficient on its own. Fixing the phase without fixing the payloads would have produced the same empty measurement and looked like a successful fix.

## The guard

Correcting the numbers was an afternoon. Making this class of error detectable is the part worth keeping.

The benchmarks now assert their own premise before measuring anything:

```rust
fn assert_rules_fire(modsec: &ModSecurity) {
    for &uri in SQLI_PAYLOADS.iter().chain(XSS_PAYLOADS) {
        assert!(
            full_request(modsec, uri, "GET"),
            "benchmark sanity check failed: attack payload not blocked \
             (are the measured phases still executing the rules?): {uri}"
        );
    }
    for &(uri, method) in CLEAN_REQUESTS {
        assert!(
            !full_request(modsec, uri, method),
            "benchmark sanity check failed: clean request was blocked: {uri}"
        );
    }
}
```

Both directions matter. Asserting that attacks are blocked catches the empty hot path. Asserting that clean traffic passes catches the inverse — a misconfigured ruleset that blocks everything, where the benchmark times a fast rejection instead of real evaluation. Either failure mode otherwise shows up as a suspiciously good number.

The test to apply to your own suite is short: **if the thing under test silently stopped working, would this benchmark get slower or faster?** If the answer is faster, it cannot detect the failure it most needs to detect. A benchmark that flatters you is worse than no benchmark, because you will cite it.

## Where the numbers landed

Current figures, both engines evaluating the same ruleset through the same phases, against libmodsecurity 3.0.16:

| Benchmark | zentinel-modsec | libmodsecurity | Ratio |
|---|---|---|---|
| Clean request | 1.34 µs | 5.65 µs | **4.2x** |
| SQLi detection | 1.40 µs | 16.03 µs | **11.5x** |
| Body processing | 1.45 µs | 12.91 µs | **8.9x** |
| Rule parsing (complex) | 2.73 µs | 10.58 µs | **3.9x** |
| Throughput, clean traffic | 676K req/s | 168K req/s | **4.0x** |

So: 4-11x depending on workload, replacing the 10-30x we published from the phase 1 measurement. The gap is widest on attack traffic, where libmodsecurity's matching cost dominates, and narrowest on clean traffic, where both engines are mostly doing bookkeeping.

These are smaller numbers. They are also the first ones that describe rule evaluation, which is the thing anyone choosing a WAF engine actually cares about.

## Numbers track correctness

One more movement worth explaining, because it is the system working as intended.

After the correction we merged two engine changes: [populating `MULTIPART_PART_HEADERS`](https://github.com/zentinelproxy/zentinel-modsec/pull/17), a collection that was registered as a valid variable but never filled, and [a chain-semantics fix](https://github.com/zentinelproxy/zentinel-modsec/pull/18) where a chain starter could fire its disruptive action before the rest of the chain was evaluated.

Both add per-request work. Multipart part headers are parsed on every body process; chain actions are held until every link matches. Throughput moved from 797K to 676K req/s.

That is a 15% cost for correct multipart handling and correct chain evaluation, and it is the right trade. It is also why the assertions matter more than the figures: a number that only moves when the engine gets faster is a number that has stopped tracking the engine.

Thanks to Laurin for a report precise enough to act on the same day.
