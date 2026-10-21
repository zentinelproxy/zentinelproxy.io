#!/usr/bin/env python3
"""Write static/llms.txt and static/llms-full.txt from the site's content.

Answer engines and agents read plain Markdown far more reliably than themed
HTML. These two files (https://llmstxt.org) used to be hand-written, and drifted
from the product: they claimed an HTTP agent transport that protocol v2 rejects
and left zstd out of the compression list. They are now generated from:

  content/_index.md [extra] llms_about   what Zentinel is (the product claims)
  front matter of every page and section the index: title, URL, description
  content/blog/*.md                      every published post, newest first
  bodies of the Markdown-written pages   llms-full.txt, in full

Unlike raskell.io, the outputs are committed: Cloudflare Pages runs its own
build command, so a file that only exists after a pre-build step might never
reach the live site. `mise run build` regenerates them, and CI runs
`python3 scripts/llms.py --check`, which fails when the committed files are
not what the content produces. Fix that by running `mise run llms`.

Output is deterministic (no build date), so the check only fails on real drift.
Standard library only; runs on macOS's system Python and the CI runner alike.

Usage: python3 scripts/llms.py [--check]
"""
import glob
import os
import re
import sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
os.chdir(ROOT)

CONFIG = open("config.toml").read()


def config_str(key):
    m = re.search(r'^%s\s*=\s*"([^"]*)"' % key, CONFIG, re.M)
    return m.group(1) if m else ""


BASE = config_str("base_url").rstrip("/")
SITE_DESC = config_str("description")
DOCS = config_str("docs_url").rstrip("/") or "https://docs.zentinelproxy.io"
GITHUB = config_str("github_repo")
VERSION = config_str("software_version")


def split_front_matter(text):
    m = re.match(r"\+\+\+\n(.*?)\n\+\+\+\n?(.*)", text, re.S)
    return (m.group(1), m.group(2)) if m else ("", text)


def fm_str(fm, key):
    m = re.search(r'^%s\s*=\s*"((?:[^"\\]|\\.)*)"' % key, fm, re.M)
    return m.group(1).replace('\\"', '"') if m else ""


def fm_multiline(fm, key):
    m = re.search(r'^%s\s*=\s*"""\n?(.*?)"""' % key, fm, re.M | re.S)
    return m.group(1).strip() if m else ""


def fm_date(fm, key):
    m = re.search(r"^%s\s*=\s*(\d{4}-\d{2}-\d{2})" % key, fm, re.M)
    return m.group(1) if m else ""


def url_for(path):
    """content/foo/bar.md -> BASE/foo/bar/, content/foo/_index.md -> BASE/foo/."""
    rel = os.path.relpath(path, "content")
    rel = re.sub(r"(^|/)_index\.md$", "", rel)
    rel = re.sub(r"\.md$", "", rel).strip("/")
    return "%s/%s/" % (BASE, rel) if rel else BASE + "/"


def absolute_links(body):
    """@/x.md#a -> BASE/x/#a; /path -> BASE/path. Fenced code is left alone."""
    def at_link(m):
        return "](%s%s)" % (url_for("content/" + m.group(1)), m.group(2) or "")

    out, fence = [], False
    for line in body.split("\n"):
        if line.lstrip().startswith("```"):
            fence = not fence
        elif not fence:
            line = re.sub(r"\]\(@/([^)#\s]+?\.md)(#[^)\s]*)?\)", at_link, line)
            line = re.sub(r"\]\((/[^)\s]*)\)", lambda m: "](%s%s)" % (BASE, m.group(1)), line)
        out.append(line)
    return "\n".join(out)


def load(path):
    fm, body = split_front_matter(open(path).read())
    return {
        "path": path,
        "fm": fm,
        "title": fm_str(fm, "title"),
        "description": fm_str(fm, "description"),
        "template": fm_str(fm, "template"),
        "date": fm_date(fm, "date"),
        "updated": fm_date(fm, "updated"),
        "draft": bool(re.search(r"^draft\s*=\s*true", fm, re.M)),
        "url": url_for(path),
        "body": absolute_links(body.strip()),
    }


home = load("content/_index.md")
ABOUT = absolute_links(fm_multiline(home["fm"], "llms_about"))
if not ABOUT:
    sys.exit("scripts/llms.py: content/_index.md has no [extra] llms_about")

pages = []
for path in sorted(glob.glob("content/*.md") + glob.glob("content/*/_index.md")):
    if path in ("content/_index.md", "content/blog/_index.md"):
        continue
    p = load(path)
    if not p["draft"]:
        pages.append(p)

posts = [load(p) for p in glob.glob("content/blog/*.md") if not p.endswith("_index.md")]
posts = sorted((p for p in posts if not p["draft"]), key=lambda p: p["date"], reverse=True)

# Pages whose substance is Markdown in content/ (rather than a page template)
# go into llms-full.txt in full.
prose = [p for p in pages if p["template"] in ("", "page.html") and p["body"]]


def entry(p, date=False):
    when = " (%s)" % p["date"] if date and p["date"] else ""
    desc = ": %s" % p["description"] if p["description"] else ""
    return "- [%s](%s)%s%s" % (p["title"], p["url"], when, desc)


index = [
    "# Zentinel",
    "",
    "> %s" % SITE_DESC,
    "",
    "## What Zentinel is",
    "",
    ABOUT,
    "",
    "Current release: %s (GitHub release tag; the crate on crates.io is `zentinel-proxy`)." % VERSION,
    "",
    "## Site",
    "",
]
index += [entry(p) for p in pages]
index += [
    "",
    "## Documentation",
    "",
    "The documentation is a separate site at %s/ (served at its root; there is no /docs/ path on zentinelproxy.io)." % DOCS,
    "",
    "- [Installation](%s/getting-started/installation/)" % DOCS,
    "- [Configuration](%s/configuration/)" % DOCS,
    "- [Agents](%s/agents/)" % DOCS,
    "- [Known limitations](%s/reference/known-limitations/): settings that are accepted but not yet applied" % DOCS,
    "- [Changelog](%s/appendix/changelog/)" % DOCS,
    "",
    "## Blog",
    "",
]
index += [entry(p, date=True) for p in posts]
index += [
    "",
    "## Optional",
    "",
    "- [All site writing in full](%s/llms-full.txt): this summary, the Markdown pages and every blog post in one file" % BASE,
    "- [Agent registry](https://registry.zentinelproxy.io/)",
    "- [Source code](%s)" % GITHUB,
    "- [Releases](%s/releases)" % GITHUB,
    "- [Atom feed](%s/atom.xml)" % BASE,
    "",
]


def full_entry(p):
    head = ["=" * 80, "", "# %s" % p["title"], "", "URL: %s" % p["url"]]
    if p["date"]:
        head.append("Published: %s" % p["date"])
    if p["updated"]:
        head.append("Updated: %s" % p["updated"])
    if p["description"]:
        head += ["", "> %s" % p["description"]]
    return head + ["", p["body"], ""]


full = [
    "# Zentinel: site writing in full",
    "",
    "> %s" % SITE_DESC,
    "",
    "## What Zentinel is",
    "",
    ABOUT,
    "",
    "The index of every page is at %s/llms.txt; the documentation is at %s/." % (BASE, DOCS),
    "",
]
for p in prose + posts:
    full += full_entry(p)

outputs = {
    "static/llms.txt": "\n".join(index).rstrip("\n") + "\n",
    "static/llms-full.txt": "\n".join(full).rstrip("\n") + "\n",
}

if "--check" in sys.argv[1:]:
    stale = [path for path, text in outputs.items()
             if not os.path.exists(path) or open(path).read() != text]
    if stale:
        print("Out of date: %s. Run `mise run llms` (python3 scripts/llms.py) and commit the result."
              % ", ".join(stale), file=sys.stderr)
        sys.exit(1)
    print("llms: %s up to date" % ", ".join(outputs))
    sys.exit(0)

for path, text in outputs.items():
    with open(path, "w") as f:
        f.write(text)
print("llms: %d pages, %d posts -> %s" % (len(pages), len(posts), ", ".join(outputs)))
