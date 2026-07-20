// @ts-nocheck

// "Art of the moment" new tab. Pulls paintings of every period, movement, and
// genre from museums around the world via Wikidata, with images from Wikimedia
// Commons — no API key, CORS-open. Each piece carries the museum that holds it,
// the genre/medium/size, and its English Wikipedia article (clean title + a short
// "about" blurb on hover). A small seed of famous works ships in the extension
// so the first paint is instant; the full cross-museum pool loads in the
// background, cached for a week.

// --- Seed (bundled for instant first paint + offline resilience) ----------
const SEED = [
  {"id": "Q1212937", "title": "The Ambassadors", "artist": "Hans Holbein the Younger", "date": "1533", "museum": "National Gallery", "genre": "portrait", "medium": "oak panel, oil paint", "height": "207", "width": "209", "file": "Hans%20Holbein%20the%20Younger%20-%20The%20Ambassadors%20-%20Google%20Art%20Project.jpg", "wiki": "The_Ambassadors_(Holbein)"},
  {"id": "Q185255", "title": "The Wedding at Cana", "artist": "Paolo Veronese", "date": "1562", "museum": "Department of Paintings of the Louvre", "genre": "religious art", "medium": "canvas, oil paint", "height": "677", "width": "994", "file": "Les%20Noces%20de%20Cana%20-%20Paolo%20Veronese%20-%20Mus%C3%A9e%20du%20Louvre%20Peintures%20INV%20142%20%3B%20MR%20384.jpg", "wiki": "The_Wedding_at_Cana_(Veronese)"},
  {"id": "Q94802", "title": "The Burial of the Count of Orgaz", "artist": "El Greco", "date": "1586", "museum": "Church of Santo Tomé", "genre": "group portrait, religious art", "medium": "canvas, oil paint", "height": "480", "width": "360", "file": "El%20Greco%20-%20The%20Burial%20of%20the%20Count%20of%20Orgaz.JPG", "wiki": "The_Burial_of_the_Count_of_Orgaz"},
  {"id": "Q883994", "title": "View of Toledo", "artist": "El Greco", "date": "1596", "museum": "Metropolitan Museum of Art", "genre": "landscape painting", "medium": "canvas, oil paint", "height": "121.3", "width": "108.6", "file": "View%20of%20Toledo%20MET%20DP349564.jpg", "wiki": "View_of_Toledo"},
  {"id": "Q2011510", "title": "Bacchus", "artist": "Caravaggio", "date": "1598", "museum": "Uffizi Gallery", "genre": "mythological painting", "medium": "canvas, oil paint", "height": "95", "width": "85", "file": "Baco%2C%20por%20Caravaggio.jpg", "wiki": "Bacchus_(Caravaggio)"},
  {"id": "Q867403", "title": "Madonna with the Long Neck", "artist": "Parmigianino", "date": "1600", "museum": "Uffizi Gallery", "genre": "religious art", "medium": "panel, oil paint", "height": "219", "width": "132", "file": "Parmigianino%20-%20Madonna%20and%20Child%20with%20Angels%2C%20known%20as%20the%20Madonna%20with%20the%20Long%20Neck.jpg", "wiki": "Madonna_with_the_Long_Neck"},
  {"id": "Q1430990", "title": "Venus, Cupid, Folly and Time", "artist": "Bronzino", "date": "1545", "museum": "National Gallery", "genre": "allegory, mythological painting", "medium": "panel, oil paint", "height": "147", "width": "117", "file": "Angelo%20Bronzino%20-%20Venus%2C%20Cupid%2C%20Folly%20and%20Time%20-%20National%20Gallery%2C%20London.jpg", "wiki": "Venus,_Cupid,_Folly_and_Time"},
  {"id": "Q951105", "title": "The Feast in the House of Levi", "artist": "Paolo Veronese", "date": "1573", "museum": "Gallerie dell'Accademia", "genre": "religious art", "medium": "canvas, oil paint", "height": "560", "width": "1039", "file": "The%20Feast%20in%20the%20House%20of%20Levi%20by%20Paolo%20Veronese%20%28edited%202%29.jpg", "wiki": "The_Feast_in_the_House_of_Levi"},
  {"id": "Q2472983", "title": "Last Supper", "artist": "Jacopo Tintoretto", "date": "1563", "museum": "Church of San Giorgio Maggiore", "genre": "religious art", "medium": "canvas, oil paint", "height": "365", "width": "568", "file": "Jacopo%20Tintoretto%20-%20The%20Last%20Supper%20-%20WGA22649.jpg", "wiki": "Last_Supper_(Tintoretto)"},
  {"id": "Q700834", "title": "Jupiter and Io", "artist": "Antonio da Correggio", "date": "1530", "museum": "Kunsthistorisches Museum", "genre": "mythological painting", "medium": "canvas, oil paint", "height": "162", "width": "73.5", "file": "Antonio%20Allegri%2C%20called%20Correggio%20-%20Jupiter%20and%20Io%20-%20Google%20Art%20Project.jpg", "wiki": "Jupiter_and_Io"},
  {"id": "Q1328065", "title": "Portrait of Eleanor of Toledo and her son", "artist": "Bronzino", "date": "1544", "museum": "Uffizi Gallery", "genre": "portrait", "medium": "panel, oil paint", "height": "115", "width": "96", "file": "Bronzino%20-%20Eleonora%20di%20Toledo%20col%20figlio%20Giovanni%20-%20Google%20Art%20Project.jpg", "wiki": "Portrait_of_Eleanor_of_Toledo"},
  {"id": "Q6402081", "title": "The Nobleman with his Hand on his Chest", "artist": "El Greco", "date": "1580", "museum": "Museo del Prado", "genre": "portrait", "medium": "canvas, oil paint", "height": "81.8", "width": "66.1", "file": "El%20caballero%20de%20la%20mano%20en%20el%20pecho%2C%20by%20El%20Greco%2C%20from%20Prado%20in%20Google%20Earth.jpg", "wiki": "The_Nobleman_with_his_Hand_on_his_Chest"},
  {"id": "Q1220013", "title": "Opening of the Fifth Seal", "artist": "El Greco", "date": "1610", "museum": "Metropolitan Museum of Art", "genre": "religious art", "medium": "canvas, oil paint", "height": "222.3", "width": "193", "file": "El%20Greco%2C%20The%20Vision%20of%20Saint%20John%20%281608-1614%29.jpg", "wiki": "Opening_of_the_Fifth_Seal"},
  {"id": "Q2393412", "title": "Venus and Mars Surprised by Vulcan", "artist": "Jacopo Tintoretto", "date": "1555", "museum": "Bavarian State Painting Collections", "genre": "mythological painting", "medium": "canvas, oil paint", "height": "135", "width": "198", "file": "JACOPO-TINTORETTO-JACOPO-ROBUSTI%20VULKAN-UEBERRASCHT-VENUS-UND-MARS%20CC-BY-SA%20BSTGS%209257.jpg", "wiki": "Mars_and_Venus_Surprised_by_Vulcan"},
  {"id": "Q180632", "title": "Pope Paul III and His Grandsons", "artist": "Titian", "date": "1546", "museum": "Museo di Capodimonte", "genre": "group portrait", "medium": "canvas, oil paint", "height": "210", "width": "176", "file": "Titian%20%E2%80%93%20Portrait%20of%20Pope%20Paul%20III%20with%20his%20Grandsons%20%E2%80%93%20Google%20Art%20Project%20%E2%80%93%20edited.jpg", "wiki": "Pope_Paul_III_and_His_Grandsons"},
  {"id": "Q2273890", "title": "Miracle of the Slave", "artist": "Jacopo Tintoretto", "date": "1547", "museum": "Gallerie dell'Accademia", "genre": "religious art", "medium": "canvas, oil paint", "height": "415", "width": "541", "file": "Tintoretto%20-%20Miracle%20of%20the%20Slave.jpg", "wiki": "Miracle_of_the_Slave_(Tintoretto)"},
  {"id": "Q2255224", "title": "Laocoön", "artist": "El Greco", "date": "1610", "museum": "National Gallery of Art", "genre": "mythological painting", "medium": "canvas, oil paint", "height": "142", "width": "193", "file": "El%20Greco%20%28Domenikos%20Theotokopoulos%29%20-%20Laoco%C3%B6n%20-%20Google%20Art%20Project.jpg", "wiki": "Laoco%C3%B6n_(El_Greco)"},
  {"id": "Q3978277", "title": "Susanna and the Elders", "artist": "Jacopo Tintoretto", "date": "1555", "museum": "Kunsthistorisches Museum", "genre": "religious art", "medium": "canvas, oil paint", "height": "146", "width": "193.6", "file": "Jacopo%20Robusti%2C%20called%20Tintoretto%20-%20Susanna%20and%20the%20Elders%20-%20Google%20Art%20Project.jpg", "wiki": "Susanna_and_the_Elders_(Tintoretto)"},
  {"id": "Q6119366", "title": "Saint Martin and the Beggar", "artist": "El Greco", "date": "1597", "museum": "National Gallery of Art", "genre": "religious art", "medium": "canvas, oil paint", "height": "193.5", "width": "103", "file": "El%20Greco%20-%20San%20Mart%C3%ADn%20y%20el%20mendigo.jpg", "wiki": "Saint_Martin_and_the_Beggar_(El_Greco)"},
  {"id": "Q2274267", "title": "The Origin of the Milky Way", "artist": "Jacopo Tintoretto", "date": "1575", "museum": "National Gallery", "genre": "mythological painting", "medium": "canvas, oil paint", "height": "149.4", "width": "168", "file": "Jacopo%20Tintoretto%20-%20The%20Origin%20of%20the%20Milky%20Way%20-%20Google%20Art%20Project.jpg", "wiki": "The_Origin_of_the_Milky_Way"},
  {"id": "Q493792", "title": "Portrait of Andrea Doria as Neptune", "artist": "Bronzino", "date": "1545", "museum": "Pinacoteca di Brera", "genre": "allegory", "medium": "canvas, oil paint", "height": "115", "width": "53", "file": "Angelo%20Bronzino%20-%20Portrait%20of%20Andrea%20Doria%20as%20Neptune%20-%20WGA3261.jpg", "wiki": "Portrait_of_Andrea_Doria_as_Neptune"},
  {"id": "Q1988152", "title": "Venus and Adonis", "artist": "Paolo Veronese", "date": "1580", "museum": "Museo del Prado", "genre": "mythological painting", "medium": "canvas, oil paint", "height": "162", "width": "191", "file": "Venus%20y%20Adonis%20%28Veronese%29.jpg", "wiki": "Venus_and_Adonis_(Veronese,_Madrid)"},
  {"id": "Q949323", "title": "Fray Hortensio Félix Paravicino", "artist": "El Greco", "date": "1609", "museum": "Museum of Fine Arts Boston", "genre": "portrait", "medium": "canvas, oil paint", "height": "112.1", "width": "86.1", "file": "El%20Greco%20%28Domenikos%20Theotokopoulos%29%20-%20Fray%20Hortensio%20F%C3%A9lix%20Paravicino%20-%20Google%20Art%20Project.jpg", "wiki": "Portrait_of_Fray_Hortensio_F%C3%A9lix_Paravacino"},
  {"id": "Q23008305", "title": "The Chess Game", "artist": "Sofonisba Anguissola", "date": "1555", "museum": "National Museum in Poznań", "genre": "group portrait", "medium": "canvas, oil paint", "height": "72", "width": "97", "file": "The%20Chess%20Game%20%28Sofonisba%20Anguissola%29%201555%20%284096x3236px%29.jpg", "wiki": "The_Game_of_Chess_(Sofonisba_Anguissola)"}
];

// --- Wikidata cross-museum pool ------------------------------------------
const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const COMMONS_FILEPATH = "https://commons.wikimedia.org/wiki/Special:FilePath/";
const WIKIPEDIA = "https://en.wikipedia.org";

// Every Wikidata item classified as a painting, regardless of period, movement,
// or genre, with a Commons image and an English Wikipedia article. The flat
// query deliberately avoids an expensive global sort/aggregation; duplicate
// metadata rows are deduplicated while normalizing the response.
const POOL_QUERY = `SELECT ?item ?title ?artist (YEAR(?inception) AS ?year) ?image ?museum ?medium ?genre ?height ?width ?article WHERE {
  ?item wdt:P31 wd:Q3305213 ; wdt:P18 ?image .
  ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> .
  ?item rdfs:label ?title . FILTER(LANG(?title) = "en")
  OPTIONAL { ?item wdt:P170 ?creator. ?creator rdfs:label ?artist. FILTER(LANG(?artist) = "en") }
  OPTIONAL { ?item wdt:P571 ?inception. }
  OPTIONAL { ?item wdt:P195 ?collection. ?collection rdfs:label ?museum. FILTER(LANG(?museum) = "en") }
  OPTIONAL { ?item wdt:P186 ?material. ?material rdfs:label ?medium. FILTER(LANG(?medium) = "en") }
  OPTIONAL { ?item wdt:P136 ?paintingGenre. ?paintingGenre rdfs:label ?genre. FILTER(LANG(?genre) = "en") }
  OPTIONAL { ?item wdt:P2048 ?height. }
  OPTIONAL { ?item wdt:P2049 ?width. }
} LIMIT 800`;

const POOL_KEY = "artworkPool";
const SCHEMA_KEY = "artworkSchema";
// Bump when the cached artwork shape changes so older caches are wiped on load.
const SCHEMA_VERSION = 1;
const POOL_TTL_MS = 7 * 24 * 60 * 60 * 1000; // Refresh the cross-museum pool weekly.
const MAX_POOL_STORE = 400;

const backdropLayers = [...document.querySelectorAll(".backdrop")];
const artworkLayers = [...document.querySelectorAll(".artwork")];
const captionEl = document.getElementById("caption");
const captionTitle = document.getElementById("caption-title");
const captionArtist = document.getElementById("caption-artist");
const captionMeta = document.getElementById("caption-meta");
const aboutWrap = document.getElementById("about");
const aboutStory = document.getElementById("about-story");
const aboutSource = document.getElementById("about-source");
const aboutFactsWrap = document.getElementById("about-facts-wrap");
const aboutFacts = document.getElementById("about-facts");
const shuffleButton = document.getElementById("shuffle");
const spinner = document.getElementById("spinner");
const errorEl = document.getElementById("error");

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let pool = []; // All known artworks (seed, then the fetched cross-museum pool).
let queue = []; // Shuffled artworks not yet shown.
let recentIds = []; // Avoid repeating recently-seen pieces this session.
let activeLayer = 0;
let isTransitioning = false;
let poolRefreshing = false;
let current = null; // The artwork currently on screen.
let errorRetries = 0; // Backoff counter for auto-retrying a failed load.
const storyCache = {}; // Wikidata QID -> Wikipedia lead extract (cached per session).

void init();

shuffleButton.addEventListener("click", () => void next());
// Fetch the Wikipedia blurb only when the user actually reaches for it.
aboutWrap.addEventListener("mouseenter", () => void loadStory(current));
aboutWrap.addEventListener("focusin", () => void loadStory(current));
errorEl.addEventListener("click", () => void next());
window.addEventListener("online", () => {
  if (!errorEl.hidden) void next();
});
document.addEventListener("keydown", (event) => {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === " " || event.key === "ArrowRight" || event.key.toLowerCase() === "n") {
    event.preventDefault();
    void next();
  }
});

async function init() {
  setSpinner(true);
  try {
    await migrateStorage();
    const cached = await loadPool();
    pool = cached ? cached.items : SEED;
    queue = shuffle(pool);
    await next();
    if (!cached || cached.stale) void refreshPool();
  } catch {
    showError();
  }
}

// Wipes caches from an older schema (incl. the previous Met-based caches).
async function migrateStorage() {
  const stored = await chrome.storage.local.get([SCHEMA_KEY]);
  if (stored[SCHEMA_KEY] === SCHEMA_VERSION) return;
  await chrome.storage.local.remove([
    POOL_KEY,
    "renaissancePool",
    "renaissanceSchema",
    "renaissanceArtIds",
    "renaissanceArtBuffer",
    "atlasInterpCache",
    "atlasSessionId",
  ]);
  await chrome.storage.local.set({ [SCHEMA_KEY]: SCHEMA_VERSION });
}

// Replaces the seed/stale pool with a fresh cross-museum pool from Wikidata.
async function refreshPool() {
  if (poolRefreshing) return;
  poolRefreshing = true;
  try {
    const fetched = await fetchPool();
    if (fetched.length >= 12) {
      pool = fetched;
      queue = shuffle(pool);
      await savePool(pool);
    }
  } catch {
    // Best-effort — the seed keeps the page working.
  } finally {
    poolRefreshing = false;
  }
}

// Draws the next artwork: keeps the current piece on screen until the new one's
// image is loaded, then crossfades. Skips any piece whose image won't load.
async function next() {
  if (isTransitioning) return;
  isTransitioning = true;
  setError(false);
  if (!current) setSpinner(true); // Nothing on screen yet (cold load / retry).
  setShuffleLoading(true);

  try {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const art = takeNext();
      if (!art) {
        showError();
        return;
      }
      try {
        await preload(imageUrl(art, sharpWidth()));
        await render(art);
        rememberId(art.id);
        void prefetchNext();
        return;
      } catch {
        continue; // Bad image or render failure — try the next candidate.
      }
    }
    showError();
  } finally {
    setShuffleLoading(false);
    isTransitioning = false;
  }
}

// Pulls the next not-recently-shown artwork, reshuffling the pool when the queue
// runs dry.
function takeNext() {
  let index = queue.findIndex((art) => !recentIds.includes(art.id));
  if (index === -1) {
    queue = shuffle(pool);
    index = queue.findIndex((art) => !recentIds.includes(art.id));
    if (index === -1) index = queue.length > 0 ? 0 : -1;
  }
  if (index === -1) return null;
  return queue.splice(index, 1)[0];
}

async function render(art) {
  current = art;
  errorRetries = 0; // A successful draw clears the failure backoff.
  const nextLayer = 1 - activeLayer;
  const backdrop = backdropLayers[nextLayer];
  const image = artworkLayers[nextLayer];

  backdrop.style.backgroundImage = `url("${imageUrl(art, 600)}")`;
  image.src = imageUrl(art, sharpWidth());
  image.alt = art.title || "Painting";

  updateCaption(art);

  // Wait two frames so the freshly-set styles register before toggling the
  // active class — otherwise the crossfade can be skipped.
  await nextFrame();
  backdrop.classList.add("is-active");
  image.classList.add("is-active");
  backdropLayers[activeLayer].classList.remove("is-active");
  artworkLayers[activeLayer].classList.remove("is-active");
  activeLayer = nextLayer;

  setSpinner(false);
}

function updateCaption(art) {
  const apply = () => {
    captionTitle.textContent = art.title || "Untitled";
    captionTitle.href = art.wiki ? `${WIKIPEDIA}/wiki/${art.wiki}` : `https://www.wikidata.org/wiki/${art.id}`;
    captionArtist.textContent = art.artist || "Unknown artist";
    captionMeta.textContent = [art.date, art.museum].filter(Boolean).join(" · ");
    populateAbout(art);
  };

  if (captionEl.dataset.visible === "true" && !prefersReducedMotion) {
    captionEl.dataset.visible = "false";
    window.setTimeout(() => {
      apply();
      captionEl.dataset.visible = "true";
    }, 220);
  } else {
    apply();
    captionEl.dataset.visible = "true";
  }
}

// Warms the browser cache for the next queued image so shuffle feels instant.
async function prefetchNext() {
  const upcoming = queue.find((art) => !recentIds.includes(art.id));
  if (!upcoming) return;
  try {
    await preload(imageUrl(upcoming, sharpWidth()));
  } catch {
    // Non-fatal — it'll just load on demand.
  }
}

// --- About panel ---------------------------------------------------------

function populateAbout(art) {
  const story = storyCache[art.id];
  aboutStory.textContent = story || composeFallbackStory(art);
  aboutSource.textContent = story ? "Wikipedia" : "";
  aboutSource.hidden = !story;

  const facts = buildFacts(art);
  aboutFacts.textContent = "";
  for (const fact of facts) {
    const row = document.createElement("li");
    const label = document.createElement("b");
    label.textContent = fact.label;
    const value = document.createElement("span");
    value.textContent = fact.value;
    row.append(label, value);
    aboutFacts.append(row);
  }
  aboutFactsWrap.hidden = facts.length === 0;
}

function buildFacts(art) {
  const facts = [];
  if (art.genre) facts.push({ label: "Genre", value: capitalize(firstItems(art.genre, 2)) });
  if (art.medium) facts.push({ label: "Medium", value: capitalize(art.medium) });
  const size = dimensions(art);
  if (size) facts.push({ label: "Size", value: size });
  return facts;
}

function composeFallbackStory(art) {
  const bits = [];
  if (art.artist && art.artist !== "Unknown artist") bits.push(`By ${art.artist}`);
  if (art.date) bits.push(bits.length ? art.date : `Painted ${art.date}`);
  if (bits.length === 0) return art.title || "";
  return `${bits.join(", ")}.`;
}

// Resolves the painting's Wikipedia lead (its article slug rides along in the
// pool), caches it, and shows it if the same piece is still on screen.
async function loadStory(art) {
  if (!art?.id || !art.wiki) return;
  if (storyCache[art.id] !== undefined) {
    applyStory(art, storyCache[art.id]);
    return;
  }
  try {
    const story = await fetchStory(art.wiki);
    storyCache[art.id] = story;
    applyStory(art, story);
  } catch {
    // Keep the metadata fallback.
  }
}

function applyStory(art, story) {
  if (!story || current?.id !== art.id) return;
  aboutStory.textContent = story;
  aboutSource.textContent = "Wikipedia";
  aboutSource.hidden = false;
}

async function fetchStory(wiki) {
  // `wiki` is already a URL-path-safe article slug from the pool query.
  const summary = await fetchJson(`${WIKIPEDIA}/api/rest_v1/page/summary/${wiki}`, { retries: 1 });
  return truncate(tidyProse(clean(summary?.extract)), 460);
}

// --- Data ----------------------------------------------------------------

async function fetchPool() {
  const url = `${SPARQL_ENDPOINT}?format=json&query=${encodeURIComponent(POOL_QUERY)}`;
  const data = await fetchJson(url, { retries: 2, timeout: 25000 });
  const rows = Array.isArray(data?.results?.bindings) ? data.results.bindings : [];
  const seen = new Set();
  const artworks = [];
  for (const row of rows) {
    const art = normalizeRow(row);
    if (art && !seen.has(art.id)) {
      seen.add(art.id);
      artworks.push(art);
    }
  }
  return artworks;
}

function normalizeRow(row) {
  const value = (key) => (row && row[key] && typeof row[key].value === "string" ? row[key].value : "");
  const id = value("item").split("/").pop();
  const file = value("image").replace(/^https?:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\//i, "");
  const wiki = value("article").split("/wiki/").pop();
  if (!/^Q\d+$/.test(id) || !file || !wiki) return null;
  return {
    id,
    file,
    wiki,
    title: clean(value("title")) || "Untitled",
    artist: clean(value("artist")) || "Unknown artist",
    date: clean(value("year")),
    museum: clean(value("museum")),
    genre: clean(value("genre")),
    medium: clean(value("medium")),
    height: clean(value("height")),
    width: clean(value("width")),
  };
}

// --- Storage -------------------------------------------------------------

async function loadPool() {
  const stored = await chrome.storage.local.get([POOL_KEY]);
  const entry = stored[POOL_KEY];
  if (!entry || !Array.isArray(entry.items) || entry.items.length === 0) return null;
  const fresh = typeof entry.fetchedAt === "number" && Date.now() - entry.fetchedAt < POOL_TTL_MS;
  return { items: entry.items, stale: !fresh };
}

async function savePool(items) {
  await chrome.storage.local.set({ [POOL_KEY]: { items: items.slice(0, MAX_POOL_STORE), fetchedAt: Date.now() } });
}

// --- Helpers -------------------------------------------------------------

function imageUrl(art, width) {
  return `${COMMONS_FILEPATH}${art.file}?width=${width}`;
}

function sharpWidth() {
  const dpr = window.devicePixelRatio || 1;
  return Math.min(2000, Math.max(1000, Math.round(window.innerWidth * dpr * 0.9)));
}

// Fetches JSON with a timeout and retries (Wikidata/Wikipedia can throttle or
// time out). Returns null on a definitive client error or after exhausting
// retries; retries on network errors, timeouts, 429s, and 5xx.
async function fetchJson(url, { retries = 2, timeout = 12000 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (response.ok) return await response.json();
      if (response.status !== 429 && response.status < 500) return null;
    } catch {
      // Network failure or timeout — fall through to retry.
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) await delay(600 * (attempt + 1));
  }
  return null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function preload(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(url);
    image.onerror = () => reject(new Error("Image failed to load."));
    image.src = url;
  });
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function rememberId(id) {
  recentIds = [id, ...recentIds.filter((value) => value !== id)].slice(0, 12);
}

// Resolves on the next paint, but with a timer fallback: requestAnimationFrame
// is paused while a tab is hidden (e.g. a new tab opened in the background), and
// without the fallback render() would hang there and never crossfade in.
function nextFrame() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    requestAnimationFrame(() => requestAnimationFrame(finish));
    setTimeout(finish, 100);
  });
}

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function capitalize(value) {
  const text = clean(value);
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function firstItems(list, count) {
  return clean(list)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, count)
    .join(", ");
}

function dimensions(art) {
  const h = trimNumber(art.height);
  const w = trimNumber(art.width);
  if (!h || !w) return "";
  return `${h} × ${w} cm`;
}

function trimNumber(value) {
  const number = Number.parseFloat(value);
  if (!Number.isFinite(number)) return "";
  return String(Math.round(number * 10) / 10);
}

function truncate(text, max) {
  if (!text || text.length <= max) return text || "";
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return `${slice.slice(0, lastSpace > 0 ? lastSpace : max).trimEnd()}…`;
}

// Wikipedia plaintext extracts can leave a sentence butted against the next
// where a citation marker was stripped ("insignia.Behind"); re-space those.
function tidyProse(text) {
  return clean(text).replace(/([a-z0-9][.!?])([A-Z])/g, "$1 $2");
}

function setSpinner(visible) {
  spinner.dataset.visible = visible ? "true" : "false";
}

function setShuffleLoading(loading) {
  shuffleButton.disabled = loading;
  if (loading) {
    shuffleButton.dataset.loading = "true";
  } else {
    delete shuffleButton.dataset.loading;
  }
}

function setError(visible) {
  errorEl.hidden = !visible;
}

function showError() {
  setSpinner(false);
  setError(true);
  setShuffleLoading(false); // Keep the shuffle button usable so "draw another" works.
  if (errorRetries < 3) {
    errorRetries += 1;
    window.setTimeout(() => {
      if (!errorEl.hidden) void next();
    }, 3000 * errorRetries);
  }
}
