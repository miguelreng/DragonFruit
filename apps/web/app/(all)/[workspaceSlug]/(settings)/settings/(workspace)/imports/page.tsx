/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { cn } from "@plane/utils";
import { PageHead } from "@/components/core/page-title";
import { CsvImportModal } from "@/components/imports";
import { SettingsBoxedControlItem } from "@/components/settings/boxed-control-item";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { useWorkspace } from "@/hooks/store/use-workspace";
import type { Route } from "./+types/page";
import { ImportsWorkspaceSettingsHeader } from "./header";

type ActiveModal = null | { kind: "csv"; source: SourceKey };

type SourceKey = "csv";

const ImportsSettingsPage = observer(function ImportsSettingsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const { t } = useTranslation();
  const { currentWorkspace } = useWorkspace();
  const [active, setActive] = useState<ActiveModal>(null);

  const pageTitle = currentWorkspace?.name
    ? `${currentWorkspace.name} - ${t("workspace_settings.settings.imports.title")}`
    : undefined;

  const sources: Array<{
    key: SourceKey;
    title: string;
    description: string;
    cta: string;
  }> = [
    {
      key: "csv",
      title: t("workspace_settings.settings.imports.sources.csv.title"),
      description: t("workspace_settings.settings.imports.sources.csv.description"),
      cta: t("workspace_settings.settings.imports.sources.csv.cta"),
    },
  ];

  return (
    <SettingsContentWrapper header={<ImportsWorkspaceSettingsHeader />}>
      <PageHead title={pageTitle} />
      <div className="flex w-full flex-col gap-y-7">
        {/* Boxed group of source rows — mirrors the export form's pattern
            (rounded outer border, rows stacked with internal dividers, primary
            CTA on the right). Keeps imports visually consistent with exports. */}
        <div className="overflow-hidden rounded-lg border border-subtle bg-layer-2">
          {sources.map((s, index) => (
            <SettingsBoxedControlItem
              key={s.key}
              className={cn("rounded-none border-0", index < sources.length - 1 && "border-b border-subtle")}
              title={s.title}
              description={s.description}
              control={
                <Button variant="primary" size="sm" onClick={() => setActive({ kind: "csv", source: s.key })}>
                  {s.cta}
                </Button>
              }
            />
          ))}
        </div>
      </div>

      <CsvImportModal
        workspaceSlug={workspaceSlug}
        source={active?.kind === "csv" ? active.source : "csv"}
        isOpen={active?.kind === "csv"}
        onClose={() => setActive(null)}
      />
    </SettingsContentWrapper>
  );
});

export default ImportsSettingsPage;
