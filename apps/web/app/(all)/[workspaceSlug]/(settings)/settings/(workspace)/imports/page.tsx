/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EPillSize, EPillVariant, Pill } from "@plane/propel/pill";
import { cn } from "@plane/utils";
import { PageHead } from "@/components/core/page-title";
import { ConnectInfoModal, CsvImportModal } from "@/components/imports";
import { SettingsBoxedControlItem } from "@/components/settings/boxed-control-item";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
import { useWorkspace } from "@/hooks/store/use-workspace";
import type { Route } from "./+types/page";
import { ImportsWorkspaceSettingsHeader } from "./header";

type ActiveModal = null | { kind: "csv" } | { kind: "connect"; service: "notion" | "clickup" };

type SourceKey = "csv" | "notion" | "clickup";

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
    ready: boolean;
    title: string;
    description: string;
    cta: string;
  }> = [
    {
      key: "csv",
      ready: true,
      title: t("workspace_settings.settings.imports.sources.csv.title"),
      description: t("workspace_settings.settings.imports.sources.csv.description"),
      cta: t("workspace_settings.settings.imports.sources.csv.cta"),
    },
    {
      key: "notion",
      ready: false,
      title: t("workspace_settings.settings.imports.sources.notion.title"),
      description: t("workspace_settings.settings.imports.sources.notion.description"),
      cta: t("workspace_settings.settings.imports.sources.notion.cta"),
    },
    {
      key: "clickup",
      ready: false,
      title: t("workspace_settings.settings.imports.sources.clickup.title"),
      description: t("workspace_settings.settings.imports.sources.clickup.description"),
      cta: t("workspace_settings.settings.imports.sources.clickup.cta"),
    },
  ];

  return (
    <SettingsContentWrapper header={<ImportsWorkspaceSettingsHeader />} hugging>
      <PageHead title={pageTitle} />
      <div className="flex w-full flex-col gap-y-6">
        <SettingsHeading
          title={t("workspace_settings.settings.imports.heading")}
          description={t("workspace_settings.settings.imports.description")}
        />
        {/* Boxed group of source rows — mirrors the export form's pattern
            (rounded outer border, rows stacked with internal dividers, primary
            CTA on the right). Keeps imports visually consistent with exports. */}
        <div className="overflow-hidden rounded-lg border border-subtle bg-layer-2">
          {sources.map((s, index) => (
            <SettingsBoxedControlItem
              key={s.key}
              className={cn("rounded-none border-0", index < sources.length - 1 && "border-b border-subtle")}
              title={
                <span className="flex items-center gap-2">
                  <span>{s.title}</span>
                  {!s.ready && (
                    <Pill variant={EPillVariant.DEFAULT} size={EPillSize.XS}>
                      {t("workspace_settings.settings.imports.setup_required")}
                    </Pill>
                  )}
                </span>
              }
              description={s.description}
              control={
                <Button
                  variant={s.ready ? "primary" : "secondary"}
                  size="sm"
                  onClick={() =>
                    s.key === "csv" ? setActive({ kind: "csv" }) : setActive({ kind: "connect", service: s.key })
                  }
                >
                  {s.cta}
                </Button>
              }
            />
          ))}
        </div>
      </div>

      <CsvImportModal workspaceSlug={workspaceSlug} isOpen={active?.kind === "csv"} onClose={() => setActive(null)} />
      <ConnectInfoModal
        service={active?.kind === "connect" ? active.service : "notion"}
        isOpen={active?.kind === "connect"}
        onClose={() => setActive(null)}
      />
    </SettingsContentWrapper>
  );
});

export default ImportsSettingsPage;
