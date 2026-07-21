import type { HocuspocusProvider } from "@hocuspocus/provider";
import { generateRandomColor, hslToHex } from "@plane/utils";
import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { TUserDetails } from "@/types";

export type TPresenceSurface = "document" | "sheet";

export type TPresenceMember = {
  avatarUrl?: string;
  id: string;
  name: string;
};

export type TPresenceSelection = {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
};

export type TPresenceParticipant = TPresenceMember & {
  clientId: number;
  color: string;
  isCurrentUser: boolean;
  pointer?: { x: number; y: number; updatedAt: number };
  selection?: TPresenceSelection;
  sheetId?: string;
};

type TPresencePayload = {
  v: 1;
  user: { id: string };
  pointer?: { x: number; y: number; surface: TPresenceSurface; updatedAt: number };
  sheet?: { sheetId: string; selection?: TPresenceSelection };
};

type TAwarenessState = {
  presence?: TPresencePayload;
  user?: Partial<TUserDetails>;
};

type TUseRealtimePresenceArgs = {
  containerRef: RefObject<HTMLElement | null>;
  provider: HocuspocusProvider;
  resolveUser?: (userId: string) => TPresenceMember | null | undefined;
  selection?: TPresenceSelection;
  sheetId?: string;
  surface: TPresenceSurface;
  user: TUserDetails;
};

const POINTER_INTERVAL = 50;
const POINTER_STALE_AFTER = 10_000;
const isFinitePoint = (pointer: TPresencePayload["pointer"]): pointer is NonNullable<TPresencePayload["pointer"]> =>
  !!pointer && Number.isFinite(pointer.x) && Number.isFinite(pointer.y) && Number.isFinite(pointer.updatedAt);

const isFiniteSelection = (selection: TPresenceSelection | undefined): selection is TPresenceSelection =>
  !!selection &&
  [selection.r1, selection.c1, selection.r2, selection.c2].every(
    (value) => Number.isInteger(value) && value >= 0 && value <= 10_000
  );

export const useRealtimePresence = ({
  containerRef,
  provider,
  resolveUser,
  selection,
  sheetId,
  surface,
  user,
}: TUseRealtimePresenceArgs) => {
  const [participants, setParticipants] = useState<TPresenceParticipant[]>([]);
  const payloadRef = useRef<TPresencePayload>({ v: 1, user: { id: user.id } });
  const lastPointerAtRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const resolveUserRef = useRef(resolveUser);
  resolveUserRef.current = resolveUser;

  const publish = useCallback(() => {
    const awareness = provider.awareness;
    if (!awareness) return;
    awareness.setLocalStateField("user", {
      id: user.id,
      name: user.name,
      color: hslToHex(generateRandomColor(user.id)),
    });
    awareness.setLocalStateField("presence", payloadRef.current);
  }, [provider, user.id, user.name]);

  const refreshParticipants = useCallback(() => {
    const awareness = provider.awareness;
    if (!awareness) return;
    const now = Date.now();
    const byUser = new Map<string, TPresenceParticipant>();

    awareness.getStates().forEach((rawState, clientId) => {
      const state = rawState as TAwarenessState;
      const presence = state.presence;
      if (presence?.v !== 1 || !presence.user?.id) return;

      const userId = presence.user.id;
      const member =
        userId === user.id
          ? { id: user.id, name: user.name }
          : (resolveUserRef.current?.(userId) ??
            (!resolveUserRef.current && state.user?.name ? { id: userId, name: state.user.name } : null));
      if (!member) return;

      const pointer =
        isFinitePoint(presence.pointer) &&
        presence.pointer.surface === surface &&
        now - presence.pointer.updatedAt <= POINTER_STALE_AFTER
          ? { x: presence.pointer.x, y: presence.pointer.y, updatedAt: presence.pointer.updatedAt }
          : undefined;
      const color = hslToHex(generateRandomColor(userId));
      const candidate: TPresenceParticipant = {
        ...member,
        clientId,
        color,
        isCurrentUser: userId === user.id,
        pointer,
        selection: isFiniteSelection(presence.sheet?.selection) ? presence.sheet.selection : undefined,
        sheetId: presence.sheet?.sheetId,
      };
      const existing = byUser.get(userId);
      if (!existing || (candidate.pointer?.updatedAt ?? 0) >= (existing.pointer?.updatedAt ?? 0)) {
        byUser.set(userId, candidate);
      }
    });

    setParticipants(
      [...byUser.values()].sort((a, b) => {
        if (a.isCurrentUser !== b.isCurrentUser) return a.isCurrentUser ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
    );
  }, [provider, surface, user.id, user.name]);

  useEffect(() => {
    payloadRef.current = {
      ...payloadRef.current,
      user: { id: user.id },
      sheet: sheetId ? { sheetId, selection } : undefined,
    };
    publish();
  }, [publish, selection?.c1, selection?.c2, selection?.r1, selection?.r2, sheetId, user.id]);

  useEffect(() => {
    const awareness = provider.awareness;
    if (!awareness) return;
    awareness.on("change", refreshParticipants);
    refreshParticipants();
    const staleTimer = window.setInterval(refreshParticipants, 2_000);
    return () => {
      window.clearInterval(staleTimer);
      awareness.off("change", refreshParticipants);
    };
  }, [provider, refreshParticipants]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const clearPointer = () => {
      if (!payloadRef.current.pointer) return;
      payloadRef.current = { ...payloadRef.current, pointer: undefined };
      publish();
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const now = Date.now();
      if (now - lastPointerAtRef.current < POINTER_INTERVAL) return;
      lastPointerAtRef.current = now;
      const rect = container.getBoundingClientRect();
      const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top, surface, updatedAt: now };
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = window.requestAnimationFrame(() => {
        payloadRef.current = { ...payloadRef.current, pointer };
        publish();
      });
    };
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") clearPointer();
    };

    container.addEventListener("pointermove", handlePointerMove, { passive: true });
    container.addEventListener("pointerleave", clearPointer);
    window.addEventListener("blur", clearPointer);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearPointer();
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerleave", clearPointer);
      window.removeEventListener("blur", clearPointer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [containerRef, provider, publish, surface]);

  return participants;
};
