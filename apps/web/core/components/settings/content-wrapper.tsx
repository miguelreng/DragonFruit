/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { ScrollArea } from "@plane/propel/scrollarea";
import { cn } from "@plane/utils";

type Props = {
  children: React.ReactNode;
  header?: React.ReactNode;
  hugging?: boolean;
  contentClassName?: string;
};

export function SettingsContentWrapper(props: Props) {
  const { children, header, hugging = false, contentClassName } = props;

  return (
    <div className="@container flex size-full grow flex-col overflow-hidden">
      {header && <div className="z-[18] w-full shrink-0">{header}</div>}
      <ScrollArea
        scrollType="hover"
        orientation="vertical"
        size="sm"
        className="size-full grow overflow-y-scroll"
        viewportClassName="scroll-shadow"
      >
        <div
          className={cn(
            // Bottom-only: content sits flush under the settings page header.
            "pb-9",
            {
              "w-full px-page-x lg:px-12": hugging,
              "mx-auto w-full max-w-225 px-page-x @min-[58.95rem]:px-0": !hugging, // 58.95rem = max-width(56.25rem) + padding-x(1.35rem * 2)
            },
            contentClassName
          )}
        >
          {children}
        </div>
      </ScrollArea>
    </div>
  );
}
