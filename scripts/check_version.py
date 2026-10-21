#!/usr/bin/env python3
"""Fail when config.toml's software_version is not the latest zentinel release.

`[extra] software_version` is the one place the site names the current
release: it feeds the JSON-LD softwareVersion, the version badge and the
docker tags on /customize/, the CalVer example on /supply-chain/, and
llms.txt. Nothing tied it to zentinel's releases, so it sat at 26.10_3 while
26.10_7 shipped.

This compares it with the tag of the latest GitHub release of
zentinelproxy/zentinel (CalVer YY.MM_PATCH, e.g. 26.10_7). It needs the
network, so it is a CI check and a mise task (`mise run check-version`), not
part of `zola build`, which stays offline.

Set GITHUB_TOKEN (CI does) to avoid the unauthenticated API rate limit.

Usage: python3 scripts/check_version.py
"""
import json
import os
import re
import sys
import urllib.request

REPO = "zentinelproxy/zentinel"
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

config = open(os.path.join(ROOT, "config.toml")).read()
m = re.search(r'^software_version\s*=\s*"([^"]+)"', config, re.M)
if not m:
    sys.exit("config.toml has no software_version")
site = m.group(1)

req = urllib.request.Request(
    "https://api.github.com/repos/%s/releases/latest" % REPO,
    headers={"Accept": "application/vnd.github+json", "User-Agent": "zentinelproxy-io-version-check"},
)
token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
if token:
    req.add_header("Authorization", "Bearer " + token)
try:
    with urllib.request.urlopen(req, timeout=30) as resp:
        latest = json.load(resp)["tag_name"]
except Exception as e:  # network, rate limit, API shape
    sys.exit("Could not read the latest %s release: %s" % (REPO, e))

if site != latest:
    print(
        "config.toml software_version is %s, but the latest %s release is %s.\n"
        "Set software_version = \"%s\" in config.toml, then run `mise run llms` and commit both."
        % (site, REPO, latest, latest),
        file=sys.stderr,
    )
    sys.exit(1)
print("software_version %s matches the latest %s release" % (site, REPO))
