/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";

// ui
import { Button } from "@plane/propel/button";
import { EmptyStateIcon, type TEmptyStateIconName } from "@/components/empty-state/empty-state-icon";

type Props = {
  title: string;
  description?: React.ReactNode;
  iconName: TEmptyStateIconName;
  primaryButton?: {
    icon?: any;
    text: string;
    onClick: () => void;
  };
  secondaryButton?: React.ReactNode;
  disabled?: boolean;
};

export function EmptyState({ title, description, iconName, primaryButton, secondaryButton, disabled = false }: Props) {
  return (
    <div className={`flex h-full w-full items-center justify-center`}>
      <div className="flex w-full flex-col items-center text-center">
        <EmptyStateIcon name={iconName} />
        <h6 className="mt-6 mb-3 text-18 font-semibold sm:mt-8">{title}</h6>
        {description && <p className="mb-7 px-5 text-tertiary sm:mb-8">{description}</p>}
        <div className="flex items-center gap-4">
          {primaryButton && (
            <Button
              variant="primary"
              prependIcon={primaryButton.icon}
              onClick={primaryButton.onClick}
              disabled={disabled}
            >
              {primaryButton.text}
            </Button>
          )}
          {secondaryButton}
        </div>
      </div>
    </div>
  );
}
