import AVFoundation
import SwiftUI

// MARK: - Models

struct WikiLookupSummary {
    let title: String
    let extract: String
    let articleURL: URL?
    let thumbnailURL: URL?
    let originalImageURL: URL?
}

struct WikiLookupState {
    enum Status {
        case loading
        case ready
        case notFound
    }

    let query: String
    var status: Status
    var summary: WikiLookupSummary?
    /// Full article intro, loaded lazily when the user expands the card.
    var fullExtract: String?
    var isExpanded = false
    var isLoadingFullExtract = false
    var isSpeaking = false

    var googleSearchURL: URL? {
        var components = URLComponents(string: "https://www.google.com/search")
        components?.queryItems = [URLQueryItem(name: "q", value: query)]
        return components?.url
    }
}

// MARK: - Client

enum WikipediaLookupClient {
    struct SearchHit: Decodable {
        let title: String
        let key: String
        let description: String?
    }

    private struct SearchResponse: Decodable {
        let pages: [SearchHit]
    }

    private struct SummaryResponse: Decodable {
        struct ImageRef: Decodable {
            let source: String
        }

        struct ContentURLs: Decodable {
            struct Desktop: Decodable {
                let page: String
            }

            let desktop: Desktop
        }

        let title: String
        let extract: String?
        let thumbnail: ImageRef?
        let originalimage: ImageRef?
        let content_urls: ContentURLs?
    }

    private struct ExtractResponse: Decodable {
        struct Query: Decodable {
            struct PageValue: Decodable {
                let extract: String?
            }

            let pages: [String: PageValue]
        }

        let query: Query?
    }

    static func search(_ query: String, limit: Int = 3) async throws -> [SearchHit] {
        var components = URLComponents(string: "https://en.wikipedia.org/w/rest.php/v1/search/page")
        components?.queryItems = [
            URLQueryItem(name: "q", value: query),
            URLQueryItem(name: "limit", value: String(limit)),
        ]
        guard let url = components?.url else { return [] }
        let (data, _) = try await URLSession.shared.data(from: url)
        return try JSONDecoder().decode(SearchResponse.self, from: data).pages
    }

    static func summary(forTitle title: String) async throws -> WikiLookupSummary? {
        let encoded =
            title.replacingOccurrences(of: " ", with: "_")
                .addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? title
        guard let url = URL(string: "https://en.wikipedia.org/api/rest_v1/page/summary/\(encoded)") else { return nil }
        let (data, response) = try await URLSession.shared.data(from: url)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        let decoded = try JSONDecoder().decode(SummaryResponse.self, from: data)
        guard let extract = decoded.extract, !extract.isEmpty else { return nil }
        return WikiLookupSummary(
            title: decoded.title,
            extract: extract,
            articleURL: decoded.content_urls.flatMap { URL(string: $0.desktop.page) },
            thumbnailURL: decoded.thumbnail.flatMap { URL(string: $0.source) },
            originalImageURL: decoded.originalimage.flatMap { URL(string: $0.source) }
        )
    }

    /// Full plain-text intro section via the action API — longer than the
    /// summary endpoint's extract, used by the card's "Expand" action.
    static func fullIntro(forTitle title: String) async throws -> String? {
        var components = URLComponents(string: "https://en.wikipedia.org/w/api.php")
        components?.queryItems = [
            URLQueryItem(name: "action", value: "query"),
            URLQueryItem(name: "prop", value: "extracts"),
            URLQueryItem(name: "exintro", value: "1"),
            URLQueryItem(name: "explaintext", value: "1"),
            URLQueryItem(name: "format", value: "json"),
            URLQueryItem(name: "formatversion", value: "1"),
            URLQueryItem(name: "redirects", value: "1"),
            URLQueryItem(name: "titles", value: title),
        ]
        guard let url = components?.url else { return nil }
        let (data, _) = try await URLSession.shared.data(from: url)
        let decoded = try JSONDecoder().decode(ExtractResponse.self, from: data)
        let extract = decoded.query?.pages.values.first?.extract?.trimmingCharacters(in: .whitespacesAndNewlines)
        return (extract?.isEmpty ?? true) ? nil : extract
    }
}

// MARK: - Card view

struct WikiLookupCardContent: View {
    @ObservedObject var store: MeetingStore
    let theme: CopilotThemeTokens

    var body: some View {
        if let lookup = store.wikiLookup {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .center, spacing: 8) {
                    Text("Lookup".uppercased())
                        .font(.custom("Figtree", size: 10).weight(.medium))
                        .foregroundStyle(theme.textTertiary)
                    Spacer()
                    Button {
                        store.dismissWikiLookup()
                    } label: {
                        AtlasIcon(.cancel)
                            .frame(width: 10, height: 10)
                            .foregroundStyle(theme.textTertiary)
                    }
                    .buttonStyle(.plain)
                }

                switch lookup.status {
                case .loading:
                    Text("Looking up \(lookup.query)…")
                        .font(.custom("Figtree", size: 12))
                        .foregroundStyle(theme.textSecondary)
                case .notFound:
                    Text("No Wikipedia article found for “\(lookup.query)”.")
                        .font(.custom("Figtree", size: 12))
                        .foregroundStyle(theme.textSecondary)
                    if let googleURL = lookup.googleSearchURL {
                        Button("Search Google") {
                            NSWorkspace.shared.open(googleURL)
                        }
                        .buttonStyle(DragonFruitSecondaryButtonStyle(theme: theme))
                    }
                case .ready:
                    if let summary = lookup.summary {
                        readyBody(lookup: lookup, summary: summary)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func readyBody(lookup: WikiLookupState, summary: WikiLookupSummary) -> some View {
        HStack(alignment: .top, spacing: 8) {
            if let thumbnail = summary.thumbnailURL, !lookup.isExpanded {
                AsyncImage(url: thumbnail) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    theme.layer1
                }
                .frame(width: 40, height: 40)
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(summary.title)
                    .font(.custom("Figtree", size: 13).weight(.semibold))
                    .foregroundStyle(theme.textPrimary)
                Text("Wikipedia")
                    .font(.custom("Figtree", size: 10))
                    .foregroundStyle(theme.textTertiary)
            }
            Spacer(minLength: 0)
        }

        if lookup.isExpanded, let imageURL = summary.originalImageURL ?? summary.thumbnailURL {
            AsyncImage(url: imageURL) { image in
                image.resizable().scaledToFit()
            } placeholder: {
                theme.layer1.frame(height: 80)
            }
            .frame(maxWidth: .infinity)
            .frame(maxHeight: 140)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }

        ScrollView(.vertical) {
            Text(displayedExtract(lookup: lookup, summary: summary))
                .font(.custom("Figtree", size: 12))
                .foregroundStyle(theme.textSecondary)
                .lineSpacing(2)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(maxHeight: lookup.isExpanded ? 220 : 76)

        HStack(spacing: 8) {
            Button(lookup.isExpanded ? "Collapse" : (lookup.isLoadingFullExtract ? "Loading…" : "Expand")) {
                store.toggleWikiLookupExpanded()
            }
            .buttonStyle(DragonFruitSecondaryButtonStyle(theme: theme))
            .disabled(lookup.isLoadingFullExtract)

            Button(lookup.isSpeaking ? "Stop" : "Read aloud") {
                store.toggleWikiLookupSpeech()
            }
            .buttonStyle(DragonFruitSecondaryButtonStyle(theme: theme))

            if let articleURL = summary.articleURL {
                Button("Full article") {
                    NSWorkspace.shared.open(articleURL)
                }
                .buttonStyle(DragonFruitSecondaryButtonStyle(theme: theme))
            }

            Spacer(minLength: 0)
        }
    }

    private func displayedExtract(lookup: WikiLookupState, summary: WikiLookupSummary) -> String {
        if lookup.isExpanded, let full = lookup.fullExtract { return full }
        return summary.extract
    }
}
