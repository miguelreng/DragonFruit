# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only

"""Safety boundary and deterministic context-pack builder for project sources."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import PurePosixPath

from django.db import transaction
from django.utils import timezone

from plane.db.models import Project, ProjectContextSource, ProjectSourceFile, ProjectSourceRevision


MAX_SOURCE_TEXT_CHARS = 50_000
MAX_CONTEXT_PACK_CHARS = 24_000
MAX_CONTEXT_FILE_CHARS = 6_000
MAX_SELECTED_PATHS = 80

_ALLOWED_SUFFIXES = {
    ".c",
    ".cc",
    ".css",
    ".go",
    ".html",
    ".java",
    ".js",
    ".json",
    ".jsx",
    ".md",
    ".mjs",
    ".py",
    ".rb",
    ".rs",
    ".rst",
    ".sh",
    ".sql",
    ".toml",
    ".ts",
    ".tsx",
    ".txt",
    ".xml",
    ".yaml",
    ".yml",
}
_BLOCKED_DIRS = {".git", ".next", ".venv", "build", "dist", "node_modules", "vendor"}
_BLOCKED_FILENAMES = {
    ".env",
    "credentials.json",
    "id_rsa",
    "id_dsa",
    "known_hosts",
    "secrets.json",
}
_BLOCKED_SUFFIXES = {".cer", ".crt", ".der", ".key", ".p12", ".pem", ".sqlite", ".sqlite3"}


class ProjectSourceValidationError(ValueError):
    """Raised when a caller tries to cross the source safety boundary."""


@dataclass(frozen=True)
class PathEligibility:
    relative_path: str
    is_eligible: bool
    exclusion_reason: str = ""


def normalize_relative_path(raw_path: str) -> str:
    """Return a portable root-relative path or reject traversal/absolute paths."""
    value = str(raw_path or "").strip()
    if not value or "\\" in value or "\x00" in value:
        raise ProjectSourceValidationError("path must be a non-empty POSIX relative path")
    path = PurePosixPath(value)
    if path.is_absolute() or ".." in path.parts or path.name in {"", ".", ".."}:
        raise ProjectSourceValidationError("path must stay within the selected source root")
    return path.as_posix()


def classify_source_path(raw_path: str, mime_type: str = "") -> PathEligibility:
    """Classify a discovered path without trusting provider metadata or manifests."""
    relative_path = normalize_relative_path(raw_path)
    path = PurePosixPath(relative_path)
    lowered_parts = {part.casefold() for part in path.parts}
    filename = path.name.casefold()
    suffix = path.suffix.casefold()
    mime = (mime_type or "").casefold()

    if lowered_parts.intersection(_BLOCKED_DIRS):
        return PathEligibility(relative_path, False, "blocked_directory")
    if filename in _BLOCKED_FILENAMES or filename.startswith(".env."):
        return PathEligibility(relative_path, False, "sensitive_filename")
    if suffix in _BLOCKED_SUFFIXES:
        return PathEligibility(relative_path, False, "sensitive_file_type")
    if mime.startswith("text/") or mime in {"application/json", "application/x-yaml", "application/yaml"}:
        return PathEligibility(relative_path, True)
    if suffix in _ALLOWED_SUFFIXES:
        return PathEligibility(relative_path, True)
    return PathEligibility(relative_path, False, "unsupported_file_type")


def normalize_selection_config(raw_config: object) -> dict:
    """Accept only a bounded exact-path selection; patterns are deliberately V2."""
    if raw_config in (None, ""):
        return {"included_paths": []}
    if not isinstance(raw_config, dict):
        raise ProjectSourceValidationError("selection_config must be an object")
    raw_paths = raw_config.get("included_paths", [])
    if not isinstance(raw_paths, list):
        raise ProjectSourceValidationError("included_paths must be a list")
    if len(raw_paths) > MAX_SELECTED_PATHS:
        raise ProjectSourceValidationError(f"included_paths cannot contain more than {MAX_SELECTED_PATHS} files")

    paths: list[str] = []
    for raw_path in raw_paths:
        path = normalize_relative_path(str(raw_path))
        if path not in paths:
            paths.append(path)
    manifest_hash = str(raw_config.get("manifest_hash") or "").strip()[:64]
    return {"included_paths": paths, "manifest_hash": manifest_hash}


@transaction.atomic
def upsert_project_source_revision(
    *,
    source: ProjectContextSource,
    external_id: str,
    relative_path: str,
    text: str,
    mime_type: str = "",
    provider_revision: str = "",
    size_bytes: int | None = None,
) -> tuple[ProjectSourceFile, ProjectSourceRevision | None]:
    """Persist one safe, immutable text revision from a trusted provider adapter.

    Provider adapters call this after they have independently proven that the
    provider file is a descendant of ``source.root_external_id``. This function
    is intentionally provider-agnostic and rejects unsafe paths before retaining
    a body, so it also remains safe for a future local-desktop adapter.
    """
    source.refresh_from_db(fields=["status", "deleted_at", "selection_config"])
    if source.deleted_at is not None or source.status == ProjectContextSource.STATUS_DISCONNECTED:
        raise ProjectSourceValidationError("source is disconnected")
    external_id = str(external_id or "").strip()
    if not external_id:
        raise ProjectSourceValidationError("external_id is required")
    if len(external_id) > 255:
        raise ProjectSourceValidationError("external_id is too long")

    eligibility = classify_source_path(relative_path, mime_type)
    # Drive permits two files with the same visible name in one folder. Keep
    # both auditable without violating the source-relative-path constraint.
    conflicting_file = (
        ProjectSourceFile.objects.filter(
            source=source, relative_path=eligibility.relative_path, deleted_at__isnull=True
        )
        .exclude(external_id=external_id)
        .first()
    )
    if conflicting_file is not None:
        path = PurePosixPath(eligibility.relative_path)
        deduplicated_path = str(path.with_name(f"{path.stem}--{external_id[:8]}{path.suffix}"))
        eligibility = classify_source_path(deduplicated_path, mime_type)
    safe_size = max(0, int(size_bytes if size_bytes is not None else len((text or "").encode("utf-8"))))
    source_file, _ = ProjectSourceFile.objects.update_or_create(
        source=source,
        external_id=external_id,
        defaults={
            "relative_path": eligibility.relative_path,
            "mime_type": str(mime_type or "")[:255],
            "size_bytes": safe_size,
            "is_eligible": eligibility.is_eligible,
            "exclusion_reason": eligibility.exclusion_reason,
        },
    )

    # Never retain the body of a blocked/unknown file merely because an adapter
    # downloaded it before classification.
    if not eligibility.is_eligible:
        return source_file, None

    source_text = str(text or "")
    truncated = len(source_text) > MAX_SOURCE_TEXT_CHARS
    source_text = source_text[:MAX_SOURCE_TEXT_CHARS]
    content_hash = hashlib.sha256(source_text.encode("utf-8")).hexdigest()
    revision, _ = ProjectSourceRevision.objects.get_or_create(
        source_file=source_file,
        content_hash=content_hash,
        defaults={
            "provider_revision": str(provider_revision or "")[:255],
            "extracted_text": source_text,
            "size_bytes": safe_size,
            "is_truncated": truncated,
        },
    )
    ProjectContextSource.objects.filter(pk=source.pk).update(
        status=ProjectContextSource.STATUS_ACTIVE,
        last_refreshed_at=timezone.now(),
        last_error_code="",
    )
    return source_file, revision


def build_project_context_pack(*, project: Project) -> dict:
    """Build the bounded external portion of an Atlas context package.

    Empty selection is intentionally empty. The UI/API must make a human select
    exact paths first; we never infer permission to place an entire folder into
    an Atlas prompt.
    """
    sources = list(
        ProjectContextSource.objects.filter(
            project=project,
            deleted_at__isnull=True,
            status=ProjectContextSource.STATUS_ACTIVE,
        ).prefetch_related("files__revisions")
    )
    remaining = MAX_CONTEXT_PACK_CHARS
    sections: list[dict] = []
    for source in sources:
        selected_paths = set((source.selection_config or {}).get("included_paths") or [])
        if not selected_paths:
            continue
        for source_file in source.files.all():
            if not source_file.is_eligible or source_file.relative_path not in selected_paths:
                continue
            revision = next((item for item in source_file.revisions.all() if item.deleted_at is None), None)
            if revision is None or not revision.extracted_text or remaining <= 0:
                continue
            excerpt_limit = min(MAX_CONTEXT_FILE_CHARS, remaining)
            excerpt = revision.extracted_text[:excerpt_limit]
            was_pack_truncated = len(revision.extracted_text) > len(excerpt)
            sections.append(
                {
                    "source_id": str(source.id),
                    "source_name": source.display_name,
                    "path": source_file.relative_path,
                    "revision_id": str(revision.id),
                    "content_hash": revision.content_hash,
                    "content": excerpt,
                    "is_truncated": revision.is_truncated or was_pack_truncated,
                }
            )
            remaining -= len(excerpt)

    return {
        "project_id": str(project.id),
        "character_budget": MAX_CONTEXT_PACK_CHARS,
        "used_characters": MAX_CONTEXT_PACK_CHARS - remaining,
        "sections": sections,
    }


def render_project_source_context(*, project: Project) -> str:
    """Render a pack for a model prompt while preserving per-file provenance."""
    sections = build_project_context_pack(project=project).get("sections") or []
    rendered_sections = []
    for section in sections:
        rendered_sections.append(
            "\n".join(
                [
                    f"--- {section['path']} (revision {section['content_hash'][:12]}) ---",
                    section["content"],
                    "[Source excerpt truncated]" if section["is_truncated"] else "",
                ]
            ).rstrip()
        )
    return "\n\n".join(rendered_sections)
