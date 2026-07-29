export type TCompactIssueState = {
  id: string;
  project_id: string;
};

export const resolveCompactIssueStateId = (
  projectId: string | null | undefined,
  selectedState: TCompactIssueState | undefined,
  defaultStateId: string | undefined
): string | undefined => {
  if (projectId && selectedState?.project_id === projectId) return selectedState.id;
  return defaultStateId;
};
