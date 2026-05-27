# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import uuid
import logging

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from django.utils.text import slugify

# Django imports
from django.db import models, transaction
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

# Module imports
from plane.utils.html_processor import strip_tags

from .base import BaseModel

logger = logging.getLogger(__name__)

ESSAY_ILLUSTRATION_TRIGGER_FIELDS = {
    "access",
    "archived_at",
    "deleted_at",
    "page_type",
    "view_props",
}

LANDING_REDEPLOY_MUTATION_FIELDS = {
    "access",
    "archived_at",
    "deleted_at",
    "description_html",
    "name",
    "page_type",
    "view_props",
}


def get_view_props():
    return {"full_width": False}


class Page(BaseModel):
    PRIVATE_ACCESS = 1
    PUBLIC_ACCESS = 0
    DEFAULT_SORT_ORDER = 65535

    ACCESS_CHOICES = ((PRIVATE_ACCESS, "Private"), (PUBLIC_ACCESS, "Public"))

    # "whiteboard" pages render a tldraw canvas; "doc" pages use the
    # collaborative rich-text editor. The renderer picks based on this field;
    # description_html / description_json carry the body in a type-specific
    # shape (Yjs binary for docs, tldraw snapshot JSON for whiteboards).
    PAGE_TYPE_DOC = "doc"
    PAGE_TYPE_WHITEBOARD = "whiteboard"
    PAGE_TYPE_CHOICES = (
        (PAGE_TYPE_DOC, "Doc"),
        (PAGE_TYPE_WHITEBOARD, "Whiteboard"),
    )

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="pages")
    name = models.TextField(blank=True)
    page_type = models.CharField(max_length=16, choices=PAGE_TYPE_CHOICES, default=PAGE_TYPE_DOC)
    description_json = models.JSONField(default=dict, blank=True)
    description_binary = models.BinaryField(null=True)
    description_html = models.TextField(blank=True, default="<p></p>")
    description_stripped = models.TextField(blank=True, null=True)
    owned_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="pages")
    access = models.PositiveSmallIntegerField(choices=((0, "Public"), (1, "Private")), default=PRIVATE_ACCESS)
    color = models.CharField(max_length=255, blank=True)
    labels = models.ManyToManyField("db.Label", blank=True, related_name="pages", through="db.PageLabel")
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="child_page",
    )
    archived_at = models.DateField(null=True)
    is_locked = models.BooleanField(default=False)
    view_props = models.JSONField(default=get_view_props)
    logo_props = models.JSONField(default=dict)
    is_global = models.BooleanField(default=False)
    projects = models.ManyToManyField("db.Project", related_name="pages", through="db.ProjectPage")
    moved_to_page = models.UUIDField(null=True, blank=True)
    moved_to_project = models.UUIDField(null=True, blank=True)
    sort_order = models.FloatField(default=DEFAULT_SORT_ORDER)

    external_id = models.CharField(max_length=255, null=True, blank=True)
    external_source = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        verbose_name = "Page"
        verbose_name_plural = "Pages"
        db_table = "pages"
        ordering = ("-created_at",)

    def __str__(self):
        """Return owner email and page name"""
        return f"{self.owned_by.email} <{self.name}>"

    def save(self, *args, **kwargs):
        # Strip the html tags using html parser
        self.description_stripped = (
            None
            if (self.description_html == "" or self.description_html is None)
            else strip_tags(self.description_html)
        )
        super(Page, self).save(*args, **kwargs)


def _is_public_doc_page(page: "Page") -> bool:
    return (
        page.page_type == Page.PAGE_TYPE_DOC
        and page.access == Page.PUBLIC_ACCESS
        and page.archived_at is None
        and page.deleted_at is None
    )


def _get_configured_essays_project_id() -> str:
    return (getattr(settings, "ESSAY_ILLUSTRATION_PROJECT_ID", "") or "").strip()


def _is_in_essays_project(page: "Page") -> bool:
    configured_project_id = _get_configured_essays_project_id()
    if not configured_project_id:
        return False

    from plane.db.models import ProjectPage

    try:
        return ProjectPage.objects.filter(
            page_id=page.id,
            project_id=configured_project_id,
            deleted_at__isnull=True,
        ).exists()
    except Exception:  # noqa: BLE001
        logger.exception("failed to check essay project for page_id=%s", page.id)
        return False


def _get_public_slug(view_props: object | None) -> str:
    if not isinstance(view_props, dict):
        return ""
    return str(view_props.get("public_slug") or "").strip()


def _build_unique_public_slug(*, page: "Page", base_slug: str) -> str:
    candidate = base_slug
    suffix = 2
    while (
        Page.objects.filter(
            workspace_id=page.workspace_id,
            access=Page.PUBLIC_ACCESS,
            archived_at__isnull=True,
            view_props__public_slug=candidate,
        )
        .exclude(pk=page.pk)
        .exists()
    ):
        candidate = f"{base_slug}-{suffix}"
        suffix += 1
    return candidate


def ensure_page_public_slug(page: "Page") -> str | None:
    if not page or not page.pk:
        return None

    if not _is_public_doc_page(page):
        return None

    if not _is_in_essays_project(page):
        return None

    existing_slug = _get_public_slug(page.view_props)
    if existing_slug:
        return existing_slug

    view_props = dict(page.view_props) if isinstance(page.view_props, dict) else {}
    base_slug = slugify(page.name or "") or f"essay-{str(page.id).split('-')[0]}"
    unique_slug = _build_unique_public_slug(page=page, base_slug=base_slug)
    view_props["public_slug"] = unique_slug

    Page.objects.filter(pk=page.pk).update(view_props=view_props)
    page.view_props = view_props
    return unique_slug


@receiver(pre_save, sender="db.Page")
def _capture_page_public_doc_state_before_save(sender, instance, **kwargs):
    if not getattr(settings, "LANDING_DEPLOY_WEBHOOK_URL", ""):
        return

    if not instance.pk:
        instance._was_public_doc_page_for_landing = False
        return

    update_fields = kwargs.get("update_fields")
    if update_fields is not None and set(update_fields).isdisjoint(LANDING_REDEPLOY_MUTATION_FIELDS):
        return

    try:
        previous = (
            Page.objects.only("page_type", "access", "archived_at", "deleted_at")
            .filter(pk=instance.pk)
            .first()
        )
        instance._was_public_doc_page_for_landing = bool(previous and _is_public_doc_page(previous))
    except Exception:  # noqa: BLE001
        logger.exception("failed to capture prior page visibility for landing redeploy page_id=%s", instance.pk)
        instance._was_public_doc_page_for_landing = False


@receiver(pre_save, sender="db.Page")
def _capture_page_public_doc_state_before_save_for_essay_illustration(sender, instance, **kwargs):
    if not instance.pk:
        instance._was_public_doc_page_for_essay_illustration = False
        return

    update_fields = kwargs.get("update_fields")
    if update_fields is not None and set(update_fields).isdisjoint(ESSAY_ILLUSTRATION_TRIGGER_FIELDS):
        instance._was_public_doc_page_for_essay_illustration = _is_public_doc_page(instance)
        return

    try:
        previous = (
            Page.objects.only("page_type", "access", "archived_at", "deleted_at")
            .filter(pk=instance.pk)
            .first()
        )
        instance._was_public_doc_page_for_essay_illustration = bool(
            previous and _is_public_doc_page(previous)
        )
    except Exception:  # noqa: BLE001
        logger.exception(
            "failed to capture prior public page state for essay illustration page_id=%s",
            instance.pk,
        )
        instance._was_public_doc_page_for_essay_illustration = False


@receiver(post_save, sender="db.Page")
def _ensure_essay_public_slug_for_public_pages(sender, instance, created, **kwargs):
    update_fields = kwargs.get("update_fields")
    if not created and update_fields is not None and set(update_fields).isdisjoint(ESSAY_ILLUSTRATION_TRIGGER_FIELDS):
        return

    try:
        ensure_page_public_slug(instance)
    except Exception:  # noqa: BLE001
        logger.exception("failed to ensure public slug for page_id=%s", instance.id)


@receiver(post_save, sender="db.Page")
def _trigger_landing_redeploy_for_public_doc_changes(sender, instance, created, **kwargs):
    webhook_url = getattr(settings, "LANDING_DEPLOY_WEBHOOK_URL", "")
    if not webhook_url:
        return

    update_fields = kwargs.get("update_fields")
    if not created and update_fields is not None and set(update_fields).isdisjoint(LANDING_REDEPLOY_MUTATION_FIELDS):
        return

    is_public_doc_now = _is_public_doc_page(instance)
    was_public_doc_before = getattr(instance, "_was_public_doc_page_for_landing", False)
    if not (is_public_doc_now or was_public_doc_before):
        return

    cooldown_seconds = max(int(getattr(settings, "LANDING_DEPLOY_WEBHOOK_COOLDOWN_SECONDS", 90)), 0)
    cache_key = f"landing_redeploy:page:{instance.id}"
    if cooldown_seconds > 0 and not cache.add(cache_key, "1", cooldown_seconds):
        return

    payload = {
        "event": "public_page_changed",
        "workspace_id": str(instance.workspace_id),
        "workspace_slug": instance.workspace.slug if instance.workspace_id else None,
        "page_id": str(instance.id),
        "public_slug": instance.view_props.get("public_slug") if isinstance(instance.view_props, dict) else None,
        "is_public": is_public_doc_now,
    }

    def _enqueue():
        try:
            from plane.bgtasks.landing_deploy_task import trigger_landing_redeploy

            trigger_landing_redeploy.delay(payload=payload)
        except Exception:  # noqa: BLE001
            logger.exception("failed to enqueue landing redeploy hook for page_id=%s", instance.id)

    transaction.on_commit(_enqueue)


@receiver(post_save, sender="db.Page")
def _trigger_essay_illustration_for_first_publish(sender, instance, created, **kwargs):
    # Always react on publish state transitions for doc pages, even if landing
    # deploy webhooks are not configured, because image generation is separate.
    update_fields = kwargs.get("update_fields")
    if update_fields is not None and set(update_fields).isdisjoint(ESSAY_ILLUSTRATION_TRIGGER_FIELDS):
        return

    is_public_doc_now = _is_public_doc_page(instance)
    was_public_doc_before = getattr(instance, "_was_public_doc_page_for_essay_illustration", False)
    if not (is_public_doc_now and not was_public_doc_before):
        return

    if not _is_in_essays_project(instance):
        return

    from plane.db.models import WorkspaceAgentWebhook

    if not WorkspaceAgentWebhook.objects.filter(workspace_id=instance.workspace_id, is_enabled=True).exists():
        return

    def _enqueue():
        try:
            from plane.bgtasks.essay_illustration_task import request_essay_illustration

            request_essay_illustration.delay(str(instance.id))
        except Exception:  # noqa: BLE001
            logger.exception("failed to enqueue essay illustration task for page_id=%s", instance.id)

    transaction.on_commit(_enqueue)


@receiver(post_save, sender="db.ProjectPage")
def _ensure_essay_public_slug_on_project_link(sender, instance, created, **kwargs):
    if not created or instance.deleted_at is not None:
        return

    configured_project_id = _get_configured_essays_project_id()
    if not configured_project_id or str(instance.project_id) != configured_project_id:
        return

    page = Page.objects.filter(pk=instance.page_id).first()
    if not page:
        return

    try:
        ensure_page_public_slug(page)
    except Exception:  # noqa: BLE001
        logger.exception("failed to ensure public slug on project link for page_id=%s", instance.page_id)


class PageLog(BaseModel):
    TYPE_CHOICES = (
        ("to_do", "To Do"),
        ("issue", "issue"),
        ("image", "Image"),
        ("video", "Video"),
        ("file", "File"),
        ("link", "Link"),
        ("cycle", "Cycle"),
        ("module", "Module"),
        ("back_link", "Back Link"),
        ("forward_link", "Forward Link"),
        ("page_mention", "Page Mention"),
        ("user_mention", "User Mention"),
    )
    transaction = models.UUIDField(default=uuid.uuid4)
    page = models.ForeignKey(Page, related_name="page_log", on_delete=models.CASCADE)
    entity_identifier = models.UUIDField(null=True, blank=True)
    entity_name = models.CharField(max_length=30, verbose_name="Transaction Type")
    entity_type = models.CharField(max_length=30, verbose_name="Entity Type", null=True, blank=True)
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="workspace_page_log")

    class Meta:
        unique_together = ["page", "transaction"]
        verbose_name = "Page Log"
        verbose_name_plural = "Page Logs"
        db_table = "page_logs"
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["entity_type"], name="pagelog_entity_type_idx"),
            models.Index(fields=["entity_identifier"], name="pagelog_entity_id_idx"),
            models.Index(fields=["entity_name"], name="pagelog_entity_name_idx"),
            models.Index(fields=["entity_type", "entity_identifier"], name="pagelog_type_id_idx"),
            models.Index(fields=["entity_name", "entity_identifier"], name="pagelog_name_id_idx"),
        ]

    def __str__(self):
        return f"{self.page.name} {self.entity_name}"


class PageLabel(BaseModel):
    label = models.ForeignKey("db.Label", on_delete=models.CASCADE, related_name="page_labels")
    page = models.ForeignKey("db.Page", on_delete=models.CASCADE, related_name="page_labels")
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="workspace_page_label")

    class Meta:
        verbose_name = "Page Label"
        verbose_name_plural = "Page Labels"
        db_table = "page_labels"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.page.name} {self.label.name}"


class ProjectPage(BaseModel):
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="project_pages")
    page = models.ForeignKey("db.Page", on_delete=models.CASCADE, related_name="project_pages")
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="project_pages")

    class Meta:
        unique_together = ["project", "page", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["project", "page"],
                condition=models.Q(deleted_at__isnull=True),
                name="project_page_unique_project_page_when_deleted_at_null",
            )
        ]
        verbose_name = "Project Page"
        verbose_name_plural = "Project Pages"
        db_table = "project_pages"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.project.name} {self.page.name}"


class PageVersion(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="page_versions")
    page = models.ForeignKey("db.Page", on_delete=models.CASCADE, related_name="page_versions")
    last_saved_at = models.DateTimeField(default=timezone.now)
    owned_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="page_versions")
    description_binary = models.BinaryField(null=True)
    description_html = models.TextField(blank=True, default="<p></p>")
    description_stripped = models.TextField(blank=True, null=True)
    description_json = models.JSONField(default=dict, blank=True)
    sub_pages_data = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "Page Version"
        verbose_name_plural = "Page Versions"
        db_table = "page_versions"
        ordering = ("-created_at",)

    def save(self, *args, **kwargs):
        # Strip the html tags using html parser
        self.description_stripped = (
            None
            if (self.description_html == "" or self.description_html is None)
            else strip_tags(self.description_html)
        )
        super(PageVersion, self).save(*args, **kwargs)


class PageTemplate(BaseModel):
    """
    A reusable Page skeleton. When a user creates a new Page from a template, the
    template's logo + description payloads are copied into the new Page. Templates
    are workspace-scoped (visible across all projects in the workspace); admin-only
    authoring is enforced at the view layer. Body shape mirrors `Page`
    (description_html / _json / _binary) so the copy is a straight field-for-field
    clone — no transformation needed at instantiation time.
    """

    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="page_templates",
    )
    name = models.CharField(max_length=255)
    description = models.CharField(max_length=512, blank=True, default="")
    logo_props = models.JSONField(default=dict)
    # Body — mirrors Page exactly so instantiation is a field-for-field copy.
    description_html = models.TextField(blank=True, default="<p></p>")
    description_json = models.JSONField(default=dict, blank=True)
    description_binary = models.BinaryField(null=True)
    description_stripped = models.TextField(blank=True, null=True)
    owned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="page_templates",
    )

    class Meta:
        verbose_name = "Page Template"
        verbose_name_plural = "Page Templates"
        db_table = "page_templates"
        ordering = ("-created_at",)
        indexes = [models.Index(fields=["workspace", "-created_at"])]

    def __str__(self):
        return self.name or str(self.id)

    def save(self, *args, **kwargs):
        self.description_stripped = (
            None
            if (self.description_html == "" or self.description_html is None)
            else strip_tags(self.description_html)
        )
        super().save(*args, **kwargs)


class PageBlockComment(BaseModel):
    """
    A comment attached to a specific span of text inside a Page's description.

    The editor renders a TipTap mark with `data-block-comment-id="<uuid>"`. That UUID
    is the `block_id` here. Multiple comments can share the same `block_id` to form a thread.
    """

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="page_block_comments")
    page = models.ForeignKey("db.Page", on_delete=models.CASCADE, related_name="block_comments")
    block_id = models.CharField(max_length=64)
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="replies",
    )
    content = models.TextField()
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="resolved_page_block_comments",
    )
    # Draft flag set by agents with draft_mode enabled. Mirrors the same
    # field on IssueComment; surfaces in the agent's runs panel for
    # approve/discard before going live.
    is_draft = models.BooleanField(default=False, db_index=True)

    class Meta:
        verbose_name = "Page Block Comment"
        verbose_name_plural = "Page Block Comments"
        db_table = "page_block_comments"
        ordering = ("created_at",)
        indexes = [
            models.Index(fields=["page", "block_id"]),
            models.Index(fields=["page", "resolved_at"]),
        ]
