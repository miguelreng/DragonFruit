import AuthenticationServices
import ApplicationServices
import AppKit
import AVFoundation
import Carbon
import Foundation
import os
import Speech
import SwiftUI
import UserNotifications

struct MeetingInfo: Identifiable {
    let id: String
    let eventId: String
    let title: String
    let startAt: Date
    let endAt: Date
    let description: String
    let location: String
    let htmlLink: String?
    let hangoutLink: String?
    let accountId: String?
    let accountEmail: String?
    let calendarId: String?
    let calendarName: String?

    var joinURL: URL? {
        let candidates = [hangoutLink, location, description, htmlLink].compactMap { $0 }
        for candidate in candidates {
            if let url = Self.extractJoinURL(from: candidate) {
                return url
            }
        }
        return nil
    }

    var calendarDisplayName: String {
        let candidate = calendarName ?? accountEmail ?? ""
        let normalized = candidate.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if ["personal", "personal calendar"].contains(normalized) {
            return ""
        }
        return candidate
    }

    private static func extractJoinURL(from text: String) -> URL? {
        let patterns = [
            #"https://meet\.google\.com/[A-Za-z0-9\-_/?=&%.]+"#,
            #"https://(?:[A-Za-z0-9\-]+\.)?zoom\.us/j/[A-Za-z0-9\-_/?=&%.]+"#,
        ]
        for pattern in patterns {
            if let range = text.range(of: pattern, options: .regularExpression) {
                return URL(string: String(text[range]))
            }
        }
        return nil
    }

    static var empty: MeetingInfo {
        MeetingInfo(
            id: "empty",
            eventId: "empty",
            title: "No meeting yet",
            startAt: .now,
            endAt: .now,
            description: "",
            location: "",
            htmlLink: nil,
            hangoutLink: nil,
            accountId: nil,
            accountEmail: nil,
            calendarId: nil,
            calendarName: nil
        )
    }
}

enum VoiceCaptureType: String {
    case task = "Task"
    case doc = "Doc"
    case sticky = "Sticky"
    case agent = "Agent"
}

enum VoiceCaptureMode {
    case intent
    case copilot
    case dictation
}

struct VoiceCaptureResult: Identifiable {
    let id = UUID()
    let type: VoiceCaptureType
    let projectHint: String
    let title: String
    let body: String
}

struct RoutingTarget {
    let workspaceSlug: String
    let projectId: String?
    let projectName: String?
}

struct AgentRoutingTarget {
    let workspaceSlug: String
    let agentId: String
    let agentName: String
}

struct AgentOption: Identifiable, Hashable {
    let id: String
    let name: String
    let workspaceSlug: String
}

struct PermissionStatus: Identifiable {
    let id: String
    let name: String
    let state: String
}

@MainActor
final class MeetingStore: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    private static let logger = Logger(subsystem: "sh.dragonfruit.copilot", category: "store")

    @Published var baseURL = "https://api.dragonfruit.sh"
    @Published var appURL = "https://app.dragonfruit.sh"
    @Published var statusMessage = ""

    @Published var isRestoringSession = false
    @Published var isAuthenticated = false
    @Published var googleConnected = false
    @Published var needsCalendarReconnect = false

    @Published var meeting = MeetingInfo.empty
    @Published var meetings: [MeetingInfo] = []
    @Published var hasMeetingsToday = false
    @Published var meetingState = "Upcoming"
    @Published var autoStartEnabled = true
    @Published var autoStartMinutesBefore = 2
    @Published var meetingNotesEnabled = true
    @Published var speechCaptureEnabled = true
    @Published var cursorBuddyEnabled = true
    @Published var gazeTrackingEnabled = false
    @Published var isListening = false
    @Published var isMeetingRecording = false
    @Published var meetingNotesTranscript = ""
    @Published var lastMeetingNotesURL: URL?
    @Published var lastSavedMeetingTitle = ""
    @Published var lastTranscript = ""
    @Published var lastCapture: VoiceCaptureResult?
    @Published var lastAgentTextResponse = ""
    @Published var isAgentResponding = false
    @Published var availableAgents: [AgentOption] = []
    @Published var selectedAgentId = ""
    @Published private var permissionsRefreshCounter = 0

    private var oauthSession: ASWebAuthenticationSession?
    private var loginPollTask: Task<Void, Never>?
    private var calendarPollTask: Task<Void, Never>?
    private var meetingRefreshTask: Task<Void, Never>?
    private var apiToken: String = ""
    private let speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "es-ES"))
    private let audioEngine = AVAudioEngine()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var isInputTapInstalled = false
    private var recordingMeeting: MeetingInfo?
    private var notifiedMeetingIds: Set<String> = []
    private var actionHotKeyRef: EventHotKeyRef?
    private var dictationHotKeyRef: EventHotKeyRef?
    private var hotKeyEventHandlerRef: EventHandlerRef?
    private var lastRoutingTarget: RoutingTarget?
    private var activeAgentSessionByWorkspace: [String: String] = [:]
    private var agentTypingTask: Task<Void, Never>?
    private var voiceCaptureMode: VoiceCaptureMode = .intent
    private var isStartingVoiceCapture = false
    private var pendingVoiceTranscript = ""
    private var voiceTranscriptFlushTask: Task<Void, Never>?

    override init() {
        super.init()
        let defaults = UserDefaults.standard
        let savedBaseURL = defaults.string(forKey: "df_base_url")
        baseURL = savedBaseURL?.contains("localhost") == true ? "https://api.dragonfruit.sh" : (savedBaseURL ?? "https://api.dragonfruit.sh")
        appURL = defaults.string(forKey: "df_app_url") ?? "https://app.dragonfruit.sh"
        apiToken = defaults.string(forKey: "df_api_token") ?? ""
        isRestoringSession = !apiToken.isEmpty
        Self.logger.info("DragonFruit store initialized. savedToken=\(!self.apiToken.isEmpty, privacy: .public)")
        setupHotkey()
        if !apiToken.isEmpty {
            Task { @MainActor in
                await restoreSession()
            }
        }
    }

    var countdownLabel: String {
        if needsCalendarReconnect { return "Reconnect" }
        if !googleConnected { return "Connect" }
        if !hasMeetingsToday, meeting.id != "empty" { return "Next up" }
        if meeting.id == "empty" { return "No meetings" }
        let delta = Int(meeting.startAt.timeIntervalSinceNow)
        if Date() >= meeting.startAt && Date() <= meeting.endAt { return "Happening now" }
        if delta <= 0 { return "Starting now" }
        return "in \(max(1, delta / 60))m"
    }

    var nextUpCountdownLabel: String {
        if needsCalendarReconnect { return "Reconnect" }
        if !googleConnected { return "Connect" }
        if meeting.id == "empty" { return "No meetings" }
        let delta = Int(meeting.startAt.timeIntervalSinceNow)
        if Date() >= meeting.startAt && Date() <= meeting.endAt { return "Happening now" }
        if delta <= 0 { return "Starting now" }
        return "in \(max(1, delta / 60))m"
    }

    var permissionStatuses: [PermissionStatus] {
        [
            PermissionStatus(id: "login", name: "DragonFruit", state: isAuthenticated ? "Connected" : "Sign in"),
            PermissionStatus(id: "mic", name: "Microphone", state: microphonePermissionLabel),
            PermissionStatus(id: "speech", name: "Speech", state: speechPermissionLabel),
            PermissionStatus(id: "accessibility", name: "Dictation", state: accessibilityPermissionLabel),
        ]
    }

    private var microphonePermissionLabel: String {
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized:
            return "Allowed"
        case .denied, .restricted:
            return "Blocked"
        case .notDetermined:
            return "Ask"
        @unknown default:
            return "Unknown"
        }
    }

    private var speechPermissionLabel: String {
        switch SFSpeechRecognizer.authorizationStatus() {
        case .authorized:
            return "Allowed"
        case .denied, .restricted:
            return "Blocked"
        case .notDetermined:
            return "Ask"
        @unknown default:
            return "Unknown"
        }
    }

    private var accessibilityPermissionLabel: String {
        AXIsProcessTrusted() ? "Allowed" : "Needed"
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        NSApplication.shared.windows.first ?? ASPresentationAnchor()
    }

    func refreshPermissionStatuses() {
        permissionsRefreshCounter += 1
    }

    func requestVoicePermissions() {
        Task { @MainActor in
            _ = await Self.requestSpeechAuthorization()
            _ = await Self.requestMicrophonePermission()
            refreshPermissionStatuses()
        }
    }

    func openAccessibilitySettings() {
        Self.requestAccessibilityPermissionIfNeeded()
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") {
            NSWorkspace.shared.open(url)
        }
        refreshPermissionStatuses()
    }

    func restoreSession() async {
        isRestoringSession = true
        Self.logger.info("Restoring DragonFruit session")
        do {
            let client = try makeClient()
            _ = try await client.getCurrentUser()
            isAuthenticated = true
            isRestoringSession = false
            statusMessage = "Signed in to DragonFruit"
            startPostLoginRefresh()
        } catch {
            Self.logger.error("Session restore failed: \(error.localizedDescription, privacy: .public)")
            clearSavedSession(message: "")
            isRestoringSession = false
        }
    }

    func toggleRecording() {
        if isMeetingRecording {
            Task { await stopMeetingRecordingAndSave() }
        } else {
            guard meetingNotesEnabled else {
                statusMessage = "Turn on meeting notes in Settings first."
                return
            }
            Task { await startMeetingRecording() }
        }
    }

    func openJoinLink() {
        guard let url = meeting.joinURL else {
            statusMessage = "No meeting link found yet."
            return
        }
        NSWorkspace.shared.open(url)
    }

    func openMeetingNotes() {
        guard let url = lastMeetingNotesURL else {
            statusMessage = "No meeting notes draft saved yet."
            return
        }
        NSWorkspace.shared.open(url)
    }

    func logout() {
        loginPollTask?.cancel()
        calendarPollTask?.cancel()
        meetingRefreshTask?.cancel()
        if isListening {
            stopVoiceCapture()
        }
        if isMeetingRecording {
            stopAudioCapture()
            isMeetingRecording = false
            meetingState = "Upcoming"
        }
        clearSavedSession(message: "")
    }

    func toggleVoiceCapture() {
        toggleVoiceCapture(mode: .intent)
    }

    func toggleCopilotVoiceCapture() {
        toggleVoiceCapture(mode: .copilot)
    }

    func toggleActionVoiceCapture() {
        toggleVoiceCapture(mode: .intent)
    }

    func toggleDictationVoiceCapture() {
        guard cursorBuddyEnabled else {
            statusMessage = "Turn on dictation in Settings first."
            return
        }
        toggleVoiceCapture(mode: .dictation)
    }

    private func toggleVoiceCapture(mode: VoiceCaptureMode) {
        if isListening {
            stopVoiceCapture()
        } else {
            guard !isStartingVoiceCapture else { return }
            guard speechCaptureEnabled else {
                statusMessage = "Turn on speech capture in Settings first."
                return
            }
            Task { await startVoiceCapture(mode: mode) }
        }
    }

    func beginDragonFruitLogin() async {
        do {
            let apiHost = baseURL.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            guard var components = URLComponents(string: "\(apiHost)/auth/native/start/") else {
                throw NSError(domain: "DragonFruitNative", code: 5, userInfo: [NSLocalizedDescriptionKey: "Invalid API URL"])
            }
            components.queryItems = [
                URLQueryItem(name: "callback", value: "dragonfruitmini://auth/login-callback"),
            ]
            guard let loginURL = components.url else {
                throw NSError(domain: "DragonFruitNative", code: 5, userInfo: [NSLocalizedDescriptionKey: "Invalid API URL"])
            }

            statusMessage = "Continue sign in to return here automatically..."
            let session = ASWebAuthenticationSession(
                url: loginURL,
                callbackURLScheme: "dragonfruitmini",
                completionHandler: Self.makeLoginCompletionHandler(store: self)
            )
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            oauthSession = session
            _ = session.start()
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    nonisolated private static func makeLoginCompletionHandler(store: MeetingStore) -> (URL?, Error?) -> Void {
        { [weak store] callbackURL, error in
            Task { @MainActor in
                guard let store else { return }
                if let error {
                    store.statusMessage = error.localizedDescription
                    store.startLoginPolling()
                    return
                }
                guard let callbackURL else {
                    store.statusMessage = "Missing login callback"
                    store.startLoginPolling()
                    return
                }
                await store.finishDragonFruitLogin(callbackURL: callbackURL)
            }
        }
    }

    private func finishDragonFruitLogin(callbackURL: URL) async {
        guard callbackURL.scheme == "dragonfruitmini" else {
            statusMessage = "Unexpected callback URL"
            return
        }
        guard let components = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false),
              let token = components.queryItems?.first(where: { $0.name == "api_token" })?.value,
              !token.isEmpty
        else {
            statusMessage = "Login callback missing API token. Please try again."
            return
        }

        do {
            apiToken = token
            UserDefaults.standard.set(token, forKey: "df_api_token")
            let client = try makeClient()
            _ = try await client.getCurrentUser()
            isAuthenticated = true
            persistSettings()
            statusMessage = "Signed in to DragonFruit"
            startPostLoginRefresh()
        } catch {
            clearSavedSession(message: "Login finished, but API session is missing. Please retry.")
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
                        self.persistSettings()
                        self.statusMessage = "Signed in to DragonFruit"
                        self.startPostLoginRefresh()
                    }
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

    private func startPostLoginRefresh() {
        meetingRefreshTask?.cancel()
        statusMessage = "Signed in. Loading copilot context..."
        Task { @MainActor [weak self] in
            guard let self else { return }
            await self.refreshCalendarState()
            await self.refreshAvailableAgents()
            self.startMeetingRefreshLoop()
        }
    }

    func spawnAgentFromVoice() {
        Task { @MainActor in
            await triggerAgentPrompt("dragonfruit agent help me with what I'm doing right now")
        }
    }

    func refreshAvailableAgents() async {
        do {
            let client = try makeClient()
            let workspaces = try await client.listWorkspaces()
            var options: [AgentOption] = []
            for workspace in workspaces {
                let agents = try await client.listAgents(workspaceSlug: workspace.slug)
                for agent in agents where agent.is_enabled {
                    options.append(
                        AgentOption(
                            id: agent.id,
                            name: agent.name,
                            workspaceSlug: workspace.slug
                        )
                    )
                }
            }

            availableAgents = options
            if selectedAgentId.isEmpty || !options.contains(where: { $0.id == selectedAgentId }) {
                selectedAgentId = options.first?.id ?? ""
            }
        } catch {
            statusMessage = "Could not load agents: \(error.localizedDescription)"
        }
    }

    func refreshCalendarState() async {
        guard isAuthenticated else { return }
        do {
            let client = try makeClient()
            let accounts = try await client.listCalendarAccounts()
            googleConnected = !accounts.isEmpty
            let formatter = ISO8601DateFormatter()
            let from = formatter.string(from: .now)
            let to = formatter.string(from: .now.addingTimeInterval(7 * 24 * 60 * 60))
            let events = accounts.isEmpty ? [] : try await client.getUpcomingMeetings(fromISO: from, toISO: to)
            let errorEvents = events.filter { $0.status.lowercased() == "error" }
            let realEvents = events.filter { event in
                let status = event.status.lowercased()
                return status != "error" && status != "cancelled"
            }
            needsCalendarReconnect = !errorEvents.isEmpty && realEvents.isEmpty
            let mappedMeetings = realEvents
                .compactMap(makeMeetingInfo(from:))
                .filter { $0.joinURL != nil }
            meetings = mappedMeetings
            hasMeetingsToday = mappedMeetings.contains(where: isTodayMeeting)

            if needsCalendarReconnect {
                meeting = MeetingInfo.empty
                meetingState = "Reconnect"
                statusMessage = "Calendar needs reconnect. Open Settings."
            } else if let currentOrUpcomingToday = mappedMeetings.first(where: { isTodayMeeting($0) && $0.endAt >= .now }) {
                meeting = currentOrUpcomingToday
                updateMeetingState(for: currentOrUpcomingToday)
                notifyIfNeeded(for: currentOrUpcomingToday)
                statusMessage = "Loaded \(mappedMeetings.count) upcoming meeting\(mappedMeetings.count == 1 ? "" : "s")."
            } else if let next = mappedMeetings.first {
                meeting = next
                meetingState = hasMeetingsToday ? "Upcoming" : "Next upcoming"
                statusMessage = hasMeetingsToday ? "No more meetings today." : "No meetings today."
            } else if accounts.isEmpty {
                meeting = MeetingInfo.empty
                meetings = []
                hasMeetingsToday = false
                needsCalendarReconnect = false
                meetingState = "Connect"
                statusMessage = "Calendar not connected yet."
            } else {
                meeting = MeetingInfo.empty
                needsCalendarReconnect = false
                meetingState = "Clear"
                statusMessage = "No meetings found for the next 7 days."
            }
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    private func makeMeetingInfo(from event: CalendarEvent) -> MeetingInfo? {
        guard let start = parseCalendarDate(event.start) else { return nil }
        let end = parseCalendarDate(event.end) ?? start.addingTimeInterval(60 * 60)
        return MeetingInfo(
            id: [event.account_id, event.calendar_id, event.id].compactMap { $0 }.joined(separator: ":"),
            eventId: event.id,
            title: event.title.isEmpty ? "Untitled meeting" : event.title,
            startAt: start,
            endAt: max(end, start.addingTimeInterval(15 * 60)),
            description: event.description,
            location: event.location,
            htmlLink: event.html_link.isEmpty ? nil : event.html_link,
            hangoutLink: event.hangout_link,
            accountId: event.account_id,
            accountEmail: event.account_email,
            calendarId: event.calendar_id,
            calendarName: event.calendar_name
        )
    }

    private func isTodayMeeting(_ meeting: MeetingInfo) -> Bool {
        Calendar.current.isDate(meeting.startAt, inSameDayAs: .now)
    }

    private func updateMeetingState(for meeting: MeetingInfo) {
        let now = Date()
        if isMeetingRecording {
            meetingState = "Recording"
        } else if now >= meeting.startAt && now <= meeting.endAt {
            meetingState = "Live"
        } else if meeting.startAt.timeIntervalSince(now) <= Double(autoStartMinutesBefore * 60) {
            meetingState = "Starting"
        } else {
            meetingState = "Upcoming"
        }
    }

    private func notifyIfNeeded(for meeting: MeetingInfo) {
        guard meeting.id != "empty", !notifiedMeetingIds.contains(meeting.id) else { return }
        let secondsUntilStart = meeting.startAt.timeIntervalSinceNow
        guard secondsUntilStart >= 0, secondsUntilStart <= Double(max(1, autoStartMinutesBefore) * 60) else { return }
        notifiedMeetingIds.insert(meeting.id)
        deliverNotification(title: "Meeting starting", body: meeting.title)
    }

    private func parseCalendarDate(_ value: String) -> Date? {
        if let date = ISO8601DateFormatter().date(from: value) {
            return date
        }
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: value)
    }

    func connectGoogle() async {
        do {
            let client = try makeClient()
            let authorizeURL = try await client.startGoogleOAuth()
            statusMessage = "Finish Google Calendar setup in your browser..."
            NSWorkspace.shared.open(authorizeURL)
            startCalendarPolling()
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    private func startCalendarPolling() {
        calendarPollTask?.cancel()
        calendarPollTask = Task { [weak self] in
            guard let self else { return }
            for _ in 0..<90 {
                if Task.isCancelled { return }
                do {
                    let client = try self.makeClient()
                    let accounts = try await client.listCalendarAccounts()
                    if !accounts.isEmpty {
                        await MainActor.run {
                            self.googleConnected = true
                            self.statusMessage = "Google Calendar connected."
                        }
                        await self.refreshCalendarState()
                        await MainActor.run {
                            self.startMeetingRefreshLoop()
                        }
                        return
                    }
                } catch {
                    // Keep polling while the browser completes OAuth.
                }
                try? await Task.sleep(nanoseconds: 1_000_000_000)
            }
            await MainActor.run {
                if !self.googleConnected {
                    self.statusMessage = "Calendar still not connected. Try again from Settings."
                }
            }
        }
    }

    private func startMeetingRefreshLoop() {
        meetingRefreshTask?.cancel()
        meetingRefreshTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                await self.refreshCalendarState()
                try? await Task.sleep(nanoseconds: 60_000_000_000)
            }
        }
    }

    private func makeClient() throws -> APIClient {
        guard let url = URL(string: baseURL.trimmingCharacters(in: .whitespacesAndNewlines)) else {
            throw NSError(domain: "DragonFruitNative", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid API base URL"])
        }
        return APIClient(baseURL: url, apiToken: apiToken.isEmpty ? nil : apiToken)
    }

    private func persistCredentials() {
        let defaults = UserDefaults.standard
        defaults.set(baseURL, forKey: "df_base_url")
        defaults.set(appURL, forKey: "df_app_url")
    }

    private func persistSettings() {
        persistCredentials()
    }

    private func clearSavedSession(message: String) {
        apiToken = ""
        isAuthenticated = false
        googleConnected = false
        needsCalendarReconnect = false
        meeting = .empty
        meetings = []
        hasMeetingsToday = false
        meetingRefreshTask?.cancel()
        UserDefaults.standard.removeObject(forKey: "df_api_token")
        if !message.isEmpty {
            statusMessage = message
        }
    }

    private func setupHotkey() {
        var eventType = EventTypeSpec(
            eventClass: OSType(kEventClassKeyboard),
            eventKind: UInt32(kEventHotKeyPressed)
        )
        let installStatus = InstallEventHandler(
            GetApplicationEventTarget(),
            Self.handleCarbonHotKey,
            1,
            &eventType,
            Unmanaged.passUnretained(self).toOpaque(),
            &hotKeyEventHandlerRef
        )
        guard installStatus == noErr else {
            statusMessage = "Could not register hotkeys."
            return
        }

        registerHotKey(id: 1, modifiers: UInt32(optionKey), storage: &actionHotKeyRef)
        registerHotKey(id: 2, modifiers: UInt32(optionKey | shiftKey), storage: &dictationHotKeyRef)
    }

    private func registerHotKey(id: UInt32, modifiers: UInt32, storage: inout EventHotKeyRef?) {
        let hotKeyID = EventHotKeyID(signature: Self.hotKeySignature, id: id)
        let status = RegisterEventHotKey(
            UInt32(kVK_Space),
            modifiers,
            hotKeyID,
            GetApplicationEventTarget(),
            0,
            &storage
        )
        if status != noErr {
            statusMessage = "Could not register shortcut \(id)."
        }
    }

    nonisolated private static let hotKeySignature: OSType = 0x4452_4654

    nonisolated private static let handleCarbonHotKey: EventHandlerUPP = { _, event, userData in
        guard let event, let userData else { return OSStatus(eventNotHandledErr) }

        var hotKeyID = EventHotKeyID()
        let status = GetEventParameter(
            event,
            EventParamName(kEventParamDirectObject),
            EventParamType(typeEventHotKeyID),
            nil,
            MemoryLayout<EventHotKeyID>.size,
            nil,
            &hotKeyID
        )
        guard status == noErr, hotKeyID.signature == MeetingStore.hotKeySignature else {
            return OSStatus(eventNotHandledErr)
        }

        let store = Unmanaged<MeetingStore>.fromOpaque(userData).takeUnretainedValue()
        Task { @MainActor in
            switch hotKeyID.id {
            case 1:
                store.toggleActionVoiceCapture()
            case 2:
                store.toggleDictationVoiceCapture()
            default:
                break
            }
        }
        return noErr
    }

    nonisolated private static func focusedElementAcceptsTextInput() -> Bool {
        guard AXIsProcessTrusted() else { return false }

        let systemWideElement = AXUIElementCreateSystemWide()
        var focusedElementValue: CFTypeRef?
        let error = AXUIElementCopyAttributeValue(
            systemWideElement,
            kAXFocusedUIElementAttribute as CFString,
            &focusedElementValue
        )
        guard error == .success, let focusedElementValue else { return false }
        guard CFGetTypeID(focusedElementValue) == AXUIElementGetTypeID() else { return false }

        let focusedElement = focusedElementValue as! AXUIElement
        let role = copyAXStringAttribute(kAXRoleAttribute, from: focusedElement)
        let roleDescription = copyAXStringAttribute(kAXRoleDescriptionAttribute, from: focusedElement)
        let editable = copyAXBoolAttribute("AXEditable", from: focusedElement)

        let textRoles = Set([
            kAXTextFieldRole as String,
            kAXTextAreaRole as String,
            kAXComboBoxRole as String,
            "AXSearchField",
        ])

        if let role, textRoles.contains(role) { return true }
        if editable == true { return true }
        return roleDescription?.localizedCaseInsensitiveContains("text") == true
    }

    nonisolated private static func requestAccessibilityPermissionIfNeeded() {
        guard !AXIsProcessTrusted() else { return }
        let options = ["AXTrustedCheckOptionPrompt": true] as CFDictionary
        _ = AXIsProcessTrustedWithOptions(options)
    }

    nonisolated private static func copyAXStringAttribute(_ attribute: String, from element: AXUIElement) -> String? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success else { return nil }
        return value as? String
    }

    nonisolated private static func copyAXBoolAttribute(_ attribute: String, from element: AXUIElement) -> Bool? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success else { return nil }
        return value as? Bool
    }

    private func startMeetingRecording() async {
        guard isAuthenticated else {
            statusMessage = "Sign in first to record meeting notes."
            return
        }
        guard googleConnected, meeting.id != "empty" else {
            statusMessage = "Connect Google Calendar and choose a meeting first."
            return
        }
        guard let recognizer = speechRecognizer, recognizer.isAvailable else {
            statusMessage = "Speech recognizer unavailable."
            return
        }

        if isListening {
            stopVoiceCapture()
        }

        do {
            let speechAuth = await Self.requestSpeechAuthorization()
            guard speechAuth == .authorized else {
                statusMessage = "Speech permission denied."
                return
            }
            let micGranted = await Self.requestMicrophonePermission()
            guard micGranted else {
                statusMessage = "Microphone permission denied."
                return
            }

            recognitionTask?.cancel()
            recognitionTask = nil
            recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
            guard let request = recognitionRequest else { return }
            request.shouldReportPartialResults = true

            meetingNotesTranscript = ""
            recordingMeeting = meeting
            let node = audioEngine.inputNode
            let format = try inputTapFormat(for: node)
            removeInputTapIfNeeded()
            node.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
                request.append(buffer)
            }
            isInputTapInstalled = true

            audioEngine.prepare()
            try audioEngine.start()
            isMeetingRecording = true
            meetingState = "Recording"
            statusMessage = "Recording meeting notes..."

            recognitionTask = Self.startRecognitionTask(recognizer: recognizer, request: request) { [weak self] result, error in
                if let result {
                    let transcript = result.bestTranscription.formattedString
                    Task { @MainActor in
                        self?.meetingNotesTranscript = transcript
                    }
                }
                if error != nil {
                    Task { @MainActor in
                        guard let self, self.isMeetingRecording else { return }
                        await self.stopMeetingRecordingAndSave()
                    }
                }
            }
        } catch {
            statusMessage = "Meeting recording failed: \(error.localizedDescription)"
            stopAudioCapture()
        }
    }

    private func stopMeetingRecordingAndSave() async {
        stopAudioCapture()
        isMeetingRecording = false
        meetingState = "Saving"

        let notes = meetingNotesTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !notes.isEmpty else {
            meetingState = "Summary"
            statusMessage = "Recording stopped. No transcript captured."
            return
        }

        do {
            let client = try makeClient()
            let workspaces = try await client.listWorkspaces()
            let workspace = workspaces.first
            guard let workspace else {
                statusMessage = "No workspace available for meeting notes."
                meetingState = "Summary"
                return
            }
            let targetMeeting = recordingMeeting ?? meeting
            let draft = try await client.createMeetingNotesDraft(
                workspaceSlug: workspace.slug,
                meeting: targetMeeting,
                notes: notes
            )
            lastMeetingNotesURL = draft.url.flatMap(URL.init(string:))
            lastSavedMeetingTitle = targetMeeting.title
            meetingState = "Notes ready"
            statusMessage = "Meeting notes saved to Drafts."
            notifyMeetingNotesSaved(title: targetMeeting.title)
        } catch {
            meetingState = "Summary"
            statusMessage = "Could not save meeting notes: \(error.localizedDescription)"
        }
    }

    private func stopAudioCapture() {
        audioEngine.stop()
        removeInputTapIfNeeded()
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionRequest = nil
    }

    private func removeInputTapIfNeeded() {
        guard isInputTapInstalled else { return }
        audioEngine.inputNode.removeTap(onBus: 0)
        isInputTapInstalled = false
    }

    private func inputTapFormat(for node: AVAudioInputNode) throws -> AVAudioFormat {
        let format = node.inputFormat(forBus: 0)
        guard format.channelCount > 0, format.sampleRate > 0 else {
            throw NSError(
                domain: "DragonFruitNative",
                code: 1201,
                userInfo: [NSLocalizedDescriptionKey: "Microphone format is not available yet. Try again."]
            )
        }
        return format
    }

    private func notifyMeetingNotesSaved(title: String) {
        deliverNotification(title: "Meeting notes saved", body: title)
    }

    private func deliverNotification(title: String, body: String) {
        Task {
            let center = UNUserNotificationCenter.current()
            _ = try? await center.requestAuthorization(options: [.alert, .sound])
            let content = UNMutableNotificationContent()
            content.title = title
            content.body = body
            content.sound = .default
            let request = UNNotificationRequest(
                identifier: UUID().uuidString,
                content: content,
                trigger: nil
            )
            try? await center.add(request)
        }
    }

    private func startVoiceCapture(mode: VoiceCaptureMode) async {
        guard !isStartingVoiceCapture else { return }
        isStartingVoiceCapture = true
        defer { isStartingVoiceCapture = false }

        guard isAuthenticated else {
            statusMessage = "Sign in first to capture voice notes."
            return
        }
        guard let recognizer = speechRecognizer, recognizer.isAvailable else {
            statusMessage = "Speech recognizer unavailable."
            return
        }
        do {
            let speechAuth = await Self.requestSpeechAuthorization()
            guard speechAuth == .authorized else {
                statusMessage = "Speech permission denied."
                return
            }
            let micGranted = await Self.requestMicrophonePermission()
            guard micGranted else {
                statusMessage = "Microphone permission denied."
                return
            }

            recognitionTask?.cancel()
            recognitionTask = nil
            recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
            guard let request = recognitionRequest else { return }
            request.shouldReportPartialResults = true

            voiceCaptureMode = mode
            lastTranscript = ""
            pendingVoiceTranscript = ""
            voiceTranscriptFlushTask?.cancel()
            voiceTranscriptFlushTask = nil
            let node = audioEngine.inputNode
            let format = try inputTapFormat(for: node)
            removeInputTapIfNeeded()
            node.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
                request.append(buffer)
            }
            isInputTapInstalled = true

            audioEngine.prepare()
            try audioEngine.start()
            isListening = true
            statusMessage = statusMessageForListening(mode: mode)

            recognitionTask = Self.startRecognitionTask(recognizer: recognizer, request: request) { [weak self] result, error in
                if let result {
                    let transcript = result.bestTranscription.formattedString
                    Task { @MainActor in
                        self?.queueVoiceTranscriptUpdate(transcript)
                    }
                }
                if error != nil {
                    Task { @MainActor in
                        guard let self, self.isListening else { return }
                        self.stopVoiceCapture()
                    }
                }
            }
        } catch {
            statusMessage = "Voice capture failed: \(error.localizedDescription)"
            stopAudioCapture()
            pendingVoiceTranscript = ""
            voiceTranscriptFlushTask?.cancel()
            voiceTranscriptFlushTask = nil
            isListening = false
        }
    }

    private func stopVoiceCapture() {
        guard isListening else { return }
        isListening = false
        stopAudioCapture()
        voiceTranscriptFlushTask?.cancel()
        voiceTranscriptFlushTask = nil
        if !pendingVoiceTranscript.isEmpty {
            lastTranscript = pendingVoiceTranscript
            pendingVoiceTranscript = ""
        }

        let text = lastTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            statusMessage = "Stopped listening."
            return
        }

        let intent = classifyIntent(from: text)
        lastCapture = intent

        if voiceCaptureMode == .dictation {
            typeTextIntoFocusedInput(text)
        } else if voiceCaptureMode == .copilot || intent.type == .agent {
            Task { @MainActor in
                await triggerAgentPrompt(text)
            }
        } else {
            Task { @MainActor in
                await persistVoiceIntent(intent)
            }
        }
    }

    private func statusMessageForListening(mode: VoiceCaptureMode) -> String {
        switch mode {
        case .copilot:
            return "Copilot listening... (⌥Space to act)"
        case .dictation:
            return "Dictating... (⌥⇧Space to type)"
        case .intent:
            return "Copilot listening... (⌥Space to create)"
        }
    }

    private func typeTextIntoFocusedInput(_ text: String) {
        guard !text.isEmpty else { return }
        guard AXIsProcessTrusted() else {
            statusMessage = "Allow Accessibility access to use dictation."
            openAccessibilitySettings()
            return
        }
        guard let source = CGEventSource(stateID: .hidSystemState) else {
            statusMessage = "Could not type dictation."
            return
        }

        let pasteboard = NSPasteboard.general
        let previousItems = pasteboard.pasteboardItems?.map(Self.copyPasteboardItem) ?? []
        pasteboard.clearContents()
        pasteboard.setString(text, forType: .string)

        let keyDown = CGEvent(keyboardEventSource: source, virtualKey: 9, keyDown: true)
        let keyUp = CGEvent(keyboardEventSource: source, virtualKey: 9, keyDown: false)
        keyDown?.flags = .maskCommand
        keyUp?.flags = .maskCommand
        keyDown?.post(tap: .cghidEventTap)
        keyUp?.post(tap: .cghidEventTap)

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            pasteboard.clearContents()
            pasteboard.writeObjects(previousItems)
        }
        statusMessage = "Typed dictation."
    }

    nonisolated private static func copyPasteboardItem(_ item: NSPasteboardItem) -> NSPasteboardItem {
        let copy = NSPasteboardItem()
        for type in item.types {
            if let data = item.data(forType: type) {
                copy.setData(data, forType: type)
            }
        }
        return copy
    }

    private func queueVoiceTranscriptUpdate(_ transcript: String) {
        pendingVoiceTranscript = transcript
        guard voiceTranscriptFlushTask == nil else { return }
        voiceTranscriptFlushTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 120_000_000)
                guard let self else { return }
                guard self.isListening else {
                    self.voiceTranscriptFlushTask = nil
                    return
                }
                if !self.pendingVoiceTranscript.isEmpty, self.lastTranscript != self.pendingVoiceTranscript {
                    self.lastTranscript = self.pendingVoiceTranscript
                }
                self.voiceTranscriptFlushTask = nil
                return
            }
        }
    }

    nonisolated private static func requestSpeechAuthorization() async -> SFSpeechRecognizerAuthorizationStatus {
        await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status)
            }
        }
    }

    nonisolated private static func requestMicrophonePermission() async -> Bool {
        await withCheckedContinuation { continuation in
            AVCaptureDevice.requestAccess(for: .audio) { granted in
                continuation.resume(returning: granted)
            }
        }
    }

    nonisolated private static func startRecognitionTask(
        recognizer: SFSpeechRecognizer,
        request: SFSpeechRecognitionRequest,
        resultHandler: @escaping @Sendable (SFSpeechRecognitionResult?, Error?) -> Void
    ) -> SFSpeechRecognitionTask {
        recognizer.recognitionTask(with: request, resultHandler: resultHandler)
    }

    private func classifyIntent(from transcript: String) -> VoiceCaptureResult {
        let lower = transcript.lowercased()
        let project = extractProjectHint(from: transcript)
        let type: VoiceCaptureType

        if lower.contains("dragonfruit agent") || lower.contains("agent") {
            type = .agent
        } else if lower.contains("doc") || lower.contains("documento") || lower.contains("spec") || lower.contains("nota larga") {
            type = .doc
        } else if lower.contains("idea") || lower.contains("note") || lower.contains("sticky") {
            type = .sticky
        } else {
            type = .task
        }

        let title = transcript.split(separator: ".").first.map(String.init) ?? transcript
        return VoiceCaptureResult(
            type: type,
            projectHint: project,
            title: title.prefix(80).description,
            body: transcript
        )
    }

    private func extractProjectHint(from transcript: String) -> String {
        let lower = transcript.lowercased()
        if let range = lower.range(of: "proyecto ") {
            let projectTail = transcript[range.upperBound...]
            return projectTail.split(separator: " ").prefix(3).joined(separator: " ")
        }
        if lower.contains("x project") {
            return "X project"
        }
        return "General Inbox"
    }

    private func persistVoiceIntent(_ intent: VoiceCaptureResult) async {
        do {
            let client = try makeClient()
            let routing = try await resolveRouting(client: client, projectHint: intent.projectHint)
            lastRoutingTarget = routing

            let html = "<p>\(escapeHTML(intent.body))</p>"
            let title = intent.title.isEmpty ? "Voice capture" : intent.title

            switch intent.type {
            case .task:
                guard let projectId = routing.projectId else {
                    statusMessage = "No project found for task. Say the project name in your note."
                    return
                }
                let created = try await client.createTask(
                    workspaceSlug: routing.workspaceSlug,
                    projectId: projectId,
                    title: title,
                    descriptionHtml: html
                )
                statusMessage = "Task created in \(routing.projectName ?? "project"): \(created.name ?? title)"
            case .doc:
                guard let projectId = routing.projectId else {
                    statusMessage = "No project found for doc. Say the project name in your note."
                    return
                }
                let created = try await client.createDoc(
                    workspaceSlug: routing.workspaceSlug,
                    projectId: projectId,
                    title: title,
                    descriptionHtml: html
                )
                statusMessage = "Doc created in \(routing.projectName ?? "project"): \(created.name ?? title)"
            case .sticky:
                let created = try await client.createSticky(
                    workspaceSlug: routing.workspaceSlug,
                    title: title,
                    descriptionHtml: html
                )
                statusMessage = "Sticky created in \(routing.workspaceSlug): \(created.name ?? title)"
            case .agent:
                spawnAgentFromVoice()
            }
        } catch {
            statusMessage = "Could not save voice note: \(error.localizedDescription)"
        }
    }

    private func resolveRouting(client: APIClient, projectHint: String) async throws -> RoutingTarget {
        let workspaces = try await client.listWorkspaces()
        guard let workspace = workspaces.first else {
            throw NSError(domain: "DragonFruitNative", code: 100, userInfo: [NSLocalizedDescriptionKey: "No workspace available"])
        }
        let projects = try await client.listProjects(workspaceSlug: workspace.slug)
        let normalizedHint = normalize(projectHint)

        if normalizedHint != normalize("General Inbox") {
            if let match = projects.first(where: { project in
                normalize(project.name).contains(normalizedHint) || normalize(project.identifier ?? "").contains(normalizedHint)
            }) {
                return RoutingTarget(workspaceSlug: workspace.slug, projectId: match.id, projectName: match.name)
            }
        }

        if let firstProject = projects.first {
            return RoutingTarget(workspaceSlug: workspace.slug, projectId: firstProject.id, projectName: firstProject.name)
        }
        return RoutingTarget(workspaceSlug: workspace.slug, projectId: nil, projectName: nil)
    }

    private func normalize(_ text: String) -> String {
        text.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
            .replacingOccurrences(of: "[^a-zA-Z0-9 ]", with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func escapeHTML(_ text: String) -> String {
        text
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
            .replacingOccurrences(of: "'", with: "&#39;")
    }

    private func triggerAgentPrompt(_ prompt: String) async {
        guard isAuthenticated else {
            statusMessage = "Sign in first to launch a DragonFruit agent."
            return
        }
        do {
            let client = try makeClient()
            let agentTarget = try await resolveAgentTarget(client: client)

            let sessionId: String
            if let existing = activeAgentSessionByWorkspace[agentTarget.workspaceSlug] {
                sessionId = existing
            } else {
                let createdSession = try await client.createAgentChatSession(
                    workspaceSlug: agentTarget.workspaceSlug,
                    agentId: agentTarget.agentId,
                    title: "DragonFruit Orbit Voice"
                )
                sessionId = createdSession.id
                activeAgentSessionByWorkspace[agentTarget.workspaceSlug] = sessionId
            }

            statusMessage = "Thinking with \(agentTarget.agentName)..."
            isAgentResponding = true
            let envelope = try await client.sendAgentChatMessage(
                workspaceSlug: agentTarget.workspaceSlug,
                sessionId: sessionId,
                content: prompt
            )

            if !envelope.assistant_message.error_message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                statusMessage = envelope.assistant_message.error_message
                lastAgentTextResponse = ""
                isAgentResponding = false
            } else {
                await streamAgentText(envelope.assistant_message.content)
                statusMessage = "Agent replied."
            }
        } catch {
            isAgentResponding = false
            statusMessage = "Agent request failed: \(error.localizedDescription)"
        }
    }

    private func resolveAgentTarget(client: APIClient) async throws -> AgentRoutingTarget {
        if let selected = availableAgents.first(where: { $0.id == selectedAgentId }) {
            return AgentRoutingTarget(
                workspaceSlug: selected.workspaceSlug,
                agentId: selected.id,
                agentName: selected.name
            )
        }

        await refreshAvailableAgents()
        if let fallback = availableAgents.first {
            return AgentRoutingTarget(
                workspaceSlug: fallback.workspaceSlug,
                agentId: fallback.id,
                agentName: fallback.name
            )
        }

        throw NSError(
            domain: "DragonFruitNative",
            code: 202,
            userInfo: [NSLocalizedDescriptionKey: "No agent available. Create one in DragonFruit settings."]
        )
    }

    private func streamAgentText(_ text: String) async {
        agentTypingTask?.cancel()
        lastAgentTextResponse = ""

        let chars = Array(text)
        let step = max(1, chars.count / 120)

        let typingTask = Task { @MainActor [weak self] in
            guard let self else { return }
            var idx = 0
            while idx < chars.count {
                if Task.isCancelled { return }
                let next = min(chars.count, idx + step)
                self.lastAgentTextResponse = String(chars[0..<next])
                idx = next
                try? await Task.sleep(nanoseconds: 18_000_000)
            }
            self.isAgentResponding = false
        }

        agentTypingTask = typingTask
        await typingTask.value
    }
}
