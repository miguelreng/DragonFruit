/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useMemo } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { Breadcrumbs } from "@plane/ui";
import { usePlatformOS } from "@/hooks/use-platform-os";

type Props = {
  label?: string;
  href?: string;
  icon?: React.ReactNode;
  disableTooltip?: boolean;
  isLast?: boolean;
};

const IconWrapper = React.memo(function IconWrapper({ icon }: { icon: React.ReactNode }) {
  return <div className="inline-flex size-4 shrink-0 items-center justify-center overflow-hidden !text-16">{icon}</div>;
});

IconWrapper.displayName = "IconWrapper";

const LabelWrapper = React.memo(function LabelWrapper({ label }: { label: React.ReactNode }) {
  return (
    <div className="relative inline-flex max-w-[150px] items-center truncate overflow-hidden leading-none text-primary">
      {label}
    </div>
  );
});

LabelWrapper.displayName = "LabelWrapper";

const BreadcrumbContent = React.memo(function BreadcrumbContent({
  icon,
  label,
}: {
  icon?: React.ReactNode;
  label?: React.ReactNode;
}) {
  if (!icon && !label) return null;

  return (
    <div className="inline-flex items-center gap-1.5 leading-none">
      {icon && <IconWrapper icon={icon} />}
      {label && <LabelWrapper label={label} />}
    </div>
  );
});

BreadcrumbContent.displayName = "BreadcrumbContent";

const ItemWrapper = React.memo(function ItemWrapper({
  children,
  ...props
}: React.ComponentProps<typeof Breadcrumbs.ItemWrapper>) {
  return <Breadcrumbs.ItemWrapper {...props}>{children}</Breadcrumbs.ItemWrapper>;
});

ItemWrapper.displayName = "ItemWrapper";

export const BreadcrumbLink = observer(function BreadcrumbLink(props: Props) {
  const { href, label, icon, disableTooltip = false, isLast = false } = props;
  const { isMobile } = usePlatformOS();

  const itemWrapperProps = useMemo(
    (): Omit<React.ComponentProps<typeof ItemWrapper>, "children"> => ({
      label: label?.toString(),
      disableTooltip: isMobile || disableTooltip,
      type: href && href !== "" ? "link" : "text",
      isLast,
    }),
    [href, label, isMobile, disableTooltip, isLast]
  );

  const content = useMemo(() => <BreadcrumbContent icon={icon} label={label} />, [icon, label]);

  if (href) {
    return (
      <Link href={href}>
        <ItemWrapper {...itemWrapperProps}>{content}</ItemWrapper>
      </Link>
    );
  }

  return <ItemWrapper {...itemWrapperProps}>{content}</ItemWrapper>;
});
