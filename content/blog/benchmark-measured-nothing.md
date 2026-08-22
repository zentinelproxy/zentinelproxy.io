+++
title = "Our Benchmark Was Measuring Nothing"
description = "We published that zentinel-modsec was 10-30x faster than libmodsecurity, with 6.2M req/s on clean traffic. A community bug report showed the benchmark never executed a single detection rule. The real number is 4-11x. Here's what went wrong, what we changed so it can't happen again, and why the corrected figure moved twice."
date = 2026-08-22
[taxonomies]
tags = ["benchmarks", "waf", "modsecurity", "engineering", "rust"]
+++

Last week our README said zentinel-modsec was 10-30x faster than the C++ libmodsecurity, clearing 6.2M requests per second on clean traffic. Our website said it. Our docs said it. The agent registry said it.

It was wrong by roughly sevenfold, and it was wrong because the benchmark never ran a single detection rule.

## The report

[Laurin](https://github.com/lbrndnr) opened [an issue](https://github.com/zentinelproxy/zentinel-modsec/issues/15) with an observation that took about four sentences:

> When comparing throughput, the `COMPLEX_RULE` is used. It corresponds to phase 2. However, when the benchmark is performed, only phase 1 rules are executed. As far as I understand, the result is that no rule is executed during the benchmark.

That is exactly right. Here is the rule the throughput comparison loaded:

```apache
SecRule REQUEST_URI|ARGS|ARGS_NAMES "@rx (?i)(?:union.*select|select.*from|insert.*into)" \
    "id:942101,phase:2,deny,status:403,\
    msg:'SQL Injection Attack',\
    severity:'CRITICAL',\
    t:lowercase,t:urlDecodeUni"
```

`phase:2` — request body. And here is what the measured section did:

```rust
let mut tx = zentinel.new_transaction();
tx.process_uri(black_box(uri), method, "HTTP/1.1").unwrap();
tx.add_request_header("Host", "example.com").unwrap();
tx.process_request_headers().unwrap();   // phase 1 ends here
tx.intervention().is_some()
```

It stopped at phase 1. The only rule in the ruleset lived in phase 2. Every iteration walked an empty rule list, found nothing to evaluate, and returned.

And — this is the part that took us a second pass to see — the libmodsecurity side of the same comparison did exactly the same thing:

```rust
let tx = LibTransaction::new(&libmsc, &librules);
tx.process_uri(black_box(uri), method, "HTTP/1.1");
tx.add_request_header("Host", "example.com");
tx.process_request_headers();
tx.intervention()
```

Neither engine evaluated a rule. So the benchmark was not comparing a WAF against a no-op, which is what we assumed when we first read the report. It was comparing **two no-ops**: the cost of creating a transaction, parsing a couple of headers, and tearing it down again. We were publishing transaction setup overhead and calling it rule-engine throughput.

## It was worse than reported

While confirming the diagnosis, we checked whether simply adding `process_request_body()` would fix the numbers. It didn't, because the payloads were wrong too.

The benchmark's "SQLi" traffic was this:

```rust
const SQLI_PAYLOADS: &[&str] = &[
    "/api/users?id=1' OR '1'='1",
    "/api/users?id=1; DROP TABLE users--",
    "/search?q=' OR 1=1--",
];
```

Those are recognisable SQL injection strings. None of them match `union.*select|select.*from|insert.*into`. Run them through the engine and the result is unambiguous:

| payload | phase 1 only | phases 1 and 2 |
|---|---|---|
| `?id=1' OR '1'='1` | not blocked | **not blocked** |
| `?id=1 UNION SELECT * FROM passwords--` | not blocked | blocked |

So there were two independent faults stacked on each other. The benchmark ran the wrong phase, and the attack traffic wouldn't have matched even in the right one. Fixing either alone would still have measured nothing.

## The corrected numbers

Both engines now run the same ruleset through request phases 1 and 2, against libmodsecurity 3.0.16:

| Benchmark | Published | Corrected |
|---|---|---|
| Clean request | 161 ns → **30x** | 1.34 µs → **4.2x** |
| SQLi detection | 295 ns → **18.8x** | 1.40 µs → **11.5x** |
| Body processing | 1.24 µs → **10.4x** | 1.45 µs → **8.9x** |
| Rule parsing (complex) | 2.75 µs → **3.6x** | 2.73 µs → **3.9x** |
| Throughput, clean | **6.2M req/s** | **676K req/s** |

The headline drops from "10-30x" to "4-11x".

Two rows barely moved, and the reason explains the whole bug.

Body processing and rule parsing were *always* measuring real work. The body benchmark called `append_request_body` and `process_request_body` on both engines from the start, so phase 2 ran and the rule actually fired. Rule parsing never involved transactions at all. Those two survived correction nearly unchanged — 10.4x to 8.9x, 3.6x to 3.9x — because there was nothing wrong with them.

Everything that collapsed came from the two groups that stopped at phase 1.

Which also answers the obvious question: if neither engine was evaluating rules, why was the measured gap 30x? Because transaction setup is where the two implementations differ most. Ours is a struct and a few allocations. libmodsecurity's crosses an FFI boundary and does considerably more bookkeeping. That 30x was a real measurement — of transaction overhead, on an empty ruleset. Add actual rule evaluation and our cost grows roughly eightfold while theirs grows about 17%, because theirs was already dominated by setup. The gap narrows to 4.2x. Nothing got slower; we simply started measuring the thing we claimed to be measuring.

## The fix that matters

Correcting the numbers took an afternoon. Making the class of error impossible is the part worth writing down.

The benchmark now asserts, before it measures anything, that the ruleset does what the benchmark claims:

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

Both directions matter. Asserting that attacks are blocked catches an empty hot path. Asserting that clean requests aren't catches the opposite failure, where a misconfigured ruleset blocks everything and the benchmark measures a fast rejection path instead of real evaluation.

An empty hot path now fails the benchmark. Before, it produced our best numbers.

If you maintain a benchmark that exercises a rule engine, a parser, a validator — anything where the interesting work is conditional — this is the question to ask: *if the thing under test silently stopped doing its job, would this benchmark get slower, or faster?* If the answer is faster, the benchmark cannot detect the failure it most needs to detect.

## The number moved again

There is a postscript, and leaving it out would repeat the original mistake in miniature.

Days after publishing the corrected figures, we merged two engine changes: [populating `MULTIPART_PART_HEADERS`](https://github.com/zentinelproxy/zentinel-modsec/pull/17), a collection that had been registered as a valid variable but never actually filled, and [a chain-semantics fix](https://github.com/zentinelproxy/zentinel-modsec/pull/18) where a chain starter fired its disruptive action before the rest of the chain was evaluated.

Both add real per-request work. Multipart part headers are now parsed on every body process; chain actions are held until every link matches. Throughput fell from 797K to 676K req/s, and the headline from "4-13x" to "4-11x".

That is a 15% regression and we are publishing it, because the alternative is quietly keeping a number that no longer matches the code — which is a smaller version of exactly what this post is about. Correct multipart handling is not free. It is also not optional.

## What we actually believe now

zentinel-modsec is 4-11x faster than libmodsecurity depending on workload, measured with both engines evaluating the same rules through the same phases on the same machine. Rule parsing is about 4x faster. The gap widens on attack traffic, where the C++ implementation's matching cost dominates, and narrows on clean traffic, where both are mostly doing bookkeeping.

Those are smaller numbers than we published. They are also the first ones we can defend, and the benchmark now fails loudly if they ever stop being true.

Thanks to Laurin for a report that was precise enough to act on immediately. The uncomfortable bugs are the valuable ones — a benchmark that flatters you is worse than no benchmark, because you will cite it.
