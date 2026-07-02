/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

//ui
import { useParams } from "next/navigation";
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  CheckIcon,
  Eraser,
  EyeOff,
  MoveRight,
} from "@/components/icons/lucide-shim";
// constants
import { EIssueFilterType, SPREADSHEET_PROPERTY_DETAILS } from "@plane/constants";
// i18n
import { useTranslation } from "@plane/i18n";
// types
import type { IIssueDisplayFilterOptions, IIssueDisplayProperties, TIssueOrderByOptions } from "@plane/types";
import { CustomMenu, Row } from "@plane/ui";
// hooks
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";
import { useIssuesActions } from "@/hooks/use-issues-actions";
import useLocalStorage from "@/hooks/use-local-storage";

interface Props {
  property: keyof IIssueDisplayProperties;
  displayFilters: IIssueDisplayFilterOptions;
  handleDisplayFilterUpdate: (data: Partial<IIssueDisplayFilterOptions>) => void;
  onClose: () => void;
  isEpic?: boolean;
}

export function HeaderColumn(props: Props) {
  const { displayFilters, handleDisplayFilterUpdate, property, onClose, isEpic = false } = props;
  // i18n
  const { t } = useTranslation();
  const { storedValue: selectedMenuItem, setValue: setSelectedMenuItem } = useLocalStorage(
    "spreadsheetViewSorting",
    ""
  );
  const { setValue: setActiveSortingProperty } = useLocalStorage("spreadsheetViewActiveSortingProperty", "");
  const propertyDetails = SPREADSHEET_PROPERTY_DETAILS[property];
  // store hooks — used to hide the column from the menu (toggles its display property off)
  const { projectId } = useParams();
  const storeType = useIssueStoreType();
  const { updateFilters } = useIssuesActions(storeType);

  const handleOrderBy = (order: TIssueOrderByOptions, itemKey: string) => {
    handleDisplayFilterUpdate({ order_by: order });

    setSelectedMenuItem(`${order}_${itemKey}`);
    setActiveSortingProperty(order === "-created_at" ? "" : itemKey);
  };

  const handleHide = () => {
    if (!projectId) return;
    updateFilters(projectId.toString(), EIssueFilterType.DISPLAY_PROPERTIES, { [property]: false });
  };

  if (!propertyDetails) return null;

  return (
    <CustomMenu
      customButtonClassName="clickable !w-full"
      customButtonTabIndex={-1}
      className="!w-full"
      customButton={
        <Row className="flex w-full cursor-pointer items-center justify-between gap-1 py-1.5 text-13 text-secondary hover:text-primary">
          <div className="flex items-center gap-1">
            {property === "sub_issue_count" && isEpic ? t("issue.label", { count: 2 }) : t(propertyDetails.i18n_title)}
          </div>
        </Row>
      }
      onMenuClose={onClose}
      placement="bottom-start"
      closeOnSelect
    >
      <CustomMenu.MenuItem onClick={() => handleOrderBy(propertyDetails.ascendingOrderKey, property)}>
        <div
          className={`flex items-center justify-between gap-1.5 px-1 ${
            selectedMenuItem === `${propertyDetails.ascendingOrderKey}_${property}`
              ? "text-primary"
              : "text-secondary hover:text-primary"
          }`}
        >
          <div className="flex items-center gap-2">
            <ArrowDownWideNarrow className="h-3 w-3 stroke-[1.5]" />
            <span>{propertyDetails.ascendingOrderTitle}</span>
            <MoveRight className="h-3 w-3" />
            <span>{propertyDetails.descendingOrderTitle}</span>
          </div>

          {selectedMenuItem === `${propertyDetails.ascendingOrderKey}_${property}` && <CheckIcon className="h-3 w-3" />}
        </div>
      </CustomMenu.MenuItem>
      <CustomMenu.MenuItem onClick={() => handleOrderBy(propertyDetails.descendingOrderKey, property)}>
        <div
          className={`flex items-center justify-between gap-1.5 px-1 ${
            selectedMenuItem === `${propertyDetails.descendingOrderKey}_${property}`
              ? "text-primary"
              : "text-secondary hover:text-primary"
          }`}
        >
          <div className="flex items-center gap-2">
            <ArrowUpNarrowWide className="h-3 w-3 stroke-[1.5]" />
            <span>{propertyDetails.descendingOrderTitle}</span>
            <MoveRight className="h-3 w-3" />
            <span>{propertyDetails.ascendingOrderTitle}</span>
          </div>

          {selectedMenuItem === `${propertyDetails.descendingOrderKey}_${property}` && (
            <CheckIcon className="h-3 w-3" />
          )}
        </div>
      </CustomMenu.MenuItem>
      {selectedMenuItem &&
        selectedMenuItem !== "" &&
        displayFilters?.order_by !== "-created_at" &&
        selectedMenuItem.includes(property) && (
          <CustomMenu.MenuItem
            className={`mt-0.5 ${selectedMenuItem === `-created_at_${property}` ? "bg-layer-1" : ""}`}
            key={property}
            onClick={() => handleOrderBy("-created_at", property)}
          >
            <div className="flex items-center gap-2 px-1">
              <Eraser className="h-3 w-3" />
              <span>{t("common.actions.clear_sorting")}</span>
            </div>
          </CustomMenu.MenuItem>
        )}
      <CustomMenu.MenuItem className="mt-0.5 border-t border-subtle pt-1" onClick={handleHide}>
        <div className="flex items-center gap-2 px-1 text-secondary hover:text-primary">
          <EyeOff className="h-3 w-3" />
          <span>Hide property</span>
        </div>
      </CustomMenu.MenuItem>
    </CustomMenu>
  );
}
