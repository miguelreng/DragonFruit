/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import type { TQuickAddIssueForm } from "../root";

export const KanbanQuickAddIssueForm = observer(function KanbanQuickAddIssueForm(props: TQuickAddIssueForm) {
  const { formRef, register, onSubmit, isEpic } = props;
  const { t } = useTranslation();
  return (
    <div className="m-1 overflow-hidden rounded-lg bg-white shadow-raised-100">
      <form ref={formRef} onSubmit={onSubmit} className="flex w-full items-center gap-x-3 p-3">
        <input
          autoComplete="off"
          placeholder={isEpic ? t("epic.title.label") : t("issue.title.label")}
          {...register("name", {
            required: isEpic ? t("epic.title.required") : t("issue.title.required"),
          })}
          className="w-full rounded-lg bg-transparent px-2 py-1.5 pl-0 text-13 leading-5 font-medium text-secondary outline-none"
        />
      </form>
      <div className="bg-[#f8f8f8] px-3 py-2 text-11 text-tertiary italic">
        {isEpic ? t("epic.add.press_enter") : t("issue.add.press_enter")}
      </div>
    </div>
  );
});
