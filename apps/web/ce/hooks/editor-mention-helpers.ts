import type { TPageSearchResponse } from "@plane/types";

export type TPageMentionKind = "page" | "whiteboard";

export const getPageMentionKind = (pageType: TPageSearchResponse["page_type"]): TPageMentionKind =>
  pageType === "whiteboard" ? "whiteboard" : "page";

export const shouldSuggestProjectCalendar = (query: string, projectName: string | undefined): boolean => {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return true;

  const calendarLabel = `${projectName?.trim() ?? ""} calendar`.trim().toLocaleLowerCase();
  return "calendar".includes(normalizedQuery) || calendarLabel.includes(normalizedQuery);
};
