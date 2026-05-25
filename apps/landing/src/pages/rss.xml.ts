import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { getEssayDescription, getEssays, getEssaySlug } from "../lib/essays";

export async function GET(context: APIContext) {
  const essays = await getEssays();

  return rss({
    title: "DragonFruit Essays",
    description: "Essays from DragonFruit on productivity, generalists, and agentic workflows.",
    site: context.site ?? "https://dragonfruit.sh",
    items: essays.map((essay) => ({
      title: essay.name || "Untitled",
      description: getEssayDescription(essay),
      pubDate: new Date(essay.created_at),
      link: `/essays/${getEssaySlug(essay)}`,
    })),
  });
}
