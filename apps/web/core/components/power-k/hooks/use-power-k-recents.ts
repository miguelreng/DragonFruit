/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useCallback, useEffect, useState } from "react";

const RECENTS_KEY = "power-k:recents";
const PINS_KEY = "power-k:pinned";
const MAX_RECENTS = 6;
const MAX_PINS = 8;

export type TPowerKRecentItem = {
  id: string;
  label: string;
  path: string;
  kind: string;
  ts: number;
};

const read = (key: string): TPowerKRecentItem[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const write = (key: string, value: TPowerKRecentItem[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
};

export const usePowerKRecents = () => {
  const [recents, setRecents] = useState<TPowerKRecentItem[]>([]);
  const [pins, setPins] = useState<TPowerKRecentItem[]>([]);

  useEffect(() => {
    setRecents(read(RECENTS_KEY));
    setPins(read(PINS_KEY));
  }, []);

  const recordVisit = useCallback((item: Omit<TPowerKRecentItem, "ts">) => {
    setRecents((prev) => {
      const next = [{ ...item, ts: Date.now() }, ...prev.filter((r) => r.id !== item.id)].slice(0, MAX_RECENTS);
      write(RECENTS_KEY, next);
      return next;
    });
  }, []);

  const togglePin = useCallback((item: Omit<TPowerKRecentItem, "ts">) => {
    setPins((prev) => {
      const existing = prev.find((p) => p.id === item.id);
      const next = existing ? prev.filter((p) => p.id !== item.id) : [{ ...item, ts: Date.now() }, ...prev].slice(0, MAX_PINS);
      write(PINS_KEY, next);
      return next;
    });
  }, []);

  const isPinned = useCallback(
    (id: string) => pins.some((p) => p.id === id),
    [pins]
  );

  return { recents, pins, recordVisit, togglePin, isPinned };
};
