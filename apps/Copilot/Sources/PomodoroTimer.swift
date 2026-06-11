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

        var duration: Int {
            switch self {
            case .focus:
                return 25 * 60
            case .shortBreak:
                return 5 * 60
            }
        }
    }

    @Published private(set) var phase: Phase = .focus
    @Published private(set) var isRunning = false
    @Published private(set) var remainingSeconds: Int = Phase.focus.duration
    @Published private(set) var completedFocusSessions = 0

    private var timer: Timer?

    /// True once a session has been started, even while paused mid-phase.
    var isActive: Bool {
        isRunning || remainingSeconds != phase.duration
    }

    var timeLabel: String {
        String(format: "%d:%02d", remainingSeconds / 60, remainingSeconds % 60)
    }

    var progress: Double {
        let total = Double(phase.duration)
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
        remainingSeconds = Phase.focus.duration
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
        remainingSeconds = phase.duration
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
                Text(pomodoro.timeLabel)
                    .font(.custom("Newsreader", size: 26).weight(.regular))
                    .foregroundStyle(theme.textPrimary)
                    .monospacedDigit()
                Text(pomodoro.phase.label)
                    .font(.custom("Figtree", size: 11).weight(.medium))
                    .foregroundStyle(pomodoro.phase == .focus ? theme.accent : theme.success)
                Spacer(minLength: 0)
            }

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
        }
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
