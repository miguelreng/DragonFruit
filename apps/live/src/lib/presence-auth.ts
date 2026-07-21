export const isAuthorizedPresenceDocumentName = (documentName: string, pageId: string | null) =>
  !!pageId && documentName === `presence:${pageId}`;
