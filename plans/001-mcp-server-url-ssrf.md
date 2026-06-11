# Plan 001: Validate MCP server URLs to block SSRF to internal/metadata addresses

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 866fb1777f..HEAD -- apps/api/plane/app/views/agent/base.py apps/api/plane/llm/mcp_client.py`
> If either in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `866fb1777f`, 2026-06-10

## Why this matters

A workspace admin configures "MCP servers" for the Atlas agent by sending a
`url` in a PATCH to the agent endpoint. That URL is later fetched **server-side**
by the API host via `requests.post(self.url, ...)` when the agent lists or calls
tools. There is currently **no validation** of the URL beyond truncating it to
2048 characters — no scheme check, no block on private/loopback/link-local
ranges. On a hosted multi-tenant deployment (production runs at
`api.dragonfruit.sh`), any workspace admin can therefore make the API server
issue requests to `http://169.254.169.254/...` (cloud instance metadata),
`http://localhost:6379` (Redis), or other internal services — a classic
server-side request forgery (SSRF) that can leak credentials or reach internal
infrastructure the admin should never touch. The fix is input validation at the
single write path, plus a defense-in-depth check at fetch time.

## Current state

- `apps/api/plane/app/views/agent/base.py` — the agent CRUD view. `_normalise_mcp_servers`
  (lines 47–102) is the **only** place an MCP server entry is built from client
  input; it is called from the PATCH handler (line 308–312). It validates shape
  and encrypts auth headers but does **not** validate the URL:

  ```python
  # apps/api/plane/app/views/agent/base.py:71-101
  for raw in submitted:
      if not isinstance(raw, dict):
          continue
      name = (raw.get("name") or "").strip()
      url = (raw.get("url") or "").strip()
      if not name or not url:
          continue
      if name in seen:
          continue
      seen.add(name)
      ...
      normalised.append(
          {
              "name": name[:64],
              "url": url[:2048],          # <-- no scheme / host validation
              "auth_header_encrypted": auth_encrypted,
              "enabled": bool(raw.get("enabled", True)),
          }
      )
  ```

  The PATCH handler is admin-gated (`@allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")`),
  which limits _who_ can set it but does not make the SSRF acceptable on a shared host.

- `apps/api/plane/llm/mcp_client.py` — `MCPClient.__init__` (lines 69–72) accepts the
  URL and `_request` (line ~103) fetches it:

  ```python
  # apps/api/plane/llm/mcp_client.py:69-72, 103
  def __init__(self, *, url: str, auth_header_value: Optional[str] = None) -> None:
      if not url:
          raise MCPClientError("url is required")
      self.url = url.rstrip("/") + "/" if not url.endswith("/") else url
  ...
      resp = requests.post(self.url, data=json.dumps(body), headers=headers, timeout=timeout)
  ```

- Conventions: this module raises `MCPClientError` (defined in the same file) for
  all client-side problems; the view returns DRF `Response({"error": ...}, status=400)`
  on bad input (see the `max_concurrent_runs` validation at base.py:292–296 for the
  exact error-return style to match).

## Commands you will need

| Purpose             | Command                                                                           | Expected on success |
| ------------------- | --------------------------------------------------------------------------------- | ------------------- |
| Lint                | `cd apps/api && ruff check plane/app/views/agent/base.py plane/llm/mcp_client.py` | exit 0, no errors   |
| Unit test           | `cd apps/api && python -m pytest plane/tests/unit/ -k mcp_url -q`                 | new tests pass      |
| Full agent contract | `cd apps/api && python -m pytest plane/tests/contract/app/test_agent_app.py -q`   | all pass            |

(The API uses pytest with `DJANGO_SETTINGS_MODULE=plane.settings.test`, configured
in `apps/api/pytest.ini` — run pytest from inside `apps/api`.)

## Scope

**In scope** (the only files you should modify):

- `apps/api/plane/llm/mcp_client.py` — add a `validate_mcp_server_url(url) -> str` helper and call it in `__init__`.
- `apps/api/plane/app/views/agent/base.py` — call the validator inside `_normalise_mcp_servers`; reject invalid entries.
- `apps/api/plane/tests/unit/test_mcp_url_validation.py` (create) — unit tests for the validator.

**Out of scope** (do NOT touch):

- The auth-header encryption logic in `_normalise_mcp_servers` — it is correct; leave it exactly as is.
- The agent dispatch / tool-loop code in `apps/api/plane/bgtasks/` and `apps/api/plane/llm/provider.py`.
- Any change to the `mcp_servers` JSON shape stored on the model — keep the four keys (`name`, `url`, `auth_header_encrypted`, `enabled`).

## Git workflow

- Branch: `advisor/001-mcp-server-url-ssrf`
- Commit style matches repo (`git log` shows `Scope: imperative summary`), e.g.
  `Agent MCP: validate server URLs to block SSRF to internal hosts`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a URL validator to `mcp_client.py`

Add a module-level function (near the top of `apps/api/plane/llm/mcp_client.py`,
after the imports and `MCPClientError` definition). It must:

- Parse the URL with `urllib.parse.urlparse`.
- Reject any scheme other than `http`/`https` → raise `MCPClientError`.
- Require a hostname.
- Resolve the hostname to IP(s) with `socket.getaddrinfo` and reject if **any**
  resolved address is private, loopback, link-local, reserved, or unspecified —
  use Python's `ipaddress` module (`ip_address(...).is_private / is_loopback /
is_link_local / is_reserved / is_unspecified / is_multicast`). Also reject when
  the host is a literal IP in those ranges. Link-local `169.254.0.0/16` (and IPv6
  `fe80::/10`) covers the cloud metadata endpoint.
- Return the normalized URL string on success.

Target shape:

```python
import ipaddress
import socket
from urllib.parse import urlparse

def validate_mcp_server_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise MCPClientError("MCP server URL must be http or https")
    host = parsed.hostname
    if not host:
        raise MCPClientError("MCP server URL must include a host")
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        raise MCPClientError(f"MCP server host does not resolve: {host}") from exc
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if (ip.is_private or ip.is_loopback or ip.is_link_local
                or ip.is_reserved or ip.is_unspecified or ip.is_multicast):
            raise MCPClientError("MCP server URL resolves to a disallowed address")
    return url
```

Then call it in `MCPClient.__init__`, right after the empty-URL check:

```python
if not url:
    raise MCPClientError("url is required")
url = validate_mcp_server_url(url)          # <-- add
self.url = url.rstrip("/") + "/" if not url.endswith("/") else url
```

**Verify**: `cd apps/api && ruff check plane/llm/mcp_client.py` → exit 0.

### Step 2: Reject invalid URLs at the write path in `base.py`

In `_normalise_mcp_servers`, import the validator and, inside the loop after
`url = (raw.get("url") or "").strip()`, validate it. An invalid URL should cause
that entry to be **skipped** (consistent with the existing `if not name or not url: continue`
behavior) rather than 500. Wrap in try/except:

```python
from plane.llm.mcp_client import validate_mcp_server_url, MCPClientError
...
url = (raw.get("url") or "").strip()
if not name or not url:
    continue
try:
    url = validate_mcp_server_url(url)
except MCPClientError:
    continue          # drop entries pointing at disallowed/invalid hosts
```

Leave the rest of the function (encryption, dedup, append) unchanged.

**Verify**: `cd apps/api && ruff check plane/app/views/agent/base.py` → exit 0.

### Step 3: Unit tests for the validator

Create `apps/api/plane/tests/unit/test_mcp_url_validation.py`. Model the file
header and style on an existing unit test (open `apps/api/plane/tests/unit/`
and copy the license header + a `@pytest.mark.unit` class). Cover:

- Accepts a normal public https URL (use a hostname that resolves publicly, e.g. `https://example.com/mcp`).
- Rejects `http://localhost:6379`.
- Rejects `http://127.0.0.1/`.
- Rejects `http://169.254.169.254/latest/meta-data/`.
- Rejects a private literal `http://10.0.0.5/`.
- Rejects a non-http scheme `file:///etc/passwd` and `ftp://x/`.
- Rejects a URL with no host.

To avoid real DNS in CI, you may pass IP-literal URLs (no DNS needed) for the
reject cases, and `monkeypatch` `socket.getaddrinfo` for the public-accept case
to return a public IP tuple. Mark the class `@pytest.mark.unit`.

**Verify**: `cd apps/api && python -m pytest plane/tests/unit/test_mcp_url_validation.py -q` → all pass.

## Test plan

- New file `plane/tests/unit/test_mcp_url_validation.py` with the cases listed in Step 3 (happy path + each reject class).
- Structural pattern: an existing file under `plane/tests/unit/`.
- Verification: `cd apps/api && python -m pytest plane/tests/unit/test_mcp_url_validation.py -q` → all pass, and the existing `test_agent_app.py` still passes.

## Done criteria

ALL must hold:

- [ ] `cd apps/api && ruff check plane/app/views/agent/base.py plane/llm/mcp_client.py` exits 0
- [ ] `cd apps/api && python -m pytest plane/tests/unit/test_mcp_url_validation.py -q` passes; the reject cases each assert `MCPClientError` is raised
- [ ] `cd apps/api && python -m pytest plane/tests/contract/app/test_agent_app.py -q` still passes
- [ ] `grep -n "validate_mcp_server_url" plane/llm/mcp_client.py plane/app/views/agent/base.py` shows it defined once and called in both files
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The "Current state" excerpts don't match the live code (drift since this plan).
- `_normalise_mcp_servers` is no longer the single write path (e.g. another caller constructs `mcp_servers` directly) — the validator must cover all write paths; report the new one.
- Tests reveal the agent stores or fetches the URL somewhere else not covered here.
- A reasonable allow-list requirement surfaces (e.g. the product intentionally needs to reach an internal MCP host in self-hosted deployments) — this changes the design; report instead of hardcoding.

## Maintenance notes

- If self-hosted deployments legitimately need internal MCP hosts, the right
  follow-up is an explicit env-gated allowlist (e.g. `MCP_ALLOWED_INTERNAL_HOSTS`),
  not removing the validation.
- A determined attacker can still attempt DNS-rebinding (resolve public at
  validation, private at fetch). The Step-1 check at `MCPClient.__init__` time
  (just before the fetch) mitigates the common case; a fully robust fix pins the
  resolved IP for the actual connection. Note this as a known limitation in the PR.
- Reviewer should confirm the reject path drops the entry quietly (no 500) and that a valid public URL still round-trips through a PATCH.
