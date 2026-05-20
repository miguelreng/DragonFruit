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
import { Logo } from "@plane/propel/emoji-icon-picker";
import { PageIcon } from "@plane/propel/icons";
import type { IFavorite } from "@plane/types";
import { ChevronRight, Star } from "@/components/icons/lucide-shim";
import { FAVORITE_ITEM_ICONS } from "@/constants/sidebar-favorites";
import { generateFavoriteItemLink } from "@/components/workspace/sidebar/favorites/favorite-items/common/helper";
import { useFavorite } from "@/hooks/store/use-favorite";

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
          <Star className="size-4 text-tertiary" />
          <h3 className="text-14 font-semibold text-secondary">Favorites</h3>
        </div>
      </div>
      <div className="rounded-md border border-subtle bg-surface-1">
        {items.length === 0 ? (
          <div className="px-3 py-6 text-center text-12 text-placeholder">
            No favorites yet. Star a doc, project, list, cycle or module to pin it here.
          </div>
        ) : (
          <ul className="divide-y divide-subtle">
            {items.map((favorite) => {
              if (!slug) return null;
              const href = generateFavoriteItemLink(slug, favorite);
              const Icon = FAVORITE_ITEM_ICONS[favorite.entity_type ?? "page"] ?? PageIcon;
              return (
                <li key={favorite.id}>
                  <Link
                    href={href}
                    className="group flex items-center gap-3 px-3 py-2.5 hover:bg-layer-transparent-hover"
                  >
                    <div className="flex size-5 flex-shrink-0 items-center justify-center text-icon-tertiary">
                      {favorite.logo_props?.in_use ? (
                        <Logo
                          logo={favorite.logo_props}
                          size={16}
                          type={favorite.entity_type === "project" ? "material" : "lucide"}
                        />
                      ) : (
                        <Icon className="size-4" />
                      )}
                    </div>
                    <span className="min-w-0 flex-1 truncate text-13 text-secondary">{favorite.name}</span>
                    <span className="flex-shrink-0 text-11 font-medium text-placeholder">
                      {labelForEntity(favorite)}
                    </span>
                    <ChevronRight className="size-3 flex-shrink-0 text-placeholder opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
});
