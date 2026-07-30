import type { HocuspocusProvider } from "@hocuspocus/provider";
import { generateRandomColor, hslToHex } from "@plane/utils";
import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { TUserDetails } from "@/types";
import { createCurrentPresenceParticipant, isPresenceEditingActive } from "./presence-state";

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
  isEditing: boolean;
  pointer?: { x: number; y: number; updatedAt: number };
  selection?: TPresenceSelection;
  sheetId?: string;
};

type TPresencePayload = {
  v: 1;
  user: { id: string };
  editing?: { updatedAt: number };
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
const EDITING_INTERVAL = 500;
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
  const lastEditingAtRef = useRef(0);
  const lastPointerAtRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const resolveUserRef = useRef(resolveUser);
  resolveUserRef.current = resolveUser;

  const publish = useCallback(() => {
    const awareness = provider.awareness;
    if (!awareness) return;
    awareness.setLocalStateField("user", {
      avatarUrl: user.avatarUrl,
      id: user.id,
      name: user.name,
      color: hslToHex(generateRandomColor(user.id)),
    });
    awareness.setLocalStateField("presence", payloadRef.current);
  }, [provider, user.avatarUrl, user.id, user.name]);

  const refreshParticipants = useCallback(() => {
    const now = Date.now();
    const byUser = new Map<string, TPresenceParticipant>();
    const latestActivityByUser = new Map<string, number>();

    if (user.id) {
      byUser.set(
        user.id,
        createCurrentPresenceParticipant({
          avatarUrl: user.avatarUrl,
          color: hslToHex(generateRandomColor(user.id)),
          id: user.id,
          name: user.name,
        })
      );
      latestActivityByUser.set(user.id, 0);
    }

    const awareness = provider.awareness;
    if (!awareness) {
      setParticipants([...byUser.values()]);
      return;
    }

    awareness.getStates().forEach((rawState, clientId) => {
      const state = rawState as TAwarenessState;
      const presence = state.presence;
      if (presence?.v !== 1 || !presence.user?.id) return;

      const userId = presence.user.id;
      const awarenessMember = state.user?.name
        ? { avatarUrl: state.user.avatarUrl, id: userId, name: state.user.name }
        : null;
      const resolvedMember = resolveUserRef.current?.(userId);
      const member =
        userId === user.id
          ? { avatarUrl: user.avatarUrl, id: user.id, name: user.name }
          : resolvedMember
            ? { ...resolvedMember, avatarUrl: resolvedMember.avatarUrl || awarenessMember?.avatarUrl }
            : awarenessMember;
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
        isEditing: isPresenceEditingActive(presence.editing?.updatedAt, now),
        pointer,
        selection: isFiniteSelection(presence.sheet?.selection) ? presence.sheet.selection : undefined,
        sheetId: presence.sheet?.sheetId,
      };
      const existing = byUser.get(userId);
      const activityAt = Math.max(candidate.pointer?.updatedAt ?? 0, presence.editing?.updatedAt ?? 0);
      if (!existing) {
        byUser.set(userId, candidate);
        latestActivityByUser.set(userId, activityAt);
      } else if (activityAt >= (latestActivityByUser.get(userId) ?? 0)) {
        byUser.set(userId, {
          ...candidate,
          avatarUrl: candidate.avatarUrl || existing.avatarUrl,
          isEditing: candidate.isEditing || existing.isEditing,
        });
        latestActivityByUser.set(userId, activityAt);
      } else if (candidate.isEditing && !existing.isEditing) {
        byUser.set(userId, { ...existing, isEditing: true });
      }
    });

    // Copy the awareness values before sorting; this package targets a
    // pre-ES2023 runtime where `toSorted` is unavailable.
    setParticipants(
      // oxlint-disable-next-line unicorn/no-array-sort
      [...byUser.values()].sort((a, b) => {
        if (a.isCurrentUser !== b.isCurrentUser) return a.isCurrentUser ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
    );
  }, [provider, surface, user.avatarUrl, user.id, user.name]);

  useEffect(() => {
    payloadRef.current = {
      ...payloadRef.current,
      user: { id: user.id },
      sheet: sheetId ? { sheetId, selection } : undefined,
    };
    publish();
  }, [publish, selection, sheetId, user.id]);

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

    const clearEditing = () => {
      if (!payloadRef.current.editing) return;
      payloadRef.current = { ...payloadRef.current, editing: undefined };
      publish();
    };
    const handleEditing = () => {
      const now = Date.now();
      if (now - lastEditingAtRef.current < EDITING_INTERVAL) return;
      lastEditingAtRef.current = now;
      payloadRef.current = { ...payloadRef.current, editing: { updatedAt: now } };
      publish();
    };
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
      if (document.visibilityState !== "visible") {
        clearEditing();
        clearPointer();
      }
    };

    container.addEventListener("beforeinput", handleEditing);
    container.addEventListener("pointermove", handlePointerMove, { passive: true });
    container.addEventListener("pointerleave", clearPointer);
    window.addEventListener("blur", clearEditing);
    window.addEventListener("blur", clearPointer);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearEditing();
      clearPointer();
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      container.removeEventListener("beforeinput", handleEditing);
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerleave", clearPointer);
      window.removeEventListener("blur", clearEditing);
      window.removeEventListener("blur", clearPointer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [containerRef, provider, publish, surface]);

  return participants;
};
