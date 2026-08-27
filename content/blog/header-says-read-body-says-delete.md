+++
title = "Header Says Read, Body Says Delete"
description = "MCP's Streamable HTTP transport mirrors the tool name into an HTTP header so that gateways can route without parsing the body. Read that header and enforce policy on it, and you have built an allowlist that allows everything. Here's the desync, the version-downgrade that defeats the obvious fix, and what Zentinel does instead."
date = 2026-08-23
updated = 2026-08-25
[taxonomies]
tags = ["mcp", "security", "agentic", "proxy", "engineering"]
+++

> **Correction — 25 August 2026.** When this was published, the enforcement described below **did not run**. The configuration parsed and the policy engine was correct; nothing in the request path ever called it. It was fixed in Zentinel 0.6.28, released the next day. The original text is left intact; the full account is [at the end](#the-correction).

A protocol that tells intermediaries "you can trust this header instead of reading the body" is doing something genuinely useful and quietly dangerous. Useful, because parsing a JSON body on every request to make a routing decision is real cost a gateway would rather not pay. Dangerous, because the moment there are two sources of truth for what a request does, an attacker gets to pick which one you read.

The Model Context Protocol does exactly this, deliberately and for good reasons. We implemented MCP awareness in Zentinel last week, and the interesting part of the work was not parsing JSON-RPC. It was working out which of the things MCP hands you are safe to believe.

## The shortcut

MCP's Streamable HTTP transport mirrors selected fields from the request body into HTTP headers. From the specification:

> The Streamable HTTP transport mirrors selected JSON-RPC body fields into HTTP headers so that intermediaries (load balancers, gateways, observability tooling) can route and inspect requests without parsing the body.

Concretely, a tool call arrives looking like this:

```http
POST /mcp HTTP/1.1
Content-Type: application/json
MCP-Protocol-Version: 2026-07-28
Mcp-Method: tools/call
Mcp-Name: get_weather

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": { "name": "get_weather", "arguments": { "location": "Seattle, WA" } }
}
```

`Mcp-Method` mirrors `method`. `Mcp-Name` mirrors `params.name`. If you are a proxy that wants to allowlist which tools a client may call, this is exactly the information you need, sitting in a header, already parsed by your HTTP stack.

The temptation is obvious. So is the bug.

## The desync

```http
POST /mcp HTTP/1.1
MCP-Protocol-Version: 2026-07-28
Mcp-Method: tools/call
Mcp-Name: read_file

{"jsonrpc":"2.0","id":1,"method":"tools/call",
 "params":{"name":"delete_everything"}}
```

The gateway reads `Mcp-Name: read_file`, checks it against the allowlist, forwards. The server reads `params.name`, and deletes everything.

There is no exploit code here. There is no parser bug, no encoding trick, no race. There are two fields that are supposed to be equal, and a request in which they are not.

The specification is aware of this. It requires *servers* to reject mismatches with a dedicated error code, `-32020 HeaderMismatch`, and explains why in terms that name the exact scenario:

> This prevents potential security vulnerabilities when different components in the network rely on different sources of truth (e.g., a load balancer routing on the header value while the MCP server executes based on the body value).

So a conforming server catches this. The problem is that "conforming server" is doing load-bearing work in that sentence. Your gateway's allowlist is a security control precisely because you do not want to rely on the thing behind it behaving correctly — that is what a gateway is *for*. A control that only works when the protected system is also correct is not much of a control.

## The obvious fix, and why it isn't enough

Compare the header to the body. If they disagree, refuse the request.

That is right, and it is what Zentinel does. But implemented on its own it is defeated by one header:

```http
MCP-Protocol-Version: 2025-06-18
Mcp-Method: tools/call
Mcp-Name: read_file

{"params":{"name":"delete_everything"}}
```

Protocol revisions before `2026-07-28` did not require mirrored headers to match the body. Some did not define these headers at all. So a proxy that validates header against body has to decide what to do when the request claims a revision where that requirement never existed — and if the answer is "skip the check", the check is optional at the attacker's discretion.

The specification anticipates this too, in a note aimed squarely at people building what we were building:

> Intermediaries that enforce policy based on mirrored headers (e.g., routing or rate-limiting by tenant) **SHOULD** verify that the `MCP-Protocol-Version` header indicates a version that requires header–body validation. If the version is older or the header is absent, the intermediary **SHOULD** reject the request rather than trusting unvalidated header values.

This is the part we expect implementers to miss. The first half — compare header to body — is the intuitive move, and it *feels* complete. The second half is a statement about the space of protocol versions, which is not where anyone's attention is when they are writing a policy engine.

Zentinel refuses requests claiming a revision older than `2026-07-28` by default. You can turn that off with `require-validated-version #false`, and the documentation says plainly what you are accepting when you do.

## The third header nobody talks about

While reviewing our own implementation before opening the pull request, we found we had done the same thing we were writing a module to prevent.

MCP lets a tool schema mark individual **arguments** for mirroring, via an `x-mcp-header` annotation. The specification's own worked example is a SQL tool that mirrors its region:

```http
Mcp-Method: tools/call
Mcp-Name: execute_sql
Mcp-Param-Region: us-west1

{"params":{"name":"execute_sql",
 "arguments":{"region":"us-west1","query":"SELECT * FROM users"}}}
```

Routing by region is precisely the use case the spec offers for these headers. Which means `Mcp-Param-Region: us-west1` with a body saying `eu-central-1` sends the request to one place and executes it in another — the same defect, on a header that is easier to overlook because it is defined by a tool's schema rather than by the protocol.

We had validated `Mcp-Method` and `Mcp-Name` and stopped there. Two of three.

Fixing it surfaced a genuine limitation worth stating rather than papering over. The header's *name* comes from the `x-mcp-header` label in the tool's schema, and that label is not required to equal the property name — `x-mcp-header: "Region"` on a property called `region` is the spec's example, but `x-mcp-header: "Reg"` would be equally valid. A proxy has never seen that schema. So Zentinel checks the headers whose suffix matches an argument name and leaves the rest alone, because denying an unmatched header would refuse legitimate traffic over a naming convention it cannot see.

That is a hole, and we would rather document it than pretend otherwise: **if you route or rate-limit on `Mcp-Param-*` headers, keep the label equal to the property name**, or the proxy cannot confirm the two still agree.

## What we actually built

The rule that falls out of all of this is short:

**Policy resolves against the body. Headers are consulted only to confirm they agree with it.**

Not "prefer the body". Not "check the header, fall back to the body". The body decides, always, and a header that disagrees is not a formatting problem to be normalised away — it is a request that contradicts itself, and it gets refused:

```
mcp-name header says "read_file" but the request body says "delete_everything";
policy is resolved against the body, and a request that disagrees with itself
is refused
```

We treat mismatches as hostile rather than as client bugs. From inside the proxy the two are indistinguishable — a buggy client and an attacker produce byte-identical requests — and only one of them is dangerous. Denying both costs a broken client an error message. Allowing both costs you the allowlist.

The performance argument for reading the header instead of the body turns out to be weaker than it looks, incidentally. You are already terminating TLS, already parsing HTTP, already buffering the body to forward it. Reading `params.name` out of a JSON object you have in memory is not the expensive part of anything.

## A2A, briefly

We added Agent2Agent support in the same change, and it is *simpler to police* for one reason: it has no mirrored headers. The method is in the body, and only in the body.

There is nothing to desynchronise, so there is nothing to spoof. The lesson generalises past MCP: giving an intermediary a second, cheaper source of truth is a feature that creates an attack surface, and a protocol that declines to offer one is easier to put a gateway in front of.

## The pattern underneath

This was not an isolated find. It came at the end of a week in which we found **thirteen** instances of the same shape in Zentinel's own configuration handling — settings that parsed cleanly, validated cleanly, and did nothing:

- Every upstream timeout in every shipped config was being discarded and replaced by its default. The parser read `connect`, the configs wrote `connect-secs`. An inference example asking for `request-secs 300` was cutting requests off at sixty.
- `failure-mode "open"` was pinned to `closed` regardless of configuration, because the parser never populated the field. Routes deliberately set to fail open would block traffic when an agent died.
- A `require_auth` flag that checked a token was *present* and never that it was *correct*. Any non-empty string authenticated.
- `client-auth` without a `ca-file` logged a warning and served ordinary TLS, so an operator could configure mutual TLS, pass `zentinel validate`, start the proxy, and accept unauthenticated clients.

Different subsystems, different authors, one shape: **the configuration says a thing is happening, and it is not.**

## The one lesson worth taking

Three of those thirteen hid the same way, and they are the reason we now have a rule.

`idle-timeout-secs 60` looked correct because the parser's default was also 60. `redis-fallback-local #true` looked correct because the default was true. `memcached-ttl-secs 2` looked correct because the default was 2. In each case the setting was being thrown away, and in each case the discarded value happened to equal what the code would have done anyway — so parsing the shipped config and eyeballing the result confirmed nothing at all.

We know exactly how well that trap works, because it caught us mid-investigation. We published a correction saying `memcached-ttl-secs` was fine, then had to retract it two hours later after testing it properly.

**Verify against a value that differs from the default.** Checking `timeout-secs 30` against a default of 30 proves nothing. Checking it against 7 proves everything.

The same rule applies to test suites, which is where it bit hardest. An existing test called `accepts_valid_auth_token` had been passing for months against an implementation that authenticated nothing:

```rust
let config = ReverseConnectionConfig {
    require_auth: true,
    ..Default::default()          // no tokens configured. none. anywhere.
};
request.auth_token = Some("valid-token-123".to_string());   // never configured
assert!(result.is_ok());
```

It configured no tokens, sent a string that existed nowhere, and asserted acceptance — and passed, because presence was the only check. Between that test and its sibling `rejects_missing_auth_token_when_required` there was an obvious gap: **a token that is present but wrong.** That is the only case that would have failed, and it is the one nobody wrote.

A test suite that covers *control present* and *control absent* but never *control given something it should reject* proves the control exists. It does not prove it works.

## Where this leaves us

Zentinel now understands MCP and A2A natively — method and tool policy, resolved against the body, with header agreement enforced rather than assumed. Seventy-three tests, every configuration setting asserted against a value that differs from its default.

None of this makes MCP a bad protocol. The specification documented its own hazard and warned intermediaries about it, which is more than most protocols manage. But a `SHOULD` in a specification is a prediction about implementer behaviour, and this one predicts that some gateways will read the header, trust it, and call it a security control.

If you operate one, the question worth asking is not whether it parses MCP. It is which field it believes when they disagree.

---

## The correction

This was published on 23 August 2026, alongside Zentinel 0.6.27. The section above says Zentinel "now understands MCP and A2A natively", with policy resolved from the body and header agreement enforced rather than assumed.

That was not true when we wrote it.

The KDL parsed. It validated. It rejected unknown keys with a helpful message. The evaluator existed, and as far as we can tell it was correct. **Nothing in the request path ever called it.** A route declaring

```kdl
mcp {
    tools { allow "get_weather" }
}
```

permitted every tool there is — an allowlist that allows everything, which is the thing this post is about, arrived at from the other direction.

It was found two days later, when someone asked how good the support actually was and the honest way to answer was to go read the call sites. There were none. `RouteConfig::mcp` and `RouteConfig::a2a` were populated by the config layer and consumed by no one. Fixed in 0.6.28.

### The part that stings

The section immediately above this one is about tests that pass against implementations that do nothing. It closes by saying: *"Seventy-three tests, every configuration setting asserted against a value that differs from its default."*

Every one of those seventy-three built a policy object by hand and called `evaluate()` on it. Every one passed. Not one of them could have failed, because the evaluator was never what was broken — production simply never reached it.

**A test that constructs the object under test cannot notice that nothing constructs it in production.**

That is the same defect this post catalogues in `accepts_valid_auth_token`, which asserted a control existed but never that it worked. We described the shape, in detail, in a post announcing a feature that had it.

For what it is worth, it is a common shape rather than an exotic one. In the same codebase, in the same month: a lint rule keyed on a struct field no configuration could set, whose tests set the field directly. A traffic simulator modelling a per-route circuit breaker the proxy has never had, whose test built the breaker by hand instead of from config. Each passed for months.

### What changed

Policy is now a function of the route configuration rather than of an already-built policy object, and the tests start from KDL and end at a decision — parse, convert, evaluate — because the gap was between configuration and enforcement, so that is the boundary worth crossing in a test.

One gap remains, and we would rather name it than let you assume otherwise: nothing automatically proves the request path still calls the policy engine. We expected Rust's dead-code lint to catch the call being deleted, so we tried it. It does not fire. Closing that properly needs a test issuing a real request through a running proxy, which we do not have a harness for yet.

### What to take from this

The advice in this post is unchanged, and the last two days argue for it more strongly rather than less. Asking a gateway which field it believes when the header and the body disagree is the right question.

It is just not a sufficient one, because a gateway can believe entirely the right field in a module that never runs.

So there is a question underneath it, and it generalises past MCP to any security control you rely on: **what would fail if this were switched off?** If the honest answer is "nothing you would notice", then it is worth finding that out on purpose — by turning it off, or by sending the request it is supposed to refuse — rather than two releases later, when someone asks.
