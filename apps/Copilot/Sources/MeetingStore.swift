import AuthenticationServices
import ApplicationServices
import AppKit
import AVFoundation
import Carbon
import Foundation
import os
import ScreenCaptureKit
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
    case bookmark = "Bookmark"
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
    let rawTranscript: String
}

struct VoiceActionResult: Identifiable {
    let id = UUID()
    let type: VoiceCaptureType
    let title: String
    let detail: String
    let resourceURL: URL?
}

private final class SystemAudioCapture: NSObject, SCStreamOutput, SCStreamDelegate {
    private let sampleQueue = DispatchQueue(label: "sh.dragonfruit.copilot.system-audio")
    private var stream: SCStream?
    private var assetWriter: AVAssetWriter?
    private var assetWriterInput: AVAssetWriterInput?
    private var didStartWriting = false
    private var onAudioSampleBuffer: ((CMSampleBuffer) -> Void)?
    private var onError: ((Error) -> Void)?

    func start(
        recordingTo fileURL: URL? = nil,
        onAudioSampleBuffer: @escaping (CMSampleBuffer) -> Void,
        onError: @escaping (Error) -> Void
    ) async throws {
        self.onAudioSampleBuffer = onAudioSampleBuffer
        self.onError = onError
        if let fileURL {
            try? FileManager.default.removeItem(at: fileURL)
            let writer = try AVAssetWriter(outputURL: fileURL, fileType: .m4a)
            let input = AVAssetWriterInput(
                mediaType: .audio,
                outputSettings: [
                    AVFormatIDKey: kAudioFormatMPEG4AAC,
                    AVSampleRateKey: 48_000,
                    AVNumberOfChannelsKey: 2,
                    AVEncoderBitRateKey: 128_000,
                ]
            )
            input.expectsMediaDataInRealTime = true
            guard writer.canAdd(input) else {
                throw NSError(
                    domain: "DragonFruitNative",
                    code: 1302,
                    userInfo: [NSLocalizedDescriptionKey: "System audio recorder is unavailable."]
                )
            }
            writer.add(input)
            assetWriter = writer
            assetWriterInput = input
            didStartWriting = false
        }

        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        guard let display = content.displays.first else {
            throw NSError(
                domain: "DragonFruitNative",
                code: 1301,
                userInfo: [NSLocalizedDescriptionKey: "No display available for system audio capture."]
            )
        }

        let configuration = SCStreamConfiguration()
        configuration.capturesAudio = true
        configuration.excludesCurrentProcessAudio = true
        configuration.sampleRate = 48_000
        configuration.channelCount = 2
        configuration.width = 2
        configuration.height = 2
        configuration.minimumFrameInterval = CMTime(value: 1, timescale: 1)
        configuration.queueDepth = 1
        configuration.showsCursor = false

        let stream = SCStream(
            filter: SCContentFilter(display: display, excludingWindows: []),
            configuration: configuration,
            delegate: self
        )
        try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: sampleQueue)
        self.stream = stream
        try await stream.startCapture()
    }

    func stop() async {
        let activeStream = stream
        let writer = assetWriter
        let input = assetWriterInput
        stream = nil
        assetWriter = nil
        assetWriterInput = nil
        didStartWriting = false
        onAudioSampleBuffer = nil
        onError = nil
        try? await activeStream?.stopCapture()
        await withCheckedContinuation { continuation in
            sampleQueue.async {
                guard let writer, writer.status == .writing else {
                    continuation.resume()
                    return
                }
                input?.markAsFinished()
                writer.finishWriting {
                    continuation.resume()
                }
            }
        }
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of outputType: SCStreamOutputType) {
        guard outputType == .audio, sampleBuffer.isValid else { return }
        appendToRecording(sampleBuffer)
        onAudioSampleBuffer?(sampleBuffer)
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        onError?(error)
    }

    private func appendToRecording(_ sampleBuffer: CMSampleBuffer) {
        guard let writer = assetWriter, let input = assetWriterInput else { return }
        if !didStartWriting {
            guard writer.startWriting() else { return }
            writer.startSession(atSourceTime: CMSampleBufferGetPresentationTimeStamp(sampleBuffer))
            didStartWriting = true
        }
        guard writer.status == .writing, input.isReadyForMoreMediaData else { return }
        input.append(sampleBuffer)
    }
}

struct VoiceCursorContext {
    var selectedText: String?
    var focusedSelectedText: String?
    var details: [String]
    var attachments: [AgentChatAttachmentPayload]
    var hoveredURL: String?
    var hoveredTitle: String?
    var hoveredRole: String?

    static let empty = VoiceCursorContext(
        selectedText: nil,
        focusedSelectedText: nil,
        details: [],
        attachments: [],
        hoveredURL: nil,
        hoveredTitle: nil,
        hoveredRole: nil
    )

    var primaryText: String? {
        let candidates = [selectedText, focusedSelectedText]
        return candidates
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty }
    }

    var promptText: String {
        var lines: [String] = []
        if let selectedText, !selectedText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            lines.append("selected text: \(selectedText)")
        }
        if let focusedSelectedText,
           focusedSelectedText != selectedText,
           !focusedSelectedText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            lines.append("focused selected text: \(focusedSelectedText)")
        }
        lines.append(contentsOf: details)
        if !attachments.isEmpty {
            lines.append("visual context: \(attachments.map(\.name).joined(separator: ", ")) attached")
        }
        return lines.joined(separator: "\n")
    }

    var looksLikeHoveredImage: Bool {
        let roleText = (hoveredRole ?? "").lowercased()
        let titleText = (hoveredTitle ?? "").lowercased()
        let urlText = (hoveredURL ?? "").lowercased()
        return roleText.contains("image") ||
            titleText.contains("image") ||
            urlText.range(of: #"\.(apng|avif|gif|jpe?g|png|svg|webp)(\?|#|$)"#, options: .regularExpression) != nil
    }
}

private enum VoiceTransformIntent {
    case translate(targetLanguage: String?)
    case rewrite(instruction: String)
}

struct RoutingTarget {
    let workspaceSlug: String
    let projectId: String?
    let projectName: String?
}

struct AgentRoutingTarget {
    let workspaceSlug: String
    let agentId: String?
    let agentName: String
}

struct AgentOption: Identifiable, Hashable {
    let id: String
    let name: String
    let workspaceSlug: String
}

struct WorkspaceOption: Identifiable, Hashable {
    let id: String
    let name: String
    let slug: String
}

struct PermissionStatus: Identifiable {
    let id: String
    let name: String
    let state: String
}

enum SpeechLanguage: String, CaseIterable, Identifiable {
    case multilingual = "multilingual"
    case arabicSA = "ar-SA"
    case catalanES = "ca-ES"
    case chineseCN = "zh-CN"
    case chineseHK = "zh-HK"
    case chineseTW = "zh-TW"
    case czechCZ = "cs-CZ"
    case danishDK = "da-DK"
    case dutchNL = "nl-NL"
    case englishUS = "en-US"
    case englishGB = "en-GB"
    case finnishFI = "fi-FI"
    case spanishES = "es-ES"
    case spanishMX = "es-MX"
    case spanishLatAm = "es-419"
    case frenchFR = "fr-FR"
    case frenchCA = "fr-CA"
    case portugueseBR = "pt-BR"
    case portuguesePT = "pt-PT"
    case italianIT = "it-IT"
    case germanDE = "de-DE"
    case greekGR = "el-GR"
    case hebrewIL = "he-IL"
    case hindiIN = "hi-IN"
    case hungarianHU = "hu-HU"
    case indonesianID = "id-ID"
    case japaneseJP = "ja-JP"
    case koreanKR = "ko-KR"
    case malayMY = "ms-MY"
    case norwegianNO = "nb-NO"
    case polishPL = "pl-PL"
    case romanianRO = "ro-RO"
    case russianRU = "ru-RU"
    case slovakSK = "sk-SK"
    case swedishSE = "sv-SE"
    case thaiTH = "th-TH"
    case turkishTR = "tr-TR"
    case ukrainianUA = "uk-UA"
    case vietnameseVN = "vi-VN"

    var id: String { rawValue }

    static var availableCases: [SpeechLanguage] {
        let supportedLocaleIDs = Set(SFSpeechRecognizer.supportedLocales().map { normalizeLocaleID($0.identifier) })
        let supportedCases = allCases.filter { language in
            guard language != .multilingual else { return true }
            return supportedLocaleIDs.contains(normalizeLocaleID(language.rawValue))
        }
        return supportedCases.isEmpty ? allCases : supportedCases
    }

    private static func normalizeLocaleID(_ identifier: String) -> String {
        identifier.replacingOccurrences(of: "_", with: "-").lowercased()
    }

    var label: String {
        switch self {
        case .multilingual:
            return "System language"
        case .arabicSA:
            return "Arabic"
        case .catalanES:
            return "Catalan"
        case .chineseCN:
            return "Chinese"
        case .chineseHK:
            return "Chinese (HK)"
        case .chineseTW:
            return "Chinese (TW)"
        case .czechCZ:
            return "Czech"
        case .danishDK:
            return "Danish"
        case .dutchNL:
            return "Dutch"
        case .englishUS:
            return "English"
        case .englishGB:
            return "English (UK)"
        case .finnishFI:
            return "Finnish"
        case .spanishES:
            return "Spanish"
        case .spanishMX:
            return "Spanish (LatAm)"
        case .spanishLatAm:
            return "Spanish (LatAm)"
        case .frenchFR:
            return "French"
        case .frenchCA:
            return "French (Canada)"
        case .portugueseBR:
            return "Portuguese"
        case .portuguesePT:
            return "Portuguese (PT)"
        case .italianIT:
            return "Italian"
        case .germanDE:
            return "German"
        case .greekGR:
            return "Greek"
        case .hebrewIL:
            return "Hebrew"
        case .hindiIN:
            return "Hindi"
        case .hungarianHU:
            return "Hungarian"
        case .indonesianID:
            return "Indonesian"
        case .japaneseJP:
            return "Japanese"
        case .koreanKR:
            return "Korean"
        case .malayMY:
            return "Malay"
        case .norwegianNO:
            return "Norwegian"
        case .polishPL:
            return "Polish"
        case .romanianRO:
            return "Romanian"
        case .russianRU:
            return "Russian"
        case .slovakSK:
            return "Slovak"
        case .swedishSE:
            return "Swedish"
        case .thaiTH:
            return "Thai"
        case .turkishTR:
            return "Turkish"
        case .ukrainianUA:
            return "Ukrainian"
        case .vietnameseVN:
            return "Vietnamese"
        }
    }

    var flag: String {
        switch self {
        case .multilingual:
            return "🌐"
        case .arabicSA:
            return "🇸🇦"
        case .catalanES:
            return "🇪🇸"
        case .chineseCN:
            return "🇨🇳"
        case .chineseHK:
            return "🇭🇰"
        case .chineseTW:
            return "🇹🇼"
        case .czechCZ:
            return "🇨🇿"
        case .danishDK:
            return "🇩🇰"
        case .dutchNL:
            return "🇳🇱"
        case .englishUS:
            return "🇺🇸"
        case .englishGB:
            return "🇬🇧"
        case .finnishFI:
            return "🇫🇮"
        case .spanishES:
            return "🇪🇸"
        case .spanishMX:
            return "🇲🇽"
        case .spanishLatAm:
            return "🌎"
        case .frenchFR:
            return "🇫🇷"
        case .frenchCA:
            return "🇨🇦"
        case .portugueseBR:
            return "🇧🇷"
        case .portuguesePT:
            return "🇵🇹"
        case .italianIT:
            return "🇮🇹"
        case .germanDE:
            return "🇩🇪"
        case .greekGR:
            return "🇬🇷"
        case .hebrewIL:
            return "🇮🇱"
        case .hindiIN:
            return "🇮🇳"
        case .hungarianHU:
            return "🇭🇺"
        case .indonesianID:
            return "🇮🇩"
        case .japaneseJP:
            return "🇯🇵"
        case .koreanKR:
            return "🇰🇷"
        case .malayMY:
            return "🇲🇾"
        case .norwegianNO:
            return "🇳🇴"
        case .polishPL:
            return "🇵🇱"
        case .romanianRO:
            return "🇷🇴"
        case .russianRU:
            return "🇷🇺"
        case .slovakSK:
            return "🇸🇰"
        case .swedishSE:
            return "🇸🇪"
        case .thaiTH:
            return "🇹🇭"
        case .turkishTR:
            return "🇹🇷"
        case .ukrainianUA:
            return "🇺🇦"
        case .vietnameseVN:
            return "🇻🇳"
        }
    }

    var displayLabel: String {
        "\(flag) \(label)"
    }

    var locale: Locale {
        if self == .multilingual {
            return Self.preferredSupportedLocale()
        }
        return Self.supportedLocale(for: rawValue) ?? Locale(identifier: rawValue)
    }

    static func supportedLocale(for identifier: String) -> Locale? {
        let normalizedIdentifier = normalizeLocaleID(identifier)
        return SFSpeechRecognizer.supportedLocales().first {
            normalizeLocaleID($0.identifier) == normalizedIdentifier
        }
    }

    private static func preferredSupportedLocale() -> Locale {
        let supportedLocales = SFSpeechRecognizer.supportedLocales()
        let supportedLocaleIDs = Set(supportedLocales.map { normalizeLocaleID($0.identifier) })
        for preferredLanguage in Locale.preferredLanguages {
            if supportedLocaleIDs.contains(normalizeLocaleID(preferredLanguage)) {
                return Locale(identifier: preferredLanguage)
            }
        }
        for fallback in ["es-ES", "en-US"] {
            if supportedLocaleIDs.contains(normalizeLocaleID(fallback)) {
                return Locale(identifier: fallback)
            }
        }
        return supportedLocales.first ?? Locale(identifier: "en-US")
    }
}

@MainActor
final class MeetingStore: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    private static let logger = Logger(subsystem: "sh.dragonfruit.copilot", category: "store")
    private static let productionAPIURL = "https://api.dragonfruit.sh"
    private static let productionAppURL = "https://app.dragonfruit.sh"

    private enum AccessibilityResetResult: Sendable {
        case success
        case failure
        case error(String)
    }

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
    @Published var showCursorBuddyEnabled = true
    @Published var cursorBuddyOpacity: Double = 1.0 {
        didSet {
            let clampedOpacity = min(max(cursorBuddyOpacity, 0.35), 1.0)
            guard clampedOpacity == cursorBuddyOpacity else {
                cursorBuddyOpacity = clampedOpacity
                return
            }
            UserDefaults.standard.set(cursorBuddyOpacity, forKey: "df_cursor_buddy_opacity")
        }
    }
    @Published var voiceActionsEnabled = true
    @Published var cursorBuddyEnabled = true {
        didSet {
            guard cursorBuddyEnabled, oldValue != cursorBuddyEnabled else { return }
            requestDictationPermissions()
        }
    }
    @Published var copilotTheme: CopilotThemeMode = .light {
        didSet {
            UserDefaults.standard.set(copilotTheme.rawValue, forKey: "df_copilot_theme")
        }
    }
    @Published var speechLanguage: SpeechLanguage = .spanishES {
        didSet {
            UserDefaults.standard.set(speechLanguage.rawValue, forKey: "df_speech_language")
            if oldValue != speechLanguage {
                statusMessage = "Speech language set to \(speechLanguage.label)."
            }
        }
    }
    @Published var isListening = false
    @Published var audioLevel: CGFloat = 0
    @Published var isMeetingRecording = false
    @Published var meetingStartPrompt: MeetingInfo?
    @Published var meetingNotesTranscript = ""
    @Published var lastMeetingNotesURL: URL?
    @Published var lastSavedMeetingTitle = ""
    @Published var lastTranscript = ""
    @Published var lastCapture: VoiceCaptureResult?
    @Published var lastVoiceActionResult: VoiceActionResult?
    @Published var lastAgentTextResponse = ""
    @Published var isAgentResponding = false
    @Published var isVoiceActionProcessing = false
    @Published var availableWorkspaces: [WorkspaceOption] = []
    @Published var selectedWorkspaceSlug = "" {
        didSet {
            UserDefaults.standard.set(selectedWorkspaceSlug, forKey: "df_selected_workspace_slug")
            selectDefaultAgentForSelectedWorkspaceIfNeeded()
        }
    }
    @Published var availableAgents: [AgentOption] = []
    @Published var selectedAgentId = "" {
        didSet {
            UserDefaults.standard.set(selectedAgentId, forKey: "df_selected_agent_id")
        }
    }
    @Published private(set) var permissionsRefreshCounter = 0

    private var oauthSession: ASWebAuthenticationSession?
    private var loginPollTask: Task<Void, Never>?
    private var calendarPollTask: Task<Void, Never>?
    private var meetingRefreshTask: Task<Void, Never>?
    private var apiToken: String = ""
    private let audioEngine = AVAudioEngine()
    private let speechAppendQueue = DispatchQueue(label: "sh.dragonfruit.copilot.speech-audio")
    private let systemAudioCapture = SystemAudioCapture()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var meetingMicAudioFile: AVAudioFile?
    private var meetingMicAudioURL: URL?
    private var meetingSystemAudioURL: URL?
    private var isInputTapInstalled = false
    private var recordingMeeting: MeetingInfo?
    private var notifiedMeetingIds: Set<String> = []
    private var actionHotKeyRef: EventHotKeyRef?
    private var hotKeyEventHandlerRef: EventHandlerRef?
    private var optionFlagsMonitor: Any?
    private var localOptionFlagsMonitor: Any?
    private var lastRoutingTarget: RoutingTarget?
    private var activeAgentSessionByWorkspace: [String: String] = [:]
    private var agentTypingTask: Task<Void, Never>?
    private var agentResponseDismissTask: Task<Void, Never>?
    private var voiceCaptureMode: VoiceCaptureMode = .intent
    private var isStartingVoiceCapture = false
    private var pendingVoiceTranscript = ""
    private var voiceTranscriptFlushTask: Task<Void, Never>?
    private var pendingCursorContext = VoiceCursorContext.empty
    private var lastAudioLevelPublishedAt: TimeInterval = 0
    private var heldHotKeyIds: Set<UInt32> = []
    private var dictationStreamedText = ""
    private var dictationSavedPasteboardItems: [NSPasteboardItem]?
    private var dictationTargetApplication: NSRunningApplication?
    private var dictationTargetElement: AXUIElement?
    private var isOptionDictationHeld = false
    private var optionDictationStartTask: Task<Void, Never>?

    override init() {
        super.init()
        let defaults = UserDefaults.standard
        let savedBaseURL = defaults.string(forKey: "df_base_url")
        let savedAppURL = defaults.string(forKey: "df_app_url")
        baseURL = savedBaseURL ?? Self.productionAPIURL
        appURL = savedAppURL ?? Self.inferAppURL(from: baseURL) ?? Self.productionAppURL
        apiToken = defaults.string(forKey: "df_api_token") ?? ""
        copilotTheme = CopilotThemeMode(rawValue: defaults.string(forKey: "df_copilot_theme") ?? "") ?? .light
        let savedCursorBuddyOpacity = defaults.object(forKey: "df_cursor_buddy_opacity") as? Double
        cursorBuddyOpacity = min(max(savedCursorBuddyOpacity ?? 1.0, 0.35), 1.0)
        speechLanguage = SpeechLanguage(rawValue: defaults.string(forKey: "df_speech_language") ?? "") ?? .spanishES
        selectedWorkspaceSlug = defaults.string(forKey: "df_selected_workspace_slug") ?? ""
        selectedAgentId = defaults.string(forKey: "df_selected_agent_id") ?? ""
        isRestoringSession = !apiToken.isEmpty
        Self.logger.info("DragonFruit store initialized. savedToken=\(!self.apiToken.isEmpty, privacy: .public)")
        setupHotkey()
        if !apiToken.isEmpty {
            Task { @MainActor in
                await restoreSession()
            }
        }
    }

    private static func inferAppURL(from apiURL: String) -> String? {
        guard var components = URLComponents(string: apiURL.trimmingCharacters(in: .whitespacesAndNewlines)) else {
            return nil
        }

        guard let host = components.host?.lowercased() else { return nil }
        let isLocalHost = host == "localhost" || host == "127.0.0.1" || host == "::1"
        guard isLocalHost else { return nil }

        if components.port == 8000 {
            components.port = 3000
        }

        return components.url?.absoluteString
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

    var selectedWorkspaceName: String {
        availableWorkspaces.first(where: { $0.slug == selectedWorkspaceSlug })?.name
            ?? availableWorkspaces.first?.name
            ?? "No workspace"
    }

    var agentsForSelectedWorkspace: [AgentOption] {
        guard !selectedWorkspaceSlug.isEmpty else { return availableAgents }
        return availableAgents.filter { $0.workspaceSlug == selectedWorkspaceSlug }
    }

    var permissionStatuses: [PermissionStatus] {
        [
            PermissionStatus(id: "login", name: "DragonFruit", state: isAuthenticated ? "Connected" : "Sign in"),
            PermissionStatus(id: "mic", name: "Microphone", state: microphonePermissionLabel),
            PermissionStatus(id: "system-audio", name: "System audio", state: systemAudioPermissionLabel),
            PermissionStatus(id: "speech", name: "Atlas voice", state: speechPermissionLabel),
            PermissionStatus(id: "accessibility", name: "Cursor context & dictation", state: accessibilityPermissionLabel),
        ]
    }

    var copilotPermissionStatuses: [PermissionStatus] {
        permissionStatuses.filter { $0.id != "login" }
    }

    var currentMissingCopilotPermission: PermissionStatus? {
        copilotPermissionStatuses.first { $0.state != "Allowed" }
    }

    var completedCopilotPermissionCount: Int {
        copilotPermissionStatuses.filter { $0.state == "Allowed" }.count
    }

    var needsPermissionOnboarding: Bool {
        AVCaptureDevice.authorizationStatus(for: .audio) != .authorized ||
            SFSpeechRecognizer.authorizationStatus() != .authorized ||
            !Self.hasSystemAudioPermission() ||
            !AXIsProcessTrusted()
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

    private var systemAudioPermissionLabel: String {
        Self.hasSystemAudioPermission() ? "Allowed" : "Needed"
    }

    private var speechRecognizer: SFSpeechRecognizer? {
        SFSpeechRecognizer(locale: speechLanguage.locale)
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
            Self.requestSystemAudioPermissionIfNeeded()
            refreshPermissionStatuses()
        }
    }

    func requestDictationPermissions() {
        Self.requestAccessibilityPermissionIfNeeded()
        Task { @MainActor in
            _ = await Self.requestSpeechAuthorization()
            _ = await Self.requestMicrophonePermission()
            Self.requestSystemAudioPermissionIfNeeded()
            refreshPermissionStatuses()
        }
    }

    func requestCopilotPermissions() {
        Self.requestAccessibilityPermissionIfNeeded()
        Task { @MainActor in
            _ = await Self.requestSpeechAuthorization()
            _ = await Self.requestMicrophonePermission()
            Self.requestSystemAudioPermissionIfNeeded()
            refreshPermissionStatuses()
            if !AXIsProcessTrusted() {
                openPrivacySettings(anchor: "Privacy_Accessibility")
            }
        }
    }

    func handlePermissionAction(_ permission: PermissionStatus) {
        switch permission.id {
        case "login":
            Task { await beginDragonFruitLogin() }
        case "mic":
            Task { @MainActor in
                _ = await Self.requestMicrophonePermission()
                refreshPermissionStatuses()
                refreshPermissionStatusesAfterSystemPrompt()
                if AVCaptureDevice.authorizationStatus(for: .audio) != .authorized {
                    openPrivacySettings(anchor: "Privacy_Microphone")
                }
            }
        case "speech":
            Task { @MainActor in
                _ = await Self.requestSpeechAuthorization()
                refreshPermissionStatuses()
                refreshPermissionStatusesAfterSystemPrompt()
                if SFSpeechRecognizer.authorizationStatus() != .authorized {
                    openPrivacySettings(anchor: "Privacy_SpeechRecognition")
                }
            }
        case "system-audio":
            Self.requestSystemAudioPermissionIfNeeded()
            refreshPermissionStatuses()
            refreshPermissionStatusesAfterSystemPrompt()
            if !Self.hasSystemAudioPermission() {
                openPrivacySettings(anchor: "Privacy_ScreenCapture")
            }
        case "accessibility":
            openAccessibilitySettings()
        default:
            refreshPermissionStatuses()
        }
    }

    func openAccessibilitySettings() {
        Self.requestAccessibilityPermissionIfNeeded()
        openPrivacySettings(anchor: "Privacy_Accessibility")
        refreshPermissionStatuses()
    }

    private func refreshPermissionStatusesAfterSystemPrompt() {
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 250_000_000)
            refreshPermissionStatuses()
            NSApplication.shared.activate(ignoringOtherApps: true)
        }
    }

    func resetAccessibilityAccess() {
        Task { @MainActor in
            let result = await Self.resetAccessibilityAccessWithTccutil()
            switch result {
            case .success:
                statusMessage = "Accessibility access reset."
                openPrivacySettings(anchor: "Privacy_Accessibility")
            case .failure:
                statusMessage = "Could not reset Accessibility access."
            case .error(let message):
                statusMessage = "Could not reset Accessibility access: \(message)"
            }
            refreshPermissionStatuses()
        }
    }

    nonisolated private static func resetAccessibilityAccessWithTccutil() async -> AccessibilityResetResult {
        await withCheckedContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                let process = Process()
                process.executableURL = URL(fileURLWithPath: "/usr/bin/tccutil")
                process.arguments = ["reset", "Accessibility", "sh.dragonfruit.copilot"]

                do {
                    try process.run()
                    process.waitUntilExit()
                    continuation.resume(returning: process.terminationStatus == 0 ? .success : .failure)
                } catch {
                    continuation.resume(returning: .error(error.localizedDescription))
                }
            }
        }
    }

    private func openPrivacySettings(anchor: String) {
        guard let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?\(anchor)") else { return }
        NSWorkspace.shared.open(url)
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

    func startPromptedMeetingNotes() {
        meetingStartPrompt = nil
        toggleRecording()
    }

    func dismissMeetingStartPrompt() {
        meetingStartPrompt = nil
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

    func beginActionVoiceCapture(hotKeyID: UInt32? = nil) {
        cancelOptionDictationStart()
        pendingCursorContext = voiceActionsEnabled ? captureCursorContext() : VoiceCursorContext.empty
        lastVoiceActionResult = nil
        lastAgentTextResponse = ""
        isVoiceActionProcessing = false
        beginVoiceCapture(mode: .intent, requiredHeldHotKeyID: hotKeyID)
    }

    func toggleDictationVoiceCapture() {
        guard cursorBuddyEnabled else {
            statusMessage = "Turn on dictation in Settings first."
            return
        }
        requestDictationPermissions()
        toggleVoiceCapture(mode: .dictation)
    }

    func beginDictationVoiceCapture(hotKeyID: UInt32? = nil) {
        guard cursorBuddyEnabled else {
            statusMessage = "Turn on dictation in Settings first."
            return
        }
        requestDictationPermissions()
        beginVoiceCapture(mode: .dictation, requiredHeldHotKeyID: hotKeyID)
    }

    func handleOptionFlagsChanged(isPressed: Bool) {
        if isPressed {
            guard !isOptionDictationHeld else { return }
            isOptionDictationHeld = true
            optionDictationStartTask?.cancel()
            optionDictationStartTask = Task { @MainActor [weak self] in
                try? await Task.sleep(nanoseconds: 160_000_000)
                guard let self, !Task.isCancelled, self.isOptionDictationHeld else { return }
                self.beginDictationVoiceCapture(hotKeyID: Self.optionOnlyDictationHotKeyID)
            }
        } else {
            isOptionDictationHeld = false
            optionDictationStartTask?.cancel()
            optionDictationStartTask = nil
            endHeldVoiceCapture(hotKeyID: Self.optionOnlyDictationHotKeyID)
        }
    }

    func endHeldVoiceCapture(hotKeyID: UInt32) {
        heldHotKeyIds.remove(hotKeyID)
        guard isListening else { return }
        stopVoiceCapture()
    }

    private func cancelOptionDictationStart() {
        isOptionDictationHeld = false
        optionDictationStartTask?.cancel()
        optionDictationStartTask = nil
        heldHotKeyIds.remove(Self.optionOnlyDictationHotKeyID)
    }

    private func toggleVoiceCapture(mode: VoiceCaptureMode) {
        if isListening {
            stopVoiceCapture()
        } else {
            beginVoiceCapture(mode: mode)
        }
    }

    private func beginVoiceCapture(mode: VoiceCaptureMode, requiredHeldHotKeyID: UInt32? = nil) {
        guard !isListening, !isStartingVoiceCapture else { return }
        guard mode == .dictation || voiceActionsEnabled else {
            statusMessage = "Turn on Voice in Settings first."
            return
        }
        if mode == .copilot {
            pendingCursorContext = voiceActionsEnabled ? captureCursorContext() : VoiceCursorContext.empty
            lastVoiceActionResult = nil
        }
        if let requiredHeldHotKeyID {
            heldHotKeyIds.insert(requiredHeldHotKeyID)
        }
        Task { await startVoiceCapture(mode: mode, requiredHeldHotKeyID: requiredHeldHotKeyID) }
    }

    func openLastVoiceActionResult() {
        guard let url = lastVoiceActionResult?.resourceURL else { return }
        NSWorkspace.shared.open(url)
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
        statusMessage = "Signed in. Loading Atlas context..."
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
            let workspaceOptions = workspaces.map {
                WorkspaceOption(id: $0.slug, name: $0.name, slug: $0.slug)
            }
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

            availableWorkspaces = workspaceOptions
            if selectedWorkspaceSlug.isEmpty || !workspaceOptions.contains(where: { $0.slug == selectedWorkspaceSlug }) {
                selectedWorkspaceSlug = workspaceOptions.first?.slug ?? ""
            }
            availableAgents = options
            selectDefaultAgentForSelectedWorkspaceIfNeeded()
        } catch {
            statusMessage = "Could not load Atlas: \(error.localizedDescription)"
        }
    }

    private func selectDefaultAgentForSelectedWorkspaceIfNeeded() {
        guard !availableAgents.isEmpty else {
            selectedAgentId = ""
            return
        }
        let scopedAgents = agentsForSelectedWorkspace
        if selectedAgentId.isEmpty || !scopedAgents.contains(where: { $0.id == selectedAgentId }) {
            selectedAgentId = scopedAgents.first?.id ?? ""
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
        if meetingNotesEnabled {
            meetingStartPrompt = meeting
        }
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
        meetingStartPrompt = nil
        hasMeetingsToday = false
        meetingRefreshTask?.cancel()
        UserDefaults.standard.removeObject(forKey: "df_api_token")
        if !message.isEmpty {
            statusMessage = message
        }
    }

    private func setupHotkey() {
        var eventTypes = [
            EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed)),
            EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyReleased)),
        ]
        let installStatus = eventTypes.withUnsafeMutableBufferPointer { buffer in
            InstallEventHandler(
                GetApplicationEventTarget(),
                Self.handleCarbonHotKey,
                buffer.count,
                buffer.baseAddress,
                Unmanaged.passUnretained(self).toOpaque(),
                &hotKeyEventHandlerRef
            )
        }
        guard installStatus == noErr else {
            statusMessage = "Could not register hotkeys."
            return
        }

        registerHotKey(id: 1, modifiers: UInt32(optionKey), storage: &actionHotKeyRef)
        setupOptionOnlyDictationMonitor()
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
    nonisolated private static let optionOnlyDictationHotKeyID: UInt32 = 10_002

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
        let eventKind = GetEventKind(event)
        Task { @MainActor in
            switch (hotKeyID.id, eventKind) {
            case (1, UInt32(kEventHotKeyPressed)):
                store.beginActionVoiceCapture(hotKeyID: hotKeyID.id)
            case (1, UInt32(kEventHotKeyReleased)):
                store.endHeldVoiceCapture(hotKeyID: hotKeyID.id)
            default:
                break
            }
        }
        return noErr
    }

    private func setupOptionOnlyDictationMonitor() {
        optionFlagsMonitor = NSEvent.addGlobalMonitorForEvents(matching: .flagsChanged) { [weak self] event in
            Self.handleOptionFlagsChanged(event: event, store: self)
        }
        localOptionFlagsMonitor = NSEvent.addLocalMonitorForEvents(matching: .flagsChanged) { [weak self] event in
            Self.handleOptionFlagsChanged(event: event, store: self)
            return event
        }
    }

    nonisolated private static func handleOptionFlagsChanged(event: NSEvent, store: MeetingStore?) {
        let isPressed = event.modifierFlags.intersection(.deviceIndependentFlagsMask).contains(.option)
        Task { @MainActor in
            store?.handleOptionFlagsChanged(isPressed: isPressed)
        }
    }

    nonisolated private static func focusedElementAcceptsTextInput() -> Bool {
        guard let focusedElement = focusedTextElement() else { return false }
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

    nonisolated private static func focusedTextElement() -> AXUIElement? {
        guard AXIsProcessTrusted() else { return nil }
        let systemWideElement = AXUIElementCreateSystemWide()
        var focusedElementValue: CFTypeRef?
        let error = AXUIElementCopyAttributeValue(
            systemWideElement,
            kAXFocusedUIElementAttribute as CFString,
            &focusedElementValue
        )
        guard error == .success, let focusedElementValue else { return nil }
        guard CFGetTypeID(focusedElementValue) == AXUIElementGetTypeID() else { return nil }
        return (focusedElementValue as! AXUIElement)
    }

    private func captureCursorContext() -> VoiceCursorContext {
        guard AXIsProcessTrusted() else {
            return VoiceCursorContext(
                selectedText: nil,
                focusedSelectedText: nil,
                details: ["Cursor context unavailable because Accessibility permission is not allowed."],
                attachments: [],
                hoveredURL: nil,
                hoveredTitle: nil,
                hoveredRole: nil
            )
        }

        let systemElement = AXUIElementCreateSystemWide()
        let mouse = NSEvent.mouseLocation
        var elementValue: AXUIElement?
        let result = AXUIElementCopyElementAtPosition(systemElement, Float(mouse.x), Float(mouse.y), &elementValue)
        guard result == .success, let element = elementValue else {
            return VoiceCursorContext(
                selectedText: nil,
                focusedSelectedText: Self.focusedSelectedText(),
                details: [frontmostAppContext()],
                attachments: captureFrontmostWindowAttachment(),
                hoveredURL: nil,
                hoveredTitle: nil,
                hoveredRole: nil
            )
        }

        let appName = frontmostAppContext()
        let role = Self.copyAXStringAttribute(kAXRoleAttribute, from: element)
        let roleDescription = Self.copyAXStringAttribute(kAXRoleDescriptionAttribute, from: element)
        let title = Self.copyAXAnyStringAttribute(kAXTitleAttribute, from: element)
        let description = Self.copyAXAnyStringAttribute(kAXDescriptionAttribute, from: element)
        let value = Self.copyAXAnyStringAttribute(kAXValueAttribute, from: element)
        let url = Self.copyAXAnyStringAttribute("AXURL", from: element)
        let selectedText = Self.copyAXAnyStringAttribute(kAXSelectedTextAttribute, from: element)
        let focusedSelectedText = Self.focusedSelectedText()

        var details: [String] = []
        if let title { details.append("title: \(title)") }
        if let role { details.append("role: \(role)") }
        if let roleDescription { details.append("role description: \(roleDescription)") }
        if let description { details.append("description: \(description)") }
        if let value { details.append("value: \(value)") }
        if let url { details.append("url: \(url)") }

        let attachments = captureElementAttachment(element: element, role: role) ?? captureFrontmostWindowAttachment()
        return VoiceCursorContext(
            selectedText: selectedText,
            focusedSelectedText: focusedSelectedText,
            details: details.isEmpty ? [appName] : ([appName] + details),
            attachments: attachments,
            hoveredURL: url,
            hoveredTitle: title ?? description ?? value,
            hoveredRole: role ?? roleDescription
        )
    }

    private func frontmostAppContext() -> String {
        let appName = NSWorkspace.shared.frontmostApplication?.localizedName ?? "Unknown app"
        return "frontmost app: \(appName)"
    }

    private func frontmostApplicationName() -> String {
        NSWorkspace.shared.frontmostApplication?.localizedName ?? "Unknown app"
    }

    private func captureElementAttachment(element: AXUIElement, role: String?) -> [AgentChatAttachmentPayload]? {
        guard let frame = copyAXFrame(from: element), frame.width >= 24, frame.height >= 24 else { return nil }
        let loweredRole = role?.lowercased() ?? ""
        let looksVisual = loweredRole.contains("image") || loweredRole.contains("webarea") || loweredRole.contains("group")
        let bounded = Self.boundedScreenshotRect(frame, maxSide: looksVisual ? 1_200 : 900)
        return captureScreenshotAttachment(rect: bounded, name: looksVisual ? "selected-context.jpg" : "hovered-context.jpg")
    }

    private func captureFrontmostWindowAttachment() -> [AgentChatAttachmentPayload] {
        guard let app = NSWorkspace.shared.frontmostApplication else { return [] }
        guard let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else {
            return []
        }
        guard let window = windows.first(where: { info in
            let ownerPID = info[kCGWindowOwnerPID as String] as? pid_t
            let layer = info[kCGWindowLayer as String] as? Int
            return ownerPID == app.processIdentifier && layer == 0
        }),
        let boundsDict = window[kCGWindowBounds as String] as? [String: Any],
        let bounds = CGRect(dictionaryRepresentation: boundsDict as CFDictionary)
        else {
            return []
        }
        return captureScreenshotAttachment(rect: Self.boundedScreenshotRect(bounds, maxSide: 1_200), name: "page-context.jpg")
    }

    private func captureScreenshotAttachment(rect: CGRect, name: String) -> [AgentChatAttachmentPayload] {
        let clipped = rect.integral
        guard clipped.width >= 24, clipped.height >= 24 else { return [] }
        guard let image = CGWindowListCreateImage(clipped, .optionOnScreenOnly, kCGNullWindowID, [.bestResolution]) else {
            return []
        }
        guard let data = Self.jpegData(from: image, compressionQuality: 0.72) else { return [] }
        return [
            AgentChatAttachmentPayload(
                name: name,
                mimeType: "image/jpeg",
                contentBase64: data.base64EncodedString()
            ),
        ]
    }

    private static func boundedScreenshotRect(_ rect: CGRect, maxSide: CGFloat) -> CGRect {
        guard rect.width > maxSide || rect.height > maxSide else { return rect }
        let scale = min(maxSide / max(rect.width, 1), maxSide / max(rect.height, 1))
        let size = CGSize(width: rect.width * scale, height: rect.height * scale)
        return CGRect(
            x: rect.midX - size.width / 2,
            y: rect.midY - size.height / 2,
            width: size.width,
            height: size.height
        )
    }

    nonisolated private static func jpegData(from image: CGImage, compressionQuality: CGFloat) -> Data? {
        let bitmap = NSBitmapImageRep(cgImage: image)
        return bitmap.representation(using: .jpeg, properties: [.compressionFactor: compressionQuality])
    }

    private func extractURL(from text: String) -> String? {
        let pattern = #"https?://[^\s<>"']+"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return nil }
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        guard let match = regex.firstMatch(in: text, range: range), let swiftRange = Range(match.range, in: text) else {
            return nil
        }
        return String(text[swiftRange]).trimmingCharacters(in: CharacterSet(charactersIn: ".,);]"))
    }

    private func isImageBookmarkIntent(_ transcript: String) -> Bool {
        let normalized = normalizedForIntent(transcript)
        return normalized.contains("image") ||
            normalized.contains("picture") ||
            normalized.contains("photo") ||
            normalized.contains("imagen") ||
            normalized.contains("foto")
    }

    private func bookmarkTitle(for intent: VoiceCaptureResult, url: String, isImage: Bool) -> String {
        let cleanedTitle = intent.title.trimmingCharacters(in: .whitespacesAndNewlines)
        let commandTitles = [
            "bookmark this",
            "save this bookmark",
            "save this link",
            "save this page",
            "save this image",
            "save image",
            "bookmark this image",
            "capture this image",
            "guarda este link",
            "guardar link",
            "guarda esta imagen",
            "guardar imagen",
            "marcador",
        ]
        if !cleanedTitle.isEmpty && !commandTitles.contains(cleanedTitle.lowercased()) {
            return cleanedTitle
        }
        if isImage, let title = pendingCursorContext.hoveredTitle?.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty {
            return title.prefix(80).description
        }
        guard let parsed = URL(string: url) else { return isImage ? "Saved image" : url }
        let lastPath = parsed.pathComponents.last?.removingPercentEncoding?.replacingOccurrences(of: "[-_]+", with: " ", options: .regularExpression)
        if let lastPath, !lastPath.isEmpty, lastPath != "/" {
            return lastPath.prefix(80).description
        }
        return parsed.host ?? (isImage ? "Saved image" : url)
    }

    private func contextNoteForPrompt(_ prompt: String) -> String? {
        var context = pendingCursorContext.promptText.trimmingCharacters(in: .whitespacesAndNewlines)
        if shouldAttachVisualContext(for: prompt), pendingCursorContext.attachments.isEmpty {
            let note = "visual context unavailable: screenshot capture did not return an image."
            context = context.isEmpty ? note : "\(context)\n\(note)"
        }
        guard !context.isEmpty else { return nil }
        return """
        Atlas context:
        \(context)

        Resolve words like "this", "that", "look at this", "translate this", or "summarize this" against the selected text, focused text, hovered UI element, URL, visual attachment, and frontmost app context above. If selected text is present, treat it as the primary object of the request.
        """
    }

    private func attachmentsForPrompt(_ prompt: String) -> [AgentChatAttachmentPayload] {
        guard shouldAttachVisualContext(for: prompt) else { return [] }
        return pendingCursorContext.attachments
    }

    private func shouldAttachVisualContext(for prompt: String) -> Bool {
        let normalized = normalizedForIntent(prompt)
        let markers = [
            "image", "photo", "picture", "screenshot", "screen", "page", "website", "site", "visual", "see", "look",
            "imagen", "foto", "captura", "pantalla", "pagina", "página", "sitio", "visual", "ves", "mira",
        ]
        return markers.contains { normalized.contains($0) }
    }

    nonisolated private static func requestAccessibilityPermissionIfNeeded() {
        guard !AXIsProcessTrusted() else { return }
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        _ = AXIsProcessTrustedWithOptions(options)
    }

    nonisolated private static func hasSystemAudioPermission() -> Bool {
        CGPreflightScreenCaptureAccess()
    }

    nonisolated private static func requestSystemAudioPermissionIfNeeded() {
        guard !CGPreflightScreenCaptureAccess() else { return }
        _ = CGRequestScreenCaptureAccess()
    }

    nonisolated private static func copyAXStringAttribute(_ attribute: String, from element: AXUIElement) -> String? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success else { return nil }
        return value as? String
    }

    nonisolated private static func copyAXAnyStringAttribute(_ attribute: String, from element: AXUIElement) -> String? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success, let value else { return nil }
        if let text = value as? String {
            return text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : text
        }
        if let url = value as? URL {
            return url.absoluteString
        }
        return String(describing: value)
    }

    nonisolated private static func focusedSelectedText() -> String? {
        let systemWideElement = AXUIElementCreateSystemWide()
        var focusedElementValue: CFTypeRef?
        let error = AXUIElementCopyAttributeValue(
            systemWideElement,
            kAXFocusedUIElementAttribute as CFString,
            &focusedElementValue
        )
        guard error == .success, let focusedElementValue else { return nil }
        guard CFGetTypeID(focusedElementValue) == AXUIElementGetTypeID() else { return nil }
        return copyAXAnyStringAttribute(kAXSelectedTextAttribute, from: focusedElementValue as! AXUIElement)
    }

    nonisolated private static func copyAXBoolAttribute(_ attribute: String, from element: AXUIElement) -> Bool? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success else { return nil }
        return value as? Bool
    }

    nonisolated private static func copyAXSelectedTextRange(from element: AXUIElement) -> CFRange? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, kAXSelectedTextRangeAttribute as CFString, &value) == .success,
              let value,
              CFGetTypeID(value) == AXValueGetTypeID()
        else {
            return nil
        }

        let axValue = value as! AXValue
        guard AXValueGetType(axValue) == .cfRange else { return nil }
        var range = CFRange()
        guard AXValueGetValue(axValue, .cfRange, &range) else { return nil }
        return range
    }

    private func copyAXFrame(from element: AXUIElement) -> CGRect? {
        var positionValue: CFTypeRef?
        var sizeValue: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, kAXPositionAttribute as CFString, &positionValue) == .success,
              AXUIElementCopyAttributeValue(element, kAXSizeAttribute as CFString, &sizeValue) == .success,
              let positionValue,
              let sizeValue,
              CFGetTypeID(positionValue) == AXValueGetTypeID(),
              CFGetTypeID(sizeValue) == AXValueGetTypeID()
        else {
            return nil
        }

        let positionAXValue = positionValue as! AXValue
        let sizeAXValue = sizeValue as! AXValue
        guard AXValueGetType(positionAXValue) == .cgPoint,
              AXValueGetType(sizeAXValue) == .cgSize
        else {
            return nil
        }

        var position = CGPoint.zero
        var size = CGSize.zero
        guard AXValueGetValue(positionAXValue, .cgPoint, &position),
              AXValueGetValue(sizeAXValue, .cgSize, &size)
        else {
            return nil
        }
        return CGRect(origin: position, size: size)
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
        if isListening {
            stopVoiceCapture()
        }

        do {
            let recognizer = speechRecognizer
            let speechAuth = SFSpeechRecognizer.authorizationStatus() == .authorized
                ? SFSpeechRecognizerAuthorizationStatus.authorized
                : await Self.requestSpeechAuthorization()
            guard speechAuth == .authorized else {
                statusMessage = "Allow Speech Recognition to capture meeting text."
                return
            }
            guard let recognizer, recognizer.isAvailable else {
                statusMessage = "Speech recognition is unavailable right now."
                return
            }
            Self.requestSystemAudioPermissionIfNeeded()
            guard Self.hasSystemAudioPermission() else {
                statusMessage = "Allow Screen & System Audio Recording to capture meeting text."
                openPrivacySettings(anchor: "Privacy_ScreenCapture")
                return
            }

            recognitionTask?.cancel()
            recognitionTask = nil
            recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
            recognitionRequest?.shouldReportPartialResults = true
            let previewRequest = recognitionRequest
            let appendQueue = speechAppendQueue
            let recordingId = UUID().uuidString
            let tempDirectory = FileManager.default.temporaryDirectory
            let systemAudioURL = tempDirectory.appendingPathComponent("dragonfruit-meeting-system-\(recordingId).m4a")
            await systemAudioCapture.stop()
            try await systemAudioCapture.start(
                recordingTo: systemAudioURL,
                onAudioSampleBuffer: { sampleBuffer in
                    if let request = previewRequest {
                        appendQueue.async {
                            request.appendAudioSampleBuffer(sampleBuffer)
                        }
                    }
                },
                onError: { [weak self] error in
                    Task { @MainActor in
                        guard let self, self.isMeetingRecording else { return }
                        self.statusMessage = "System audio capture stopped: \(error.localizedDescription)"
                    }
                }
            )

            meetingNotesTranscript = ""
            meetingStartPrompt = nil
            recordingMeeting = meeting
            meetingMicAudioFile = nil
            meetingMicAudioURL = nil
            meetingSystemAudioURL = systemAudioURL
            isMeetingRecording = true
            meetingState = "Recording"
            statusMessage = "Capturing meeting text locally. Audio will be deleted after transcription."

            if let request = previewRequest {
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
                            self.meetingNotesTranscript = ""
                        }
                    }
                }
            }
        } catch {
            statusMessage = "Meeting recording failed: \(error.localizedDescription)"
            stopAudioCapture()
        }
    }

    private func stopMeetingRecordingAndSave() async {
        await stopMeetingAudioCapture()
        isMeetingRecording = false
        meetingState = "Saving"

        var transcript = meetingNotesTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
        let systemAudioURL = meetingSystemAudioURL
        if let systemAudioURL, FileManager.default.fileExists(atPath: systemAudioURL.path) {
            statusMessage = "Transcribing meeting text locally with Whisper.cpp..."
            do {
                let whisperTranscript = try await transcribeWithWhisperCPP(audioURL: systemAudioURL)
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                if !whisperTranscript.isEmpty {
                    transcript = whisperTranscript
                    meetingNotesTranscript = whisperTranscript
                }
            } catch {
                if transcript.isEmpty {
                    meetingState = "Summary"
                    statusMessage = "Whisper.cpp transcription failed: \(error.localizedDescription)"
                    try? FileManager.default.removeItem(at: systemAudioURL)
                    meetingSystemAudioURL = nil
                    return
                }
                statusMessage = "Whisper.cpp failed; saving live transcript."
            }
        }
        if transcript.isEmpty {
            meetingState = "Summary"
            statusMessage = "Recording stopped. No meeting text captured."
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
            let notes = formattedMeetingNotes(from: transcript, meeting: targetMeeting)
            let draft = try await client.createMeetingNotesDraft(
                workspaceSlug: workspace.slug,
                meeting: targetMeeting,
                notes: notes,
                micAudioURL: nil,
                systemAudioURL: nil
            )
            lastMeetingNotesURL = draft.url.flatMap(URL.init(string:))
            lastSavedMeetingTitle = targetMeeting.title
            meetingState = "Notes ready"
            statusMessage = "Meeting notes saved to Docs."
            notifyMeetingNotesSaved(title: targetMeeting.title)
        } catch {
            meetingState = "Summary"
            statusMessage = "Could not save meeting notes: \(error.localizedDescription)"
        }
        if let systemAudioURL {
            try? FileManager.default.removeItem(at: systemAudioURL)
        }
        meetingMicAudioURL = nil
        meetingSystemAudioURL = nil
    }

    private func formattedMeetingNotes(from transcript: String, meeting: MeetingInfo) -> String {
        let trimmedTranscript = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        let actionItems = extractActionItems(from: trimmedTranscript)
        let actionText = actionItems.isEmpty
            ? "- No explicit action items detected."
            : actionItems.map { "- \($0)" }.joined(separator: "\n")

        return """
        Meeting: \(meeting.title)

        Action items:
        \(actionText)

        Transcript:
        \(trimmedTranscript)
        """
    }

    private func extractActionItems(from transcript: String) -> [String] {
        let separators = CharacterSet(charactersIn: ".!?\n")
        let candidates = transcript
            .components(separatedBy: separators)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { $0.count >= 8 }

        let actionMarkers = [
            "action item",
            "todo",
            "to do",
            "follow up",
            "need to",
            "needs to",
            "we should",
            "we need",
            "we will",
            "we'll",
            "i will",
            "i'll",
            "let's",
            "please",
            "can you",
            "could you",
        ]

        var seen = Set<String>()
        var items: [String] = []
        for candidate in candidates {
            let normalized = candidate.lowercased()
            guard actionMarkers.contains(where: { normalized.contains($0) }) else { continue }
            guard !seen.contains(normalized) else { continue }
            seen.insert(normalized)
            items.append(candidate)
            if items.count == 12 { break }
        }
        return items
    }

    private func transcribeWithWhisperCPP(audioURL: URL) async throws -> String {
        let binaryURL = try whisperCPPBinaryURL()
        let modelURL = try whisperCPPModelURL()
        let tempDirectory = FileManager.default.temporaryDirectory
        let wavURL = tempDirectory.appendingPathComponent("dragonfruit-whisper-\(UUID().uuidString).wav")
        let outputPrefix = tempDirectory
            .appendingPathComponent("dragonfruit-whisper-output-\(UUID().uuidString)")
            .path
        let outputURL = URL(fileURLWithPath: "\(outputPrefix).txt")

        defer {
            try? FileManager.default.removeItem(at: wavURL)
            try? FileManager.default.removeItem(at: outputURL)
        }

        try await runProcess(
            executableURL: URL(fileURLWithPath: "/usr/bin/afconvert"),
            arguments: ["-f", "WAVE", "-d", "LEI16@16000", audioURL.path, wavURL.path]
        )
        try await runProcess(
            executableURL: binaryURL,
            arguments: [
                "-m", modelURL.path,
                "-f", wavURL.path,
                "-otxt",
                "-of", outputPrefix,
                "-nt",
            ]
        )

        return try String(contentsOf: outputURL, encoding: .utf8)
    }

    private func whisperCPPBinaryURL() throws -> URL {
        let defaults = UserDefaults.standard
        let candidates = [
            defaults.string(forKey: "df_whisper_cpp_binary"),
            ProcessInfo.processInfo.environment["WHISPER_CPP_BINARY"],
            "\(NSHomeDirectory())/whisper.cpp/build/bin/whisper-cli",
            "\(NSHomeDirectory())/Code/whisper.cpp/build/bin/whisper-cli",
            "/opt/homebrew/bin/whisper-cli",
            "/usr/local/bin/whisper-cli",
        ].compactMap { $0 }.filter { !$0.isEmpty }

        for path in candidates where FileManager.default.isExecutableFile(atPath: path) {
            return URL(fileURLWithPath: path)
        }
        throw NSError(
            domain: "DragonFruitNative",
            code: 3001,
            userInfo: [NSLocalizedDescriptionKey: "whisper.cpp binary not found. Set df_whisper_cpp_binary or WHISPER_CPP_BINARY."]
        )
    }

    private func whisperCPPModelURL() throws -> URL {
        let defaults = UserDefaults.standard
        let candidates = [
            defaults.string(forKey: "df_whisper_cpp_model"),
            ProcessInfo.processInfo.environment["WHISPER_CPP_MODEL"],
            "\(NSHomeDirectory())/Library/Application Support/DragonFruit/Whisper/ggml-base.en.bin",
            "\(NSHomeDirectory())/Library/Application Support/Screen Studio/models/ggml-base.bin",
            "\(NSHomeDirectory())/Library/Application Support/Screen Studio/models/ggml-small.bin",
            "\(NSHomeDirectory())/whisper.cpp/models/ggml-base.en.bin",
            "\(NSHomeDirectory())/Code/whisper.cpp/models/ggml-base.en.bin",
            "\(NSHomeDirectory())/whisper.cpp/models/ggml-small.en.bin",
            "\(NSHomeDirectory())/Code/whisper.cpp/models/ggml-small.en.bin",
        ].compactMap { $0 }.filter { !$0.isEmpty }

        for path in candidates where FileManager.default.fileExists(atPath: path) {
            return URL(fileURLWithPath: path)
        }
        throw NSError(
            domain: "DragonFruitNative",
            code: 3002,
            userInfo: [NSLocalizedDescriptionKey: "Whisper model not found. Set df_whisper_cpp_model or WHISPER_CPP_MODEL."]
        )
    }

    private func runProcess(executableURL: URL, arguments: [String]) async throws {
        try await Task.detached(priority: .userInitiated) {
            let process = Process()
            process.executableURL = executableURL
            process.arguments = arguments
            let errorPipe = Pipe()
            process.standardError = errorPipe
            try process.run()
            process.waitUntilExit()
            guard process.terminationStatus == 0 else {
                let errorData = errorPipe.fileHandleForReading.readDataToEndOfFile()
                let errorText = String(data: errorData, encoding: .utf8)?
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                throw NSError(
                    domain: "DragonFruitNative",
                    code: Int(process.terminationStatus),
                    userInfo: [NSLocalizedDescriptionKey: errorText?.isEmpty == false ? errorText! : "Process failed."]
                )
            }
        }.value
    }

    private func stopMeetingAudioCapture() async {
        stopMicrophoneCapture()
        await systemAudioCapture.stop()
        meetingMicAudioFile = nil
        stopSpeechRecognitionPipeline()
    }

    private func stopAudioCapture() {
        stopMicrophoneCapture()
        Task { await systemAudioCapture.stop() }
        stopSpeechRecognitionPipeline()
    }

    private func stopMicrophoneCapture() {
        audioEngine.stop()
        removeInputTapIfNeeded()
        audioEngine.reset()
        audioLevel = 0
    }

    private func stopSpeechRecognitionPipeline() {
        let request = recognitionRequest
        recognitionRequest = nil
        speechAppendQueue.async {
            request?.endAudio()
        }
        recognitionTask?.finish()
        recognitionTask?.cancel()
        recognitionTask = nil
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

    private func startVoiceCapture(mode: VoiceCaptureMode, requiredHeldHotKeyID: UInt32? = nil) async {
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
        if mode == .dictation {
            Self.requestAccessibilityPermissionIfNeeded()
            guard AXIsProcessTrusted() else {
                statusMessage = "Allow Accessibility access to use dictation."
                openAccessibilitySettings()
                return
            }
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
            if let requiredHeldHotKeyID, !heldHotKeyIds.contains(requiredHeldHotKeyID) {
                statusMessage = "Dictation cancelled."
                return
            }

            recognitionTask?.cancel()
            recognitionTask = nil
            recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
            guard let request = recognitionRequest else { return }
            request.shouldReportPartialResults = true
            let appendQueue = speechAppendQueue

            voiceCaptureMode = mode
            lastTranscript = ""
            pendingVoiceTranscript = ""
            voiceTranscriptFlushTask?.cancel()
            voiceTranscriptFlushTask = nil
            if mode == .dictation {
                prepareStreamingDictation()
            }
            let node = audioEngine.inputNode
            let format = try inputTapFormat(for: node)
            removeInputTapIfNeeded()
            node.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
                appendQueue.async {
                    request.append(buffer)
                }
                let level = Self.normalizedAudioLevel(from: buffer)
                Task { @MainActor [weak self] in
                    self?.updateAudioLevel(level)
                }
            }
            isInputTapInstalled = true

            audioEngine.prepare()
            try audioEngine.start()
            isListening = true
            statusMessage = statusMessageForListening(mode: mode)
            if let requiredHeldHotKeyID, !heldHotKeyIds.contains(requiredHeldHotKeyID) {
                stopVoiceCapture()
                statusMessage = "Dictation cancelled."
                return
            }

            recognitionTask = Self.startRecognitionTask(recognizer: recognizer, request: request) { [weak self] result, error in
                if let result {
                    let transcript = result.bestTranscription.formattedString
                    let isFinal = result.isFinal
                    Task { @MainActor in
                        guard let self else { return }
                        self.queueVoiceTranscriptUpdate(transcript)
                        if isFinal {
                            self.streamDictationText(transcript)
                        }
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
            finishStreamingDictation()
            audioLevel = 0
            isListening = false
        }
    }

    private func stopVoiceCapture() {
        let wasListening = isListening
        isListening = false
        audioLevel = 0
        stopAudioCapture()
        guard wasListening else { return }
        voiceTranscriptFlushTask?.cancel()
        voiceTranscriptFlushTask = nil
        if !pendingVoiceTranscript.isEmpty {
            lastTranscript = pendingVoiceTranscript
            pendingVoiceTranscript = ""
        }

        let text = lastTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            finishStreamingDictation()
            statusMessage = "Stopped listening."
            return
        }

        if voiceCaptureMode == .dictation {
            if dictationStreamedText.isEmpty {
                dictationSavedPasteboardItems = nil
                typeTextIntoFocusedInput(text)
            } else {
                streamDictationText(text)
                finishStreamingDictation()
                statusMessage = "Typed dictation."
            }
            return
        }

        if let transformIntent = transformIntent(from: text) {
            guard let selectedText = pendingCursorContext.primaryText else {
                statusMessage = "Select text first, then ask Atlas to translate or rewrite it."
                return
            }
            isVoiceActionProcessing = true
            Task { @MainActor in
                await triggerAgentTransform(transformIntent, selectedText: selectedText)
            }
            return
        }

        let intent = classifyIntent(from: text)
        lastCapture = intent
        statusMessage = statusMessage(for: intent.type)

        if intent.type == .agent {
            isVoiceActionProcessing = true
            Task { @MainActor in
                await triggerAgentPrompt(
                    text,
                    toolMode: "none",
                    attachments: attachmentsForPrompt(text),
                    contextNote: contextNoteForPrompt(text)
                )
            }
        } else {
            isVoiceActionProcessing = true
            Task { @MainActor in
                await persistVoiceIntent(intent)
            }
        }
    }

    private func statusMessageForListening(mode: VoiceCaptureMode) -> String {
        switch mode {
        case .copilot:
            return "Atlas listening... (⌥Space to finish)"
        case .dictation:
            return "Dictating... (release ⌥ to stop)"
        case .intent:
            return "Atlas listening... (⌥Space to finish)"
        }
    }

    private func updateAudioLevel(_ level: CGFloat) {
        let now = Date().timeIntervalSinceReferenceDate
        guard now - lastAudioLevelPublishedAt > 0.035 else { return }
        lastAudioLevelPublishedAt = now
        audioLevel = max(0, min(1, level))
    }

    nonisolated private static func normalizedAudioLevel(from buffer: AVAudioPCMBuffer) -> CGFloat {
        guard let channelData = buffer.floatChannelData, buffer.frameLength > 0 else { return 0 }
        let channelCount = Int(buffer.format.channelCount)
        let frameCount = Int(buffer.frameLength)
        var sum: Float = 0

        for channel in 0..<max(1, channelCount) {
            let samples = channelData[channel]
            for frame in 0..<frameCount {
                let sample = samples[frame]
                sum += sample * sample
            }
        }

        let meanSquare = sum / Float(max(1, frameCount * max(1, channelCount)))
        let rms = sqrt(meanSquare)
        let adjusted = max(0, min(1, (rms - 0.012) * 14))
        return CGFloat(adjusted)
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

        restoreDictationTargetFocus()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) {
            self.postKeyboardShortcut(virtualKey: 9, flags: .maskCommand, source: source)
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            pasteboard.clearContents()
            pasteboard.writeObjects(previousItems)
        }
        statusMessage = "Typed dictation."
    }

    private func copyDictationToClipboard(_ text: String) {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(text, forType: .string)
        statusMessage = "Copied dictation. Press ⌘V to paste."
    }

    private func prepareStreamingDictation() {
        dictationStreamedText = ""
        dictationSavedPasteboardItems = NSPasteboard.general.pasteboardItems?.map(Self.copyPasteboardItem) ?? []
        dictationTargetApplication = NSWorkspace.shared.frontmostApplication
        dictationTargetElement = Self.focusedTextElement()
    }

    private func finishStreamingDictation() {
        guard let savedItems = dictationSavedPasteboardItems else {
            dictationStreamedText = ""
            dictationTargetApplication = nil
            dictationTargetElement = nil
            return
        }
        dictationSavedPasteboardItems = nil
        dictationStreamedText = ""
        dictationTargetApplication = nil
        dictationTargetElement = nil
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            let pasteboard = NSPasteboard.general
            pasteboard.clearContents()
            pasteboard.writeObjects(savedItems)
        }
    }

    private func streamDictationText(_ transcript: String) {
        guard voiceCaptureMode == .dictation else { return }
        let nextText = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !nextText.isEmpty, nextText != dictationStreamedText else { return }
        guard AXIsProcessTrusted() else { return }
        guard let source = CGEventSource(stateID: .hidSystemState) else { return }

        if dictationStreamedText.isEmpty {
            pasteStreamingDictationText(nextText, source: source)
        } else if nextText.hasPrefix(dictationStreamedText) {
            let suffix = String(nextText.dropFirst(dictationStreamedText.count))
            pasteStreamingDictationText(suffix, source: source)
        } else {
            selectPreviousCharacters(dictationStreamedText.count, source: source)
            pasteStreamingDictationText(nextText, source: source)
        }
        dictationStreamedText = nextText
    }

    private func pasteStreamingDictationText(_ text: String, source: CGEventSource) {
        guard !text.isEmpty else { return }
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(text, forType: .string)
        restoreDictationTargetFocus()
        postKeyboardShortcut(virtualKey: 9, flags: .maskCommand, source: source)
    }

    private func insertTextIntoDictationTarget(_ text: String, replacingPreviousCount: Int = 0) -> Bool {
        guard !text.isEmpty else { return true }
        let element = dictationTargetElement ?? Self.focusedTextElement()
        guard let element else { return false }

        restoreDictationTargetFocus()

        if replacingPreviousCount <= 0,
           AXUIElementSetAttributeValue(element, kAXSelectedTextAttribute as CFString, text as CFTypeRef) == .success {
            return true
        }

        guard let currentValue = Self.copyAXStringAttribute(kAXValueAttribute, from: element),
              var selectedRange = Self.copyAXSelectedTextRange(from: element)
        else {
            return false
        }

        let characters = Array(currentValue)
        let boundedLocation = min(max(0, selectedRange.location), characters.count)
        let replacementLength: Int
        if replacingPreviousCount > 0, selectedRange.length == 0 {
            let replacementStart = max(0, boundedLocation - replacingPreviousCount)
            replacementLength = boundedLocation - replacementStart
            selectedRange = CFRange(location: replacementStart, length: replacementLength)
        } else {
            replacementLength = max(0, min(selectedRange.length, characters.count - boundedLocation))
            selectedRange = CFRange(location: boundedLocation, length: replacementLength)
        }

        let prefix = String(characters.prefix(selectedRange.location))
        let suffixStart = min(characters.count, selectedRange.location + selectedRange.length)
        let suffix = String(characters.dropFirst(suffixStart))
        let nextValue = prefix + text + suffix

        guard AXUIElementSetAttributeValue(element, kAXValueAttribute as CFString, nextValue as CFTypeRef) == .success else {
            return false
        }

        var nextSelection = CFRange(location: selectedRange.location + text.count, length: 0)
        if let axRange = AXValueCreate(.cfRange, &nextSelection) {
            AXUIElementSetAttributeValue(element, kAXSelectedTextRangeAttribute as CFString, axRange)
        }
        return true
    }

    private func restoreDictationTargetFocus() {
        dictationTargetApplication?.activate(options: [.activateIgnoringOtherApps])
        if let element = dictationTargetElement {
            AXUIElementSetAttributeValue(element, kAXFocusedAttribute as CFString, kCFBooleanTrue)
        }
    }

    private func selectPreviousCharacters(_ count: Int, source: CGEventSource) {
        guard count > 0 else { return }
        for _ in 0..<count {
            postKeyboardShortcut(virtualKey: CGKeyCode(kVK_LeftArrow), flags: .maskShift, source: source)
        }
    }

    private func postKeyboardShortcut(virtualKey: CGKeyCode, flags: CGEventFlags, source: CGEventSource) {
        let keyDown = CGEvent(keyboardEventSource: source, virtualKey: virtualKey, keyDown: true)
        let keyUp = CGEvent(keyboardEventSource: source, virtualKey: virtualKey, keyDown: false)
        keyDown?.flags = flags
        keyUp?.flags = flags
        keyDown?.post(tap: .cghidEventTap)
        keyUp?.post(tap: .cghidEventTap)
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
        let normalized = normalizedForIntent(transcript)
        let project = extractProjectHint(from: transcript)
        let type: VoiceCaptureType

        let stickyMarkers = ["sticky", "stickie", "stickies", "stickiy", "stick ", "post it", "post-it", "note", "nota", "idea", "memo"]
        let bookmarkMarkers = [
            "bookmark", "book mark", "save this link", "save this page", "save this url",
            "save this image", "save image", "bookmark this image", "capture this image",
            "guardar link", "guarda este link", "guarda esta imagen", "guardar imagen", "marcador",
        ]
        let docMarkers = ["doc", "document", "documento", "spec", "file", "archivo", "page", "pagina", "nota larga", "brief"]
        let taskMarkers = ["task", "todo", "to do", "tarea", "issue", "bug", "ticket", "accion", "action", "follow up", "reminder", "recordatorio"]

        if isExplicitCreationRequest(normalized, verbs: bookmarkCreationVerbs, markers: bookmarkMarkers) {
            type = .bookmark
        } else if isExplicitCreationRequest(normalized, verbs: stickyCreationVerbs, markers: stickyMarkers) {
            type = .sticky
        } else if isExplicitCreationRequest(normalized, verbs: docCreationVerbs, markers: docMarkers) {
            type = .doc
        } else if isExplicitCreationRequest(normalized, verbs: taskCreationVerbs, markers: taskMarkers) {
            type = .task
        } else {
            type = .agent
        }

        let payload = cleanIntentPayload(from: transcript, type: type)
        let titleSource = payload.split(separator: ".").first.map(String.init) ?? payload
        let title = polishedIntentPayload(titleSource, type: type)
        return VoiceCaptureResult(
            type: type,
            projectHint: project,
            title: title.prefix(80).description,
            body: payload,
            rawTranscript: transcript
        )
    }

    private func normalizedForIntent(_ transcript: String) -> String {
        transcript
            .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: speechLanguage.locale)
            .lowercased()
    }

    private func containsAny(_ markers: [String], in text: String) -> Bool {
        markers.contains { text.contains($0) }
    }

    private var taskCreationVerbs: [String] {
        ["create", "make", "add", "new", "save", "build", "crear", "crea", "haz", "hacer", "agrega", "anade", "nuevo", "nueva", "guarda"]
    }

    private var docCreationVerbs: [String] {
        ["create", "write", "draft", "generate", "make", "prepare", "crear", "crea", "escribe", "redacta", "genera", "haz", "hacer", "prepara"]
    }

    private var stickyCreationVerbs: [String] {
        ["create", "make", "add", "save", "crear", "crea", "haz", "hacer", "agrega", "anade", "guarda"]
    }

    private var bookmarkCreationVerbs: [String] {
        ["bookmark", "save", "add", "capture", "guardar", "guarda", "agrega", "anade"]
    }

    private func isExplicitCreationRequest(_ normalizedTranscript: String, verbs: [String], markers: [String]) -> Bool {
        guard !isInformationRequest(normalizedTranscript) else { return false }
        return containsAny(verbs, in: normalizedTranscript) && containsAny(markers, in: normalizedTranscript)
    }

    private func statusMessage(for type: VoiceCaptureType) -> String {
        switch type {
        case .agent:
            return "Thinking..."
        case .task:
            return "Creating task..."
        case .doc:
            return "Creating document..."
        case .sticky:
            return "Creating sticky..."
        case .bookmark:
            return "Saving bookmark..."
        }
    }

    private func cleanIntentPayload(from transcript: String, type: VoiceCaptureType) -> String {
        let trimmed = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return transcript }

        let contentMarkers = [
            " en el que diga ", " en la que diga ", " que diga ", " que diga: ", " donde diga ",
            " con el texto ", " con texto ", " que se llame ", " llamado ", " llamada ",
            " titled ", " called ", " saying ", " that says ", " with the text ", " with text ",
        ]
        for marker in contentMarkers {
            if let tail = tailAfter(marker: marker, in: trimmed), !tail.isEmpty {
                return polishedIntentPayload(tail, type: type)
            }
        }

        var cleaned = trimmed
        let prefixes = commandPrefixes(for: type)
        for prefix in prefixes.sorted(by: { $0.count > $1.count }) {
            let lowered = cleaned.lowercased()
            if lowered.hasPrefix(prefix) {
                cleaned = String(cleaned.dropFirst(prefix.count)).trimmingCharacters(in: .whitespacesAndNewlines)
                break
            }
        }

        let leadingConnectors = ["que diga", "diga", "con", "sobre", "para", "called", "titled", "saying", "that says"]
        var removedConnector = true
        while removedConnector {
            removedConnector = false
            for connector in leadingConnectors.sorted(by: { $0.count > $1.count }) {
                let lowered = cleaned.lowercased()
                if lowered.hasPrefix(connector + " ") {
                    cleaned = String(cleaned.dropFirst(connector.count)).trimmingCharacters(in: .whitespacesAndNewlines)
                    removedConnector = true
                    break
                }
            }
        }

        return polishedIntentPayload(cleaned.isEmpty ? trimmed : cleaned, type: type)
    }

    private func commandPrefixes(for type: VoiceCaptureType) -> [String] {
        let general = ["crea ", "crear ", "create ", "make ", "add ", "agrega ", "añade ", "haz "]
        let specific: [String]
        switch type {
        case .task:
            specific = ["crea una tarea", "crea un task", "create a task", "add a task", "make a task", "tarea"]
        case .doc:
            specific = ["crea un documento", "crea un doc", "create a doc", "create a document", "documento", "doc"]
        case .sticky:
            specific = ["crea un sticky", "crea una sticky", "crea una nota", "crea un note", "create a sticky", "create a note", "make a sticky", "add a sticky", "sticky", "nota"]
        case .bookmark:
            specific = [
                "bookmark this", "save this bookmark", "save this link", "save this page",
                "save this image", "save image", "bookmark this image", "add bookmark", "bookmark",
                "guarda este link", "guardar link", "guarda esta imagen", "guardar imagen", "marcador",
            ]
        case .agent:
            specific = ["pregunta ", "ask ", "agent ", "dragonfruit agent "]
        }
        return specific + general
    }

    private func tailAfter(marker: String, in text: String) -> String? {
        let lowered = text.lowercased()
        guard let range = lowered.range(of: marker) else { return nil }
        let offset = lowered.distance(from: lowered.startIndex, to: range.upperBound)
        let index = text.index(text.startIndex, offsetBy: offset)
        return String(text[index...]).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func polishedIntentPayload(_ text: String, type: VoiceCaptureType) -> String {
        var cleaned = text.trimmingCharacters(in: .whitespacesAndNewlines)
        cleaned = cleaned.trimmingCharacters(in: CharacterSet(charactersIn: "\"'“”‘’.,:;"))
        guard type == .sticky else { return cleaned }

        let hasUppercase = cleaned.unicodeScalars.contains { CharacterSet.uppercaseLetters.contains($0) }
        guard !hasUppercase, cleaned.count <= 48 else { return cleaned }
        return cleaned.localizedCapitalized
    }

    private func isInformationRequest(_ lowercasedTranscript: String) -> Bool {
        let markers = [
            "?", "what", "why", "how", "explain", "opinion", "think", "info", "information", "help me",
            "get ", "find ", "show ", "list ", "fetch ",
            "que ", "qué", "por que", "por qué", "como ", "cómo", "explica", "opinion", "opinión", "informacion", "información", "ayuda",
            "obten ", "busca ", "muestra ", "lista ",
        ]
        return markers.contains { lowercasedTranscript.contains($0) }
    }

    private func transformIntent(from transcript: String) -> VoiceTransformIntent? {
        let normalized = normalizedForIntent(transcript)
        let translateMarkers = [
            "translate this", "translate selected", "translate selection", "translate the selected",
            "traduce esto", "traducir esto", "traduce seleccionado", "traduce el texto", "traduce la seleccion", "traduce la selección",
        ]
        if translateMarkers.contains(where: { normalized.contains($0) }) {
            return .translate(targetLanguage: targetLanguage(from: normalized))
        }

        let rewriteMarkers = [
            "rewrite this", "rewrite selected", "rewrite selection", "rephrase this", "make this clearer", "make it clearer",
            "fix this", "improve this", "clean this up", "polish this",
            "reescribe esto", "reescribir esto", "reescribe seleccionado", "mejora esto", "arregla esto", "hazlo mas claro", "hazlo más claro",
        ]
        if rewriteMarkers.contains(where: { normalized.contains($0) }) {
            return .rewrite(instruction: transcript.trimmingCharacters(in: .whitespacesAndNewlines))
        }
        return nil
    }

    private func targetLanguage(from normalizedTranscript: String) -> String? {
        let markers = [" to ", " into ", " a ", " al ", " en "]
        for marker in markers {
            guard let range = normalizedTranscript.range(of: marker) else { continue }
            let tail = normalizedTranscript[range.upperBound...]
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard !tail.isEmpty else { continue }
            let words = tail.split(separator: " ").prefix(3).joined(separator: " ")
            if !words.isEmpty { return words }
        }
        return nil
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
        defer { isVoiceActionProcessing = false }
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
                let resultTitle = created.name ?? title
                let url = resourceURL(type: .task, workspaceSlug: routing.workspaceSlug, projectId: projectId, entityId: created.id)
                lastVoiceActionResult = VoiceActionResult(
                    type: .task,
                    title: resultTitle,
                    detail: "Created in \(routing.projectName ?? "project")",
                    resourceURL: url
                )
                statusMessage = "Task created: \(resultTitle)"
            case .doc:
                guard let projectId = routing.projectId else {
                    statusMessage = "No project found for doc. Say the project name in your note."
                    return
                }
                statusMessage = "Buddy is creating the document..."
                await triggerAgentPrompt(
                    intent.rawTranscript,
                    projectId: projectId,
                    contextNote: contextNoteForPrompt(intent.rawTranscript),
                    forceDocumentTool: true
                )
            case .sticky:
                let created = try await client.createSticky(
                    workspaceSlug: routing.workspaceSlug,
                    title: title,
                    descriptionHtml: html
                )
                let resultTitle = created.name ?? title
                let url = resourceURL(type: .sticky, workspaceSlug: routing.workspaceSlug, projectId: nil, entityId: created.id)
                lastVoiceActionResult = VoiceActionResult(
                    type: .sticky,
                    title: resultTitle,
                    detail: "Created in \(routing.workspaceSlug)",
                    resourceURL: url
                )
                statusMessage = "Sticky created: \(resultTitle)"
            case .bookmark:
                guard let projectId = routing.projectId else {
                    statusMessage = "No project found for bookmark. Say the project name in your note."
                    return
                }
                let context = pendingCursorContext.promptText.trimmingCharacters(in: .whitespacesAndNewlines)
                let fallbackText = context.isEmpty ? intent.rawTranscript : context
                guard let bookmarkURL = pendingCursorContext.hoveredURL ?? extractURL(from: fallbackText) else {
                    statusMessage = "No URL found to bookmark. Hover or focus the page or image, then try again."
                    return
                }
                let isImageBookmark = isImageBookmarkIntent(intent.rawTranscript) || pendingCursorContext.looksLikeHoveredImage
                var metadata = [
                    "source_app": frontmostApplicationName(),
                    "captured_text": context,
                ]
                if isImageBookmark {
                    metadata["image_url"] = bookmarkURL
                    metadata["site_name"] = "Image"
                }
                let created = try await client.createBookmark(
                    workspaceSlug: routing.workspaceSlug,
                    projectId: projectId,
                    title: bookmarkTitle(for: intent, url: bookmarkURL, isImage: isImageBookmark),
                    url: bookmarkURL,
                    description: intent.body,
                    metadata: metadata,
                    tags: isImageBookmark ? ["image"] : []
                )
                let url = resourceURL(type: .bookmark, workspaceSlug: routing.workspaceSlug, projectId: projectId, entityId: created.id)
                lastVoiceActionResult = VoiceActionResult(
                    type: .bookmark,
                    title: created.title,
                    detail: "Saved in \(routing.projectName ?? "project")",
                    resourceURL: url
                )
                statusMessage = "Bookmark saved: \(created.title)"
            case .agent:
                await triggerAgentPrompt(
                    intent.body,
                    contextNote: contextNoteForPrompt(intent.body)
                )
            }
        } catch {
            statusMessage = "Could not save voice note: \(error.localizedDescription)"
        }
    }

    private func resourceURL(type: VoiceCaptureType, workspaceSlug: String, projectId: String?, entityId: String) -> URL? {
        let trimmedAppURL = appURL.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let base = URL(string: trimmedAppURL) else { return nil }
        let path: String
        switch type {
        case .task:
            guard let projectId else { return nil }
            path = "/\(workspaceSlug)/projects/\(projectId)/issues/\(entityId)"
        case .doc:
            guard let projectId else { return nil }
            path = "/\(workspaceSlug)/projects/\(projectId)/pages/\(entityId)"
        case .sticky:
            path = "/\(workspaceSlug)/stickies"
        case .bookmark:
            guard let projectId else { return nil }
            path = "/\(workspaceSlug)/projects/\(projectId)/bookmarks"
        case .agent:
            path = "/\(workspaceSlug)/settings/agents"
        }
        return URL(string: path, relativeTo: base)?.absoluteURL
    }

    private func resolveRouting(client: APIClient, projectHint: String) async throws -> RoutingTarget {
        let workspaces = try await client.listWorkspaces()
        guard let workspace = workspaces.first(where: { $0.slug == selectedWorkspaceSlug }) ?? workspaces.first else {
            throw NSError(domain: "DragonFruitNative", code: 100, userInfo: [NSLocalizedDescriptionKey: "No workspace available"])
        }
        if selectedWorkspaceSlug != workspace.slug {
            selectedWorkspaceSlug = workspace.slug
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

    private func triggerAgentPrompt(
        _ prompt: String,
        projectId: String? = nil,
        toolMode: String? = nil,
        attachments: [AgentChatAttachmentPayload]? = nil,
        contextNote: String? = nil,
        forceDocumentTool: Bool = false
    ) async {
        guard isAuthenticated else {
            statusMessage = "Sign in first to launch Atlas."
            isVoiceActionProcessing = false
            return
        }
        isVoiceActionProcessing = true
        agentResponseDismissTask?.cancel()
        agentResponseDismissTask = nil
        defer { isVoiceActionProcessing = false }
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
                    title: "Atlas Voice"
                )
                sessionId = createdSession.id
                activeAgentSessionByWorkspace[agentTarget.workspaceSlug] = sessionId
            }

            statusMessage = "Asking \(agentTarget.agentName)..."
            isAgentResponding = true
            let envelope = try await client.sendAgentChatMessage(
                workspaceSlug: agentTarget.workspaceSlug,
                sessionId: sessionId,
                content: prompt,
                projectId: projectId,
                toolMode: toolMode,
                attachments: attachments ?? attachmentsForPrompt(prompt),
                contextNote: contextNote ?? contextNoteForPrompt(prompt),
                forceDocumentTool: forceDocumentTool
            )

            if !envelope.assistant_message.error_message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Self.logger.error("Agent returned error: \(envelope.assistant_message.error_message, privacy: .public)")
                statusMessage = Self.userFacingAgentErrorMessage(envelope.assistant_message.error_message)
                lastAgentTextResponse = ""
                isAgentResponding = false
            } else {
                await streamAgentText(envelope.assistant_message.content)
                statusMessage = "Atlas replied."
                scheduleAgentResponseDismiss()
            }
        } catch {
            isAgentResponding = false
            Self.logger.error("Agent request failed: \(error.localizedDescription, privacy: .public)")
            statusMessage = Self.userFacingAgentErrorMessage(error.localizedDescription)
        }
    }

    private func triggerAgentTransform(_ intent: VoiceTransformIntent, selectedText: String) async {
        guard isAuthenticated else {
            statusMessage = "Sign in first to use Atlas transforms."
            isVoiceActionProcessing = false
            return
        }
        isVoiceActionProcessing = true
        agentResponseDismissTask?.cancel()
        agentResponseDismissTask = nil
        defer { isVoiceActionProcessing = false }
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
                    title: "Atlas Voice"
                )
                sessionId = createdSession.id
                activeAgentSessionByWorkspace[agentTarget.workspaceSlug] = sessionId
            }

            statusMessage = "Transforming selected text..."
            isAgentResponding = true
            let prompt = transformPrompt(for: intent, selectedText: selectedText)
            let envelope = try await client.sendAgentChatMessage(
                workspaceSlug: agentTarget.workspaceSlug,
                sessionId: sessionId,
                content: prompt,
                toolMode: "none"
            )
            isAgentResponding = false

            let errorMessage = envelope.assistant_message.error_message.trimmingCharacters(in: .whitespacesAndNewlines)
            guard errorMessage.isEmpty else {
                Self.logger.error("Agent transform returned error: \(errorMessage, privacy: .public)")
                statusMessage = Self.userFacingAgentErrorMessage(errorMessage)
                lastAgentTextResponse = ""
                return
            }

            let transformed = cleanTransformResponse(envelope.assistant_message.content)
            guard !transformed.isEmpty else {
                statusMessage = "Atlas returned an empty transform. Try again."
                lastAgentTextResponse = ""
                return
            }

            copyTextToClipboard(transformed)
            switch intent {
            case .translate:
                statusMessage = "Translated text copied to clipboard."
                lastAgentTextResponse = "Translated text copied to clipboard."
            case .rewrite:
                statusMessage = "Rewritten text copied to clipboard."
                lastAgentTextResponse = "Rewritten text copied to clipboard."
            }
            scheduleAgentResponseDismiss()
        } catch {
            isAgentResponding = false
            Self.logger.error("Agent transform failed: \(error.localizedDescription, privacy: .public)")
            statusMessage = Self.userFacingAgentErrorMessage(error.localizedDescription)
            lastAgentTextResponse = ""
        }
    }

    private func transformPrompt(for intent: VoiceTransformIntent, selectedText: String) -> String {
        let instruction: String
        switch intent {
        case .translate(let targetLanguage):
            if let targetLanguage, !targetLanguage.isEmpty {
                instruction = "Translate the selected text to \(targetLanguage)."
            } else {
                instruction = "Translate the selected text to the most likely requested language."
            }
        case .rewrite(let userInstruction):
            instruction = "Rewrite the selected text according to this voice instruction: \(userInstruction)"
        }
        return """
        \(instruction)
        Return only the transformed text. Do not add explanations, quotes, labels, markdown fences, or commentary.

        Selected text:
        \(selectedText)
        """
    }

    private func cleanTransformResponse(_ text: String) -> String {
        var cleaned = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if cleaned.hasPrefix("```"), cleaned.hasSuffix("```") {
            cleaned = cleaned
                .replacingOccurrences(of: #"^```[a-zA-Z0-9_-]*\s*"#, with: "", options: .regularExpression)
                .replacingOccurrences(of: #"```$"#, with: "", options: .regularExpression)
                .trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return cleaned.trimmingCharacters(in: CharacterSet(charactersIn: "\"“”"))
    }

    private func copyTextToClipboard(_ text: String) {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(text, forType: .string)
    }

    private static func userFacingAgentErrorMessage(_ rawMessage: String) -> String {
        let normalized = rawMessage.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if normalized.contains("timed out") || normalized.contains("timeout") {
            return "Atlas took too long to answer. Try again."
        }
        return "Atlas couldn’t answer that. Try again."
    }

    private func resolveAgentTarget(client: APIClient) async throws -> AgentRoutingTarget {
        if let selected = agentsForSelectedWorkspace.first(where: { $0.id == selectedAgentId }) {
            return AgentRoutingTarget(
                workspaceSlug: selected.workspaceSlug,
                agentId: selected.id,
                agentName: selected.name
            )
        }

        await refreshAvailableAgents()
        if let fallback = agentsForSelectedWorkspace.first {
            return AgentRoutingTarget(
                workspaceSlug: fallback.workspaceSlug,
                agentId: fallback.id,
                agentName: fallback.name
            )
        }

        if !selectedWorkspaceSlug.isEmpty {
            return AgentRoutingTarget(
                workspaceSlug: selectedWorkspaceSlug,
                agentId: nil,
                agentName: "Atlas"
            )
        }

        if let workspace = availableWorkspaces.first {
            return AgentRoutingTarget(
                workspaceSlug: workspace.slug,
                agentId: nil,
                agentName: "Atlas"
            )
        }

        throw NSError(
            domain: "DragonFruitNative",
            code: 202,
            userInfo: [NSLocalizedDescriptionKey: "No workspace available for Atlas."]
        )
    }

    private func streamAgentText(_ text: String) async {
        agentTypingTask?.cancel()
        agentResponseDismissTask?.cancel()
        agentResponseDismissTask = nil
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

    private func scheduleAgentResponseDismiss() {
        agentResponseDismissTask?.cancel()
        let dismissTask = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 6_000_000_000)
            guard !Task.isCancelled else { return }
            self?.lastAgentTextResponse = ""
        }
        agentResponseDismissTask = dismissTask
    }

}
