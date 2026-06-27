/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { orderBy } from "lodash-es";
import Link from "next/link";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import type { IFavorite } from "@plane/types";
import { ChevronRight } from "@/components/icons/lucide-shim";
import { useFavorite } from "@/hooks/store/use-favorite";
import { useFavoriteItemDetails } from "@/hooks/use-favorite-item-details";

const PREVIEW_COUNT = 8;

const labelForEntity = (favorite: IFavorite): string => {
  switch (favorite.entity_type) {
    case "page":
      return "Doc";
    case "project":
      return "Project";
    case "view":
      return "List";
    case "module":
      return "Module";
    case "cycle":
      return "Cycle";
    default:
      return favorite.entity_type ?? "Item";
  }
};

const FavoriteRow = observer(function FavoriteRow({
  workspaceSlug,
  favorite,
}: {
  workspaceSlug: string;
  favorite: IFavorite;
}) {
  const { itemIcon, itemTitle, itemLink } = useFavoriteItemDetails(workspaceSlug, favorite);
  return (
    <li>
      <Link href={itemLink} className="group flex items-center gap-3 px-3 py-2.5 hover:bg-layer-transparent-hover">
        <div className="flex size-5 flex-shrink-0 items-center justify-center text-icon-tertiary">{itemIcon}</div>
        <span className="min-w-0 flex-1 truncate text-13 text-secondary">{itemTitle}</span>
        <span className="flex-shrink-0 text-11 font-medium text-placeholder">{labelForEntity(favorite)}</span>
        <ChevronRight className="size-3 flex-shrink-0 text-placeholder opacity-0 transition-opacity group-hover:opacity-100" />
      </Link>
    </li>
  );
});

export const FavoritesSection = observer(function FavoritesSection() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString();
  const { groupedFavorites, fetchFavorite } = useFavorite();

  useSWR(slug ? `HOME_FAVORITES_${slug}` : null, slug ? () => fetchFavorite(slug) : null, {
    revalidateOnFocus: false,
  });

  const items = orderBy(Object.values(groupedFavorites), "sequence", "desc")
    .filter((fav) => !fav.parent && !fav.is_folder)
    .slice(0, PREVIEW_COUNT);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <h3 className="text-14 font-semibold text-secondary">Favorites</h3>
        </div>
      </div>
      <div>
        {items.length === 0 ? (
          <div className="px-2 py-6 text-center text-12 text-placeholder">
            No favorites yet. Star a doc, project, list, cycle or module to pin it here.
          </div>
        ) : (
          <ul className="flex flex-col">
            {slug &&
              items.map((favorite) => <FavoriteRow key={favorite.id} workspaceSlug={slug} favorite={favorite} />)}
          </ul>
        )}
      </div>
    </section>
  );
});
