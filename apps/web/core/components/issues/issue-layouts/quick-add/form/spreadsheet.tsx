/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import type { TQuickAddIssueForm } from "../root";

export const SpreadsheetQuickAddIssueForm = observer(function SpreadsheetQuickAddIssueForm(props: TQuickAddIssueForm) {
  const { ref, register, onSubmit, isEpic } = props;
  const { t } = useTranslation();
  return (
    // Inline editable cell (no floating box) so the row reads like a real grid
    // row, with the row's own borders defining it.
    <form ref={ref} onSubmit={onSubmit} className="flex h-full w-full items-center px-page-x">
      <input
        type="text"
        autoComplete="off"
        placeholder={isEpic ? t("epic.title.label") : t("issue.title.label")}
        {...register("name", {
          required: isEpic ? t("epic.title.required") : t("issue.title.required"),
        })}
        className="w-full bg-transparent text-13 leading-5 text-secondary outline-none placeholder:text-placeholder"
      />
    </form>
  );
});
