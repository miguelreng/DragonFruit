import AuthenticationServices
import ApplicationServices
import AppKit
import AVFoundation
import AudioToolbox
import Carbon
import Foundation
import os
@preconcurrency import ScreenCaptureKit
@preconcurrency import Speech
import SwiftUI
import UniformTypeIdentifiers
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
    let hasOtherAttendees: Bool?

    // A meeting worth auto-prompting notes for: one with other people on it.
    // Falls back to "has a video link" when the backend predates attendee data.
    var isLikelyRealMeeting: Bool {
        if let hasOtherAttendees { return hasOtherAttendees }
        return joinURL != nil
    }

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
            calendarName: nil,
            hasOtherAttendees: nil
        )
    }
}

enum VoiceCaptureType: String {
    case task = "Task"
    case doc = "Doc"
    case sticky = "Sticky"
    case bookmark = "Bookmark"
    case agent = "Agent"
    case lookup = "Lookup"
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

struct MeetingNotesSavedNotice: Identifiable, Equatable {
    let id = UUID()
    let title: String
    let url: URL?
}

/// Asks the user which project the just-recorded meeting notes belong to.
/// Shown as an island bubble while the transcription runs; the save waits on
/// the answer (nil choice = the server's default project).
struct MeetingNotesProjectRequest: Identifiable, Equatable {
    let id = UUID()
    let meetingTitle: String
    let projects: [ProjectSummary]
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

/// A single turn in the floating Atlas chat panel.
struct AtlasChatMessage: Identifiable, Equatable {
    enum Role { case user, assistant }
    let id = UUID()
    let role: Role
    var text: String
    /// Assistant placeholder that is still streaming / awaiting content.
    var isStreaming: Bool = false
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

/// The signed-in user as configured in the web app's profile settings.
struct AtlasUserProfile: Equatable {
    let displayName: String
    let email: String
    let avatarURL: URL?

    /// Up to two initials for the avatar fallback, derived from the name or email.
    var initials: String {
        let letters = displayName
            .split(separator: " ")
            .prefix(2)
            .compactMap(\.first)
            .map(String.init)
            .joined()
        if !letters.isEmpty { return letters.uppercased() }
        return String(email.prefix(1)).uppercased()
    }
}

struct PermissionStatus: Identifiable {
    let id: String
    let name: String
    let state: String
    /// Required permissions gate entry to the app; optional ones are recommended
    /// but never block (requested contextually or from Settings).
    var isRequired: Bool = false
    /// True when macOS only honors a fresh grant after the app relaunches
    /// (re-enabling a previously blocked mic/speech).
    var requiresRestart: Bool = false
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

    /// whisper.cpp language code (ISO 639-1). When whisper runs in `auto` mode
    /// it can emit bracketed `[Language]` tokens (e.g. "[Spanish]") instead of
    /// transcribing, so we pass the configured language explicitly whenever we
    /// know it and only fall back to `auto` for the system-language option.
    var whisperLanguageCode: String {
        guard self != .multilingual else { return "auto" }
        let primary = rawValue.split(separator: "-").first.map(String.init)?.lowercased() ?? "auto"
        // whisper uses `no` for Norwegian Bokmål rather than the BCP-47 `nb`.
        return primary == "nb" ? "no" : primary
    }

    /// English-only whisper models (`*.en.bin`) can't honor a non-English
    /// language flag, so a non-English selection needs a multilingual model.
    var needsMultilingualWhisperModel: Bool {
        whisperLanguageCode != "en" && whisperLanguageCode != "auto"
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
    private static let apiTokenKeychainAccount = "df_api_token"

    private static func loadAPIToken(migratingFrom defaults: UserDefaults) -> String {
        if let token = KeychainStore.load(account: apiTokenKeychainAccount), !token.isEmpty {
            return token
        }
        // Migrate a token written by older builds that stored it in plaintext UserDefaults.
        if let legacy = defaults.string(forKey: "df_api_token"), !legacy.isEmpty {
            KeychainStore.save(account: apiTokenKeychainAccount, value: legacy)
            defaults.removeObject(forKey: "df_api_token")
            return legacy
        }
        return ""
    }

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
    /// Profile (name + avatar) of the signed-in user, sourced from web settings.
    @Published var userProfile: AtlasUserProfile?
    @Published var googleConnected = false
    @Published var needsCalendarReconnect = false

    @Published var meeting = MeetingInfo.empty
    @Published var meetings: [MeetingInfo] = []
    @Published var hasMeetingsToday = false
    @Published var meetingState = "Upcoming"
    @Published var autoStartEnabled = true
    @Published var autoStartMinutesBefore = 2
    @Published var meetingNotesEnabled = true {
        didSet { UserDefaults.standard.set(meetingNotesEnabled, forKey: "df_meeting_notes_enabled") }
    }
    @Published var autoOpenMeetingNotesEnabled = true {
        didSet { UserDefaults.standard.set(autoOpenMeetingNotesEnabled, forKey: "df_auto_open_meeting_notes_enabled") }
    }
    @Published var showCursorBuddyEnabled = true {
        didSet { UserDefaults.standard.set(showCursorBuddyEnabled, forKey: "df_show_cursor_buddy_enabled") }
    }
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
    // True while a stopped meeting is being transcribed + turned into notes, so
    // the UI can surface a "Creating meeting notes…" toast during the save.
    @Published var isSavingMeetingNotes = false
    @Published var meetingStartPrompt: MeetingInfo?
    @Published var meetingNotesTranscript = ""
    @Published var lastMeetingNotesURL: URL?
    @Published var lastSavedMeetingTitle = ""
    @Published var lastTranscript = ""
    @Published var lastCapture: VoiceCaptureResult?
    @Published var lastVoiceActionResult: VoiceActionResult?
    /// Set when meeting notes finish saving; the notch island shows it as a
    /// success bubble with a View button.
    @Published var lastMeetingNotesSavedNotice: MeetingNotesSavedNotice?
    /// Non-nil while the post-recording "save notes to which project?" ask is
    /// showing. The stop-and-save pipeline blocks on the answer.
    @Published var meetingNotesProjectRequest: MeetingNotesProjectRequest?
    private enum MeetingNotesProjectAsk {
        case idle
        case asking
        case resolved(ProjectSummary?)
    }
    private var meetingNotesProjectAsk: MeetingNotesProjectAsk = .idle
    private var meetingNotesProjectContinuation: CheckedContinuation<ProjectSummary?, Never>?
    private var meetingNotesProjectFetchTask: Task<Void, Never>?
    @Published var lastAgentTextResponse = ""
    @Published var isAgentResponding = false
    @Published var isVoiceActionProcessing = false
    /// Drives the floating glass chat panel (toggled with ⌥A). The overlay
    /// controller observes this to show/hide the window.
    @Published var isAtlasChatVisible = false
    /// Full multi-turn transcript shown in the floating chat panel.
    @Published var atlasChatMessages: [AtlasChatMessage] = []
    /// True while a chat turn is in flight (request sent, awaiting/streaming reply).
    @Published var isAtlasChatSending = false
    /// Number of files staged (via the composer paperclip) for the next message.
    @Published var atlasChatPendingAttachmentCount = 0
    private var atlasChatPendingAttachments: [AgentChatAttachmentPayload] = []
    /// Text selected in the frontmost app when the chat was opened, offered as
    /// context for the next question (shown as a chip in the composer).
    @Published var atlasChatSelectionContext: String?
    /// When on, every message attaches a screenshot of the frontmost window so
    /// Atlas can "see what I see" — regardless of the message wording. Keyword
    /// detection (see `shouldAttachVisualContext`) still triggers capture when
    /// this is off. Toggled from the composer's screen-vision button.
    @Published var atlasChatScreenVisionEnabled = false
    @Published var availableWorkspaces: [WorkspaceOption] = []
    @Published var selectedWorkspaceSlug = "" {
        didSet {
            UserDefaults.standard.set(selectedWorkspaceSlug, forKey: "df_selected_workspace_slug")
            selectDefaultAgentForSelectedWorkspaceIfNeeded()
            if oldValue != selectedWorkspaceSlug {
                Task { @MainActor [weak self] in
                    await self?.refreshMyTasks()
                }
            }
        }
    }
    @Published var myTasks: [MyTaskSummary] = []
    @Published var wikiLookup: WikiLookupState?
    @Published var isLoadingMyTasks = false
    @Published var hasLoadedMyTasks = false
    private var currentUserId = ""
    private var taskIdsBeingCompleted: Set<String> = []
    @Published var availableAgents: [AgentOption] = []
    @Published var selectedAgentId = "" {
        didSet {
            UserDefaults.standard.set(selectedAgentId, forKey: "df_selected_agent_id")
        }
    }
    @Published private(set) var permissionsRefreshCounter = 0
    /// True while the menu bar popover is on screen; used to suppress the
    /// redundant permission toast so onboarding isn't shown twice at once.
    @Published var isPopoverOpen = false
    /// Set when the user taps "Do this later" in onboarding, so permissions are
    /// no longer forced up front (they can still grant them later from Settings).
    @Published var permissionsOnboardingDismissed = false
    /// One-line explanation shown when macOS is tracking permissions for a
    /// different / unverified copy of Atlas (e.g. a dev build alongside the
    /// installed app), which silently breaks the grant flow. Nil when healthy.
    @Published var permissionsEnvironmentWarning: String?
    /// Set when starting meeting notes is blocked only by missing Screen
    /// Recording, so the popover can show an inline "Allow + Restart" banner.
    @Published var needsScreenRecordingForMeeting = false

    private var oauthSession: ASWebAuthenticationSession?
    private var calendarPollTask: Task<Void, Never>?
    private var meetingRefreshTask: Task<Void, Never>?
    private var sessionRestoreAttempts = 0
    private var apiToken: String = ""
    private var audioEngine = AVAudioEngine()
    private let speechAppendQueue = DispatchQueue(label: "sh.dragonfruit.copilot.speech-audio")
    private let systemAudioCapture = SystemAudioCapture()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var meetingMicAudioFile: AVAudioFile?
    private var meetingMicAudioURL: URL?
    private var meetingSystemAudioURL: URL?
    // Loudest level seen on the system-audio tap during the current meeting
    // recording. 0 at save time means the tap delivered pure digital silence
    // (TCC denied or broken routing) — distinct from "nobody spoke".
    private var meetingSystemAudioPeak: CGFloat = 0
    private var isInputTapInstalled = false
    private var microphoneReleaseTask: Task<Void, Never>?
    private var recordingMeeting: MeetingInfo?
    private var notifiedMeetingIds: Set<String> = []
    private var actionHotKeyRef: EventHotKeyRef?
    private var chatHotKeyRef: EventHotKeyRef?
    private var hotKeyEventHandlerRef: EventHandlerRef?
    private var optionFlagsMonitor: Any?
    private var localOptionFlagsMonitor: Any?
    private var lastRoutingTarget: RoutingTarget?
    private var activeAgentSessionByWorkspace: [String: String] = [:]
    private var agentTypingTask: Task<Void, Never>?
    private var agentResponseDismissTask: Task<Void, Never>?
    private var atlasChatTypingTask: Task<Void, Never>?
    private var voiceCaptureMode: VoiceCaptureMode = .intent
    private struct PendingVoiceCaptureStart {
        let mode: VoiceCaptureMode
        let requiredHeldHotKeyID: UInt32
        let heldHotKeySequence: Int
    }
    private var isStartingVoiceCapture = false
    private var pendingVoiceCaptureStart: PendingVoiceCaptureStart?
    private var voiceCaptureStartTask: Task<Void, Never>?
    private var startingVoiceCaptureHotKeyID: UInt32?
    private var startingVoiceCaptureMode: VoiceCaptureMode?
    private var pendingVoiceTranscript = ""
    private var voiceTranscriptFlushTask: Task<Void, Never>?
    private var pendingCursorContext = VoiceCursorContext.empty
    private var lastAudioLevelPublishedAt: TimeInterval = 0
    private var heldHotKeyIds: Set<UInt32> = []
    private var heldHotKeySequenceByID: [UInt32: Int] = [:]
    private var nextHeldHotKeySequence = 0
    private var dictationStreamedText = ""
    private var dictationSavedPasteboardItems: [NSPasteboardItem]?
    private var dictationTargetApplication: NSRunningApplication?
    private var dictationTargetElement: AXUIElement?
    private var isOptionDictationHeld = false
    private var optionDictationStartTask: Task<Void, Never>?
    /// Guards against the onboarding card and the menu-bar toast both firing the
    /// same permission action. One tap must yield one prompt or one Settings
    /// window, never both.
    private var isHandlingPermissionAction = false
    /// Last privacy-pane open (anchor + monotonic time) to debounce repeats so
    /// taps / re-renders can't stack multiple System Settings windows.
    private var lastPrivacySettingsOpen: (anchor: String, at: TimeInterval)?
    /// Repeating timer that re-checks permission status while onboarding is
    /// visible; auto-stops once the blocking gate is satisfied.
    private var permissionPollTimer: Timer?
    private var lastLoggedPermissionSnapshot = ""

    override init() {
        super.init()
        let defaults = UserDefaults.standard
        let savedBaseURL = defaults.string(forKey: "df_base_url")
        let savedAppURL = defaults.string(forKey: "df_app_url")
        baseURL = savedBaseURL ?? Self.productionAPIURL
        appURL = savedAppURL ?? Self.inferAppURL(from: baseURL) ?? Self.productionAppURL
        apiToken = Self.loadAPIToken(migratingFrom: defaults)
        copilotTheme = CopilotThemeMode(rawValue: defaults.string(forKey: "df_copilot_theme") ?? "") ?? .light
        let savedCursorBuddyOpacity = defaults.object(forKey: "df_cursor_buddy_opacity") as? Double
        cursorBuddyOpacity = min(max(savedCursorBuddyOpacity ?? 1.0, 0.35), 1.0)
        speechLanguage = SpeechLanguage(rawValue: defaults.string(forKey: "df_speech_language") ?? "") ?? .spanishES
        autoOpenMeetingNotesEnabled = defaults.object(forKey: "df_auto_open_meeting_notes_enabled") as? Bool ?? true
        selectedWorkspaceSlug = defaults.string(forKey: "df_selected_workspace_slug") ?? ""
        selectedAgentId = defaults.string(forKey: "df_selected_agent_id") ?? ""
        isRestoringSession = !apiToken.isEmpty
        Self.logger.info("DragonFruit store initialized. savedToken=\(!self.apiToken.isEmpty, privacy: .public)")
        detectPermissionsEnvironment()
        logPermissionSnapshot(reason: "launch")
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
        return Self.relativeStartLabel(seconds: delta)
    }

    var nextUpCountdownLabel: String {
        if needsCalendarReconnect { return "Reconnect" }
        if !googleConnected { return "Connect" }
        if meeting.id == "empty" { return "No meetings" }
        let delta = Int(meeting.startAt.timeIntervalSinceNow)
        if Date() >= meeting.startAt && Date() <= meeting.endAt { return "Happening now" }
        if delta <= 0 { return "Starting now" }
        return Self.relativeStartLabel(seconds: delta)
    }

    private static func relativeStartLabel(seconds: Int) -> String {
        let minutes = max(1, seconds / 60)
        guard minutes >= 60 else {
            return "in \(minutes)m"
        }

        let hours = minutes / 60
        let remainingMinutes = minutes % 60
        if remainingMinutes == 0 {
            return "in \(hours)h"
        }
        return "in \(hours)h \(remainingMinutes)m"
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
        let micLabel = microphonePermissionLabel
        let speechLabel = speechPermissionLabel
        return [
            PermissionStatus(id: "login", name: "DragonFruit", state: isAuthenticated ? "Connected" : "Sign in"),
            // Required: the floor for Atlas voice + dictation, both grantable via
            // an in-app system prompt. Re-enabling a previously blocked one needs
            // a relaunch, so flag that for the restart hint.
            PermissionStatus(id: "mic", name: "Microphone", state: micLabel,
                             isRequired: true, requiresRestart: micLabel == "Blocked"),
            PermissionStatus(id: "speech", name: "Atlas voice", state: speechLabel,
                             isRequired: true, requiresRestart: speechLabel == "Blocked"),
            // Optional: only specific features need these, so they never block
            // entry. Accessibility toggles live; system audio is requested when
            // the Core Audio tap starts.
            PermissionStatus(id: "accessibility", name: "Cursor context & dictation", state: accessibilityPermissionLabel,
                             isRequired: false, requiresRestart: false),
            PermissionStatus(id: "system-audio", name: "System audio", state: systemAudioPermissionLabel,
                             isRequired: false, requiresRestart: false),
        ]
    }

    var copilotPermissionStatuses: [PermissionStatus] {
        permissionStatuses.filter { $0.id != "login" }
    }

    /// Required permissions still missing; these gate entry to the app.
    var requiredMissingPermissions: [PermissionStatus] {
        copilotPermissionStatuses.filter { $0.isRequired && $0.state != "Allowed" }
    }

    /// Optional/recommended permissions still missing; surfaced but never blocking.
    var optionalMissingPermissions: [PermissionStatus] {
        copilotPermissionStatuses.filter { !$0.isRequired && $0.state != "Allowed" }
    }

    /// First missing required permission; drives the blocking onboarding step.
    var currentMissingRequiredPermission: PermissionStatus? {
        requiredMissingPermissions.first
    }

    /// First missing permission overall (required first, then optional); used by
    /// the onboarding card / toast to point at the next actionable step.
    var currentMissingCopilotPermission: PermissionStatus? {
        currentMissingRequiredPermission ?? optionalMissingPermissions.first
    }

    var completedCopilotPermissionCount: Int {
        copilotPermissionStatuses.filter { $0.state == "Allowed" }.count
    }

    /// Granted / total required permissions, for the onboarding progress dots.
    var requiredPermissionProgress: (granted: Int, total: Int) {
        let required = copilotPermissionStatuses.filter { $0.isRequired }
        return (required.filter { $0.state == "Allowed" }.count, required.count)
    }

    /// Onboarding only blocks on REQUIRED permissions (mic + speech). Screen
    /// Recording and Accessibility are recommended and requested contextually, so
    /// a user who just wants Atlas voice is never stuck behind a relaunch-gated
    /// grant. Both feature entry points still enforce their own permissions
    /// just-in-time (startMeetingRecording / startVoiceCapture).
    var needsPermissionOnboarding: Bool {
        !requiredMissingPermissions.isEmpty
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
        if #available(macOS 14.2, *) {
            return UserDefaults.standard.bool(forKey: "df_system_audio_permission_granted") ? "Allowed" : "Ask"
        }
        return "Unsupported"
    }

    private var speechRecognizer: SFSpeechRecognizer? {
        SFSpeechRecognizer(locale: speechLanguage.locale)
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        NSApplication.shared.windows.first ?? ASPresentationAnchor()
    }

    func refreshPermissionStatuses() {
        logPermissionSnapshot(reason: "refresh")
        permissionsRefreshCounter += 1
    }

    private func logPermissionSnapshot(reason: String) {
        let requiredMissing = requiredMissingPermissions.map(\.id).joined(separator: ",")
        let snapshot = [
            "mic=\(microphonePermissionLabel)",
            "speech=\(speechPermissionLabel)",
            "accessibility=\(accessibilityPermissionLabel)",
            "systemAudio=\(systemAudioPermissionLabel)",
            "requiredMissing=\(requiredMissing.isEmpty ? "none" : requiredMissing)",
        ].joined(separator: " ")

        guard snapshot != lastLoggedPermissionSnapshot else { return }
        lastLoggedPermissionSnapshot = snapshot
        Self.logger.info(
            "Permission state (\(reason, privacy: .public)): \(snapshot, privacy: .public) bundle=\(Bundle.main.bundleURL.path, privacy: .public)"
        )
    }

    /// Re-checks permission status on a gentle 1s timer while the onboarding card
    /// or the menu-bar toast is visible. This is the safety net for the case
    /// where the user grants in System Settings while Atlas is already active (so
    /// there's no app-activation event to trigger a refresh). Auto-stops once the
    /// blocking gate is satisfied; optional grants are picked up on reactivation.
    func startPermissionPolling() {
        guard permissionPollTimer == nil else { return }
        let timer = Timer(timeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                self.refreshPermissionStatuses()
                if !self.needsPermissionOnboarding {
                    self.stopPermissionPolling()
                }
            }
        }
        RunLoop.main.add(timer, forMode: .common)
        permissionPollTimer = timer
    }

    func stopPermissionPolling() {
        permissionPollTimer?.invalidate()
        permissionPollTimer = nil
    }

    /// Detects the silent TCC failure mode where macOS grants permissions to a
    /// different Atlas copy with the same bundle id.
    func detectPermissionsEnvironment() {
        let installedPath = "/Applications/DragonFruit Atlas.app"
        let runningPath = Bundle.main.bundleURL.standardizedFileURL.path
        if runningPath != installedPath, FileManager.default.fileExists(atPath: installedPath) {
            permissionsEnvironmentWarning =
                "Permissions may belong to the Atlas copy in /Applications. Quit that copy before granting access here."
            return
        }
        permissionsEnvironmentWarning = nil
    }

    /// Dictation needs Accessibility (to type into the focused field); speech and
    /// mic are requested just-in-time when capture starts. Pre-prompt only
    /// Accessibility here so enabling dictation doesn't fire a stack of unrelated
    /// permission modals.
    func requestDictationPermissions() {
        Self.requestAccessibilityPermissionIfNeeded()
        refreshPermissionStatuses()
    }

    func handlePermissionAction(_ permission: PermissionStatus) {
        // Re-entrancy guard: the onboarding card and the menu-bar toast both bind
        // "Allow" to this, and SwiftUI re-renders can fire it twice. One tap must
        // produce exactly one prompt OR one Settings window, never both.
        guard !isHandlingPermissionAction else { return }
        isHandlingPermissionAction = true
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 1_200_000_000)
            isHandlingPermissionAction = false
        }

        switch permission.id {
        case "login":
            Task { await beginDragonFruitLogin() }
        case "mic":
            // Not-yet-asked: in-app system prompt (no Settings window). Already
            // blocked: Settings, since macOS won't re-prompt a denied permission.
            switch AVCaptureDevice.authorizationStatus(for: .audio) {
            case .notDetermined:
                Task { @MainActor in
                    // Bring Atlas to the front first: as a menu-bar app the popover
                    // can lose focus and macOS then never presents the prompt.
                    NSApplication.shared.activate(ignoringOtherApps: true)
                    _ = await Self.requestMicrophonePermission()
                    refreshPermissionStatuses()
                    refreshPermissionStatusesAfterSystemPrompt()
                }
            case .denied, .restricted:
                openPrivacySettings(anchor: "Privacy_Microphone")
            default:
                refreshPermissionStatuses()
            }
        case "speech":
            switch SFSpeechRecognizer.authorizationStatus() {
            case .notDetermined:
                Task { @MainActor in
                    NSApplication.shared.activate(ignoringOtherApps: true)
                    _ = await Self.requestSpeechAuthorization()
                    refreshPermissionStatuses()
                    refreshPermissionStatusesAfterSystemPrompt()
                }
            case .denied, .restricted:
                openPrivacySettings(anchor: "Privacy_SpeechRecognition")
            default:
                refreshPermissionStatuses()
            }
        case "system-audio":
            requestSystemAudioRecording()
        case "accessibility":
            openAccessibilitySettings()
        default:
            refreshPermissionStatuses()
        }
    }

    /// Requests System Audio Recording Only by starting a short Core Audio tap.
    /// Apple doesn't expose a public preflight API for this permission; the
    /// system prompt appears when the tap-backed aggregate device starts.
    func requestSystemAudioRecording() {
        NSApplication.shared.activate(ignoringOtherApps: true)
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                try await systemAudioCapture.requestPermission()
                needsScreenRecordingForMeeting = false
                statusMessage = "System audio recording is ready."
                refreshPermissionStatuses()
            } catch {
                statusMessage = "Allow Atlas under System Audio Recording Only, then try again."
                refreshPermissionStatuses()
            }
        }
    }

    func openAccessibilitySettings() {
        // Prompt only. The macOS Accessibility dialog already carries an "Open
        // System Settings" button and adds Atlas to the list, so opening Settings
        // on top of it just stacks a second modal.
        Self.requestAccessibilityPermissionIfNeeded()
        refreshPermissionStatuses()
        refreshPermissionStatusesAfterSystemPrompt()
    }

    /// Re-enabling mic/speech from System Settings only takes effect after a
    /// relaunch. That's the macOS "Quit & Reopen" dialog.
    /// Relaunch cleanly so the freshly granted permission is detected.
    func restartApp() {
        let bundlePath = Bundle.main.bundleURL.path
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/sh")
        process.arguments = [
            "-c",
            "sleep 1.2; /usr/bin/open \"$1\"",
            "atlas-relaunch",
            bundlePath,
        ]
        do {
            try process.run()
        } catch {
            statusMessage = "Restart Atlas from the menu bar."
            return
        }
        NSApp.terminate(nil)
    }

    private func refreshPermissionStatusesAfterSystemPrompt() {
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 250_000_000)
            refreshPermissionStatuses()
            NSApplication.shared.activate(ignoringOtherApps: true)
            try? await Task.sleep(nanoseconds: 1_250_000_000)
            refreshPermissionStatuses()
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
        // Debounce: ignore a repeat open of the same pane within 2s so taps /
        // re-renders can't stack multiple System Settings windows.
        let now = ProcessInfo.processInfo.systemUptime
        if let last = lastPrivacySettingsOpen, last.anchor == anchor, now - last.at < 2 {
            return
        }
        lastPrivacySettingsOpen = (anchor, now)
        guard let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?\(anchor)") else { return }
        NSWorkspace.shared.open(url)
    }

    func restoreSession() async {
        isRestoringSession = true
        Self.logger.info("Restoring DragonFruit session")
        do {
            let client = try makeClient()
            let user = try await client.getCurrentUser()
            sessionRestoreAttempts = 0
            isAuthenticated = true
            applyCurrentUserProfile(user)
            isRestoringSession = false
            statusMessage = "Signed in to DragonFruit"
            startPostLoginRefresh()
        } catch {
            Self.logger.error("Session restore failed: \(error.localizedDescription, privacy: .public)")
            let nsError = error as NSError
            let isAuthFailure = nsError.domain == "DragonFruitNative" && (nsError.code == 401 || nsError.code == 403)
            if isAuthFailure {
                clearSavedSession(message: "")
                isRestoringSession = false
            } else if sessionRestoreAttempts < 3 {
                // Transient failure (offline, server deploy, timeout): keep the
                // saved token and retry instead of signing the user out.
                sessionRestoreAttempts += 1
                try? await Task.sleep(nanoseconds: 4_000_000_000)
                await restoreSession()
            } else {
                sessionRestoreAttempts = 0
                isRestoringSession = false
                statusMessage = "Couldn't reach DragonFruit. Your session is saved; sign in or relaunch to retry."
            }
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
        // Starting notes from the prompt means the meeting is beginning now —
        // jump into the call too when the event carries a Meet/Zoom link.
        if let url = meetingStartPrompt?.joinURL {
            NSWorkspace.shared.open(url)
        }
        meetingStartPrompt = nil
        toggleRecording()
    }

    func dismissMeetingStartPrompt() {
        meetingStartPrompt = nil
    }

    // MARK: Meeting-notes project ask

    /// UI answer to the "save notes to which project?" bubble. nil means the
    /// user skipped choosing (closed the bubble) — the server then files the
    /// notes under its default project, matching the pre-picker behavior.
    func chooseMeetingNotesProject(_ project: ProjectSummary?) {
        guard case .asking = meetingNotesProjectAsk else { return }
        meetingNotesProjectRequest = nil
        meetingNotesProjectAsk = .resolved(project)
        meetingNotesProjectContinuation?.resume(returning: project)
        meetingNotesProjectContinuation = nil
    }

    /// Kicks off the ask as soon as recording stops so the bubble is up while
    /// Whisper transcribes. With zero or one project there is nothing to ask,
    /// so the choice resolves immediately and no bubble appears.
    private func beginMeetingNotesProjectAsk(meetingTitle: String) {
        meetingNotesProjectAsk = .asking
        meetingNotesProjectFetchTask = Task { [weak self] in
            guard let self else { return }
            let projects = ((try? await self.makeClient().listProjects(workspaceSlug: self.selectedWorkspaceSlug)) ?? [])
                .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
            guard case .asking = self.meetingNotesProjectAsk, !Task.isCancelled else { return }
            if projects.count <= 1 {
                self.chooseMeetingNotesProject(projects.first)
            } else {
                self.meetingNotesProjectRequest = MeetingNotesProjectRequest(
                    meetingTitle: meetingTitle,
                    projects: projects
                )
            }
        }
    }

    private func awaitMeetingNotesProjectChoice() async -> ProjectSummary? {
        switch meetingNotesProjectAsk {
        case .resolved(let project): return project
        case .idle: return nil
        case .asking:
            return await withCheckedContinuation { meetingNotesProjectContinuation = $0 }
        }
    }

    /// Tears down the ask on every exit from the save pipeline (and when a new
    /// recording starts). Resumes a still-armed continuation with nil so the
    /// awaiting save can never hang.
    private func clearMeetingNotesProjectAsk() {
        meetingNotesProjectFetchTask?.cancel()
        meetingNotesProjectFetchTask = nil
        meetingNotesProjectRequest = nil
        meetingNotesProjectContinuation?.resume(returning: nil)
        meetingNotesProjectContinuation = nil
        meetingNotesProjectAsk = .idle
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
        calendarPollTask?.cancel()
        meetingRefreshTask?.cancel()
        stopPermissionPolling()
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
            if isOptionDictationHeld {
                guard isStaleOptionDictationHold else { return }
                isOptionDictationHeld = false
                markHeldHotKeyReleased(Self.optionOnlyDictationHotKeyID)
            }
            isOptionDictationHeld = true
            markHeldHotKeyPressed(Self.optionOnlyDictationHotKeyID)
            optionDictationStartTask?.cancel()
            optionDictationStartTask = Task { @MainActor [weak self] in
                try? await Task.sleep(nanoseconds: 160_000_000)
                guard let self else { return }
                self.optionDictationStartTask = nil
                guard !Task.isCancelled, self.isOptionDictationHeld else { return }
                self.beginDictationVoiceCapture(hotKeyID: Self.optionOnlyDictationHotKeyID)
            }
        } else {
            isOptionDictationHeld = false
            optionDictationStartTask?.cancel()
            optionDictationStartTask = nil
            endHeldVoiceCapture(hotKeyID: Self.optionOnlyDictationHotKeyID)
        }
    }

    private var isStaleOptionDictationHold: Bool {
        !isListening &&
            !isStartingVoiceCapture &&
            optionDictationStartTask == nil &&
            pendingVoiceCaptureStart?.requiredHeldHotKeyID != Self.optionOnlyDictationHotKeyID
    }

    func endHeldVoiceCapture(hotKeyID: UInt32) {
        markHeldHotKeyReleased(hotKeyID)
        cancelStartingVoiceCaptureIfNeeded(hotKeyID: hotKeyID)
        guard isListening else { return }
        stopVoiceCapture()
    }

    private func cancelOptionDictationStart() {
        isOptionDictationHeld = false
        optionDictationStartTask?.cancel()
        optionDictationStartTask = nil
        markHeldHotKeyReleased(Self.optionOnlyDictationHotKeyID)
    }

    private func toggleVoiceCapture(mode: VoiceCaptureMode) {
        if isListening {
            stopVoiceCapture()
        } else {
            beginVoiceCapture(mode: mode)
        }
    }

    private func beginVoiceCapture(mode: VoiceCaptureMode, requiredHeldHotKeyID: UInt32? = nil) {
        guard !isListening else { return }
        guard mode == .dictation || voiceActionsEnabled else {
            statusMessage = "Turn on Voice in Settings first."
            return
        }
        if mode == .copilot {
            pendingCursorContext = voiceActionsEnabled ? captureCursorContext() : VoiceCursorContext.empty
            lastVoiceActionResult = nil
        }
        var heldHotKeySequence: Int?
        if let requiredHeldHotKeyID {
            heldHotKeySequence = currentHeldHotKeySequence(for: requiredHeldHotKeyID)
                ?? markHeldHotKeyPressed(requiredHeldHotKeyID)
        }
        if isStartingVoiceCapture {
            if let requiredHeldHotKeyID, let heldHotKeySequence {
                pendingVoiceCaptureStart = PendingVoiceCaptureStart(
                    mode: mode,
                    requiredHeldHotKeyID: requiredHeldHotKeyID,
                    heldHotKeySequence: heldHotKeySequence
                )
            }
            return
        }
        startingVoiceCaptureHotKeyID = requiredHeldHotKeyID
        startingVoiceCaptureMode = mode
        voiceCaptureStartTask?.cancel()
        let startTask = Task { @MainActor [weak self] in
            guard let self else { return }
            await self.startVoiceCapture(
                mode: mode,
                requiredHeldHotKeyID: requiredHeldHotKeyID,
                heldHotKeySequence: heldHotKeySequence
            )
        }
        voiceCaptureStartTask = startTask
    }

    @discardableResult
    private func markHeldHotKeyPressed(_ hotKeyID: UInt32) -> Int {
        nextHeldHotKeySequence += 1
        heldHotKeyIds.insert(hotKeyID)
        heldHotKeySequenceByID[hotKeyID] = nextHeldHotKeySequence
        return nextHeldHotKeySequence
    }

    private func markHeldHotKeyReleased(_ hotKeyID: UInt32) {
        heldHotKeyIds.remove(hotKeyID)
        heldHotKeySequenceByID[hotKeyID] = nil
        if pendingVoiceCaptureStart?.requiredHeldHotKeyID == hotKeyID {
            pendingVoiceCaptureStart = nil
        }
    }

    private func currentHeldHotKeySequence(for hotKeyID: UInt32) -> Int? {
        guard heldHotKeyIds.contains(hotKeyID) else { return nil }
        return heldHotKeySequenceByID[hotKeyID]
    }

    private func isHeldHotKeyActive(_ hotKeyID: UInt32?, sequence: Int?) -> Bool {
        guard let hotKeyID else { return true }
        guard heldHotKeyIds.contains(hotKeyID) else { return false }
        if hotKeyID == Self.optionOnlyDictationHotKeyID {
            let flags = NSEvent.modifierFlags.intersection(.deviceIndependentFlagsMask)
            guard flags.contains(.option) else { return false }
        }
        guard let sequence else { return true }
        return heldHotKeySequenceByID[hotKeyID] == sequence
    }

    private func startPendingVoiceCaptureIfNeeded() {
        guard !isListening, !isStartingVoiceCapture, let pendingStart = pendingVoiceCaptureStart else {
            if isListening {
                pendingVoiceCaptureStart = nil
            }
            return
        }
        guard isHeldHotKeyActive(
            pendingStart.requiredHeldHotKeyID,
            sequence: pendingStart.heldHotKeySequence
        ) else {
            self.pendingVoiceCaptureStart = nil
            return
        }

        self.pendingVoiceCaptureStart = nil
        beginVoiceCapture(
            mode: pendingStart.mode,
            requiredHeldHotKeyID: pendingStart.requiredHeldHotKeyID
        )
    }

    private func cancelStartingVoiceCaptureIfNeeded(hotKeyID: UInt32) {
        guard isStartingVoiceCapture, startingVoiceCaptureHotKeyID == hotKeyID else { return }
        voiceCaptureStartTask?.cancel()
        voiceCaptureStartTask = nil
        let startingMode = startingVoiceCaptureMode ?? voiceCaptureMode
        startingVoiceCaptureHotKeyID = nil
        startingVoiceCaptureMode = nil
        cleanupPreparedVoiceCaptureStart(mode: startingMode)
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
                    return
                }
                guard let callbackURL else {
                    store.statusMessage = "Sign in didn't complete. Please try again."
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
            KeychainStore.save(account: Self.apiTokenKeychainAccount, value: token)
            let client = try makeClient()
            let user = try await client.getCurrentUser()
            isAuthenticated = true
            applyCurrentUserProfile(user)
            persistSettings()
            statusMessage = "Signed in to DragonFruit"
            startPostLoginRefresh()
        } catch {
            clearSavedSession(message: "Login finished, but API session is missing. Please retry.")
            statusMessage = "Login finished, but API session is missing. Please retry."
        }
    }

    private func startPostLoginRefresh() {
        meetingRefreshTask?.cancel()
        statusMessage = "Signed in. Loading Atlas context..."
        Task { @MainActor [weak self] in
            guard let self else { return }
            await self.refreshCalendarState()
            await self.refreshAvailableAgents()
            await self.refreshMyTasks()
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

    func refreshMyTasks() async {
        guard isAuthenticated, !currentUserId.isEmpty, !selectedWorkspaceSlug.isEmpty else { return }
        isLoadingMyTasks = true
        defer {
            isLoadingMyTasks = false
            hasLoadedMyTasks = true
        }
        do {
            let client = try makeClient()
            let tasks = try await client.listMyOpenTasks(workspaceSlug: selectedWorkspaceSlug, userId: currentUserId)
            myTasks = Array(tasks.prefix(3))
        } catch {
            Self.logger.error("Could not load my tasks: \(error.localizedDescription, privacy: .public)")
        }
    }

    func isCompletingTask(_ task: MyTaskSummary) -> Bool {
        taskIdsBeingCompleted.contains(task.id)
    }

    func markTaskDone(_ task: MyTaskSummary) {
        guard let projectId = task.project_id, !taskIdsBeingCompleted.contains(task.id) else { return }
        taskIdsBeingCompleted.insert(task.id)
        objectWillChange.send()
        Task { @MainActor [weak self] in
            guard let self else { return }
            defer {
                self.taskIdsBeingCompleted.remove(task.id)
                self.objectWillChange.send()
            }
            do {
                let client = try self.makeClient()
                let states = try await client.listStates(workspaceSlug: self.selectedWorkspaceSlug, projectId: projectId)
                guard let doneState = states.first(where: { $0.group == "completed" }) else {
                    self.statusMessage = "This project has no completed state."
                    return
                }
                try await client.setTaskState(
                    workspaceSlug: self.selectedWorkspaceSlug,
                    projectId: projectId,
                    issueId: task.id,
                    stateId: doneState.id
                )
                self.myTasks.removeAll { $0.id == task.id }
                await self.refreshMyTasks()
            } catch {
                self.statusMessage = "Could not complete task: \(error.localizedDescription)"
            }
        }
    }

    // MARK: - Voice Wikipedia lookup

    private let wikiSpeechSynthesizer = AVSpeechSynthesizer()

    func performWikiLookup(query: String) async {
        wikiLookup = WikiLookupState(query: query, status: .loading)
        statusMessage = "Looking up \(query)..."
        do {
            let hits = try await WikipediaLookupClient.search(query)
            guard let top = hits.first,
                  let summary = try await WikipediaLookupClient.summary(forTitle: top.title)
            else {
                wikiLookup = WikiLookupState(query: query, status: .notFound)
                statusMessage = "No Wikipedia article for \(query)"
                return
            }
            wikiLookup = WikiLookupState(query: query, status: .ready, summary: summary)
            statusMessage = "Found: \(summary.title)"
        } catch {
            wikiLookup = WikiLookupState(query: query, status: .notFound)
            statusMessage = "Lookup failed: \(error.localizedDescription)"
        }
    }

    func toggleWikiLookupExpanded() {
        guard var lookup = wikiLookup, let summary = lookup.summary else { return }
        if lookup.isExpanded {
            lookup.isExpanded = false
            wikiLookup = lookup
            return
        }
        if lookup.fullExtract != nil {
            lookup.isExpanded = true
            wikiLookup = lookup
            return
        }
        lookup.isLoadingFullExtract = true
        wikiLookup = lookup
        Task { @MainActor [weak self] in
            let full = try? await WikipediaLookupClient.fullIntro(forTitle: summary.title)
            guard var current = self?.wikiLookup, current.query == lookup.query else { return }
            current.isLoadingFullExtract = false
            current.fullExtract = full ?? summary.extract
            current.isExpanded = true
            self?.wikiLookup = current
        }
    }

    func toggleWikiLookupSpeech() {
        guard var lookup = wikiLookup, let summary = lookup.summary else { return }
        if wikiSpeechSynthesizer.isSpeaking {
            wikiSpeechSynthesizer.stopSpeaking(at: .immediate)
            lookup.isSpeaking = false
            wikiLookup = lookup
            return
        }
        let text = lookup.isExpanded ? (lookup.fullExtract ?? summary.extract) : summary.extract
        let utterance = AVSpeechUtterance(string: "\(summary.title). \(text)")
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate
        wikiSpeechSynthesizer.speak(utterance)
        lookup.isSpeaking = true
        wikiLookup = lookup
    }

    func dismissWikiLookup() {
        if wikiSpeechSynthesizer.isSpeaking {
            wikiSpeechSynthesizer.stopSpeaking(at: .immediate)
        }
        wikiLookup = nil
    }

    func openTaskInWeb(_ task: MyTaskSummary) {
        guard let projectId = task.project_id,
              let url = resourceURL(type: .task, workspaceSlug: selectedWorkspaceSlug, projectId: projectId, entityId: task.id)
        else { return }
        NSWorkspace.shared.open(url)
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
                .filter { !$0.all_day }
                .compactMap(makeMeetingInfo(from:))
                .sorted { $0.startAt < $1.startAt }
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
        } catch let error as CalendarServiceError {
            needsCalendarReconnect = false
            if meeting.id == "empty" {
                meetingState = googleConnected ? "Syncing" : "Connect"
            }
            statusMessage = "Calendar sync paused. Atlas will retry shortly."
            Self.logger.error("Calendar refresh failed with status \(error.statusCode, privacy: .public): \(error.message, privacy: .public)")
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
            calendarName: event.calendar_name,
            hasOtherAttendees: event.has_other_attendees
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
        if meetingNotesEnabled && meeting.isLikelyRealMeeting {
            // The notch island shows the prompt (with Start notes); a system
            // banner on top of it would be a duplicate.
            meetingStartPrompt = meeting
        } else {
            deliverNotification(title: "Meeting starting", body: meeting.title)
        }
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

    /// Public façade for sibling stores (e.g. AgentInboxStore) that need a
    /// correctly-credentialed APIClient without duplicating the construction logic.
    func makeClientPublic() throws -> APIClient {
        try makeClient()
    }

    private func persistCredentials() {
        let defaults = UserDefaults.standard
        defaults.set(baseURL, forKey: "df_base_url")
        defaults.set(appURL, forKey: "df_app_url")
    }

    private func persistSettings() {
        persistCredentials()
    }

    /// Maps the `api/users/me/` payload into the published profile used by the UI.
    private func applyCurrentUserProfile(_ json: [String: Any]) {
        func value(_ key: String) -> String {
            (json[key] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        }
        currentUserId = value("id")
        let fullName = [value("first_name"), value("last_name")]
            .filter { !$0.isEmpty }
            .joined(separator: " ")
        let displayName = !fullName.isEmpty ? fullName : value("display_name")
        let email = value("email")
        userProfile = AtlasUserProfile(
            displayName: displayName.isEmpty ? email : displayName,
            email: email,
            avatarURL: resolveAvatarURL(value("avatar_url"))
        )
    }

    /// `avatar_url` is either an absolute URL (generated avatars) or an
    /// API-relative asset path like `/api/assets/v2/static/<id>/` that must be
    /// resolved against `baseURL`. DiceBear's default avatars are SVG, which
    /// `NSImage` can't render, so we ask the same endpoint for a PNG instead.
    private func resolveAvatarURL(_ raw: String) -> URL? {
        guard !raw.isEmpty else { return nil }
        if raw.hasPrefix("http://") || raw.hasPrefix("https://") {
            let normalized = raw.contains("api.dicebear.com")
                ? raw.replacingOccurrences(of: "/svg?", with: "/png?")
                : raw
            return URL(string: normalized)
        }
        guard let base = URL(string: baseURL) else { return nil }
        let trimmed = raw.hasPrefix("/") ? String(raw.dropFirst()) : raw
        return URL(string: trimmed, relativeTo: base)?.absoluteURL
    }

    private func clearSavedSession(message: String) {
        apiToken = ""
        isAuthenticated = false
        userProfile = nil
        googleConnected = false
        needsCalendarReconnect = false
        meeting = .empty
        meetings = []
        meetingStartPrompt = nil
        hasMeetingsToday = false
        meetingRefreshTask?.cancel()
        KeychainStore.delete(account: Self.apiTokenKeychainAccount)
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

        registerHotKey(id: 1, keyCode: UInt32(kVK_Space), modifiers: UInt32(optionKey), storage: &actionHotKeyRef)
        // ⌥A toggles the floating glass chat panel.
        registerHotKey(id: 2, keyCode: UInt32(kVK_ANSI_A), modifiers: UInt32(optionKey), storage: &chatHotKeyRef)
        setupOptionOnlyDictationMonitor()
    }

    private func registerHotKey(id: UInt32, keyCode: UInt32, modifiers: UInt32, storage: inout EventHotKeyRef?) {
        let hotKeyID = EventHotKeyID(signature: Self.hotKeySignature, id: id)
        let status = RegisterEventHotKey(
            keyCode,
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
            case (2, UInt32(kEventHotKeyPressed)):
                store.toggleAtlasChat()
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

    /// Screen context for the floating chat's "see what I see": a screenshot of
    /// the frontmost app's window plus its focused element's text/URL. Unlike the
    /// voice path this roots on the frontmost app rather than the mouse position,
    /// because when you send from the chat the pointer sits over the Atlas panel.
    /// Async because the screenshot goes through ScreenCaptureKit.
    private func captureAtlasChatVisualContext() async -> VoiceCursorContext {
        guard AXIsProcessTrusted() else { return .empty }
        var details: [String] = [frontmostAppContext()]
        var url: String?
        var title: String?
        var role: String?
        var selectedText: String?
        if let element = Self.focusedUIElement() {
            role = Self.copyAXStringAttribute(kAXRoleAttribute, from: element)
            title = Self.copyAXAnyStringAttribute(kAXTitleAttribute, from: element)
                ?? Self.copyAXAnyStringAttribute(kAXDescriptionAttribute, from: element)
            url = Self.copyAXAnyStringAttribute("AXURL", from: element)
            selectedText = Self.copyAXAnyStringAttribute(kAXSelectedTextAttribute, from: element)
            if let title { details.append("title: \(title)") }
            if let role { details.append("role: \(role)") }
            if let url { details.append("url: \(url)") }
        }
        return VoiceCursorContext(
            selectedText: selectedText,
            focusedSelectedText: Self.focusedSelectedText(),
            details: details,
            attachments: await captureScreenAttachment(),
            hoveredURL: url,
            hoveredTitle: title,
            hoveredRole: role
        )
    }

    /// Screenshot the frontmost window for "see what I see". Uses ScreenCaptureKit
    /// on macOS 14+ (the CGWindowList path is deprecated and returns wallpaper-only
    /// frames on recent macOS), falling back to the legacy capture on macOS 13.
    private func captureScreenAttachment() async -> [AgentChatAttachmentPayload] {
        let frontmostPID = NSWorkspace.shared.frontmostApplication?.processIdentifier
        let appName = NSWorkspace.shared.frontmostApplication?.localizedName ?? "?"
        Self.logger.error("DIAG screen capture start: frontmost=\(appName, privacy: .public) pid=\(frontmostPID ?? -1) preflight=\(Self.hasScreenRecordingAccess())")
        if #available(macOS 14.0, *) {
            if let image = await Self.captureFrontmostWindowSCK(pid: frontmostPID) {
                Self.logger.error("DIAG SCK image \(image.width)x\(image.height)")
                if let data = Self.downscaledJPEG(image, maxSide: 1400, quality: 0.72) {
                    Self.logger.error("DIAG attachment bytes=\(data.count)")
                    return [
                        AgentChatAttachmentPayload(
                            name: "screen-context.jpg",
                            mimeType: "image/jpeg",
                            contentBase64: data.base64EncodedString()
                        ),
                    ]
                }
                Self.logger.error("DIAG downscaledJPEG returned nil")
            } else {
                Self.logger.error("DIAG SCK returned nil image")
            }
        }
        // macOS 13, or ScreenCaptureKit returned nothing.
        let legacy = captureFrontmostWindowAttachment()
        Self.logger.error("DIAG legacy CGWindowList attachments=\(legacy.count)")
        if legacy.isEmpty {
            Self.logger.error("Atlas 'see my screen' capture returned no image (Screen Recording permission not granted?).")
        }
        return legacy
    }

    /// Capture the frontmost app's largest on-screen window via ScreenCaptureKit.
    /// Falls back to the main display when no window is resolvable.
    @available(macOS 14.0, *)
    nonisolated private static func captureFrontmostWindowSCK(pid: pid_t?) async -> CGImage? {
        do {
            let content = try await SCShareableContent.excludingDesktopWindows(
                true,
                onScreenWindowsOnly: true
            )
            let ownBundleID = Bundle.main.bundleIdentifier
            let windows = content.windows.filter { window in
                guard window.isOnScreen, window.frame.width >= 120, window.frame.height >= 120 else { return false }
                // Never screenshot Atlas's own panels.
                if window.owningApplication?.bundleIdentifier == ownBundleID { return false }
                if let pid { return window.owningApplication?.processID == pid }
                return true
            }
            logger.error("DIAG SCK shareable windows=\(content.windows.count) eligible=\(windows.count) displays=\(content.displays.count)")
            let target = windows.max { ($0.frame.width * $0.frame.height) < ($1.frame.width * $1.frame.height) }
            if let target {
                logger.error("DIAG SCK target window '\(target.title ?? "?", privacy: .public)' \(Int(target.frame.width))x\(Int(target.frame.height))")
                let filter = SCContentFilter(desktopIndependentWindow: target)
                let config = SCStreamConfiguration()
                config.width = Int(target.frame.width)
                config.height = Int(target.frame.height)
                config.showsCursor = false
                config.ignoreShadowsSingleWindow = true
                return try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
            }
            if let display = content.displays.first {
                let filter = SCContentFilter(display: display, excludingWindows: [])
                let config = SCStreamConfiguration()
                config.width = display.width
                config.height = display.height
                config.showsCursor = false
                return try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
            }
        } catch {
            logger.error("SCScreenshotManager capture failed: \(error.localizedDescription, privacy: .public)")
        }
        return nil
    }

    /// Aspect-preserving downscale to `maxSide` then JPEG-encode. Pure CoreGraphics
    /// so it is safe to call off the main thread.
    nonisolated private static func downscaledJPEG(_ image: CGImage, maxSide: Int, quality: CGFloat) -> Data? {
        let maxDim = max(image.width, image.height)
        guard maxDim > 0 else { return nil }
        let scale = min(1.0, Double(maxSide) / Double(maxDim))
        guard scale < 1.0 else { return jpegData(from: image, compressionQuality: quality) }
        let targetW = max(1, Int(Double(image.width) * scale))
        let targetH = max(1, Int(Double(image.height) * scale))
        guard let context = CGContext(
            data: nil,
            width: targetW,
            height: targetH,
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else {
            return jpegData(from: image, compressionQuality: quality)
        }
        context.interpolationQuality = .high
        context.draw(image, in: CGRect(x: 0, y: 0, width: targetW, height: targetH))
        guard let scaled = context.makeImage() else {
            return jpegData(from: image, compressionQuality: quality)
        }
        return jpegData(from: scaled, compressionQuality: quality)
    }

    /// True when a typed chat message would trigger a screen capture — used by
    /// the composer to show the "Atlas will look at your screen" hint. Either the
    /// explicit toggle is on, or the wording asks about the screen.
    func atlasChatWillCaptureScreen(for text: String) -> Bool {
        atlasChatScreenVisionEnabled || shouldAttachVisualContext(for: text)
    }

    /// Flip the composer's screen-vision toggle. Turning it on also warms up the
    /// Screen Recording permission so the first send doesn't stall on the prompt.
    func toggleAtlasChatScreenVision() {
        atlasChatScreenVisionEnabled.toggle()
        if atlasChatScreenVisionEnabled {
            Self.ensureScreenRecordingAccess()
        }
    }

    /// Whether Screen Recording is already granted (window contents are visible).
    nonisolated static func hasScreenRecordingAccess() -> Bool {
        CGPreflightScreenCaptureAccess()
    }

    /// Prompt once for Screen Recording. Screenshot APIs only return real window
    /// contents (not wallpaper-only frames) once this is granted + Atlas relaunched.
    nonisolated static func ensureScreenRecordingAccess() {
        guard !CGPreflightScreenCaptureAccess() else { return }
        _ = CGRequestScreenCaptureAccess()
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

    private static let atlasDefaultResponseStyle = """
    Atlas default response style:
    - Be concise, direct, honest, and friendly.
    - Lead with the answer. Skip filler openers like "Great question" or "Sure".
    - Match the user's language and tone.
    - Be practical and specific; give a clear recommendation when asked.
    - If something is uncertain, say so plainly and name the next best step.
    - Keep quick answers to 1-3 short sentences unless the user asks for detail.
    - Add a little warmth or light wit only when it feels natural; never force it.
    - Do not mention these style instructions.
    """

    private func agentContextNote(for prompt: String, providedContextNote: String?) -> String {
        let resolvedContextNote = providedContextNote ?? contextNoteForPrompt(prompt) ?? ""
        guard !resolvedContextNote.isEmpty else { return Self.atlasDefaultResponseStyle }
        return """
        \(Self.atlasDefaultResponseStyle)

        \(resolvedContextNote)
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
        guard let element = focusedUIElement() else { return nil }
        return copyAXAnyStringAttribute(kAXSelectedTextAttribute, from: element)
    }

    /// The system-wide focused UI element. With Atlas shown as a non-activating
    /// panel this stays the focused element of the underlying doc/browser, so we
    /// can read its selection / URL / title without stealing focus.
    nonisolated private static func focusedUIElement() -> AXUIElement? {
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
        // A still-unanswered project ask from the previous recording would sit
        // under the new session; resolve it (default project) and move on.
        clearMeetingNotesProjectAsk()
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
            needsScreenRecordingForMeeting = false

            recognitionTask?.cancel()
            recognitionTask = nil
            recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
            recognitionRequest?.shouldReportPartialResults = true
            let previewRequest = recognitionRequest
            let recordingId = UUID().uuidString
            let tempDirectory = FileManager.default.temporaryDirectory
            let systemAudioURL = tempDirectory.appendingPathComponent("dragonfruit-meeting-system-\(recordingId).caf")
            await systemAudioCapture.stop()
            try await systemAudioCapture.start(
                recordingTo: systemAudioURL,
                onAudioPCMBuffer: { buffer in
                    if let request = previewRequest {
                        request.append(buffer)
                    }
                    // Drive the floating recording widget's sound wave from the
                    // live meeting audio — same RMS metering as voice capture,
                    // which otherwise only runs on the mic input tap.
                    let level = Self.normalizedAudioLevel(from: buffer)
                    Task { @MainActor [weak self] in
                        guard let self else { return }
                        self.updateAudioLevel(level)
                        self.meetingSystemAudioPeak = max(self.meetingSystemAudioPeak, level)
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
            meetingSystemAudioPeak = 0
            isMeetingRecording = true
            meetingState = "Recording"
            if meetingWhisperModelLanguageMismatch {
                statusMessage = "Recording in \(speechLanguage.label), but only an English-only Whisper model was found. Install a multilingual model (e.g. ggml-base.bin) for accurate notes."
            } else {
                statusMessage = "Capturing meeting text locally. Audio will be deleted after transcription."
            }

            // Also capture the local microphone — system audio only carries the
            // other participants, so without this the user's own voice is missing
            // from the transcript. Non-fatal: a mic failure still records system.
            do {
                try startMeetingMicrophoneCapture()
            } catch {
                Self.logger.error("Meeting mic capture failed: \(error.localizedDescription, privacy: .public)")
                meetingMicAudioFile = nil
                meetingMicAudioURL = nil
            }

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
            if error.localizedDescription.lowercased().contains("system audio") {
                needsScreenRecordingForMeeting = true
            }
            stopAudioCapture()
        }
    }

    private func stopMeetingRecordingAndSave() async {
        // Flip on immediately (before the async audio teardown) so the
        // "Creating meeting notes…" toast appears the instant Stop is pressed,
        // and clear it on every exit path once the notes are saved or failed.
        isSavingMeetingNotes = true
        defer { isSavingMeetingNotes = false }
        await stopMeetingAudioCapture()
        isMeetingRecording = false
        meetingState = "Saving"

        // Ask for the destination project up front so the user can answer
        // while Whisper transcribes; the save below waits on the choice.
        beginMeetingNotesProjectAsk(meetingTitle: (recordingMeeting ?? meeting).title)
        defer { clearMeetingNotesProjectAsk() }

        let systemAudioURL = meetingSystemAudioURL
        let micAudioURL = meetingMicAudioURL
        // Both captured files exist only long enough to transcribe locally —
        // remove them on every exit path.
        defer {
            if let systemAudioURL { try? FileManager.default.removeItem(at: systemAudioURL) }
            if let micAudioURL { try? FileManager.default.removeItem(at: micAudioURL) }
            meetingSystemAudioURL = nil
            meetingMicAudioURL = nil
        }

        var transcript = meetingNotesTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
        let audioURLs = [systemAudioURL, micAudioURL]
            .compactMap { $0 }
            .filter { FileManager.default.fileExists(atPath: $0.path) }
        // Per-side outcome so a one-sided transcript can be called out instead
        // of silently saving notes that are missing the other participants.
        var systemSideHadSpeech = false
        var micSideHadSpeech = false
        if meetingWhisperModelLanguageMismatch {
            // Only an English-only model is available for a non-English meeting:
            // whisper would hallucinate English and overwrite the (correct) live
            // transcript, so skip it and keep what the live recognizer captured.
            Self.logger.info("Skipping Whisper pass — English-only model for \(self.speechLanguage.label, privacy: .public); keeping live transcript")
            if !transcript.isEmpty {
                statusMessage = "Saved the live \(speechLanguage.label) transcript. Install a multilingual Whisper model (e.g. ggml-base.bin) for higher-accuracy notes."
            }
        } else if !audioURLs.isEmpty {
            statusMessage = "Transcribing meeting text locally with Whisper.cpp..."
            var pieces: [String] = []
            var whisperFailed = false
            // Transcribe each side (system = other participants, mic = the user)
            // and merge. Either side may be silent, so cleanedWhisperTranscript
            // drops silence-only filler instead of one side stomping the other.
            for url in audioURLs {
                let size = ((try? FileManager.default.attributesOfItem(atPath: url.path))?[.size] as? Int) ?? -1
                Self.logger.info("Whisper input \(url.lastPathComponent, privacy: .public): \(size, privacy: .public) bytes")
                do {
                    let raw = try await transcribeWithWhisperCPP(audioURL: url)
                    let piece = Self.cleanedWhisperTranscript(raw)
                    // Log lengths only — never the transcript content — so meeting
                    // text doesn't leak into the system log.
                    Self.logger.info(
                        "Whisper [\(url.lastPathComponent, privacy: .public)]: raw \(raw.count, privacy: .public) chars, kept \(piece.count, privacy: .public)"
                    )
                    if !piece.isEmpty { pieces.append(piece) }
                    if url == systemAudioURL { systemSideHadSpeech = !piece.isEmpty }
                    if url == micAudioURL { micSideHadSpeech = !piece.isEmpty }
                } catch {
                    whisperFailed = true
                    Self.logger.error(
                        "Whisper failed [\(url.lastPathComponent, privacy: .public)]: \(error.localizedDescription, privacy: .public)"
                    )
                }
            }
            let merged = pieces.joined(separator: "\n\n").trimmingCharacters(in: .whitespacesAndNewlines)
            if !merged.isEmpty {
                transcript = merged
                meetingNotesTranscript = merged
            } else if whisperFailed && transcript.isEmpty {
                meetingState = "Summary"
                statusMessage = "Whisper.cpp transcription failed."
                return
            } else if whisperFailed {
                statusMessage = "Whisper.cpp failed; saving live transcript."
            }
        }
        Self.logger.info("Final meeting transcript: \(transcript.count, privacy: .public) chars -> creating draft")
        if transcript.isEmpty {
            meetingState = "Summary"
            statusMessage = "Recording stopped. No meeting text captured."
            return
        }

        do {
            let client = try makeClient()
            let workspaces = try await client.listWorkspaces()
            let workspace = workspaces.first { $0.slug == selectedWorkspaceSlug } ?? workspaces.first
            guard let workspace else {
                statusMessage = "No workspace available for meeting notes."
                meetingState = "Summary"
                return
            }
            let targetMeeting = recordingMeeting ?? meeting
            let chosenProject = await awaitMeetingNotesProjectChoice()
            let draft = try await client.createMeetingNotesDraft(
                workspaceSlug: workspace.slug,
                meeting: targetMeeting,
                notes: transcript,
                projectId: chosenProject?.id,
                micAudioURL: nil,
                systemAudioURL: nil
            )
            lastMeetingNotesURL = draft.url.flatMap(URL.init(string:))
            lastSavedMeetingTitle = targetMeeting.title
            Self.logger.info("Meeting notes draft created (hasURL=\(draft.url != nil, privacy: .public), calendar=\(draft.calendar_attached == true, privacy: .public))")
            meetingState = "Notes ready"
            let destination = chosenProject.map { "\($0.name) docs" } ?? "Docs"
            statusMessage = (draft.calendar_attached == true)
                ? "Meeting notes saved to \(destination) and attached to your event."
                : "Meeting notes saved to \(destination)."
            if micSideHadSpeech && !systemSideHadSpeech {
                if meetingSystemAudioPeak < 0.01 {
                    // The tap delivered pure digital silence — a permission or
                    // routing failure, not a quiet meeting. Surface the fix.
                    Self.logger.warning("Meeting notes one-sided: system audio tap was silent (peak \(Double(self.meetingSystemAudioPeak), privacy: .public))")
                    statusMessage = "Notes saved, but only your voice was captured — the meeting audio was silent. Allow Atlas under System Audio Recording Only in Privacy & Security and try again."
                    needsScreenRecordingForMeeting = true
                } else {
                    statusMessage = "Notes saved, but no participant speech was recognized in the meeting audio."
                }
            }
            notifyMeetingNotesSaved(title: targetMeeting.title)
            // Open the saved document in the browser as soon as recording finishes.
            if autoOpenMeetingNotesEnabled, let notesURL = lastMeetingNotesURL {
                NSWorkspace.shared.open(notesURL)
            }
        } catch {
            meetingState = "Summary"
            Self.logger.error("Meeting notes save failed: \(error.localizedDescription, privacy: .public)")
            let targetMeeting = recordingMeeting ?? meeting
            if let backupURL = try? saveMeetingNotesBackup(meeting: targetMeeting, transcript: transcript) {
                lastMeetingNotesURL = backupURL
                lastSavedMeetingTitle = targetMeeting.title
                statusMessage = "Could not save online. Saved a local backup in Documents."
                if autoOpenMeetingNotesEnabled {
                    NSWorkspace.shared.open(backupURL)
                }
            } else {
                statusMessage = "Could not save meeting notes: \(error.localizedDescription)"
            }
        }
    }

    private func saveMeetingNotesBackup(meeting: MeetingInfo, transcript: String) throws -> URL {
        let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
            ?? FileManager.default.homeDirectoryForCurrentUser
        let directoryURL = documentsURL.appendingPathComponent("DragonFruit Meeting Notes", isDirectory: true)
        try FileManager.default.createDirectory(at: directoryURL, withIntermediateDirectories: true)

        let timestampFormatter = DateFormatter()
        timestampFormatter.locale = Locale(identifier: "en_US_POSIX")
        timestampFormatter.dateFormat = "yyyy-MM-dd-HHmmss"
        let timestamp = timestampFormatter.string(from: Date())
        let title = sanitizedMeetingNotesFileName(meeting.title.isEmpty ? "Meeting notes" : meeting.title)
        let fileURL = directoryURL.appendingPathComponent("\(timestamp)-\(title).md")

        let capturedAt = ISO8601DateFormatter().string(from: Date())
        var lines = [
            "# \(meeting.title.isEmpty ? "Meeting notes" : meeting.title)",
            "",
            "Captured by DragonFruit Atlas on \(capturedAt).",
        ]
        if let joinURL = meeting.joinURL {
            lines.append("")
            lines.append("Meeting link: \(joinURL.absoluteString)")
        }
        lines.append("")
        lines.append("## Transcript")
        lines.append("")
        lines.append(transcript)

        try lines.joined(separator: "\n").write(to: fileURL, atomically: true, encoding: .utf8)
        return fileURL
    }

    private func sanitizedMeetingNotesFileName(_ value: String) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_ "))
        let scalars = value.unicodeScalars.map { scalar in
            allowed.contains(scalar) ? Character(scalar) : "-"
        }
        let collapsed = String(scalars)
            .replacingOccurrences(of: " ", with: "-")
            .trimmingCharacters(in: CharacterSet(charactersIn: "-_"))
        return String((collapsed.isEmpty ? "Meeting-notes" : collapsed).prefix(80))
    }

    private func transcribeWithWhisperCPP(audioURL: URL) async throws -> String {
        let binaryURL = try whisperCPPBinaryURL()
        let languageCode = speechLanguage.whisperLanguageCode
        let modelURL = try whisperCPPModelURL(preferMultilingual: speechLanguage.needsMultilingualWhisperModel)
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
                "-l", languageCode,
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

    private func whisperModelCandidates(preferMultilingual: Bool) -> [String] {
        let defaults = UserDefaults.standard
        // An explicitly configured model always wins — honor the user's choice.
        let explicit = [
            defaults.string(forKey: "df_whisper_cpp_model"),
            ProcessInfo.processInfo.environment["WHISPER_CPP_MODEL"],
        ].compactMap { $0 }.filter { !$0.isEmpty }
        var fallbacks = [
            "\(NSHomeDirectory())/Library/Application Support/DragonFruit/Whisper/ggml-base.en.bin",
            "\(NSHomeDirectory())/Library/Application Support/Screen Studio/models/ggml-base.bin",
            "\(NSHomeDirectory())/Library/Application Support/Screen Studio/models/ggml-small.bin",
            "\(NSHomeDirectory())/whisper.cpp/models/ggml-base.en.bin",
            "\(NSHomeDirectory())/Code/whisper.cpp/models/ggml-base.en.bin",
            "\(NSHomeDirectory())/whisper.cpp/models/ggml-small.en.bin",
            "\(NSHomeDirectory())/Code/whisper.cpp/models/ggml-small.en.bin",
        ]
        if preferMultilingual {
            // English-only models can't transcribe other languages, so try
            // multilingual models first when a non-English language is selected.
            fallbacks = fallbacks.filter { !$0.hasSuffix(".en.bin") }
                + fallbacks.filter { $0.hasSuffix(".en.bin") }
        }
        return explicit + fallbacks
    }

    private func resolvedWhisperModelPath(preferMultilingual: Bool) -> String? {
        whisperModelCandidates(preferMultilingual: preferMultilingual)
            .first { FileManager.default.fileExists(atPath: $0) }
    }

    private func whisperCPPModelURL(preferMultilingual: Bool) throws -> URL {
        if let path = resolvedWhisperModelPath(preferMultilingual: preferMultilingual) {
            return URL(fileURLWithPath: path)
        }
        throw NSError(
            domain: "DragonFruitNative",
            code: 3002,
            userInfo: [NSLocalizedDescriptionKey: "Whisper model not found. Set df_whisper_cpp_model or WHISPER_CPP_MODEL."]
        )
    }

    /// True when a non-English language is selected but the only Whisper model
    /// we can find is English-only. That pairing can't transcribe the spoken
    /// language — whisper ignores the language flag and hallucinates English —
    /// so we warn up front and keep the live transcript instead.
    private var meetingWhisperModelLanguageMismatch: Bool {
        guard speechLanguage.needsMultilingualWhisperModel else { return false }
        guard let path = resolvedWhisperModelPath(preferMultilingual: true) else { return false }
        return path.hasSuffix(".en.bin")
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
        stopSpeechRecognitionPipeline()
        Task { await systemAudioCapture.stop() }
    }

    private func stopMicrophoneCapture() {
        microphoneReleaseTask?.cancel()
        microphoneReleaseTask = nil
        releaseMicrophoneHardware()
        audioLevel = 0
        scheduleMicrophoneReleaseVerification()
    }

    private func releaseMicrophoneHardware() {
        removeInputTapIfNeeded()
        if audioEngine.isRunning {
            audioEngine.stop()
        }
        audioEngine.reset()
        audioEngine = AVAudioEngine()
        isInputTapInstalled = false
    }

    private func scheduleMicrophoneReleaseVerification() {
        microphoneReleaseTask?.cancel()
        microphoneReleaseTask = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 180_000_000)
            guard let self, !Task.isCancelled else { return }
            guard !self.isListening, !self.isStartingVoiceCapture, !self.isMeetingRecording else {
                self.microphoneReleaseTask = nil
                return
            }
            self.releaseMicrophoneHardware()
            self.audioLevel = 0
            self.microphoneReleaseTask = nil
        }
    }

    private func stopSpeechRecognitionPipeline() {
        let request = recognitionRequest
        let task = recognitionTask
        recognitionRequest = nil
        recognitionTask = nil
        speechAppendQueue.async {
            request?.endAudio()
            task?.cancel()
        }
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

    // Capture the local microphone alongside system audio for a meeting. System
    // audio only carries the other participants, so without this the user's own
    // voice never reaches the transcript. Writes a temp CAF for the post-meeting
    // Whisper pass and drives the recording widget's sound wave from the mic.
    private func startMeetingMicrophoneCapture() throws {
        let node = audioEngine.inputNode
        let format = try inputTapFormat(for: node)
        let micURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("dragonfruit-meeting-mic-\(UUID().uuidString).caf")
        let micFile = try AVAudioFile(
            forWriting: micURL,
            settings: format.settings,
            commonFormat: format.commonFormat,
            interleaved: format.isInterleaved
        )
        meetingMicAudioFile = micFile
        meetingMicAudioURL = micURL

        removeInputTapIfNeeded()
        node.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            try? micFile.write(from: buffer)
            let level = Self.normalizedAudioLevel(from: buffer)
            Task { @MainActor [weak self] in
                self?.updateAudioLevel(level)
            }
        }
        isInputTapInstalled = true
        audioEngine.prepare()
        try audioEngine.start()
        Self.logger.info(
            "Meeting mic capture started @\(format.sampleRate, privacy: .public)Hz \(format.channelCount, privacy: .public)ch -> \(micURL.lastPathComponent, privacy: .public)"
        )
    }

    // whisper.cpp emits non-speech annotation tokens — "[BLANK_AUDIO]",
    // "(silence)", "[Music]", or a bare "[Spanish]" language tag when it can't
    // transcribe foreign/quiet audio — plus filler like "you" / "Thank you.".
    // Strip the annotations and treat a transcript made of *only* such noise as
    // empty so it can't pollute (or overwrite a good live) transcript.
    nonisolated private static func cleanedWhisperTranscript(_ raw: String) -> String {
        let withoutAnnotations = raw
            .replacingOccurrences(of: "\\[[^\\]]*\\]", with: " ", options: .regularExpression)
            .replacingOccurrences(of: "\\([^\\)]*\\)", with: " ", options: .regularExpression)
            .replacingOccurrences(of: "[ \\t]+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let normalized = withoutAnnotations
            .lowercased()
            .trimmingCharacters(in: CharacterSet(charactersIn: " .,!?-\n"))
        let silenceTokens: Set<String> = [
            "", "you", "thank you", "thanks for watching", "thanks for watching everyone",
        ]
        return silenceTokens.contains(normalized) ? "" : withoutAnnotations
    }

    private func notifyMeetingNotesSaved(title: String) {
        // Shown as a success bubble under the notch island (with a View
        // button) instead of a system banner.
        lastMeetingNotesSavedNotice = MeetingNotesSavedNotice(title: title, url: lastMeetingNotesURL)
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

    private func startVoiceCapture(
        mode: VoiceCaptureMode,
        requiredHeldHotKeyID: UInt32? = nil,
        heldHotKeySequence: Int? = nil
    ) async {
        guard !isStartingVoiceCapture else { return }
        isStartingVoiceCapture = true
        microphoneReleaseTask?.cancel()
        microphoneReleaseTask = nil
        defer {
            if startingVoiceCaptureHotKeyID == requiredHeldHotKeyID, startingVoiceCaptureMode == mode {
                voiceCaptureStartTask = nil
                startingVoiceCaptureHotKeyID = nil
                startingVoiceCaptureMode = nil
            }
            isStartingVoiceCapture = false
            startPendingVoiceCaptureIfNeeded()
        }

        guard canContinueVoiceCaptureStart(
            mode: mode,
            requiredHeldHotKeyID: requiredHeldHotKeyID,
            heldHotKeySequence: heldHotKeySequence
        ) else { return }
        guard isAuthenticated else {
            statusMessage = "Sign in first to capture voice notes."
            return
        }
        guard let recognizer = speechRecognizer, recognizer.isAvailable else {
            statusMessage = "Speech recognizer unavailable."
            return
        }
        if mode == .dictation {
            guard AXIsProcessTrusted() else {
                statusMessage = "Allow Accessibility access to use dictation."
                openAccessibilitySettings()
                return
            }
        }
        do {
            let speechAuth = await Self.currentSpeechAuthorizationOrRequest()
            guard canContinueVoiceCaptureStart(
                mode: mode,
                requiredHeldHotKeyID: requiredHeldHotKeyID,
                heldHotKeySequence: heldHotKeySequence
            ) else { return }
            guard speechAuth == .authorized else {
                statusMessage = "Speech permission denied."
                return
            }
            let micGranted = await Self.currentMicrophonePermissionOrRequest()
            guard canContinueVoiceCaptureStart(
                mode: mode,
                requiredHeldHotKeyID: requiredHeldHotKeyID,
                heldHotKeySequence: heldHotKeySequence
            ) else { return }
            guard micGranted else {
                statusMessage = "Microphone permission denied."
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
            guard canContinuePreparedVoiceCaptureStart(
                mode: mode,
                requiredHeldHotKeyID: requiredHeldHotKeyID,
                heldHotKeySequence: heldHotKeySequence
            ) else { return }
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
            guard canContinuePreparedVoiceCaptureStart(
                mode: mode,
                requiredHeldHotKeyID: requiredHeldHotKeyID,
                heldHotKeySequence: heldHotKeySequence
            ) else { return }

            audioEngine.prepare()
            try audioEngine.start()
            guard canContinuePreparedVoiceCaptureStart(
                mode: mode,
                requiredHeldHotKeyID: requiredHeldHotKeyID,
                heldHotKeySequence: heldHotKeySequence
            ) else { return }
            isListening = true
            statusMessage = statusMessageForListening(mode: mode)
            if !canContinueVoiceCaptureStart(
                mode: mode,
                requiredHeldHotKeyID: requiredHeldHotKeyID,
                heldHotKeySequence: heldHotKeySequence
            ) {
                stopVoiceCapture()
                return
            }

            recognitionTask = Self.startRecognitionTask(recognizer: recognizer, request: request) { [weak self] result, error in
                if let result {
                    let transcript = result.bestTranscription.formattedString
                    Task { @MainActor in
                        guard let self else { return }
                        self.queueVoiceTranscriptUpdate(transcript)
                        self.streamDictationText(transcript)
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
            cleanupPreparedVoiceCaptureStart(mode: mode)
        }
    }

    private func canContinuePreparedVoiceCaptureStart(
        mode: VoiceCaptureMode,
        requiredHeldHotKeyID: UInt32?,
        heldHotKeySequence: Int?
    ) -> Bool {
        guard canContinueVoiceCaptureStart(
            mode: mode,
            requiredHeldHotKeyID: requiredHeldHotKeyID,
            heldHotKeySequence: heldHotKeySequence
        ) else {
            cleanupPreparedVoiceCaptureStart(mode: mode)
            return false
        }
        return true
    }

    private func canContinueVoiceCaptureStart(
        mode: VoiceCaptureMode,
        requiredHeldHotKeyID: UInt32?,
        heldHotKeySequence: Int?
    ) -> Bool {
        guard !Task.isCancelled, isHeldHotKeyActive(requiredHeldHotKeyID, sequence: heldHotKeySequence) else {
            setVoiceCaptureCancelledStatusIfNeeded(mode: mode)
            return false
        }
        return true
    }

    private func setVoiceCaptureCancelledStatusIfNeeded(mode: VoiceCaptureMode) {
        guard pendingVoiceCaptureStart == nil else { return }
        switch mode {
        case .dictation:
            statusMessage = "Dictation cancelled."
        case .copilot, .intent:
            statusMessage = "Voice capture cancelled."
        }
    }

    private func cleanupPreparedVoiceCaptureStart(mode: VoiceCaptureMode) {
        stopAudioCapture()
        pendingVoiceTranscript = ""
        voiceTranscriptFlushTask?.cancel()
        voiceTranscriptFlushTask = nil
        finishStreamingDictation()
        audioLevel = 0
        isListening = false
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
        // Perceptual (dB) metering. Loudness is logarithmic, so the old linear
        // `(rms - floor) * gain` mapping left normal speech (RMS ~0.02–0.1)
        // bunched at the bottom and the bars barely moved. Map a sensible dBFS
        // window to 0…1 instead: a near-silent room rests below the view's
        // noise gate, quiet speech lands mid-scale, and a strong voice reaches
        // the top — so the wave actually tracks the talker.
        guard rms > 0.0008 else { return 0 }   // true-silence gate
        let db = 20 * log10(rms)               // ≈ -62 … 0 dBFS
        let minDb: Float = -46                 // ambient / near-silent floor
        let maxDb: Float = -12                 // strong speech → full scale
        let level = (db - minDb) / (maxDb - minDb)
        return CGFloat(max(0, min(1, level)))
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

        // Rewrite only the part of the transcript that actually changed: keep the
        // shared prefix in place, drop the diverged tail, and type the new tail.
        // This keeps live corrections cheap instead of re-pasting the whole buffer.
        let previousChars = Array(dictationStreamedText)
        let nextChars = Array(nextText)
        var commonPrefix = 0
        let maxPrefix = min(previousChars.count, nextChars.count)
        while commonPrefix < maxPrefix, previousChars[commonPrefix] == nextChars[commonPrefix] {
            commonPrefix += 1
        }

        let removeCount = previousChars.count - commonPrefix
        let insertText = String(nextChars.dropFirst(commonPrefix))

        if removeCount > 0 {
            selectPreviousCharacters(removeCount, source: source)
            if insertText.isEmpty {
                postKeyboardShortcut(virtualKey: CGKeyCode(kVK_Delete), flags: [], source: source)
            }
        }
        if !insertText.isEmpty {
            pasteStreamingDictationText(insertText, source: source)
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
        if let app = dictationTargetApplication, !app.isActive {
            app.activate(options: [.activateIgnoringOtherApps])
        }
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

    nonisolated private static func currentSpeechAuthorizationOrRequest() async -> SFSpeechRecognizerAuthorizationStatus {
        let status = SFSpeechRecognizer.authorizationStatus()
        guard status == .notDetermined else { return status }
        return await requestSpeechAuthorization()
    }

    nonisolated private static func requestMicrophonePermission() async -> Bool {
        await withCheckedContinuation { continuation in
            AVCaptureDevice.requestAccess(for: .audio) { granted in
                continuation.resume(returning: granted)
            }
        }
    }

    nonisolated private static func currentMicrophonePermissionOrRequest() async -> Bool {
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized:
            return true
        case .notDetermined:
            return await requestMicrophonePermission()
        case .denied, .restricted:
            return false
        @unknown default:
            return false
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

        if let lookupQuery = extractLookupQuery(from: transcript, normalized: normalized) {
            return VoiceCaptureResult(
                type: .lookup,
                projectHint: project,
                title: lookupQuery.prefix(80).description,
                body: lookupQuery,
                rawTranscript: transcript
            )
        }

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

    /// "look up X" / "what is X" / "define X" → returns X, or nil when the
    /// transcript isn't a lookup request. Checked before every other intent
    /// so quick definitions never round-trip through the agent.
    private func extractLookupQuery(from transcript: String, normalized: String) -> String? {
        let markers = [
            "look up ", "lookup ", "what is ", "what's ", "whats ", "who is ", "who was ",
            "define ", "definition of ", "look for the definition of ",
            "que es ", "quien es ", "quien fue ", "definicion de ", "busca en wikipedia ",
        ]
        for marker in markers {
            guard normalized.contains(marker) else { continue }
            guard let tail = tailAfter(marker: marker, in: transcript) else { continue }
            let query = tail
                .trimmingCharacters(in: CharacterSet(charactersIn: "\"'“”‘’.,:;?¿"))
                .trimmingCharacters(in: .whitespacesAndNewlines)
            if !query.isEmpty { return query }
        }
        return nil
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
        case .lookup:
            return "Looking it up..."
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
        case .lookup:
            specific = ["look up", "lookup", "define", "que es", "quien es"]
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
        // Lookups never touch the DragonFruit API — answer straight from
        // Wikipedia (with a Google fallback) without resolving a project.
        if intent.type == .lookup {
            await performWikiLookup(query: intent.body)
            return
        }
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
                statusMessage = "Atlas is creating the document..."
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
            case .lookup:
                // Handled before the API round-trip at the top of this method.
                return
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
        case .lookup:
            return nil
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

            statusMessage = "Asking Atlas..."
            isAgentResponding = true
            let envelope = try await client.sendAgentChatMessage(
                workspaceSlug: agentTarget.workspaceSlug,
                sessionId: sessionId,
                content: prompt,
                projectId: projectId,
                toolMode: toolMode,
                attachments: attachments ?? attachmentsForPrompt(prompt),
                contextNote: agentContextNote(for: prompt, providedContextNote: contextNote),
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

    // MARK: - Floating chat panel (⌥A)

    /// Show/hide the floating glass chat panel. Bound to the ⌥A global hotkey.
    func toggleAtlasChat() {
        if !isAtlasChatVisible {
            // Read the selection from the app you're in NOW, before our panel
            // activates and moves focus — so it can seed the question's context.
            captureAtlasChatSelection()
        }
        isAtlasChatVisible.toggle()
    }

    /// Grab the frontmost app's current text selection (via Accessibility) to
    /// offer as context. Clears the chip when nothing is selected.
    private func captureAtlasChatSelection() {
        guard AXIsProcessTrusted() else {
            atlasChatSelectionContext = nil
            return
        }
        let text = Self.focusedSelectedText()?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let text, !text.isEmpty {
            atlasChatSelectionContext = String(text.prefix(4000))
        } else {
            atlasChatSelectionContext = nil
        }
    }

    func clearAtlasChatSelectionContext() {
        atlasChatSelectionContext = nil
    }

    /// Poll the frontmost app's selection while the chat panel is open, so text
    /// selected AFTER opening still becomes context. Skips our own app (so it
    /// doesn't clobber the chip while you're typing) and only updates on a
    /// non-empty selection (never clears — dismiss the chip with its ✕).
    func refreshAtlasChatSelectionFromFrontmost() {
        guard isAtlasChatVisible, !isAtlasChatSending, AXIsProcessTrusted() else { return }
        if NSWorkspace.shared.frontmostApplication?.bundleIdentifier == Bundle.main.bundleIdentifier {
            return
        }
        guard let text = Self.focusedSelectedText()?.trimmingCharacters(in: .whitespacesAndNewlines),
              !text.isEmpty else { return }
        let capped = String(text.prefix(4000))
        if capped != atlasChatSelectionContext {
            atlasChatSelectionContext = capped
        }
    }

    func closeAtlasChat() {
        guard isAtlasChatVisible else { return }
        isAtlasChatVisible = false
    }

    /// Clear the visible transcript and drop the cached session so the next
    /// message starts a brand-new Atlas conversation.
    func startNewAtlasChat() {
        atlasChatTypingTask?.cancel()
        atlasChatMessages.removeAll()
        isAtlasChatSending = false
        activeAgentSessionByWorkspace.removeAll()
    }

    /// Stage files from the composer paperclip to send with the next message.
    func attachAtlasChatFiles(_ urls: [URL]) {
        for url in urls {
            guard let data = try? Data(contentsOf: url) else { continue }
            let mime = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
            atlasChatPendingAttachments.append(
                AgentChatAttachmentPayload(
                    name: url.lastPathComponent,
                    mimeType: mime,
                    contentBase64: data.base64EncodedString()
                )
            )
        }
        atlasChatPendingAttachmentCount = atlasChatPendingAttachments.count
    }

    /// Open the workspace integrations settings page (composer grid button).
    func openAtlasIntegrations() {
        let slug = selectedWorkspaceSlug
        let base = appURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let path = slug.isEmpty ? "\(base)/settings/integrations" : "\(base)/\(slug)/settings/integrations"
        if let url = URL(string: path) {
            NSWorkspace.shared.open(url)
        }
    }

    /// Send a typed message from the floating chat panel, reusing the same
    /// per-workspace Atlas session as voice so both share one conversation.
    func sendAtlasChatMessage(_ rawText: String) {
        let text = rawText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isAtlasChatSending else { return }

        let pendingAttachments = atlasChatPendingAttachments
        atlasChatPendingAttachments.removeAll()
        atlasChatPendingAttachmentCount = 0

        let selection = atlasChatSelectionContext
        atlasChatSelectionContext = nil
        let selectionNote = selection.map {
            "The user has this text selected and is asking about it:\n\"\"\"\n\($0)\n\"\"\""
        }
        // "See what I see": either the screen-vision toggle is on, or the message
        // asks about the screen ("what's on my screen", "look at this", "mira"…)
        // → attach a screenshot of the frontmost window plus its focused element's
        // text/URL. The chat panel is a non-activating panel, so the frontmost app
        // stays the doc/browser — never Atlas itself.
        let wantsScreen = atlasChatScreenVisionEnabled || shouldAttachVisualContext(for: text)

        guard isAuthenticated else {
            atlasChatMessages.append(AtlasChatMessage(role: .user, text: text))
            atlasChatMessages.append(AtlasChatMessage(role: .assistant, text: "Sign in to DragonFruit first to chat with Atlas."))
            return
        }

        atlasChatMessages.append(AtlasChatMessage(role: .user, text: text))
        let placeholderIndex = atlasChatMessages.count
        atlasChatMessages.append(AtlasChatMessage(role: .assistant, text: "", isStreaming: true))
        isAtlasChatSending = true

        Task { @MainActor [weak self] in
            guard let self else { return }
            defer { self.isAtlasChatSending = false }
            do {
                var attachments = pendingAttachments
                var contextNote = selectionNote

                if wantsScreen {
                    // Screen Recording is required for real window contents. If it
                    // isn't granted yet, trigger the system prompt and tell the
                    // user how to finish — don't send a blank/wallpaper frame.
                    if !Self.hasScreenRecordingAccess() {
                        Self.ensureScreenRecordingAccess()
                        self.finishAtlasChatReply(
                            at: placeholderIndex,
                            with: "I need **Screen Recording** permission to see your screen. I just opened the request — enable “DragonFruit Atlas” under System Settings → Privacy & Security → Screen Recording, then quit and reopen Atlas and ask me again.",
                            stream: false
                        )
                        return
                    }
                    self.pendingCursorContext = await self.captureAtlasChatVisualContext()
                    attachments += self.attachmentsForPrompt(text)
                    if let visualNote = self.contextNoteForPrompt(text) {
                        contextNote = visualNote
                    }
                    self.pendingCursorContext = .empty
                }

                let client = try self.makeClient()
                let agentTarget = try await self.resolveAgentTarget(client: client)

                let sessionId: String
                if let existing = self.activeAgentSessionByWorkspace[agentTarget.workspaceSlug] {
                    sessionId = existing
                } else {
                    let created = try await client.createAgentChatSession(
                        workspaceSlug: agentTarget.workspaceSlug,
                        agentId: agentTarget.agentId,
                        title: "Atlas Chat"
                    )
                    sessionId = created.id
                    self.activeAgentSessionByWorkspace[agentTarget.workspaceSlug] = sessionId
                }

                let envelope = try await client.sendAgentChatMessage(
                    workspaceSlug: agentTarget.workspaceSlug,
                    sessionId: sessionId,
                    content: text,
                    attachments: attachments,
                    contextNote: contextNote
                )

                let error = envelope.assistant_message.error_message.trimmingCharacters(in: .whitespacesAndNewlines)
                if !error.isEmpty {
                    Self.logger.error("Atlas chat error: \(error, privacy: .public)")
                    self.finishAtlasChatReply(at: placeholderIndex, with: Self.userFacingAgentErrorMessage(error), stream: false)
                } else {
                    let reply = envelope.assistant_message.content.trimmingCharacters(in: .whitespacesAndNewlines)
                    if reply.isEmpty {
                        // Nothing to show — drop the placeholder bubble rather
                        // than display a canned "(empty reply)" / "finished".
                        self.removeAtlasChatMessage(at: placeholderIndex)
                    } else {
                        self.finishAtlasChatReply(at: placeholderIndex, with: reply, stream: true)
                    }
                }
            } catch {
                Self.logger.error("Atlas chat request failed: \(error.localizedDescription, privacy: .public)")
                self.finishAtlasChatReply(at: placeholderIndex, with: Self.userFacingAgentErrorMessage(error.localizedDescription), stream: false)
            }
        }
    }

    /// Drop the pending assistant placeholder (used when the reply is empty).
    private func removeAtlasChatMessage(at index: Int) {
        atlasChatTypingTask?.cancel()
        guard atlasChatMessages.indices.contains(index) else { return }
        atlasChatMessages.remove(at: index)
    }

    /// Fill the pending assistant bubble, optionally with a typewriter reveal.
    private func finishAtlasChatReply(at index: Int, with text: String, stream: Bool) {
        atlasChatTypingTask?.cancel()
        guard atlasChatMessages.indices.contains(index) else { return }

        guard stream else {
            atlasChatMessages[index].text = text
            atlasChatMessages[index].isStreaming = false
            return
        }

        let chars = Array(text)
        let step = max(1, chars.count / 120)
        atlasChatTypingTask = Task { @MainActor [weak self] in
            var idx = 0
            while idx < chars.count {
                if Task.isCancelled { return }
                guard let self, self.atlasChatMessages.indices.contains(index) else { return }
                let next = min(chars.count, idx + step)
                self.atlasChatMessages[index].text = String(chars[0..<next])
                idx = next
                try? await Task.sleep(nanoseconds: 14_000_000)
            }
            guard let self, self.atlasChatMessages.indices.contains(index) else { return }
            self.atlasChatMessages[index].isStreaming = false
        }
    }

}
