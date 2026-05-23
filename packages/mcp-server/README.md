# @dragonfruit/mcp-server

`xmcp`-based MCP server that exposes Dragon Fruit workspace operations as MCP tools.

## Auth and runtime config

This server supports two auth modes:

1. Static env-based (good for local testing)
2. Per-request header-based (good for multi-user/session usage)

Supported request headers:

- `authorization`: forwarded to Dragon Fruit API as `Authorization`
- `x-api-key`: forwarded to Dragon Fruit API as `X-Api-Key` (used when `authorization` is absent)
- `x-dragonfruit-workspace-slug`: workspace slug override per request
- `x-dragonfruit-api-base-url`: API base URL override per request

Environment fallbacks:

- `DRAGONFRUIT_API_BASE_URL` (default: `http://localhost:8000`)
- `DRAGONFRUIT_WORKSPACE_SLUG`
- `DRAGONFRUIT_API_TOKEN` (as `X-Api-Key`)
- `DRAGONFRUIT_AUTHORIZATION` (full `Authorization` value)

## Run

```bash
pnpm --filter @dragonfruit/mcp-server dev
```

## Integration smoke test

This test validates all 7 tools over MCP HTTP using header-based auth.

Required env vars:

- `DRAGONFRUIT_WORKSPACE_SLUG`
- `DRAGONFRUIT_TEST_PROJECT_ID`
- `DRAGONFRUIT_AUTHORIZATION` or `DRAGONFRUIT_API_TOKEN`

Optional:

- `MCP_SERVER_URL` (default `http://127.0.0.1:3001/mcp`)
- `DRAGONFRUIT_TEST_SEARCH_QUERY` (default `roadmap`)

Run:

```bash
pnpm --filter @dragonfruit/mcp-server test:smoke
```

## Tools

- `list_projects` (paginated)
- `list_tasks` (paginated)
- `get_task`
- `create_task`
- `update_task`
- `add_comment`
- `search_pages` (paginated)

Paginated tools return:

```json
{
  "items": [],
  "total": 0,
  "pagination": {
    "limit": 25,
    "offset": 0,
    "next_offset": null,
    "has_more": false
  }
}
```
