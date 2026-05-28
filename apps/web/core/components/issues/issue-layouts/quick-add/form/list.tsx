/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import type { TQuickAddIssueForm } from "../root";

export const ListQuickAddIssueForm = observer(function ListQuickAddIssueForm(props: TQuickAddIssueForm) {
  const { ref, register, onSubmit, isEpic } = props;
  const { t } = useTranslation();
  return (
    <div className="shadow-raised-200">
      <form
        ref={ref}
        onSubmit={onSubmit}
        className="flex h-8 w-full items-center gap-x-3 border-[0.5px] border-t-0 border-subtle bg-surface-1 px-3"
      >
        <div className="flex w-full items-center gap-3">
          <input
            type="text"
            autoComplete="off"
            placeholder={`${isEpic ? t("epic.title.label") : t("issue.title.label")}`}
            {...register("name", {
              required: isEpic ? t("epic.title.required") : t("issue.title.required"),
            })}
            className="h-8 w-full rounded-md bg-transparent px-2 text-13 leading-5 font-medium text-secondary outline-none"
          />
        </div>
      </form>
    </div>
  );
});
