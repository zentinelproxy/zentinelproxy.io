+++
title = "A Gateway for Agentic Protocols"
description = "Zentinel now does for MCP what a reverse proxy has always done for HTTP: per-tool metrics, per-tool rate limits, a tool list cut to what the route permits, and a health check that speaks the protocol. Here is what shipped, two things it caught that had been silently broken for months, and an honest outlook on the harder question — whether a proxy should also be an MCP server."
date = 2026-09-02
[taxonomies]
tags = ["mcp", "agentic", "a2a", "proxy", "observability", "engineering"]
+++

Six months ago the interesting traffic through a reverse proxy was HTTP requests
from browsers. Increasingly it is JSON-RPC from models: an agent calling a tool,
an agent talking to another agent, a completion request billed by the token.
These are not HTTP-shaped problems wearing new names. A rate limit that counts
requests is close to meaningless when one request runs a database query and the
next returns a cached string.

We wrote about [the header/body desync in MCP](@/blog/header-says-read-body-says-delete.md)
in August — the part where the protocol invites intermediaries to trust a header
that the client controls independently of the body. That post was about deciding
whether to forward a request. This one is about everything after that decision,
because guarding one MCP server is a fraction of what a gateway does.

Zentinel 26.09_2 adds four things. Each is a thing a reverse proxy has always
done for HTTP, done properly for MCP for the first time.

## Count what actually ran

`zentinel_mcp_calls_total` is labelled by route, JSON-RPC method, tool, and
decision:

```
zentinel_mcp_calls_total{route="mcp",method="tools/call",target="search_docs",decision="allowed"} 4213
zentinel_mcp_calls_total{route="mcp",method="tools/call",target="execute_sql",decision="denied"} 17
```

The method and tool come from the request **body**, never from the mirrored
`Mcp-Method` and `Mcp-Name` headers. This is the desync again, in its
observability costume: a client can set `Mcp-Name: search_docs` while the body
calls `execute_sql`, and a dashboard built on headers would show a tidy picture
of a tool that never ran.

Both labels are attacker-supplied, which makes cardinality a real concern rather
than a theoretical one — a client calling `tools/call` with random names could
otherwise mint an unbounded number of series and take the metrics endpoint with
it. So each label is reduced to something the route's own configuration names,
and anything else is reported as `<other>`. The number of series a route can
produce is bounded by its config, not by its traffic.

## Rate limit the expensive tool, not the endpoint

An MCP endpoint shares one limit across every tool it exposes. A client
hammering the tool that runs a query exhausts the quota for the tool that
returns a constant.

```kdl
filter "per-tool" {
    type "rate-limit"
    max-rps 5
    key "mcp-tool"
}
```

`mcp-tool` and `client-ip-and-mcp-tool` are the first rate-limit keys Zentinel
resolves from the request body rather than from headers, for the reason above: a
limit keyed on `Mcp-Name` would meter what a client claimed rather than what the
server will execute. The consequence is that the limit applies once the body has
arrived rather than on headers, which is a real difference and worth knowing —
it only applies to routes carrying an `mcp` block.

## Stop advertising what you will refuse

This one started as tidiness and turned out to be a disclosure.

A route with `tools { allow "search_docs" "get_weather" }` refuses a call to
anything else. Until now it also let the upstream answer `tools/list` with the
full set. A client would ask what is available, receive all eighty tools the
server offers, pick one of the seventy-five this route forbids, and be refused.
The policy held. Everything about the exchange was avoidable.

Three costs, in increasing order of how much they matter:

1. A wasted round trip whose failure reads as a bug in the upstream.
2. Tool descriptions spent from the model's context window. MCP clients degrade
   well before a hundred tools; a route permitting five of eighty should
   advertise five.
3. **A tool list is an inventory.** Names and descriptions routinely say which
   internal systems exist and what they can be made to do. A client permitted to
   call none of them still got to read all of it.

`tools/list`, `resources/list` and `prompts/list` responses are now filtered to
exactly what the route permits — same identity rule, same predicate as the
enforcer, so what is hidden is precisely what a call would be refused and never
more. A filter that hid a *different* set than the enforcer refuses would be
worse than no filter: it would make the advertised surface actively misleading
rather than merely incomplete.

## Health checks that speak the protocol

A TCP check proves a socket is open. An HTTP check proves something answered
200. Neither says the thing behind it still speaks MCP — and plenty of MCP
servers expose no `/health` endpoint at all, so for an upstream whose entire
purpose is serving tool calls, the usual checks confirm the least interesting
property available.

```kdl
health-check {
    type "mcp" {
        path "/mcp"
        expected-tools "search_docs" "get_weather"
    }
    interval-secs 30
}
```

The probe sends `initialize`, and given `expected-tools` also asks `tools/list`
and requires those tools to be present. A server that is listening and
initialising but has lost the backend behind its tools is marked unhealthy and
taken out of rotation, rather than left there to fail real calls. A JSON-RPC
error counts as unhealthy despite arriving with HTTP 200 — which is the failure
mode a plain HTTP check structurally cannot see.

## What we found while building it

Two things worth reporting, because both had been true for a long time and
neither produced an error.

**Health checks never probed anything.** Not the MCP ones — *any* of them.
`http`, `tcp`, `grpc`, `inference`, in every configuration. The runner spawned,
logged that it had started, and ticked on schedule against an empty backend set.
Measured against a real backend at `interval-secs 2`: zero probes in twelve
seconds.

It failed silently in both directions, which is why it lasted. No probe was
sent, so a backend that was down was never detected. No backend was ever marked
unhealthy, so nothing was taken out of rotation. Anyone who configured
health-checked failover had the appearance of it and not the fact. The fix is in
this release, and it is worth knowing what to expect on upgrade: backends that
have been quietly failing may be marked unhealthy and removed from rotation for
the first time.

**Our own integration suite had never run.** It existed, it was thorough, and CI
executed `cargo test` only. Wiring it up surfaced four further faults *in the
suite itself* — it terminated on its first passing assertion, probed the wrong
port, lacked routes for the paths it asserted on, and could not reach the agent
it was testing. Every property it covers had been unverified between releases.

There is a pattern here we keep meeting: code that parses, starts, logs, and
does nothing. It does not show up in tests that check configuration, because the
configuration is correct. It shows up when you count the requests arriving at the
other end.

## MCP is not the only protocol

The same machinery is not MCP-specific by accident.

**A2A** gets method allow/deny lists and explicit handling of methods the proxy
does not recognise — defaulting to allow, deliberately, because A2A is young and
refusing every method added after the proxy was built would make upgrading your
agents require upgrading your proxy first.

**Inference upstreams** get token-aware load balancing (`least_tokens_queued`,
which balances on queued work rather than connection count), token budgets, and
health checks that verify the models you depend on are actually loaded rather
than that the server is up.

## Where this goes: Zentinel as an MCP origin

Everything above is Zentinel as a **gateway**. It sits in front of an MCP server
and enforces, meters and observes. It is not an MCP server itself, and today it
cannot be one.

The question we keep being asked — and keep asking ourselves — is whether it
should be. Here is our current thinking, offered as an outlook rather than a
roadmap, because none of it is built and some of it may not survive contact with
the design.

### The gap

Most MCP-worthy context is not an HTTP API. It is object storage, a filesystem,
a SQL database, a search index, a pile of internal documentation. MCP is how a
model reaches all of it, and today reaching any of it means writing a server.

That work gets rewritten per organisation, and the artifact it produces is
usually a process holding broad credentials with no policy in front of it —
precisely the thing a proxy exists to sit in front of. The pitch is not
"REST → MCP"; several tools do that already. It is that a server declared in
Zentinel's config would be **policy-enforced from its first request**, because
the engine described in the rest of this post is already here. The allowlists,
the per-tool metrics, the rate limits, the audit trail — none of that would need
building again.

### The shape it would take

Tools and resources come from a **closed, curated set of sources**, declared in
configuration:

| Source | Exposes as |
|---|---|
| `http` / OpenAPI | tools, from operations you name |
| `filesystem` / object store | resources |
| `sql` | tools, from named parameterised read-only queries |
| `search` index | tools |
| an existing Zentinel `agent` | tools |

Sketching it — **this is illustrative, not a spec, and no part of it works
today**:

```kdl
mcp-server "internal" {
    source "docs" {
        type "search"
        tool "search_runbooks" {
            description "Search operational runbooks by keyword"
        }
    }
    source "reporting" {
        type "sql"
        read-only #true
        tool "revenue_by_month" {
            description "Monthly revenue for a given year"
            query "SELECT month, total FROM revenue WHERE year = $1"
        }
    }
}
```

Two properties of that sketch matter more than the syntax.

**Every tool is named by a human.** There is no mode where pointing at an
OpenAPI spec generates two hundred tools. Whole-spec generation is at most a
scaffolding command that emits config for you to review, edit and commit —
never a live binding. A tool surface that changes because someone edited a spec
in another repository is implicit behaviour of the worst kind, and it is the
single thing we are most determined not to ship.

**The source list is closed.** "A place to embed arbitrary logic because it
might be useful" is how a bounded system stops being one. No scripting in
config, no shell-command source. If your case needs one, an
[agent](https://docs.zentinelproxy.io/agents/) is the extension point and always
has been.

### What we would get wrong if we hurried

Four problems we would rather solve on paper first.

**Tool-count explosion.** A real API becomes hundreds of tools, and MCP clients
degrade badly past a few dozen because the tool list eats the model's context
window. This is the strongest argument that *curation is the product* — the
valuable artifact is a short, well-described tool list, not a complete one. It
also means the tool-list filtering shipped in this release is not a side feature
of the gateway; it is the same insight arriving early.

**Names and descriptions dominate quality.** Model tool-selection depends on them
far more than on schema correctness, and names auto-derived from `operationId`
are reliably poor. This cuts the same way: a generator that produces
`getUserByIdV2` for two hundred endpoints has produced something worse than
nothing.

**Side effects.** Every `DELETE` endpoint becomes callable the moment it becomes
a tool. Allowlist-by-default is not a setting here, it is the only defensible
default — along with read-only by default for `sql` and `filesystem`.

**Session state.** MCP has sessions; a reverse proxy is comfortably stateless.
This is the one genuinely blocking question, and it blocks the *gateway* half
too — presenting several MCP servers as one endpoint with their tools namespaced
apart needs an answer to where a session lives and what happens when one
upstream dies mid-session. Whatever we decide shapes everything built on top, so
we would rather settle it before writing code than during.

### Where it would live

Not in the proxy hot path. Serving MCP inverts what the proxy is — it stops
forwarding and starts originating — so this belongs in an agent or a distinct
`serve` mode. Agents can already short-circuit with a response, which makes it
feasible without touching request forwarding, and keeping it out of the hot path
keeps the gateway work shippable on its own. Which is exactly what happened this
release.

### Honestly

Zentinel is a proxy. The gateway work in this post is unambiguously proxy work:
it is what a reverse proxy does, applied to a protocol that did not exist when
most reverse proxies were written. Originating MCP is a different claim, and
"our proxy is also an application server" is a sentence that has ended badly for
other projects.

We think there is a real version of it — narrow, declarative, curated, and
policy-enforced from the first request — and we would rather build that one
slowly than a general one quickly. The scope discipline we have written down for
ourselves is to prove it with exactly two sources, `http` and one non-API, before
adding a third.

It is all tracked in
[#443](https://github.com/zentinelproxy/zentinel/issues/443). If you are running
MCP behind a proxy, or want to, that issue is the right place to tell us which
half matters more to you — and which two sources you would actually use. That
answer would change what we build first.

---

*Zentinel 26.09_2 is on [crates.io](https://crates.io/crates/zentinel-proxy) and
[GitHub](https://github.com/zentinelproxy/zentinel). The MCP configuration
reference is in [the docs](https://docs.zentinelproxy.io/configuration/agentic/).*
