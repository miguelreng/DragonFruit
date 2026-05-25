/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type React from "react";
// plane imports
import type { ISvgIcons } from "@plane/propel/icons";
import type { TWorkspaceSettingsTabs } from "@plane/types";

type THeroIconProps = React.SVGProps<SVGSVGElement> & ISvgIcons;

const heroIcon =
  (path: React.ReactNode): React.FC<THeroIconProps> =>
  ({ className, ...props }) => (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.8}
      stroke="currentColor"
      aria-hidden="true"
      {...props}
    >
      {path}
    </svg>
  );

const GeneralIcon = heroIcon(
  <path
    strokeLinecap="round"
    strokeLinejoin="round"
    d="M3.75 21h16.5M4.5 21V5.25A2.25 2.25 0 0 1 6.75 3h7.5a2.25 2.25 0 0 1 2.25 2.25V21M8.25 7.5h4.5m-4.5 3h4.5m-4.5 3h4.5M8.25 21v-3.75h4.5V21"
  />
);

const MembersIcon = heroIcon(
  <path
    strokeLinecap="round"
    strokeLinejoin="round"
    d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.625 21a12.318 12.318 0 0 1-6.375-1.766v-.11a6.375 6.375 0 0 1 12.75 0Zm-3-11.003a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm7.5 1.5a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
  />
);

const ExportIcon = heroIcon(
  <path
    strokeLinecap="round"
    strokeLinejoin="round"
    d="M12 3v12m0-12 4.5 4.5M12 3 7.5 7.5M4.5 15.75v2.25A3 3 0 0 0 7.5 21h9a3 3 0 0 0 3-3v-2.25"
  />
);

const ImportIcon = heroIcon(
  <path
    strokeLinecap="round"
    strokeLinejoin="round"
    d="M12 3v12m0 0 4.5-4.5M12 15 7.5 10.5M4.5 15.75v2.25A3 3 0 0 0 7.5 21h9a3 3 0 0 0 3-3v-2.25"
  />
);

const AboutIcon = heroIcon(
  <path
    strokeLinecap="round"
    strokeLinejoin="round"
    d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"
  />
);

const AIIcon = heroIcon(
  <path
    strokeLinecap="round"
    strokeLinejoin="round"
    d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Zm6.187-10.279.5 1.75 1.75.5-1.75.5-.5 1.75-.5-1.75-1.75-.5 1.75-.5.5-1.75Zm2.25 9 .75 2.625 2.625.75-2.625.75-.75 2.625-.75-2.625-2.625-.75 2.625-.75.75-2.625Z"
  />
);

const AgentsIcon = heroIcon(
  <path
    strokeLinecap="round"
    strokeLinejoin="round"
    d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.63 8.41m5.96 5.96L9.63 8.41m0 0A6 6 0 0 0 2.25 14.25h4.8m2.58-5.84L7.5 10.5m6 6-2.121 2.121M14.25 6.75h.008v.008h-.008V6.75Z"
  />
);

const TemplatesIcon = heroIcon(
  <path
    strokeLinecap="round"
    strokeLinejoin="round"
    d="M19.5 14.25v-6.75a2.25 2.25 0 0 0-.659-1.591l-3.75-3.75A2.25 2.25 0 0 0 13.5 1.5h-6A2.25 2.25 0 0 0 5.25 3.75v16.5A2.25 2.25 0 0 0 7.5 22.5h9a2.25 2.25 0 0 0 2.25-2.25v-1.5M9 12h6M9 15h6M9 18h3m1.5-16.5V6a1.5 1.5 0 0 0 1.5 1.5h4.5"
  />
);

const WebhooksIcon = heroIcon(
  <path
    strokeLinecap="round"
    strokeLinejoin="round"
    d="M8.25 7.5a3.75 3.75 0 1 1 4.5 3.675M15.75 16.5a3.75 3.75 0 1 1-4.5-3.675M7.5 15.75 4.875 18.375M16.5 8.25l2.625-2.625M9.75 12h4.5"
  />
);

const MCPIcon = heroIcon(
  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 7.5h9m0 0L13.5 4.5m3 3-3 3m3 6h-9m0 0 3 3m-3-3 3-3" />
);

export const WORKSPACE_SETTINGS_ICONS: Record<TWorkspaceSettingsTabs, React.FC<ISvgIcons>> = {
  general: GeneralIcon,
  members: MembersIcon,
  export: ExportIcon,
  imports: ImportIcon,
  webhooks: WebhooksIcon,
  ai: AIIcon,
  agents: AgentsIcon,
  about: AboutIcon,
  mcp: MCPIcon,
  templates: TemplatesIcon,
};
