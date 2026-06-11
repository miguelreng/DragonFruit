# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Atlas document-writing proposal helpers.

Extracted from agent/chat.py. These helpers drive the streaming and
non-streaming doc-write proposal protocol (_doc_write_event, the
@@ATLAS block parser, _normalise_doc_write_proposals, etc.) and the
ProseMirror JSON traversal helpers (_document_blocks_from_json,
_text_from_pm_node) that feed them.
"""

import json
import re

from django.core.serializers.json import DjangoJSONEncoder

from plane.utils.html_builders import paragraphs_html


_DOC_WRITE_SYSTEM_PROMPT = """
You are Atlas writing inside a Dragon Fruit document review mode.

Return JSON only, with this shape:
{
  "proposals": [
    {
      "operation": "insert_after" | "replace" | "delete",
      "target_block_id": "exact block id from the provided block list, or empty for new insertions",
      "content_text": "one paragraph, heading, or short list worth of proposed document text"
    }
  ]
}

Rules:
- Create one proposal per paragraph or logical block.
- For create mode, use only insert_after proposals and leave target_block_id empty.
- For update mode, use replace/delete only when you are changing a provided block; use insert_after for new context.
- If "Intent: replace" is present, prefer replace proposals against existing block ids. For requests to replace the entire text/document, replace the first relevant block with the new full text and delete any remaining obsolete blocks.
- Preserve the user's intent and write production-ready document prose.
- Do not include markdown fences, commentary, or any keys outside the JSON object.
- When "Cited reference material" is provided in the user prompt, ground factual statements in it
  and include a cited Source line (e.g. "Source: <url>") where appropriate; do not invent sources.
""".strip()


# Streaming variant. Plain-text block protocol instead of one JSON blob so we
# can parse proposals as they arrive token-by-token and surface each paragraph
# live in the editor. Each block is a `@@ATLAS` header line followed by the
# proposed body text; the next header (or end of stream) closes the block.
_DOC_WRITE_STREAM_SYSTEM_PROMPT = """
You are Atlas writing inside a Dragon Fruit document review mode.

Stream the proposed edits as plain text using this exact block protocol. No JSON, no markdown fences, no commentary.

For every proposed edit, first emit a header line by itself:
@@ATLAS op=<insert_after|replace|delete> target=<block id or empty>
Then write the proposed document text on the following lines. Begin each new edit with another @@ATLAS header line.

Rules:
- One @@ATLAS block per paragraph, heading, or short list.
- create mode: use only `op=insert_after` and leave target empty.
- update mode: use `op=replace` or `op=delete` only against a provided block id; use `op=insert_after` with an empty target for brand-new content.
- If "Intent: replace" is present, prefer `op=replace` against existing block ids. For requests to replace the entire text/document, replace the first relevant block with the new full text and delete any remaining obsolete blocks.
- If a "Selected text" section is present, the user is editing exactly that passage: find the provided block id whose text matches the selection and emit a single `op=replace` against it. Do not rewrite, re-order, or touch other blocks unless the request clearly asks you to.
- For `op=delete`, emit only the header line (no body).
- Write production-ready prose. Do not restate the user's prompt.
- Never write the literal text "@@ATLAS" inside body content.
- When "Cited reference material" is provided in the user prompt, ground factual statements in it
  and include a cited Source line (e.g. "Source: <url>") where appropriate; do not invent sources.
""".strip()

_DOC_WRITE_STREAM_MARKER = "@@ATLAS"


def _doc_write_event(event: str, **payload):
    return json.dumps({"event": event, **payload}, cls=DjangoJSONEncoder, separators=(",", ":")) + "\n"


def _plain_text_to_html(text: str) -> str:
    return paragraphs_html(text)


def _document_blocks_from_json(document_json) -> list[dict]:
    if not isinstance(document_json, dict):
        return []
    content = document_json.get("content")
    if not isinstance(content, list):
        return []
    blocks: list[dict] = []
    for node in content:
        if not isinstance(node, dict):
            continue
        attrs = node.get("attrs") if isinstance(node.get("attrs"), dict) else {}
        block_id = str(attrs.get("id") or "").strip()
        text = _text_from_pm_node(node).strip()
        if block_id and text:
            blocks.append({"id": block_id, "type": node.get("type") or "block", "text": text[:2_000]})
    return blocks[:80]


def _text_from_pm_node(node) -> str:
    if not isinstance(node, dict):
        return ""
    if node.get("type") == "text":
        return str(node.get("text") or "")
    content = node.get("content")
    if not isinstance(content, list):
        return ""
    return " ".join(part for part in (_text_from_pm_node(child) for child in content) if part)


def _normalise_doc_write_proposals(raw, *, mode: str, intent: str, blocks: list[dict], fallback_text: str) -> list[dict]:
    block_map = {block["id"]: block for block in blocks}
    first_block_id = blocks[0]["id"] if blocks else ""
    proposals = raw.get("proposals") if isinstance(raw, dict) else None
    if not isinstance(proposals, list):
        proposals = []

    clean: list[dict] = []
    for index, proposal in enumerate(proposals[:30]):
        if not isinstance(proposal, dict):
            continue
        operation = str(proposal.get("operation") or "insert_after").strip()
        if operation not in {"insert_after", "replace", "delete"}:
            operation = "insert_after"
        target_block_id = str(proposal.get("target_block_id") or "").strip()
        if mode == "update" and intent == "replace" and operation == "replace" and target_block_id not in block_map:
            target_block_id = first_block_id
        if operation in {"replace", "delete"} and target_block_id not in block_map:
            operation = "insert_after"
            target_block_id = ""
        content_text = str(proposal.get("content_text") or "").strip()
        if operation != "delete" and not content_text:
            continue
        if mode == "create":
            operation = "insert_after"
            target_block_id = ""
        clean.append(
            {
                "id": f"proposal-{index + 1}",
                "operation": operation,
                "target_block_id": target_block_id,
                "target_original_text": block_map.get(target_block_id, {}).get("text", ""),
                "content_text": content_text[:4_000],
                "content_html": _plain_text_to_html(content_text[:4_000]),
            }
        )

    if clean:
        return clean

    fallback_parts = [part.strip() for part in re.split(r"\n{2,}", fallback_text or "") if part.strip()]
    fallback: list[dict] = []
    for index, part in enumerate(fallback_parts[:12]):
        operation = "insert_after"
        target_block_id = ""
        if mode == "update" and intent == "replace" and first_block_id and index == 0:
            operation = "replace"
            target_block_id = first_block_id
        fallback.append(
            {
                "id": f"proposal-{index + 1}",
                "operation": operation,
                "target_block_id": target_block_id,
                "target_original_text": block_map.get(target_block_id, {}).get("text", ""),
                "content_text": part[:4_000],
                "content_html": _plain_text_to_html(part[:4_000]),
            }
        )
    return fallback


_DOC_WRITE_HEADER_RE = re.compile(
    r"^\s*@@ATLAS\s+op=(?P<op>[a-z_]+)\s*(?:target=(?P<target>\S*))?\s*$",
    re.IGNORECASE,
)


def _parse_doc_write_header(line: str):
    """Parse a `@@ATLAS op=… target=…` header line.

    Returns (operation, target_block_id) or None if the line isn't a header.
    """
    match = _DOC_WRITE_HEADER_RE.match(line)
    if not match:
        return None
    operation = (match.group("op") or "").strip().lower()
    target = (match.group("target") or "").strip()
    return operation, target


def _normalise_stream_header(operation: str, target_block_id: str, *, mode: str, intent: str, block_map: dict):
    """Apply the same validity rules as the non-streaming path to one
    streamed header: clamp the operation, drop targets we don't recognise,
    and force insert_after in create mode."""
    if operation not in {"insert_after", "replace", "delete"}:
        operation = "insert_after"
    if mode == "update" and intent == "replace" and operation == "replace" and target_block_id not in block_map:
        target_block_id = next(iter(block_map), "")
    if operation in {"replace", "delete"} and target_block_id not in block_map:
        operation = "insert_after"
        target_block_id = ""
    if mode == "create":
        operation = "insert_after"
        target_block_id = ""
    return operation, target_block_id


def _stream_doc_write_events(tokens, *, mode: str, intent: str, block_map: dict):
    """Parse Atlas's `@@ATLAS` block protocol from a token iterable.

    Yields (event_name, payload) tuples — proposal_started / proposal_delta /
    proposal_completed — as each block opens, grows, and closes. Pure with
    respect to the token stream (no LLM, no database), so it is unit-testable
    by feeding a scripted list of token strings.
    """
    index = 0
    current: dict | None = None
    buffer = ""

    def _finalise(proposal: dict) -> dict:
        text = (proposal["content_text"] or "").strip()[:4_000]
        proposal["content_text"] = text
        proposal["content_html"] = _plain_text_to_html(text)
        return proposal

    def _completed_payload(proposal: dict) -> dict:
        return {
            "proposal_id": proposal["id"],
            "operation": proposal["operation"],
            "target_block_id": proposal["target_block_id"],
            "target_original_text": proposal["target_original_text"],
            "content_text": proposal["content_text"],
            "content_html": proposal["content_html"],
        }

    for token in tokens:
        buffer += token
        while "\n" in buffer:
            line, buffer = buffer.split("\n", 1)
            header = _parse_doc_write_header(line)
            if header is not None:
                if current is not None:
                    _finalise(current)
                    yield ("proposal_completed", _completed_payload(current))
                operation, target = _normalise_stream_header(
                    header[0], header[1], mode=mode, intent=intent, block_map=block_map
                )
                index += 1
                current = {
                    "id": f"proposal-{index}",
                    "operation": operation,
                    "target_block_id": target,
                    "target_original_text": block_map.get(target, {}).get("text", ""),
                    "content_text": "",
                    "content_html": "",
                }
                yield (
                    "proposal_started",
                    {
                        "proposal_id": current["id"],
                        "operation": current["operation"],
                        "target_block_id": current["target_block_id"],
                        "target_original_text": current["target_original_text"],
                    },
                )
            elif current is not None:
                current["content_text"] += line + "\n"
                yield (
                    "proposal_delta",
                    {
                        "proposal_id": current["id"],
                        "content_text": current["content_text"].strip(),
                        "content_html": _plain_text_to_html(current["content_text"]),
                    },
                )
        # Stream the in-progress (newline-less) tail so text types out smoothly,
        # but never mistake a partial header line for body content.
        if current is not None and buffer and not buffer.lstrip().startswith("@"):
            yield (
                "proposal_delta",
                {
                    "proposal_id": current["id"],
                    "content_text": (current["content_text"] + buffer).strip(),
                    "content_html": _plain_text_to_html(current["content_text"] + buffer),
                },
            )
    if current is not None:
        if buffer and _parse_doc_write_header(buffer) is None:
            current["content_text"] += buffer
        _finalise(current)
        yield ("proposal_completed", _completed_payload(current))


def _fallback_doc_write_text(prompt: str, *, mode: str) -> str:
    cleaned = " ".join((prompt or "").split()).strip()
    if not cleaned:
        cleaned = "this document"
    if mode == "update":
        return (
            f"This proposed update turns the request into a clearer document paragraph: {cleaned}. "
            "It is intentionally concise so you can accept it, reject it, or use it as a starting point."
        )
    return (
        f"This draft introduces the document around the request: {cleaned}. "
        "It gives the page a simple starting paragraph that can be refined after review."
    )


def _extract_json_object(text: str) -> dict | None:
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
