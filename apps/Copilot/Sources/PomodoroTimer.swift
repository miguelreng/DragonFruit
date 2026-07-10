import AppKit
import Combine
import SwiftUI

@MainActor
final class PomodoroTimerModel: ObservableObject {
    enum Phase {
        case focus
        case shortBreak

        var label: String {
            switch self {
            case .focus:
                return "Focus"
            case .shortBreak:
                return "Break"
            }
        }
    }

    static let focusPresets = [15, 25, 45, 60, 90]
    static let breakPresets = [5, 10, 15]
    private static let focusMinutesKey = "df_pomodoro_focus_minutes"
    private static let breakMinutesKey = "df_pomodoro_break_minutes"

    @Published private(set) var phase: Phase = .focus
    @Published private(set) var isRunning = false
    @Published private(set) var remainingSeconds: Int
    @Published private(set) var completedFocusSessions = 0

    @Published var focusMinutes: Int {
        didSet {
            UserDefaults.standard.set(focusMinutes, forKey: Self.focusMinutesKey)
            syncRemainingAfterDurationChange(for: .focus)
        }
    }

    @Published var breakMinutes: Int {
        didSet {
            UserDefaults.standard.set(breakMinutes, forKey: Self.breakMinutesKey)
            syncRemainingAfterDurationChange(for: .shortBreak)
        }
    }

    private var timer: Timer?

    init() {
        let storedFocus = UserDefaults.standard.integer(forKey: Self.focusMinutesKey)
        let storedBreak = UserDefaults.standard.integer(forKey: Self.breakMinutesKey)
        let focus = storedFocus > 0 ? storedFocus : 25
        focusMinutes = focus
        breakMinutes = storedBreak > 0 ? storedBreak : 5
        remainingSeconds = focus * 60
    }

    func duration(for phase: Phase) -> Int {
        switch phase {
        case .focus:
            return focusMinutes * 60
        case .shortBreak:
            return breakMinutes * 60
        }
    }

    /// True once a session has been started, even while paused mid-phase.
    var isActive: Bool {
        isRunning || remainingSeconds != duration(for: phase)
    }

    // Picking a new duration while the current phase sits untouched (or
    // paused) restarts that phase's clock; a running timer is left alone and
    // picks up the new length on the next phase.
    private func syncRemainingAfterDurationChange(for changed: Phase) {
        guard phase == changed, !isRunning else { return }
        remainingSeconds = duration(for: phase)
    }

    var timeLabel: String {
        String(format: "%d:%02d", remainingSeconds / 60, remainingSeconds % 60)
    }

    var progress: Double {
        let total = Double(duration(for: phase))
        guard total > 0 else { return 0 }
        return 1 - (Double(remainingSeconds) / total)
    }

    /// Shown next to the menu bar icon while a session is running.
    var menuBarLabel: String? {
        isRunning ? timeLabel : nil
    }

    func toggle() {
        isRunning ? pause() : start()
    }

    func start() {
        guard !isRunning else { return }
        isRunning = true
        let timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.tick()
            }
        }
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer
    }

    func pause() {
        isRunning = false
        timer?.invalidate()
        timer = nil
    }

    func reset() {
        pause()
        phase = .focus
        remainingSeconds = duration(for: .focus)
        completedFocusSessions = 0
    }

    func skipPhase() {
        advancePhase(playChime: false)
    }

    private func tick() {
        guard isRunning else { return }
        remainingSeconds -= 1
        if remainingSeconds <= 0 {
            advancePhase(playChime: true)
        }
    }

    private func advancePhase(playChime: Bool) {
        if phase == .focus {
            completedFocusSessions += 1
        }
        phase = phase == .focus ? .shortBreak : .focus
        remainingSeconds = duration(for: phase)
        if playChime {
            NSSound(named: "Glass")?.play()
        }
    }
}

struct PomodoroCardContent: View {
    @ObservedObject var pomodoro: PomodoroTimerModel
    let theme: CopilotThemeTokens

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center, spacing: 8) {
                Text("Pomodoro".uppercased())
                    .font(.custom("Figtree", size: 10).weight(.medium))
                    .foregroundStyle(theme.textTertiary)
                Spacer()
                if pomodoro.completedFocusSessions > 0 {
                    Text("\(pomodoro.completedFocusSessions) done")
                        .font(.custom("Figtree", size: 10).weight(.semibold))
                        .foregroundStyle(theme.textTertiary)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(theme.layer1)
                        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                }
            }

            HStack(alignment: .firstTextBaseline, spacing: 8) {
                if pomodoro.isRunning {
                    timeText
                } else {
                    // Idle/paused, the time is a menu: pick focus and break
                    // lengths without leaving the card.
                    Menu {
                        durationMenuItems
                    } label: {
                        HStack(alignment: .center, spacing: 5) {
                            timeText
                            AtlasIcon(.arrowDown)
                                .frame(width: 9, height: 9)
                                .foregroundStyle(theme.textTertiary)
                        }
                        .contentShape(Rectangle())
                    }
                    .menuStyle(.borderlessButton)
                    .menuIndicator(.hidden)
                    .fixedSize()
                    .help("Change focus and break lengths")
                }
                Text(pomodoro.phase.label)
                    .font(.custom("Figtree", size: 11).weight(.medium))
                    .foregroundStyle(pomodoro.phase == .focus ? theme.accent : theme.success)
                Spacer(minLength: 0)
            }

            durationControls
        }
    }

    private var timeText: some View {
        Text(pomodoro.timeLabel)
            .font(.custom("Newsreader", size: 26).weight(.regular))
            .foregroundStyle(theme.textPrimary)
            .monospacedDigit()
    }

    @ViewBuilder
    private var durationMenuItems: some View {
        Section("Focus") {
            ForEach(PomodoroTimerModel.focusPresets, id: \.self) { minutes in
                Toggle("\(minutes) minutes", isOn: Binding(
                    get: { pomodoro.focusMinutes == minutes },
                    set: { if $0 { pomodoro.focusMinutes = minutes } }
                ))
            }
        }
        Section("Break") {
            ForEach(PomodoroTimerModel.breakPresets, id: \.self) { minutes in
                Toggle("\(minutes) minutes", isOn: Binding(
                    get: { pomodoro.breakMinutes == minutes },
                    set: { if $0 { pomodoro.breakMinutes = minutes } }
                ))
            }
        }
    }

    private var durationControls: some View {
            HStack(spacing: 10) {
                GeometryReader { proxy in
                    ZStack(alignment: .leading) {
                        Capsule()
                            .fill(theme.layer1)
                        Capsule()
                            .fill(pomodoro.phase == .focus ? theme.accent : theme.success)
                            .frame(width: max(4, proxy.size.width * pomodoro.progress))
                            .animation(.linear(duration: 1), value: pomodoro.progress)
                    }
                }
                .frame(height: 4)

                Button {
                    pomodoro.toggle()
                } label: {
                    Image(systemName: pomodoro.isRunning ? "pause.fill" : "play.fill")
                }
                .buttonStyle(PomodoroIconButtonStyle(theme: theme, prominent: true))
                .help(pomodoro.isRunning ? "Pause" : (pomodoro.isActive ? "Resume" : "Start focus"))

                if pomodoro.isActive {
                    Button {
                        pomodoro.skipPhase()
                    } label: {
                        Image(systemName: "forward.end.fill")
                    }
                    .buttonStyle(PomodoroIconButtonStyle(theme: theme))
                    .help(pomodoro.phase == .focus ? "Skip to break" : "Skip to focus")

                    Button {
                        pomodoro.reset()
                    } label: {
                        Image(systemName: "arrow.counterclockwise")
                    }
                    .buttonStyle(PomodoroIconButtonStyle(theme: theme))
                    .help("Reset")
                }
            }
            .frame(maxWidth: .infinity)
    }
}

private struct PomodoroIconButtonStyle: ButtonStyle {
    let theme: CopilotThemeTokens
    var prominent = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(prominent ? theme.textOnAccent : theme.textSecondary)
            .frame(width: 26, height: 26)
            .background(
                Circle()
                    .fill(
                        prominent
                            ? theme.accent.opacity(configuration.isPressed ? 0.85 : 1)
                            : theme.layer1.opacity(configuration.isPressed ? 0.72 : 1)
                    )
            )
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
    }
}
