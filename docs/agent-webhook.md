# Agent webhook

DragonFruit doesn't bundle an LLM. Instead, every workspace can configure a
single HTTPS endpoint that receives `/agent` invocations from the doc editor.
Whatever's on the other end — a Cloudflare worker, an Anthropic-backed Node
script, n8n, a teammate's laptop — is free to use the regular Pages and
Issues API to write back.

This is intentionally a thin contract. The point is to let the community
explore agent shapes before we decide what to bring in-house.

---

## How it works

1. A workspace admin POSTs a webhook URL to the workspace's config endpoint.
   The server generates an HMAC secret and returns it once.
2. In the doc editor, the user types `/agent`, hits enter, types a prompt,
   and submits.
3. The web app POSTs to the dispatch endpoint with the page/block context
   and the user's prompt.
4. The server signs the payload with HMAC-SHA256 and POSTs it to the
   configured URL with a 5-second timeout.
5. The dispatch endpoint returns `202` with a `dispatch_id`. The agent runs
   on its own schedule and writes back via the normal Plane API.

The editor never blocks waiting for the agent. Agents that take seconds or
minutes are equally welcome; agents that respond in 100ms see no benefit.

---

## Configuring an agent for a workspace

Admin role required. Replace `<slug>` and `<token>` accordingly.

```bash
# Save your webhook URL (server auto-generates the HMAC secret on first save)
curl -X PUT https://<host>/api/workspaces/<slug>/agent-webhook/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://my-agent.example.com/dispatch","is_enabled":true}'

# Response (the `secret` field is returned exactly once — store it):
# {
#   "id": "…",
#   "url": "https://my-agent.example.com/dispatch",
#   "is_enabled": true,
#   "has_secret": true,
#   "secret": "AbCdE…32_url-safe_chars",
#   "created_at": "…",
#   "updated_at": "…"
# }

# Rotate the secret
curl -X PUT https://<host>/api/workspaces/<slug>/agent-webhook/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://my-agent.example.com/dispatch","rotate_secret":true}'

# Disable temporarily
curl -X PUT https://<host>/api/workspaces/<slug>/agent-webhook/ \
  -H "Authorization: Bearer <token>" \
  -d '{"url":"https://my-agent.example.com/dispatch","is_enabled":false}'

# Remove
curl -X DELETE https://<host>/api/workspaces/<slug>/agent-webhook/ \
  -H "Authorization: Bearer <token>"
```

---

## Payload schema

When a user invokes `/agent`, DragonFruit POSTs JSON to the configured URL:

```jsonc
{
  "dispatch_id": "9e8a…",          // unique per invocation
  "event": "agent.invoke",
  "sent_at": "2026-05-18T19:42:11Z",
  "workspace": { "slug": "robot", "id": "…" },
  "user":      { "id": "…", "email": "…" },
  "prompt":    "Draft three follow-up tasks from this section.",
  "context": {
    "project_id":    "…|null",     // null on workspace-level pages
    "page_id":       "…|null",
    "block_id":      "…|null",     // the block the slash was invoked from
    "selection_text": "…|null"     // selected text, or the paragraph if no selection
  }
}
```

### Headers

| Header                          | Example                                          | Meaning                                              |
| ------------------------------- | ------------------------------------------------ | ---------------------------------------------------- |
| `X-Dragonfruit-Event`           | `agent.invoke`                                   | Event type. Always `agent.invoke` today.             |
| `X-Dragonfruit-Signature`       | `sha256=4f8a…`                                   | HMAC-SHA256 of the exact request body, hex-encoded.  |
| `X-Dragonfruit-Dispatch-Id`     | `9e8a…`                                          | Same `dispatch_id` as in the body, for logging.      |
| `User-Agent`                    | `DragonFruit-Agent-Webhook/1`                    | Always this prefix.                                  |

### Verifying the signature (Node)

```js
import crypto from "node:crypto";

function verify(req, secret) {
  const sig = req.headers["x-dragonfruit-signature"];
  if (!sig?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", secret).update(req.rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(sig.slice(7)), Buffer.from(expected));
}
```

> Compute the HMAC on the **raw** request body, not the JSON-parsed version
> — JSON.stringify is not stable across implementations.

---

## Writing back

The agent doesn't reply through the webhook response. It uses the normal
Plane API with a workspace API token (issued by an admin in workspace
settings). Common patterns:

- **Append to the page** — `PATCH /api/workspaces/<slug>/projects/<project_id>/pages/<page_id>/description/`
- **Create tasks** — `POST /api/workspaces/<slug>/projects/<project_id>/issues/`
- **Comment on the page block** — `POST /api/workspaces/<slug>/projects/<project_id>/pages/<page_id>/block-comments/`

Whatever the agent writes shows up in the editor in real time via the live
collaboration channel (HocusPocus).

---

## Minimal receiver example (Node + Express)

```js
import express from "express";
import crypto from "node:crypto";

const SECRET = process.env.DRAGONFRUIT_WEBHOOK_SECRET;
const app = express();
app.use(express.raw({ type: "application/json" }));

app.post("/dispatch", async (req, res) => {
  const sig = req.headers["x-dragonfruit-signature"];
  const expected = crypto.createHmac("sha256", SECRET).update(req.body).digest("hex");
  if (!sig || !crypto.timingSafeEqual(Buffer.from(sig.replace(/^sha256=/, "")), Buffer.from(expected))) {
    return res.status(401).end();
  }

  const { prompt, context, workspace } = JSON.parse(req.body.toString());
  res.status(202).end(); // ack fast — actual work happens async

  // ... call your model, then write back via the Plane API ...
});

app.listen(3030);
```

---

## What's intentionally not here

- **No bundled LLM.** Bring your own model.
- **No response contract.** The webhook ACK is just for delivery; the agent
  decides what to do, when, and where to write it.
- **No streaming.** If your agent wants progressive output, write to the
  page incrementally via the Pages API — collaborators see edits in real
  time. Adding SSE to the dispatch path doubles complexity for marginal
  benefit at this stage.
- **No settings UI yet.** Admins configure via `curl` or the Django shell.
  A workspace settings page is a follow-up.
