import AuthenticationServices
import AVFoundation
import Foundation
import Speech
import SwiftUI

struct MeetingInfo: Identifiable {
    let id = UUID()
    let title: String
    let startAt: Date
}

enum VoiceCaptureType: String {
    case task = "Task"
    case doc = "Doc"
    case sticky = "Sticky"
    case agent = "Agent"
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

@MainActor
final class MeetingStore: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    @Published var baseURL = "http://localhost:8000"
    @Published var appURL = "https://app.dragonfruit.sh"
    @Published var statusMessage = ""

    @Published var isAuthenticated = false
    @Published var googleConnected = false

    @Published var meeting = MeetingInfo(title: "No meeting yet", startAt: .now)
    @Published var meetingState = "Upcoming"
    @Published var autoStartEnabled = true
    @Published var autoStartMinutesBefore = 2
    @Published var isListening = false
    @Published var lastTranscript = ""
    @Published var lastCapture: VoiceCaptureResult?
    @Published var lastAgentTextResponse = ""
    @Published var isAgentResponding = false
    @Published var availableAgents: [AgentOption] = []
    @Published var selectedAgentId = ""

    private var oauthSession: ASWebAuthenticationSession?
    private let speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "es-ES"))
    private let audioEngine = AVAudioEngine()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var localKeyMonitor: Any?
    private var globalKeyMonitor: Any?
    private var lastRoutingTarget: RoutingTarget?
    private var activeAgentSessionByWorkspace: [String: String] = [:]
    private var agentTypingTask: Task<Void, Never>?

    override init() {
        super.init()
        let defaults = UserDefaults.standard
        baseURL = defaults.string(forKey: "df_base_url") ?? "http://localhost:8000"
        appURL = defaults.string(forKey: "df_app_url") ?? "https://app.dragonfruit.sh"
        setupHotkey()
    }

    var countdownLabel: String {
        let delta = Int(meeting.startAt.timeIntervalSinceNow)
        if delta <= 0 { return "Starting now" }
        return "in \(max(1, delta / 60))m"
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        NSApplication.shared.windows.first ?? ASPresentationAnchor()
    }

    func toggleRecording() {
        if meetingState == "Recording" {
            meetingState = "Summary"
        } else {
            meetingState = "Recording"
        }
    }

    func toggleVoiceCapture() {
        if isListening {
            stopVoiceCapture()
        } else {
            Task { await startVoiceCapture() }
        }
    }

    func beginDragonFruitLogin() async {
        do {
            let appHost = appURL.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            guard
                let loginURL = URL(string: "\(appHost)/?next_path=dragonfruitmini://auth/login-callback")
            else {
                throw NSError(domain: "DragonFruitNative", code: 5, userInfo: [NSLocalizedDescriptionKey: "Invalid app URL"])
            }

            statusMessage = "Open browser to sign in or sign up..."
            let session = ASWebAuthenticationSession(url: loginURL, callbackURLScheme: "dragonfruitmini") { [weak self] callbackURL, error in
                guard let self else { return }
                if let error {
                    Task { @MainActor in self.statusMessage = error.localizedDescription }
                    return
                }
                guard let callbackURL else {
                    Task { @MainActor in self.statusMessage = "Missing login callback" }
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

        do {
            let client = try makeClient()
            _ = try await client.getCurrentUser()
            isAuthenticated = true
            persistSettings()
            statusMessage = "Signed in to DragonFruit"
            await refreshCalendarState()
            await refreshAvailableAgents()
        } catch {
            isAuthenticated = false
            statusMessage = "Login finished, but API session is missing. Please retry."
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
            if let account = accounts.first {
                let formatter = ISO8601DateFormatter()
                let from = formatter.string(from: .now)
                let to = formatter.string(from: .now.addingTimeInterval(24 * 60 * 60))
                let events = try await client.getEvents(accountId: account.id, fromISO: from, toISO: to)
                if let event = events.first {
                    let start = formatter.date(from: event.start) ?? .now.addingTimeInterval(300)
                    meeting = MeetingInfo(title: event.title.isEmpty ? "Untitled meeting" : event.title, startAt: start)
                }
            }
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    func connectGoogle() async {
        do {
            let client = try makeClient()
            let authorizeURL = try await client.startGoogleOAuth()
            statusMessage = "Waiting for Google consent..."
            let session = ASWebAuthenticationSession(url: authorizeURL, callbackURLScheme: "dragonfruitmini") { [weak self] callbackURL, error in
                guard let self else { return }
                if let error {
                    Task { @MainActor in self.statusMessage = error.localizedDescription }
                    return
                }
                guard
                    let callbackURL,
                    let components = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false),
                    let code = components.queryItems?.first(where: { $0.name == "code" })?.value
                else {
                    Task { @MainActor in self.statusMessage = "Missing OAuth code" }
                    return
                }
                Task { @MainActor in
                    await self.finishGoogleConnect(code: code)
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

    private func finishGoogleConnect(code: String) async {
        do {
            let client = try makeClient()
            try await client.finishGoogleOAuth(code: code)
            statusMessage = "Google connected"
            await refreshCalendarState()
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    private func makeClient() throws -> APIClient {
        guard let url = URL(string: baseURL.trimmingCharacters(in: .whitespacesAndNewlines)) else {
            throw NSError(domain: "DragonFruitNative", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid API base URL"])
        }
        return APIClient(baseURL: url)
    }

    private func persistCredentials() {
        let defaults = UserDefaults.standard
        defaults.set(baseURL, forKey: "df_base_url")
        defaults.set(appURL, forKey: "df_app_url")
    }

    private func persistSettings() {
        persistCredentials()
    }

    private func setupHotkey() {
        localKeyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self else { return event }
            if self.isVoiceHotkey(event: event) {
                Task { @MainActor in self.toggleVoiceCapture() }
                return nil
            }
            return event
        }
        globalKeyMonitor = NSEvent.addGlobalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self else { return }
            if self.isVoiceHotkey(event: event) {
                Task { @MainActor in self.toggleVoiceCapture() }
            }
        }
    }

    private func isVoiceHotkey(event: NSEvent) -> Bool {
        let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
        return flags == [.option, .command] && event.keyCode == 49
    }

    private func startVoiceCapture() async {
        guard isAuthenticated else {
            statusMessage = "Sign in first to capture voice notes."
            return
        }
        guard let recognizer = speechRecognizer, recognizer.isAvailable else {
            statusMessage = "Speech recognizer unavailable."
            return
        }
        do {
            let speechAuth = await SFSpeechRecognizer.requestAuthorization()
            guard speechAuth == .authorized else {
                statusMessage = "Speech permission denied."
                return
            }
            let micGranted = await AVAudioApplication.requestRecordPermission()
            guard micGranted else {
                statusMessage = "Microphone permission denied."
                return
            }

            recognitionTask?.cancel()
            recognitionTask = nil
            recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
            guard let request = recognitionRequest else { return }
            request.shouldReportPartialResults = true

            let node = audioEngine.inputNode
            let format = node.outputFormat(forBus: 0)
            node.removeTap(onBus: 0)
            node.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
                self?.recognitionRequest?.append(buffer)
            }

            audioEngine.prepare()
            try audioEngine.start()
            isListening = true
            statusMessage = "Listening... (⌥⌘Space to stop)"

            recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
                guard let self else { return }
                if let result {
                    Task { @MainActor in self.lastTranscript = result.bestTranscription.formattedString }
                }
                if error != nil {
                    Task { @MainActor in self.stopVoiceCapture() }
                }
            }
        } catch {
            statusMessage = "Voice capture failed: \(error.localizedDescription)"
            stopVoiceCapture()
        }
    }

    private func stopVoiceCapture() {
        isListening = false
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionRequest = nil

        let text = lastTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            statusMessage = "Stopped listening."
            return
        }

        let intent = classifyIntent(from: text)
        lastCapture = intent

        if intent.type == .agent {
            Task { @MainActor in
                await triggerAgentPrompt(intent.body)
            }
        } else {
            Task { @MainActor in
                await persistVoiceIntent(intent)
            }
        }
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
