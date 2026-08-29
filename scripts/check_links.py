#!/usr/bin/env python3
"""Check internal links in the Zola content tree.

`zola check` only validates Zola's own `@/page.md` link syntax, so the
absolute-path links this site mostly uses are never verified and rot silently.
This walks every markdown link and resolves it against the routes Zola will
actually serve.

Zola routing: content/foo/bar.md    -> /foo/bar/
              content/foo/_index.md -> /foo/

Two failures are specific to this site:

* **`/docs/...` links.** The documentation is served at the root of
  docs.zentinelproxy.io, not under `/docs/` on this host, so those always 404.
  This has broken twice; it is a hard failure.
* **Pinned release downloads.** A hardcoded
  `releases/download/<tag>/<asset>` URL cannot be verified statically and rots
  when assets are renamed — the install instructions carried one that 404'd from
  the moment the project was renamed. Reported as a warning, since blog posts
  legitimately cite historical releases.

Usage: python3 scripts/check_links.py [content]
Exits non-zero if any internal link is broken or any `/docs/` link is present.
"""
import os
import re
import sys
from collections import defaultdict

ROOT = sys.argv[1] if len(sys.argv) > 1 else "content"

LINK_RE = re.compile(r"\[([^\]]*)\]\(([^)]+)\)")

# The documentation lives on its own host and is served at that host's root, so
# a /docs/... path on this site is always a 404. Written out rather than
# rewritten automatically: the correct target is usually not a bare prefix swap.
DOCS_PREFIX_RE = re.compile(r"^/docs(/|$)")

# Pinned release assets cannot be verified without knowing what a release
# actually shipped, and they rot silently when asset names change.
PINNED_DOWNLOAD_RE = re.compile(
    r"https://github\.com/[^/]+/[^/]+/releases/download/(?!\$\{|\{)[^/]+/"
)


def build_routes(root):
    """Map every URL path Zola will serve -> source file."""
    routes = {}
    for dirpath, _dirs, files in os.walk(root):
        for fn in files:
            if not fn.endswith(".md"):
                continue
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, root)
            if fn == "_index.md":
                url = "/" + os.path.dirname(rel).replace(os.sep, "/")
            else:
                url = "/" + rel[:-3].replace(os.sep, "/")
            url = url.rstrip("/")
            if url == "":
                url = "/"
            routes[url] = full
    return routes


def redirect_routes(path="static/_redirects"):
    """Source paths served by Cloudflare Pages redirect rules.

    These are real routes that do not exist in `content/`, so without them a
    link to e.g. /agents/ looks broken when it is not.
    """
    routes = {}
    if not os.path.exists(path):
        return routes
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            if len(parts) < 2:
                continue
            src = parts[0].rstrip("*").rstrip("/") or "/"
            routes[src] = path
    return routes


def redirect_targets(path="static/_redirects"):
    """(source, target) pairs whose target is a path on this host.

    A /docs/... target 404s for the same reason a /docs/... link does, and this
    file is easy to forget because nothing renders it.
    """
    out = []
    if not os.path.exists(path):
        return out
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            if len(parts) >= 2:
                out.append((parts[0], parts[1]))
    return out


def normalize(target, src_url):
    """Resolve a markdown link target to a normalized URL path, or None if external."""
    t = target.strip()
    if t.startswith("<") and t.endswith(">"):
        t = t[1:-1]
    # strip title:  (/foo "Title")
    t = re.split(r"\s+", t, maxsplit=1)[0]
    if not t:
        return None
    low = t.lower()
    if low.startswith(("http://", "https://", "mailto:", "tel:", "#", "data:")):
        return None
    t = t.split("#")[0].split("?")[0]
    if not t:
        return None
    if t.startswith("@/"):
        # Zola internal link: @/path/to/page.md, relative to content root
        url = "/" + t[2:]
    elif t.startswith("/"):
        url = t
    else:
        base = src_url if src_url.endswith("/") else src_url + "/"
        url = os.path.normpath(os.path.join(base, t))
    url = "/" + url.strip("/")
    if url.endswith(".md"):
        url = url[:-3]
    return url.rstrip("/") or "/"


def main():
    routes = build_routes(ROOT)
    routes.update(redirect_routes())
    broken = defaultdict(list)
    docs_links = defaultdict(list)
    pinned = defaultdict(list)
    total = 0
    for url, path in sorted(routes.items()):
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
        # strip fenced code blocks so example configs don't produce false hits
        text = re.sub(r"```.*?```", "", text, flags=re.S)
        for label, target in LINK_RE.findall(text):
            raw = target.strip().split()[0] if target.strip() else ""
            if DOCS_PREFIX_RE.match(raw):
                docs_links[path].append((label, raw))
            if PINNED_DOWNLOAD_RE.search(raw):
                pinned[path].append((label, raw))
            resolved = normalize(target, url)
            if resolved is None:
                continue
            total += 1
            # static assets live outside content/
            if re.search(r"\.(png|jpg|jpeg|svg|gif|ico|pdf|zip|txt|css|js|json|webmanifest|toml|kdl|xml)$", resolved):
                continue
            if resolved not in routes:
                broken[path].append((label, target, resolved))
    print(f"checked {total} internal links across {len(routes)} pages")
    count = 0
    for path in sorted(broken):
        print(f"\n{path}")
        for label, target, resolved in broken[path]:
            count += 1
            print(f"   [{label}]({target})   -> {resolved}  MISSING")
    print(f"\n{count} broken internal links in {len(broken)} files")

    bad_redirects = [
        (src, dst) for src, dst in redirect_targets() if DOCS_PREFIX_RE.match(dst)
    ]
    if bad_redirects:
        print(f"\n{len(bad_redirects)} redirect rule(s) in static/_redirects point at")
        print("/docs/ on this host, which 404s. Use absolute docs.zentinelproxy.io URLs:")
        for src, dst in bad_redirects:
            print(f"   {src} -> {dst}")

    docs_count = sum(len(v) for v in docs_links.values())
    if docs_count:
        print(f"\n{docs_count} link(s) to /docs/ — the documentation is served at")
        print("the root of docs.zentinelproxy.io, so these 404 on this site:")
        for path in sorted(docs_links):
            for label, raw in docs_links[path]:
                print(f"   {path}: [{label}]({raw})")
                print(f"      -> https://docs.zentinelproxy.io{raw[len('/docs'):] or '/'}")

    pinned_count = sum(len(v) for v in pinned.values())
    if pinned_count:
        print(f"\nwarning: {pinned_count} pinned release download(s). These rot when")
        print("assets are renamed; prefer resolving the latest release at run time:")
        for path in sorted(pinned):
            for label, raw in pinned[path]:
                print(f"   {path}: {raw}")

    return 1 if (count or docs_count or bad_redirects) else 0


if __name__ == "__main__":
    sys.exit(main())
