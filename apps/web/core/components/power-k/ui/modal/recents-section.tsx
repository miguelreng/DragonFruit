/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Command } from "cmdk";
import { Clock, Pin, PinOff } from "@/components/icons/lucide-shim";
import { cn } from "@plane/utils";
import type { TPowerKRecentItem } from "../../hooks/use-power-k-recents";

type Props = {
  recents: TPowerKRecentItem[];
  pins: TPowerKRecentItem[];
  isPinned: (id: string) => boolean;
  onSelect: (item: TPowerKRecentItem) => void;
  onTogglePin: (item: TPowerKRecentItem) => void;
};

function Row({
  item,
  pinned,
  onSelect,
  onTogglePin,
}: {
  item: TPowerKRecentItem;
  pinned: boolean;
  onSelect: (item: TPowerKRecentItem) => void;
  onTogglePin: (item: TPowerKRecentItem) => void;
}) {
  return (
    <Command.Item
      value={`recent-${item.id}-${item.label}`}
      onSelect={() => onSelect(item)}
      className="group focus:outline-none"
    >
      <div className="flex min-w-0 items-center gap-2 text-secondary">
        {pinned ? (
          <Pin className="size-3.5 shrink-0 text-accent-primary" />
        ) : (
          <Clock className="size-3.5 shrink-0 text-tertiary" />
        )}
        <span className="truncate">{item.label}</span>
        <span className="shrink-0 text-11 text-tertiary">{item.kind}</span>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin(item);
        }}
        className={cn("rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-layer-2-hover", {
          "opacity-100": pinned,
        })}
        aria-label={pinned ? "Unpin" : "Pin"}
      >
        {pinned ? <PinOff className="size-3 text-tertiary" /> : <Pin className="size-3 text-tertiary" />}
      </button>
    </Command.Item>
  );
}

export function PowerKRecentsSection(props: Props) {
  const { recents, pins, isPinned, onSelect, onTogglePin } = props;
  if (recents.length === 0 && pins.length === 0) return null;

  const recentsOnly = recents.filter((r) => !isPinned(r.id));

  return (
    <>
      {pins.length > 0 && (
        <Command.Group heading="Pinned">
          {pins.map((p) => (
            <Row key={`pin-${p.id}`} item={p} pinned onSelect={onSelect} onTogglePin={onTogglePin} />
          ))}
        </Command.Group>
      )}
      {recentsOnly.length > 0 && (
        <Command.Group heading="Recents">
          {recentsOnly.map((r) => (
            <Row key={`recent-${r.id}`} item={r} pinned={false} onSelect={onSelect} onTogglePin={onTogglePin} />
          ))}
        </Command.Group>
      )}
    </>
  );
}
