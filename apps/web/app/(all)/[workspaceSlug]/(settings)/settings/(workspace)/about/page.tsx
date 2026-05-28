/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { AboutWorkspaceSettingsHeader } from "./header";

function AboutSettingsPage() {
  const { t } = useTranslation();
  const { currentWorkspace } = useWorkspace();

  const pageTitle = currentWorkspace?.name
    ? `${currentWorkspace.name} - ${t("workspace_settings.settings.about.title")}`
    : undefined;

  return (
    <SettingsContentWrapper header={<AboutWorkspaceSettingsHeader />}>
      <PageHead title={pageTitle} />
      <div className="w-full">
        <SettingsHeading
          title={t("workspace_settings.settings.about.heading")}
          description={t("workspace_settings.settings.about.description")}
        />
        <article className="font-newsreader mt-8 flex max-w-[560px] flex-col gap-5 text-[17px] leading-[1.65] text-secondary">
          <p>Hi —</p>
          <p>
            DragonFruit started as a small frustration. I love how Linear feels, I love how Notion docs read, and I love
            that Plane is open source. But none of them, on their own, was the thing I actually wanted to work in every
            day. So I started carving one out.
          </p>
          <p>
            This is a fork of Plane, but the goal isn&apos;t to track Plane. It&apos;s to make the work itself feel
            lighter — sharper sidebar, calmer typography, docs that behave like a real writing surface, AI that you
            bring your own key to so nothing about your work routes through somebody else&apos;s pricing page.
          </p>
          <p>
            A few principles I keep coming back to as I build this. Nothing here is hosted by us in the data-extraction
            sense — your LLM keys are yours, your data is yours, and the source is open. When a feature gets removed, it
            gets removed cleanly, not hidden behind a flag. Empty states should feel like an invitation, not a
            billboard. Speed and quiet are features.
          </p>
          <p>
            If you&apos;re reading this, you&apos;re either using DragonFruit or kicking the tires on it. Either way,
            thanks. It means a lot.
          </p>
          <p className="mt-4">
            — Miguel
            <br />
            <span className="text-body-sm-regular text-tertiary">maker of DragonFruit</span>
          </p>
        </article>
      </div>
    </SettingsContentWrapper>
  );
}

export default AboutSettingsPage;
