import AuthenticationServices
import SwiftUI

enum MeetingState: String {
    case upcoming = "Upcoming"
    case recording = "Recording"
    case summary = "Summary"
}

struct MeetingInfo: Identifiable {
    let id = UUID()
    let title: String
    let startAt: Date
}

final class MeetingStore: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    @Published var baseURL = "http://localhost:8000"
    @Published var appURL = "https://app.dragonfruit.sh"
    @Published var isAuthenticated = false
    @Published var googleConnected = false
    @Published var googleCode = ""
    @Published var statusMessage = ""
    @Published var state: MeetingState = .upcoming
    @Published var autoStartEnabled = true
    @Published var autoStartMinutesBefore = 2
    @Published var meeting = MeetingInfo(title: "Acme weekly product sync", startAt: .now.addingTimeInterval(60 * 5))
    @Published var summary = ""

    private var timer: Timer?
    private var events: [CalendarEvent] = []
    private var oauthSession: ASWebAuthenticationSession?
    private var loginPollTask: Task<Void, Never>?
    private var apiToken: String = ""

    override init() {
        super.init()
        let defaults = UserDefaults.standard
        baseURL = defaults.string(forKey: "df_base_url") ?? "http://localhost:8000"
        appURL = defaults.string(forKey: "df_app_url") ?? "https://app.dragonfruit.sh"
        apiToken = defaults.string(forKey: "df_api_token") ?? ""

        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.tick()
            }
        }
    }

    var countdownLabel: String {
        if let first = events.first, let date = ISO8601DateFormatter().date(from: first.start) {
            let delta = Int(date.timeIntervalSinceNow)
            if delta > 0 {
                return "in \(max(1, delta / 60))m"
            }
        }
        let delta = Int(meeting.startAt.timeIntervalSinceNow)
        if delta <= 0 { return "Starting now" }
        let mins = delta / 60
        if mins >= 60 { return "in \(mins / 60)h \(mins % 60)m" }
        return "in \(mins)m"
    }

    func toggleRecording() {
        if state == .recording {
            state = .summary
            summary = "• Discussed roadmap priorities\n• Decision: ship notes importer first\n• Action: create 3 tasks in DragonFruit"
        } else {
            state = .recording
        }
    }

    private func tick() {
        guard autoStartEnabled, state != .recording else { return }
        let trigger = meeting.startAt.addingTimeInterval(Double(-autoStartMinutesBefore * 60))
        if Date() >= trigger, Date() < meeting.startAt.addingTimeInterval(30) {
            state = .recording
        }
    }

    private func makeClient() throws -> APIClient {
        guard let url = URL(string: baseURL.trimmingCharacters(in: .whitespacesAndNewlines)) else {
            throw NSError(domain: "DragonFruitNative", code: 2001, userInfo: [NSLocalizedDescriptionKey: "Invalid base URL"])
        }
        return APIClient(baseURL: url, apiToken: apiToken.isEmpty ? nil : apiToken)
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        NSApplication.shared.windows.first ?? ASPresentationAnchor()
    }

    func beginDragonFruitLogin() async {
        do {
            let appHost = appURL.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            guard var components = URLComponents(string: "\(appHost)/login") else {
                throw NSError(domain: "DragonFruitNative", code: 5, userInfo: [NSLocalizedDescriptionKey: "Invalid app URL"])
            }
            components.queryItems = [
                URLQueryItem(name: "next_path", value: "dragonfruitmini://auth/login-callback"),
            ]
            guard let loginURL = components.url else {
                throw NSError(domain: "DragonFruitNative", code: 5, userInfo: [NSLocalizedDescriptionKey: "Invalid app URL"])
            }
            statusMessage = "Continue sign in to return here automatically..."
            let session = ASWebAuthenticationSession(url: loginURL, callbackURLScheme: "dragonfruitmini") { [weak self] callbackURL, error in
                guard let self else { return }
                if let error {
                    Task { @MainActor in self.statusMessage = error.localizedDescription }
                    self.startLoginPolling()
                    return
                }
                guard let callbackURL else {
                    Task { @MainActor in self.statusMessage = "Missing login callback" }
                    self.startLoginPolling()
                    return
                }
                Task { @MainActor in
                    await self.finishDragonFruitLogin(callbackURL: callbackURL)
                }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            oauthSession = session
            _ = session.start()
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    private func finishDragonFruitLogin(callbackURL: URL) async {
        guard callbackURL.scheme == "dragonfruitmini" else {
            statusMessage = "Unexpected callback URL"
            return
        }
        if let components = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false),
           let token = components.queryItems?.first(where: { $0.name == "api_token" })?.value,
           !token.isEmpty
        {
            apiToken = token
            UserDefaults.standard.set(token, forKey: "df_api_token")
        }
        do {
            let client = try makeClient()
            _ = try await client.getCurrentUser()
            isAuthenticated = true
            UserDefaults.standard.set(baseURL, forKey: "df_base_url")
            UserDefaults.standard.set(appURL, forKey: "df_app_url")
            statusMessage = "Signed in to DragonFruit"
            await refreshCalendar()
        } catch {
            isAuthenticated = false
            statusMessage = "Login finished, but API session is missing. Please retry."
        }
    }

    private func startLoginPolling() {
        loginPollTask?.cancel()
        loginPollTask = Task { [weak self] in
            guard let self else { return }
            for _ in 0..<60 {
                if Task.isCancelled { return }
                do {
                    let client = try self.makeClient()
                    _ = try await client.getCurrentUser()
                    await MainActor.run {
                        self.isAuthenticated = true
                        UserDefaults.standard.set(self.baseURL, forKey: "df_base_url")
                        UserDefaults.standard.set(self.appURL, forKey: "df_app_url")
                        self.statusMessage = "Signed in to DragonFruit"
                    }
                    await self.refreshCalendar()
                    return
                } catch {
                    try? await Task.sleep(nanoseconds: 1_000_000_000)
                }
            }
            await MainActor.run {
                if !self.isAuthenticated {
                    self.statusMessage = "Login complete on web? Click again to retry sync."
                }
            }
        }
    }

    func refreshCalendar() async {
        guard isAuthenticated else { return }
        do {
            let client = try makeClient()
            let accounts = try await client.listCalendarAccounts()
            googleConnected = !accounts.isEmpty
            if let account = accounts.first {
                let from = ISO8601DateFormatter().string(from: .now)
                let to = ISO8601DateFormatter().string(from: .now.addingTimeInterval(60 * 60 * 24))
                events = try await client.getEvents(accountId: account.id, fromISO: from, toISO: to)
                if let event = events.first {
                    let startDate = ISO8601DateFormatter().date(from: event.start) ?? .now.addingTimeInterval(300)
                    meeting = MeetingInfo(title: event.title.isEmpty ? "Untitled meeting" : event.title, startAt: startDate)
                }
            }
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    func beginGoogleConnect() async {
        do {
            let client = try makeClient()
            let authorizeURL = try await client.startGoogleOAuth()
            statusMessage = "Opened Google OAuth in browser"
            if let url = URL(string: authorizeURL) {
                NSWorkspace.shared.open(url)
            }
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    func finishGoogleConnect() async {
        guard !googleCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        do {
            let client = try makeClient()
            try await client.finishGoogleOAuth(code: googleCode.trimmingCharacters(in: .whitespacesAndNewlines))
            statusMessage = "Google connected"
            googleCode = ""
            await refreshCalendar()
        } catch {
            statusMessage = error.localizedDescription
        }
    }
}

struct MeetingPopoverView: View {
    @StateObject private var store = MeetingStore()

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                if let logo = BrandTheme.logo {
                    Image(nsImage: logo)
                        .resizable()
                        .scaledToFit()
                        .frame(height: 16)
                        .foregroundStyle(Color.gray.opacity(0.7))
                        .opacity(0.7)
                }
                Spacer()
                Text("Copilot")
                    .font(.custom("Figtree", size: 12).weight(.medium))
                    .foregroundStyle(BrandTheme.labelLight)
            }

            if !store.isAuthenticated {
                card {
                    Text("Login to DragonFruit")
                        .font(.custom("Figtree", size: 12).weight(.medium))
                        .foregroundStyle(BrandTheme.labelLight)
                    Button("Continue with DragonFruit") {
                        Task { await store.beginDragonFruitLogin() }
                    }
                    .buttonStyle(DragonFruitPrimaryButtonStyle())
                    Text("Sign in on the web to sync meetings and cowork with your agent. You’ll return here automatically.")
                        .font(.custom("Figtree", size: 11).weight(.medium))
                        .foregroundStyle(BrandTheme.labelLight)
                }
            } else {
                card {
                    labelRow("Settings", value: "Open")
                    Text("Calendar connected and voice capture ready.")
                        .font(.custom("Figtree", size: 12).weight(.medium))
                        .foregroundStyle(BrandTheme.labelLight)
                }
            }

            if store.isAuthenticated {
                card {
                    labelRow("Upcoming meeting", value: store.countdownLabel)
                    Text(store.meeting.title)
                        .font(.custom("Newsreader", size: 18).weight(.medium))
                        .lineSpacing(0)
                        .lineLimit(2)
                }
            }

            if !store.statusMessage.isEmpty {
                Text(store.statusMessage)
                    .font(.custom("Figtree", size: 11).weight(.medium))
                    .foregroundStyle(BrandTheme.textSecondary)
            }
        }
        .padding(12)
        .background(BrandTheme.surface)
        .preferredColorScheme(.light)
    }

    @ViewBuilder
    private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            content()
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(BrandTheme.card)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(BrandTheme.border, lineWidth: 1)
        )
    }

    @ViewBuilder
    private func labelRow(_ label: String, value: String) -> some View {
        HStack {
            Text(label.uppercased())
                .font(.custom("Figtree", size: 10).weight(.semibold))
                .foregroundStyle(BrandTheme.labelLight)
            Spacer()
            Text(value)
                .font(.custom("Figtree", size: 11).weight(.medium))
                .foregroundStyle(BrandTheme.textSecondary)
        }
    }
}
