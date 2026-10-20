+++
title = "Why Zentinel Runs on a Fork of Pingora"
description = "Twice this year we wrote that our Pingora fork was temporary, kept only until upstream caught up on a security fix. It is still here, it is now published on crates.io, and it no longer exists for security reasons. Here is what it changes, why a proxy needs those changes, and what keeping a fork actually costs."
date = 2026-10-20
[taxonomies]
tags = ["infrastructure", "pingora", "rust", "engineering"]
+++

Zentinel is built on [Pingora](https://github.com/cloudflare/pingora),
Cloudflare's Rust framework for building proxies. For most of this year we have
also run on a fork of it, and we have said more than once that the fork was
about to go away.

In February, the [Pingora 0.7 post](@/blog/pingora-0-7-upgrade.md) was titled
"Dropping the Fork". In March, the [0.8 post](@/blog/pingora-0-8-upgrade.md)
said the fork was back, but only until 0.8.1 or 0.9.0 shipped. The
[CVE response post](@/blog/pingora-cve-response.md) put it as a rule: we
maintain a fork only when upstream is behind on a security patch.

Pingora 0.9.0 shipped in September. The fork did not go away. Since August it
has carried changes that are not security fixes at all, and since August it has
been published on crates.io under its own names. This post explains why, and
what it costs us.

## The short version

Our fork today is upstream Pingora 0.9.0 plus three changes:

| Change | What it lets Zentinel do |
|---|---|
| `TlsSettings::with_server_config` | Hand the listener a complete rustls `ServerConfig`: the TLS versions, cipher suites and session settings from the configuration |
| `ProxyHttp::should_retry_response` | Retry a request when the upstream *answers* with an error such as `503`, not only when the connection fails |
| `Session::enable_retry_buffering_with_limit` | Keep request bodies larger than 64 KiB available for the upstream after the proxy has read them |

All three are additive. Each one defaults to upstream's behaviour, and none of
them changes anything for a program that does not call it. Five of Pingora's
crates are republished as `zentinel-pingora-*`, because they contain the
changes or depend on a crate that does. The rest are unchanged, and Zentinel
takes them straight from crates.io.

## How a security fork became a feature fork

The first two forks were what we said they were. In January we carried three
security fixes on Pingora 0.6 until 0.7 included them. In March we carried one
commit on 0.8.0 to move a transitive `prometheus` dependency past a
vulnerability. Both times the plan was to delete the fork, and the first time we
did.

What changed in August was not Pingora. It was what we were finding in
Zentinel. We spent August to October hunting for settings that parse,
validate and then do nothing, which we wrote about in
[It Parsed, and Did Nothing](@/blog/it-parsed-and-did-nothing.md). Two of the
worst ones could not be fixed inside Zentinel at all.

**TLS settings with nowhere to go.** A Zentinel listener accepts per-SNI
certificates, client certificate authentication (`client-auth`), a minimum
TLS version and a cipher suite list. All of it was parsed and validated, and
none of it reached the listener ([#303](https://github.com/zentinelproxy/zentinel/issues/303)).

The reason was in Pingora: `TlsSettings::build()` constructed its rustls
`ServerConfig` internally, with one certificate for every client, TLS 1.2 and
1.3, and the provider's default cipher suites. The `ServerConfig` never left
that function, so there was no way to give it anything else. Zentinel was
reduced to logging warnings that the configured certificates were not served
and the configured `client-auth` was not enforced.

The patch ([fork #6](https://github.com/zentinelproxy/pingora/pull/6)) adds
`TlsSettings::with_server_config`, which takes a `ServerConfig` the caller has
built. Zentinel builds one from the listener's configuration, with an SNI
certificate resolver, a client certificate verifier and the configured versions
and suites. `enable_h2()` still layers ALPN on top, so HTTP/2 keeps working. If
a client certificate verifier was also set the old way, it is reported rather
than dropped quietly: for mTLS in particular, silence would suggest an
enforcement that is not there.

**Retries that could not see a response.** A route's `retry-policy` is meant
to say things like "retry on `502` or `503`, three times"
([#279](https://github.com/zentinelproxy/zentinel/issues/279)). Pingora's retry
loop runs again only when proxying returns an *error*. An upstream answering
`503` is not an error; it is a response, and by the time its status is known it
is already on its way to the client.

The patch ([fork #8](https://github.com/zentinelproxy/pingora/pull/8)) adds
`should_retry_response`, which sees the upstream's response header before any
of it is sent downstream. Returning `true` turns the response into a retryable
error, and Pingora's existing retry loop does the rest, including replaying the
buffered request body. It never fires for cached responses, for `1xx`, or when
the body was too large to buffer, because a retry would send a truncated body.
Counting attempts is left to the application, which is what makes per-route
limits possible: Pingora's `max_retries` is one number for the whole server.

The third change came this month. Zentinel reads a request's whole body before
proxying it when it validates the body against an API schema or multiplexes MCP
calls. The body then reaches the upstream through Pingora's retry buffer, which
has a fixed size of 64 KiB. Anything larger was dropped from the buffer, the
upstream waited for a body that never came, and the request timed out
([#531](https://github.com/zentinelproxy/zentinel/issues/531)). The patch
([fork #12](https://github.com/zentinelproxy/pingora/pull/12)) lets the caller
choose the buffer size per request.

## Pingora is a framework, and frameworks have edges

None of this is a complaint about Pingora. It is a framework with deliberate
extension points, `ProxyHttp`'s filters and callbacks, and almost everything
Zentinel does fits through them. Routing, agents, caching, rate limiting, health
checks and the WAF all live on our side of that line.

But a general-purpose reverse proxy driven by a configuration file has a
specific problem. Every setting it accepts must reach something that can apply
it. A framework is shaped by the programs its authors write against it. A
configuration language is shaped by what operators expect to be able to say.
Where those two shapes differ, the proxy either refuses the setting, which
operators rightly find limiting, or accepts it and ignores it. That is the bug
class we spent three months removing.

So when a setting ran into one of Pingora's edges, we had three options. Drop
the setting. Keep it and document that it does nothing. Or move the edge. For
TLS settings and response-based retries, moving the edge was a few dozen lines
in Pingora against a feature that otherwise could not work, so we moved it.

Upstream is moving too. Pingora 0.9.0 added `set_cert_resolver` and
`set_client_cert_verifier`, which close part of the TLS gap: per-SNI
certificates and mTLS could now be done without our patch. Protocol versions,
cipher suites and session settings still cannot, so the patch stays for now.

We have not proposed these changes upstream. They are written to be additive
and off by default, so they could be.

## What a fork costs

We said in February that a fork is operational overhead. Here is the bill so
far.

**Publishing.** `cargo publish` keeps only the version of a dependency and
drops its git source. Zentinel depended on the fork by git URL, so the
`zentinel-proxy` crate on crates.io depended on *upstream* Pingora, which lacks
`with_server_config`. `cargo install zentinel-proxy` built for ten minutes and
then failed to compile, for two releases, until a user reported it
([#357](https://github.com/zentinelproxy/zentinel/issues/357)). Our release
binaries and container images were fine, which is why we did not notice.

The fix was to publish the fork's crates under new names
([fork #9](https://github.com/zentinelproxy/pingora/pull/9)), and that had a
trap of its own. Every crate above `pingora-core` in the dependency graph has to
be renamed too, or a build ends up with two incompatible copies of Pingora's
types. Our first attempt built cleanly on its own and failed the moment Zentinel
was built against it, because the fork resolved one crate from a local path and
Zentinel resolved it from crates.io. A fork that builds green by itself tells
you nothing about how it behaves once published.

**Rebasing.** Moving the fork to 0.9.0
([fork #10](https://github.com/zentinelproxy/pingora/pull/10)) was mostly
mechanical: take upstream's version of every file outside the patch set, then
merge the patch set by hand. The one surprise was a test file the fork had never
touched. Git merged it from an older common ancestor and silently put back test
gating that upstream had removed in 0.9.0. We now finish every rebase by diffing
the result against the upstream tag and resetting anything outside the patch
set.

**Keeping the fork's own CI alive.** A fork inherits upstream's CI and then
drifts from it. Our fork's build went red for months because upstream does not
commit a `Cargo.lock`, and new releases of its dependencies broke the build on
their own schedule. Its security audit failed on every run for more than 60
days, because the action it used stopped resolving. Neither failure was in code we had
changed, and both were easy to miss, because nobody watches a repository they
think of as "upstream plus two patches".

**Attribution.** Pingora is Apache-2.0. The fork carries a `NOTICE` that names
the modified files and what changed, and says that Zentinel is not affiliated
with or endorsed by Cloudflare. The renamed crates on crates.io point at our
fork, not at Cloudflare's repository, so that nobody files an issue with
Cloudflare about code Cloudflare did not write.

## Where this goes next

The fork has a clear exit for each patch. When upstream can take a full rustls
configuration, `with_server_config` goes. If upstream gains a way to retry on a
response, `should_retry_response` goes. When the retry buffer size can be set
per request, the third goes.

Upstream is already heading somewhere we want to follow. A change merged after
0.9.0 makes Pingora's response body filters `async`. Today those filters are
synchronous, so when a Zentinel agent inspects a response body, the proxy has
to block a worker thread while it waits for the agent. When we fixed the other
blocking calls on the request path in
[26.10_7](https://github.com/zentinelproxy/zentinel/blob/main/CHANGELOG.md),
this was the one we could not remove. Once that change is released, it goes
away without a patch of ours.

Until then, the honest description is the one we should have written in
August: Zentinel runs on a small, published fork of Pingora, because a proxy
that promises to apply its configuration sometimes needs a hook the framework
does not have yet. The fork, its pull requests and the reasoning behind each
patch are public at
[zentinelproxy/pingora](https://github.com/zentinelproxy/pingora).
