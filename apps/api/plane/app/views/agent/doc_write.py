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

import html
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
- `Edit scope: entire_document` is authoritative and overrides any cursor or selected-text context. Inspect every
  provided block from first to last, apply the request consistently to every applicable block, and do not stop
  after a representative sample. Leave blocks that already satisfy the request untouched.
- `Edit scope: selection` means change only the selected passage unless the user explicitly broadens the scope.
- If "Intent: replace" is present, prefer replace proposals against existing block ids. For requests to replace the entire text/document, replace the first relevant block with the new full text and delete any remaining obsolete blocks.
- Preserve the user's intent and write production-ready document prose.
- To add vertical space between two blocks, emit an insert_after proposal targeting the block ABOVE the gap
  with content_text exactly "[blank]" — it becomes one empty paragraph. For "fix/add spacing between
  paragraphs" requests, emit one such [blank] proposal per gap and NEVER rewrite or duplicate the paragraphs
  themselves.
- If the user asks for a chart/graph/visualization of data, put a fenced block inside content_text:
  ```chart
  {"type": "bar", "labels": ["Jan", "Feb"], "series": [{"name": "Signups", "values": [120, 180]}]}
  ```
  with type one of bar|line|area|pie|donut and only real numbers from the request, the document, or
  provided reference material. Give the chart its own proposal.
- Other than chart fences, do not include markdown fences, commentary, or any keys outside the JSON object.
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
- `Edit scope: entire_document` is authoritative and overrides any cursor or selected-text context. Inspect every
  provided block from first to last, apply the request consistently to every applicable block, and do not stop
  after a representative sample. Leave blocks that already satisfy the request untouched.
- `Edit scope: selection` means change only the selected passage unless the user explicitly broadens the scope.
- If "Intent: replace" is present, prefer `op=replace` against existing block ids. For requests to replace the entire text/document, replace the first relevant block with the new full text and delete any remaining obsolete blocks.
- If a "Selected text" section is present, the user is editing exactly that passage: find the provided block id whose text matches the selection and emit a single `op=replace` against it. Do not rewrite, re-order, or touch other blocks unless the request clearly asks you to.
- For `op=delete`, emit only the header line (no body).
- To add vertical space between two blocks, emit `op=insert_after` targeting the block ABOVE the gap with a
  body that is exactly the single line `[blank]` — it becomes one empty paragraph. For "fix/add spacing
  between paragraphs" requests, emit one such [blank] block per gap and NEVER rewrite or duplicate the
  paragraphs themselves.
- Write production-ready prose. Do not restate the user's prompt.
- If the user asks for a chart/graph/visualization of data, emit inside a block's body a fenced chart:
  ```chart
  {"type": "bar", "labels": ["Jan", "Feb"], "series": [{"name": "Signups", "values": [120, 180]}]}
  ```
  with type one of bar|line|area|pie|donut, an optional "title", and only real numbers from the
  request, the document, or provided reference material. Give the chart its own @@ATLAS block.
- Never write the literal text "@@ATLAS" inside body content.
- When "Cited reference material" is provided in the user prompt, ground factual statements in it
  and include a cited Source line (e.g. "Source: <url>") where appropriate; do not invent sources.
""".strip()

_DOC_WRITE_STREAM_MARKER = "@@ATLAS"


# Page-scoped editing often retains a browser selection after focus moves to
# the Atlas composer. Explicit whole-document language must win over that stale
# selection, otherwise the selected-text rule narrows a clearly global request
# to one passage. These patterns intentionally describe scope, not edit type.
_ENTIRE_DOCUMENT_SCOPE_PATTERNS = (
    # English: "all the document", "the entire page", "throughout my doc".
    re.compile(r"\b(?:all|every)\s+(?:of\s+)?(?:the\s+|this\s+|my\s+)?(?:document|doc|page)\b", re.IGNORECASE),
    re.compile(r"\b(?:the\s+|this\s+|my\s+)?(?:entire|whole|full)\s+(?:document|doc|page|thing)\b", re.IGNORECASE),
    re.compile(
        r"\b(?:throughout|across)\s+(?:the\s+|this\s+|my\s+)?(?:(?:entire|whole|full)\s+)?(?:document|doc|page)\b",
        re.IGNORECASE,
    ),
    re.compile(r"\b(?:document|doc|page)[ -]wide\b", re.IGNORECASE),
    re.compile(r"\beverywhere(?:\s+(?:in|on)\s+(?:the\s+|this\s+|my\s+)?(?:document|doc|page))?\b", re.IGNORECASE),
    # A request for every repeated structural block is also document-wide.
    re.compile(
        r"\b(?:all|every)\s+(?:the\s+)?(?:paragraphs?|headings?|sections?|titles?|lists?|tables?|blocks?)\b",
        re.IGNORECASE,
    ),
    # Spanish: "todo el documento", "la página completa", "todos los títulos".
    re.compile(r"\b(?:todo|toda)\s+(?:el\s+|la\s+|este\s+|esta\s+|mi\s+)?(?:documento|doc|p[aá]gina)\b", re.IGNORECASE),
    re.compile(r"\b(?:el\s+|la\s+|este\s+|esta\s+|mi\s+)?(?:documento|doc|p[aá]gina)\s+complet[oa]\b", re.IGNORECASE),
    re.compile(r"\b(?:en\s+)?todas\s+partes\b", re.IGNORECASE),
    re.compile(
        r"\b(?:todos|todas)\s+(?:los\s+|las\s+)?(?:p[aá]rrafos?|encabezados?|secciones?|t[ií]tulos?|listas?|tablas?|bloques?)\b",
        re.IGNORECASE,
    ),
)


def infer_doc_write_scope(prompt: str, selection_text: str = "") -> str:
    """Return the authoritative scope for a page edit request.

    Explicit document-wide language always wins. Otherwise an actual selection
    is the target; without one, Atlas is editing the open document generally.
    """
    text = (prompt or "").strip()
    if any(pattern.search(text) for pattern in _ENTIRE_DOCUMENT_SCOPE_PATTERNS):
        return "entire_document"
    if (selection_text or "").strip():
        return "selection"
    return "document"


def _doc_write_event(event: str, **payload):
    return json.dumps({"event": event, **payload}, cls=DjangoJSONEncoder, separators=(",", ":")) + "\n"


# A completed ```chart fence inside a proposal body. Only closed fences match,
# so partially-streamed charts stay plain text until the closing fence arrives.
_CHART_FENCE_RE = re.compile(r"```chart[ \t]*\n(.*?)\n[ \t]*```", re.DOTALL)

_CHART_SPEC_TYPES = {"bar", "line", "area", "pie", "donut"}


def _chart_component_html(raw_json: str) -> str | None:
    """`<chart-component chart="{…}">` for a valid chart spec, else None.

    Mirrors the web app's chart-block serialization (parseChartSpec does the
    deep validation client-side when rendering); this only gates on the shape
    being plausibly a chart so malformed model output stays visible as text.
    """
    try:
        spec = json.loads(raw_json)
    except ValueError:
        return None
    if not isinstance(spec, dict):
        return None
    if str(spec.get("type") or "").strip().lower() not in _CHART_SPEC_TYPES:
        return None
    if not isinstance(spec.get("labels"), list) or not isinstance(spec.get("series"), list):
        return None
    payload = html.escape(json.dumps(spec), quote=True)
    return f'<chart-component chart="{payload}"></chart-component>'


# Spacer convention: a proposal whose content is exactly "[blank]" (or
# "[space]"/"[empty]") inserts ONE empty paragraph — the only way the model can
# express "add vertical space here" (paragraphs_html drops blank segments).
_BLANK_SPACER_RE = re.compile(r"^\s*\[(?:blank|space|empty)\]\s*$", re.IGNORECASE)


def _is_blank_spacer(text: str) -> bool:
    return bool(_BLANK_SPACER_RE.match(text or ""))


def _plain_text_to_html(text: str) -> str:
    parts: list[str] = []
    last = 0
    for match in _CHART_FENCE_RE.finditer(text or ""):
        chart_html = _chart_component_html(match.group(1))
        if chart_html is None:
            continue
        before = (text or "")[last : match.start()]
        if before.strip():
            parts.append(paragraphs_html(before))
        parts.append(chart_html)
        last = match.end()
    if not parts:
        return paragraphs_html(text)
    tail = (text or "")[last:]
    if tail.strip():
        parts.append(paragraphs_html(tail))
    return "".join(parts)


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


# Literal find-replace detection. A user request like "replace renji for rengi"
# is a mechanical edit the LLM tends to botch (it drafts a couple of block edits
# and misses occurrences such as the H1 title), so we recognise it here and build
# the edits deterministically from the document JSON instead of asking the model.
#
# Each pattern captures (search, replacement). We accept optional surrounding
# quotes around either term and a small set of common phrasings. Keep this
# deliberately conservative: anything that isn't a clean single search→replacement
# pair returns None so the caller falls back to the LLM path.
_FIND_REPLACE_PATTERNS = [
    # replace X for Y / replace X with Y
    re.compile(r"^\s*replace\s+(?P<search>.+?)\s+(?:for|with)\s+(?P<replacement>.+?)\s*$", re.IGNORECASE),
    # swap X for Y / swap X with Y
    re.compile(r"^\s*swap\s+(?P<search>.+?)\s+(?:for|with)\s+(?P<replacement>.+?)\s*$", re.IGNORECASE),
    # change X to Y / change X into Y
    re.compile(r"^\s*change\s+(?P<search>.+?)\s+(?:to|into)\s+(?P<replacement>.+?)\s*$", re.IGNORECASE),
    # rename X to Y
    re.compile(r"^\s*rename\s+(?P<search>.+?)\s+to\s+(?P<replacement>.+?)\s*$", re.IGNORECASE),
]


def _strip_optional_quotes(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'`":
        return value[1:-1].strip()
    return value


# Replace-type keywords that may introduce a quoted-terms request such as
# `replace word "rengi" for "antonio"`. When the prompt opens with one of these
# AND carries exactly two quoted segments, we take the two quoted strings as the
# (search, replacement) pair and ignore any filler words around them.
_REPLACE_KEYWORDS = ("replace", "swap", "change", "rename")

# Matches a single quoted segment: "...", '...', or `...`. Used only to detect
# the "exactly two quoted segments" case; we do not parse arbitrary nesting.
_QUOTED_SEGMENT_RE = re.compile(r"\"([^\"]*)\"|'([^']*)'|`([^`]*)`")

# Clearly-meta leading phrases we strip from an UNQUOTED positional search term
# so `replace the word rengi with antonio` extracts `rengi`. Intentionally
# conservative: only these explicit phrases, never bare `the `/`all `/`every `.
_FIND_REPLACE_FILLER_PREFIXES = (
    "the word ",
    "word ",
    "the phrase ",
    "phrase ",
    "all instances of ",
    "all occurrences of ",
    "every instance of ",
    "every occurrence of ",
)


def _strip_leading_filler(value: str) -> str:
    """Strip a single leading meta phrase (case-insensitive) from ``value``.

    Only the explicit phrases in ``_FIND_REPLACE_FILLER_PREFIXES`` are removed,
    and only from the start. Bare articles/quantifiers are deliberately left
    alone so we don't mangle a legitimate search term like "all hands".
    """
    for prefix in _FIND_REPLACE_FILLER_PREFIXES:
        if value.lower().startswith(prefix):
            return value[len(prefix) :].strip()
    return value


def _quoted_terms_find_replace(text: str) -> tuple[str, str] | None:
    """Quoted-terms priority path for ``parse_find_replace``.

    If the (already trimmed, single-line) prompt begins with a replace-type
    keyword AND contains exactly two quoted segments, return those two quoted
    strings in order as (search, replacement) — ignoring any filler words such
    as `word`/`all`/`the` around them. Quotes inside the segments are kept
    verbatim, so `replace "the cat" with "the dog"` yields ("the cat", "the dog").

    Returns None (so the caller falls through to the positional patterns) unless
    there are EXACTLY two quoted segments and both are non-empty.
    """
    lowered = text.lower()
    if not any(lowered.startswith(keyword) for keyword in _REPLACE_KEYWORDS):
        return None
    matches = _QUOTED_SEGMENT_RE.findall(text)
    if len(matches) != 2:
        return None
    # findall returns a tuple of the three alternation groups per match; exactly
    # one is the captured (possibly empty) content for that quote style.
    segments = ["".join(groups) for groups in matches]
    search, replacement = segments[0].strip(), segments[1].strip()
    if not search or not replacement:
        return None
    return search, replacement


def parse_find_replace(prompt: str) -> tuple[str, str] | None:
    """Detect a literal find-replace request and return (search, replacement).

    Recognises common phrasings — "replace X for Y", "replace X with Y",
    "change X to Y", "swap X for Y", "rename X to Y" — with optional quotes
    around either term. Returns None when the prompt is not a clean literal
    single search→replacement pair, so the caller falls back to the LLM.

    The match is intentionally strict: the whole (single-line, trimmed) prompt
    must be the command and nothing else. Multi-line prompts, empty terms, or a
    search term that contains the connector word (which would make the split
    ambiguous) all return None.
    """
    if not prompt:
        return None
    text = prompt.strip()
    # A literal replace is a single instruction; reject multi-line prompts so we
    # don't accidentally swallow a longer editorial request whose first line
    # happens to look like a command.
    if "\n" in text:
        return None
    # Quoted-terms priority: `replace word "rengi" for "antonio"` or
    # `replace all "rengi" with "antonio"`. When the command opens with a
    # replace-type keyword and carries exactly two quoted segments, use those two
    # strings verbatim and ignore any filler words around them.
    quoted = _quoted_terms_find_replace(text)
    if quoted is not None:
        return quoted
    for pattern in _FIND_REPLACE_PATTERNS:
        match = pattern.match(text)
        if not match:
            continue
        # Strip the meta filler phrase first, then any quotes that now lead the
        # term, so `the word "rengi"` reduces to `rengi` (filler -> `"rengi"` ->
        # quote strip -> `rengi`), not `"rengi"`.
        search = _strip_optional_quotes(_strip_leading_filler(_strip_optional_quotes(match.group("search"))))
        replacement = _strip_optional_quotes(_strip_leading_filler(_strip_optional_quotes(match.group("replacement"))))
        # Both terms must be non-empty. We allow the replacement to be empty only
        # if it was explicitly quoted (an intentional deletion); a bare empty
        # replacement means the phrasing didn't parse cleanly.
        if not search or not replacement:
            return None
        return search, replacement
    return None


def _replace_all_case_insensitive(text: str, search: str, replacement: str) -> str:
    """Replace every occurrence of ``search`` in ``text`` with ``replacement``.

    Matching is case-insensitive; the replacement is inserted verbatim as the
    user typed it (we do not try to mirror the original casing). This keeps the
    behaviour simple and predictable — "replace renji for rengi" turns both
    "Renji" and "renji" into "rengi".
    """
    if not search:
        return text
    return re.sub(re.escape(search), lambda _m: replacement, text, flags=re.IGNORECASE)


def build_find_replace_proposals(blocks: list[dict], search: str, replacement: str) -> list[dict]:
    """Build deterministic replace proposals for a literal find-replace.

    Iterates over EVERY block from ``_document_blocks_from_json`` (including the
    title / H1 / headings), and for each block whose text contains ``search``
    case-insensitively emits ONE replace proposal whose new text is the block
    text with ALL occurrences of ``search`` replaced by ``replacement``. No cap
    and no early-stop: every matching block in the document gets an edit, and
    every occurrence within a block is replaced.

    The proposal/event shape matches ``_normalise_doc_write_proposals`` and the
    streamed ``@@ATLAS`` path so the frontend review UI renders these unchanged.
    """
    proposals: list[dict] = []
    if not search:
        return proposals
    needle = search.casefold()
    index = 0
    for block in blocks:
        original = block.get("text") or ""
        if needle not in original.casefold():
            continue
        new_text = _replace_all_case_insensitive(original, search, replacement)[:4_000]
        index += 1
        proposals.append(
            {
                "id": f"proposal-{index}",
                "operation": "replace",
                "target_block_id": block["id"],
                "target_original_text": original,
                "content_text": new_text,
                "content_html": _plain_text_to_html(new_text),
            }
        )
    return proposals


def _normalise_doc_write_proposals(
    raw, *, mode: str, intent: str, blocks: list[dict], fallback_text: str
) -> list[dict]:
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
        if operation == "insert_after" and target_block_id and _is_blank_spacer(content_text):
            clean.append(
                {
                    "id": f"proposal-{index + 1}",
                    "operation": operation,
                    "target_block_id": target_block_id,
                    "target_original_text": block_map.get(target_block_id, {}).get("text", ""),
                    "content_text": "",
                    "content_html": "<p></p>",
                }
            )
            continue
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
        if proposal["operation"] == "insert_after" and proposal["target_block_id"] and _is_blank_spacer(text):
            proposal["content_text"] = ""
            proposal["content_html"] = "<p></p>"
            return proposal
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
