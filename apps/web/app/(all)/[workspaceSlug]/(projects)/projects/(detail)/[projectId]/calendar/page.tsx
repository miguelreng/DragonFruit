/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// components
import { CalendarRoot } from "@/components/calendar/calendar-root";
import { PageHead } from "@/components/core/page-title";
// hooks
import { useProject } from "@/hooks/store/use-project";
import type { Route } from "./+types/page";

function ProjectCalendarPage({ params }: Route.ComponentProps) {
  const { projectId } = params;
  const { getProjectById } = useProject();
  const project = getProjectById(projectId);
  const pageTitle = project?.name ? `${project.name} - Calendar` : undefined;

  return (
    <>
      <PageHead title={pageTitle} />
      <CalendarRoot projectId={projectId} />
    </>
  );
}

export default observer(ProjectCalendarPage);
