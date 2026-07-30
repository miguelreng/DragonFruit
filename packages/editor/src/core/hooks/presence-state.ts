export const PRESENCE_EDITING_STALE_AFTER = 4_000;

export type TCurrentPresenceIdentity = {
  avatarUrl?: string;
  color: string;
  id: string;
  name: string;
};

export function isPresenceEditingActive(updatedAt: number | undefined, now = Date.now()): boolean {
  return (
    typeof updatedAt === "number" &&
    Number.isFinite(updatedAt) &&
    updatedAt <= now &&
    now - updatedAt <= PRESENCE_EDITING_STALE_AFTER
  );
}

/** Seed the local user so awareness can deduplicate this browser's sessions. */
export function createCurrentPresenceParticipant(user: TCurrentPresenceIdentity) {
  return {
    avatarUrl: user.avatarUrl,
    clientId: 0,
    color: user.color,
    id: user.id,
    isCurrentUser: true,
    isEditing: false,
    name: user.name,
  };
}

/** The collaborator avatar stack represents other people, never the viewer. */
export function getRemotePresenceParticipants<T extends { isCurrentUser: boolean }>(participants: T[]): T[] {
  return participants.filter((participant) => !participant.isCurrentUser);
}
