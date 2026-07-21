import { Avatar } from "@plane/ui";
import { cn } from "@plane/utils";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { RefObject } from "react";

import { useRealtimePresence } from "@/hooks/use-realtime-presence";
import type {
  TPresenceMember,
  TPresenceParticipant,
  TPresenceSelection,
  TPresenceSurface,
} from "@/hooks/use-realtime-presence";
import type { TUserDetails } from "@/types";

type Props = {
  className?: string;
  containerRef: RefObject<HTMLElement | null>;
  provider: HocuspocusProvider;
  resolveUser?: (userId: string) => TPresenceMember | null | undefined;
  selection?: TPresenceSelection;
  sheetId?: string;
  surface: TPresenceSurface;
  user: TUserDetails;
};

export function RealtimePresence(props: Props) {
  const participants = useRealtimePresence(props);
  return <RealtimePresenceLayer participants={participants} className={props.className} />;
}

export function RealtimePresenceLayer({
  className,
  avatarsClassName,
  participants,
}: {
  avatarsClassName?: string;
  className?: string;
  participants: TPresenceParticipant[];
}) {
  const visible = participants.slice(0, 4);
  const overflow = participants.length - visible.length;

  return (
    <div className={cn("pointer-events-none absolute inset-0 z-30 overflow-hidden", className)}>
      <div
        className={cn("absolute top-3 right-3 z-10 flex items-center -space-x-2", avatarsClassName)}
        aria-label={`${participants.length} collaborator${participants.length === 1 ? "" : "s"} online`}
      >
        {visible.map((participant) => (
          <div
            key={participant.id}
            className="shadow-xs rounded-full border-2 bg-surface-1 p-px"
            style={{ borderColor: participant.color }}
            title={`${participant.name}${participant.isCurrentUser ? " (you)" : ""}`}
          >
            <Avatar
              size={24}
              showTooltip={false}
              src={participant.avatarUrl}
              name={participant.name}
              fallbackBackgroundColor={participant.color}
            />
          </div>
        ))}
        {overflow > 0 ? (
          <div className="border-surface-1 shadow-xs grid size-7 place-items-center rounded-full border-2 bg-layer-2 text-10 font-medium text-secondary">
            +{overflow}
          </div>
        ) : null}
      </div>

      {participants
        .filter((participant) => !participant.isCurrentUser && participant.pointer)
        .map((participant) => (
          <div
            key={`pointer-${participant.id}`}
            className="absolute top-0 left-0 will-change-transform motion-reduce:transition-none"
            style={{
              transform: `translate3d(${participant.pointer?.x ?? 0}px, ${participant.pointer?.y ?? 0}px, 0)`,
            }}
            aria-hidden="true"
          >
            <svg width="18" height="22" viewBox="0 0 18 22" fill="none" className="drop-shadow-sm">
              <path
                d="M1.2 1.1 16.4 11l-7.1 1.2-3.8 6.6L1.2 1.1Z"
                fill={participant.color}
                stroke="white"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
            <span
              className="shadow-sm -mt-1 ml-3 block max-w-40 truncate rounded-md px-1.5 py-0.5 text-10 font-medium text-white"
              style={{ backgroundColor: participant.color }}
            >
              {participant.name}
            </span>
          </div>
        ))}
    </div>
  );
}
