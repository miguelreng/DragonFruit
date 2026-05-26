# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json

# Django imports
from django.utils import timezone
from django.db.models import Q, OuterRef, F, Func, UUIDField, Value, CharField, Subquery
from django.core.serializers.json import DjangoJSONEncoder
from django.db.models.functions import Coalesce
from django.contrib.postgres.aggregates import ArrayAgg
from django.contrib.postgres.fields import ArrayField

# Third Party imports
from rest_framework.response import Response
from rest_framework import status

# Module imports
from .. import BaseViewSet
from plane.app.serializers import IssueRelationSerializer, RelatedIssueSerializer
from plane.app.permissions import ProjectEntityPermission, WorkspaceEntityPermission
from plane.db.models import (
    Project,
    IssueRelation,
    Issue,
    FileAsset,
    IssueLink,
    CycleIssue,
)
from plane.bgtasks.issue_activities_task import issue_activity
from plane.utils.issue_relation_mapper import get_actual_relation
from plane.utils.host import base_host


class IssueRelationViewSet(BaseViewSet):
    serializer_class = IssueRelationSerializer
    model = IssueRelation
    permission_classes = [ProjectEntityPermission]

    def get_permissions(self):
        if self.action == "list_custom_labels":
            self.permission_classes = [WorkspaceEntityPermission]
        else:
            self.permission_classes = [ProjectEntityPermission]

        return super(IssueRelationViewSet, self).get_permissions()

    def list(self, request, slug, project_id, issue_id):
        issue_relations = (
            IssueRelation.objects.filter(Q(issue_id=issue_id) | Q(related_issue=issue_id))
            .filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("project")
            .select_related("workspace")
            .select_related("issue")
            .order_by("-created_at")
            .distinct()
        )
        # get all blocking issues
        blocking_issues = issue_relations.filter(relation_type="blocked_by", related_issue_id=issue_id).values_list(
            "issue_id", flat=True
        )

        # get all blocked by issues
        blocked_by_issues = issue_relations.filter(relation_type="blocked_by", issue_id=issue_id).values_list(
            "related_issue_id", flat=True
        )

        # get all duplicate issues
        duplicate_issues = issue_relations.filter(issue_id=issue_id, relation_type="duplicate").values_list(
            "related_issue_id", flat=True
        )

        # get all relates to issues
        duplicate_issues_related = issue_relations.filter(
            related_issue_id=issue_id, relation_type="duplicate"
        ).values_list("issue_id", flat=True)

        # get all relates to issues
        relates_to_issues = issue_relations.filter(issue_id=issue_id, relation_type="relates_to").values_list(
            "related_issue_id", flat=True
        )

        # get all relates to issues
        relates_to_issues_related = issue_relations.filter(
            related_issue_id=issue_id, relation_type="relates_to"
        ).values_list("issue_id", flat=True)

        # get all start after issues
        start_after_issues = issue_relations.filter(
            relation_type="start_before", related_issue_id=issue_id
        ).values_list("issue_id", flat=True)

        # get all start_before issues
        start_before_issues = issue_relations.filter(relation_type="start_before", issue_id=issue_id).values_list(
            "related_issue_id", flat=True
        )

        # get all finish after issues
        finish_after_issues = issue_relations.filter(
            relation_type="finish_before", related_issue_id=issue_id
        ).values_list("issue_id", flat=True)

        # get all finish before issues
        finish_before_issues = issue_relations.filter(relation_type="finish_before", issue_id=issue_id).values_list(
            "related_issue_id", flat=True
        )

        # Pull the underlying IssueRelation row's `custom_label` for each
        # related issue. A relation can be stored in either direction
        # (issue=current,related=other OR issue=other,related=current depending
        # on the type), so we match both. The subquery only runs once per row.
        custom_label_subquery = (
            IssueRelation.objects.filter(deleted_at__isnull=True)
            .filter(
                Q(issue_id=issue_id, related_issue_id=OuterRef("id"))
                | Q(issue_id=OuterRef("id"), related_issue_id=issue_id)
            )
            .values("custom_label")[:1]
        )

        queryset = (
            Issue.issue_objects.filter(workspace__slug=slug)
            .select_related("workspace", "project", "state", "parent")
            .prefetch_related("assignees", "labels", "issue_module__module")
            .annotate(custom_label=Subquery(custom_label_subquery))
            .annotate(
                cycle_id=Subquery(
                    CycleIssue.objects.filter(issue=OuterRef("id"), deleted_at__isnull=True).values("cycle_id")[:1]
                )
            )
            .annotate(
                link_count=IssueLink.objects.filter(issue=OuterRef("id"))
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )
            .annotate(
                attachment_count=FileAsset.objects.filter(
                    issue_id=OuterRef("id"),
                    entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
                )
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )
            .annotate(
                sub_issues_count=Issue.issue_objects.filter(parent=OuterRef("id"))
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )
            .annotate(
                label_ids=Coalesce(
                    ArrayAgg(
                        "labels__id",
                        distinct=True,
                        filter=Q(~Q(labels__id__isnull=True) & (Q(label_issue__deleted_at__isnull=True))),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
                assignee_ids=Coalesce(
                    ArrayAgg(
                        "assignees__id",
                        distinct=True,
                        filter=Q(
                            ~Q(assignees__id__isnull=True)
                            & Q(assignees__member_project__is_active=True)
                            & Q(issue_assignee__deleted_at__isnull=True)
                        ),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
            )
        ).distinct()

        # Fields
        fields = [
            "id",
            "name",
            "state_id",
            "sort_order",
            "priority",
            "sequence_id",
            "project_id",
            "label_ids",
            "assignee_ids",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "relation_type",
            # User-defined override label from IssueRelation.custom_label.
            # Client should prefer this when set; fall back to relation_type
            # title-case as before when null.
            "custom_label",
        ]

        response_data = {
            "blocking": queryset.filter(pk__in=blocking_issues)
            .annotate(relation_type=Value("blocking", output_field=CharField()))
            .values(*fields),
            "blocked_by": queryset.filter(pk__in=blocked_by_issues)
            .annotate(relation_type=Value("blocked_by", output_field=CharField()))
            .values(*fields),
            "duplicate": queryset.filter(pk__in=duplicate_issues)
            .annotate(relation_type=Value("duplicate", output_field=CharField()))
            .values(*fields)
            | queryset.filter(pk__in=duplicate_issues_related)
            .annotate(relation_type=Value("duplicate", output_field=CharField()))
            .values(*fields),
            "relates_to": queryset.filter(pk__in=relates_to_issues)
            .annotate(relation_type=Value("relates_to", output_field=CharField()))
            .values(*fields)
            | queryset.filter(pk__in=relates_to_issues_related)
            .annotate(relation_type=Value("relates_to", output_field=CharField()))
            .values(*fields),
            "start_after": queryset.filter(pk__in=start_after_issues)
            .annotate(relation_type=Value("start_after", output_field=CharField()))
            .values(*fields),
            "start_before": queryset.filter(pk__in=start_before_issues)
            .annotate(relation_type=Value("start_before", output_field=CharField()))
            .values(*fields),
            "finish_after": queryset.filter(pk__in=finish_after_issues)
            .annotate(relation_type=Value("finish_after", output_field=CharField()))
            .values(*fields),
            "finish_before": queryset.filter(pk__in=finish_before_issues)
            .annotate(relation_type=Value("finish_before", output_field=CharField()))
            .values(*fields),
        }

        return Response(response_data, status=status.HTTP_200_OK)

    def create(self, request, slug, project_id, issue_id):
        relation_type = request.data.get("relation_type", None)
        if relation_type is None:
            return Response(
                {"message": "Issue relation type is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Optional per-project custom label. Trimmed + bounded to the model's
        # max_length so a long client-side string doesn't 500 the bulk_create.
        # Empty string normalizes to None so we don't burn a row of empty text.
        raw_label = request.data.get("custom_label")
        custom_label = (raw_label or "").strip() if isinstance(raw_label, str) else None
        if custom_label == "":
            custom_label = None
        if custom_label and len(custom_label) > 120:
            custom_label = custom_label[:120]

        issues = request.data.get("issues", [])
        project = Project.objects.get(pk=project_id)

        issue_relation = IssueRelation.objects.bulk_create(
            [
                IssueRelation(
                    issue_id=(issue if relation_type in ["blocking", "start_after", "finish_after"] else issue_id),
                    related_issue_id=(
                        issue_id if relation_type in ["blocking", "start_after", "finish_after"] else issue
                    ),
                    relation_type=(get_actual_relation(relation_type)),
                    custom_label=custom_label,
                    project_id=project_id,
                    workspace_id=project.workspace_id,
                    created_by=request.user,
                    updated_by=request.user,
                )
                for issue in issues
            ],
            batch_size=10,
            ignore_conflicts=True,
        )

        issue_activity.delay(
            type="issue_relation.activity.created",
            requested_data=json.dumps(request.data, cls=DjangoJSONEncoder),
            actor_id=str(request.user.id),
            issue_id=str(issue_id),
            project_id=str(project_id),
            current_instance=None,
            epoch=int(timezone.now().timestamp()),
            notification=True,
            origin=base_host(request=request, is_app=True),
        )

        if relation_type in ["blocking", "start_after", "finish_after"]:
            return Response(
                RelatedIssueSerializer(issue_relation, many=True).data,
                status=status.HTTP_201_CREATED,
            )
        else:
            return Response(
                IssueRelationSerializer(issue_relation, many=True).data,
                status=status.HTTP_201_CREATED,
            )

    def update_custom_label(self, request, slug, project_id, issue_id):
        """Update the user-defined `custom_label` on an existing IssueRelation.

        The relation between any two issues is unique (see the model's
        unique_together constraint on issue + related_issue), so we look
        it up by the `related_issue` id passed in the body, regardless
        of which direction it was stored. Empty / missing label clears it
        (stored as null) — same normalization as the create endpoint.
        """
        related_issue = request.data.get("related_issue", None)
        if not related_issue:
            return Response(
                {"message": "related_issue is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw_label = request.data.get("custom_label")
        custom_label = (raw_label or "").strip() if isinstance(raw_label, str) else None
        if custom_label == "":
            custom_label = None
        if custom_label and len(custom_label) > 120:
            custom_label = custom_label[:120]

        issue_relation = (
            IssueRelation.objects.filter(workspace__slug=slug)
            .filter(
                Q(issue_id=issue_id, related_issue_id=related_issue)
                | Q(issue_id=related_issue, related_issue_id=issue_id)
            )
            .first()
        )
        if not issue_relation:
            return Response(
                {"message": "Relation not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        issue_relation.custom_label = custom_label
        issue_relation.updated_by = request.user
        issue_relation.save(update_fields=["custom_label", "updated_by", "updated_at"])

        return Response(IssueRelationSerializer(issue_relation).data, status=status.HTTP_200_OK)

    def list_custom_labels(self, request, slug):
        """Distinct custom_label values across all IssueRelations in this
        workspace. Used by the rich-filters "Relation label" picker so the
        user gets typeahead/multi-select instead of having to remember
        what they labeled relations as.

        Returns a flat list of strings, alphabetically. Nulls + empty
        strings are filtered out — the picker only cares about labels
        the user has actually assigned.
        """
        labels = (
            IssueRelation.objects.filter(
                workspace__slug=slug,
                deleted_at__isnull=True,
                custom_label__isnull=False,
            )
            .exclude(custom_label="")
            .values_list("custom_label", flat=True)
            .distinct()
            .order_by("custom_label")
        )
        return Response(list(labels), status=status.HTTP_200_OK)

    def remove_relation(self, request, slug, project_id, issue_id):
        related_issue = request.data.get("related_issue", None)

        issue_relations = IssueRelation.objects.filter(
            workspace__slug=slug,
        ).filter(
            Q(issue_id=related_issue, related_issue_id=issue_id) | Q(issue_id=issue_id, related_issue_id=related_issue)
        )
        issue_relations = issue_relations.first()
        current_instance = json.dumps(IssueRelationSerializer(issue_relations).data, cls=DjangoJSONEncoder)
        issue_relations.delete()
        issue_activity.delay(
            type="issue_relation.activity.deleted",
            requested_data=json.dumps(request.data, cls=DjangoJSONEncoder),
            actor_id=str(request.user.id),
            issue_id=str(issue_id),
            project_id=str(project_id),
            current_instance=current_instance,
            epoch=int(timezone.now().timestamp()),
            notification=True,
            origin=base_host(request=request, is_app=True),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
