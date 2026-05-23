import SwiftUI

struct MeetingPopoverView: View {
    @StateObject private var store = MeetingStore()

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header

            if store.isRestoringSession {
                loadingCard
            } else if !store.isAuthenticated {
                loginCard
            } else {
                settingsCard
                upcomingCard
                recorderCard
                voiceCard
            }

            if !store.statusMessage.isEmpty {
                Text(store.statusMessage)
                    .font(.custom("Figtree", size: 11).weight(.medium))
                    .foregroundStyle(BrandTheme.textSecondary)
                    .lineLimit(3)
            }
        }
        .padding(12)
        .background(BrandTheme.surface)
        .preferredColorScheme(.light)
    }

    private var header: some View {
        HStack(spacing: 8) {
            if let logo = BrandTheme.logo {
                Image(nsImage: logo)
                    .resizable()
                    .scaledToFit()
                    .frame(height: 16)
                    .opacity(0.62)
            }
            Spacer()
            Text("Copilot")
                .font(.custom("Figtree", size: 12).weight(.medium))
                .foregroundStyle(BrandTheme.labelLight)
        }
    }

    private var loginCard: some View {
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
                .foregroundStyle(BrandTheme.textSecondary)
        }
    }

    private var loadingCard: some View {
        card {
            HStack(spacing: 10) {
                ProgressView()
                    .controlSize(.small)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Checking your DragonFruit session")
                        .font(.custom("Figtree", size: 12).weight(.medium))
                        .foregroundStyle(BrandTheme.textPrimary)
                    Text("One moment while Copilot verifies this Mac.")
                        .font(.custom("Figtree", size: 11).weight(.medium))
                        .foregroundStyle(BrandTheme.textSecondary)
                }
                Spacer()
            }
        }
    }

    private var settingsCard: some View {
        card {
            sectionLabel("Settings")
            featureToggle("Meeting notes", isOn: $store.meetingNotesEnabled)
            featureToggle("Speech", isOn: $store.speechCaptureEnabled)
            featureToggle("Cursor buddy", isOn: $store.cursorBuddyEnabled)
            featureToggle("Gaze tracking", isOn: $store.gazeTrackingEnabled, detail: "Soon", disabled: true)
            HStack(spacing: 8) {
                Button(settingsButtonTitle) {
                    Task {
                        if store.googleConnected && !store.needsCalendarReconnect {
                            await store.refreshCalendarState()
                        } else {
                            await store.connectGoogle()
                        }
                    }
                }
                .buttonStyle(DragonFruitPrimaryButtonStyle())
                Button("Open") {
                    if let url = URL(string: store.appURL) {
                        NSWorkspace.shared.open(url)
                    }
                }
                .buttonStyle(.plain)
                .font(.custom("Figtree", size: 12).weight(.medium))
                .foregroundStyle(BrandTheme.textSecondary)
                Spacer()
            }
        }
    }

    private var upcomingCard: some View {
        card {
            sectionLabel("Upcoming meeting")
            if store.needsCalendarReconnect {
                Text("Reconnect Google Calendar to bring meetings here.")
                    .font(.custom("Newsreader", size: 18).weight(.medium))
                    .foregroundStyle(BrandTheme.textPrimary)
                    .lineLimit(2)
                Button("Reconnect Google Calendar") {
                    Task { await store.connectGoogle() }
                }
                .buttonStyle(DragonFruitPrimaryButtonStyle())
            } else if store.googleConnected {
                if !store.hasMeetingsToday && store.meeting.id != "empty" {
                    Text("No meetings today")
                        .font(.custom("Figtree", size: 12).weight(.medium))
                        .foregroundStyle(BrandTheme.textSecondary)
                }
                Text(store.meeting.id == "empty" ? "No upcoming meetings" : store.meeting.title)
                    .font(.custom("Newsreader", size: 18).weight(.medium))
                    .foregroundStyle(BrandTheme.textPrimary)
                    .lineSpacing(0)
                    .lineLimit(2)
                if store.meeting.id != "empty" {
                    HStack(spacing: 8) {
                        Text(store.countdownLabel)
                            .font(.custom("Figtree", size: 11).weight(.medium))
                            .foregroundStyle(BrandTheme.textSecondary)
                        if store.meeting.joinURL != nil {
                            Button("Join meeting") {
                                store.openJoinLink()
                            }
                            .buttonStyle(DragonFruitPrimaryButtonStyle())
                        }
                        if !store.meeting.calendarDisplayName.isEmpty {
                            Text(store.meeting.calendarDisplayName)
                                .font(.custom("Figtree", size: 10).weight(.medium))
                                .foregroundStyle(BrandTheme.labelLight)
                                .lineLimit(1)
                        }
                        Spacer()
                    }
                }
            } else {
                Button("Connect Google Calendar") {
                    Task { await store.connectGoogle() }
                }
                .buttonStyle(DragonFruitPrimaryButtonStyle())
            }
        }
    }

    private var recorderCard: some View {
        card {
            HStack {
                sectionLabel("Recorder")
                Spacer()
                Text(store.meetingState)
                    .font(.custom("Figtree", size: 11).weight(.medium))
                    .foregroundStyle(BrandTheme.textSecondary)
                if store.lastMeetingNotesURL != nil {
                    Button("Open notes") {
                        store.openMeetingNotes()
                    }
                    .buttonStyle(.plain)
                    .font(.custom("Figtree", size: 12).weight(.medium))
                    .foregroundStyle(BrandTheme.textSecondary)
                }
                Button(store.isMeetingRecording ? "Stop & save" : "Start notes") {
                    store.toggleRecording()
                }
                .buttonStyle(DragonFruitPrimaryButtonStyle())
            }
            if store.isMeetingRecording && !store.meetingNotesTranscript.isEmpty {
                Text(store.meetingNotesTranscript)
                    .font(.custom("Figtree", size: 11).weight(.medium))
                    .foregroundStyle(BrandTheme.textSecondary)
                    .lineLimit(3)
            } else if !store.lastSavedMeetingTitle.isEmpty {
                Text("Saved draft for \(store.lastSavedMeetingTitle).")
                    .font(.custom("Figtree", size: 11).weight(.medium))
                    .foregroundStyle(BrandTheme.textSecondary)
                    .lineLimit(2)
            }
        }
    }

    private var settingsButtonTitle: String {
        if store.needsCalendarReconnect { return "Reconnect Calendar" }
        return store.googleConnected ? "Refresh meetings" : "Connect Google Calendar"
    }

    private var voiceCard: some View {
        card {
            sectionLabel("Voice notes")
            Text("Capture an idea and DragonFruit routes it as a task, doc, sticky, or agent request.")
                .font(.custom("Figtree", size: 11).weight(.medium))
                .foregroundStyle(BrandTheme.textSecondary)
            HStack(spacing: 8) {
                Button(store.isListening ? "Stop" : "Capture") {
                    store.toggleVoiceCapture()
                }
                .buttonStyle(DragonFruitPrimaryButtonStyle())
                Button("Agent") {
                    store.spawnAgentFromVoice()
                }
                .buttonStyle(.plain)
                .font(.custom("Figtree", size: 12).weight(.medium))
                .foregroundStyle(BrandTheme.textSecondary)
                Text(store.isListening ? "Listening" : "⌥⌘Space")
                    .font(.custom("Figtree", size: 10).weight(.medium))
                    .foregroundStyle(BrandTheme.labelLight)
                Spacer()
            }
            if let capture = store.lastCapture {
                Text("\(capture.type.rawValue) · \(capture.projectHint)")
                    .font(.custom("Figtree", size: 10).weight(.medium))
                    .foregroundStyle(BrandTheme.labelLight)
                Text(capture.title)
                    .font(.custom("Newsreader", size: 16).weight(.medium))
                    .foregroundStyle(BrandTheme.textPrimary)
                    .lineLimit(2)
            }
            if !store.lastAgentTextResponse.isEmpty {
                Text(store.lastAgentTextResponse)
                    .font(.custom("Figtree", size: 12).weight(.medium))
                    .foregroundStyle(BrandTheme.textPrimary)
                    .lineLimit(5)
            }
        }
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
    private func sectionLabel(_ label: String) -> some View {
        Text(label.uppercased())
            .font(.custom("Figtree", size: 10).weight(.medium))
            .foregroundStyle(BrandTheme.labelLight)
    }

    private func featureToggle(
        _ label: String,
        isOn: Binding<Bool>,
        detail: String? = nil,
        disabled: Bool = false
    ) -> some View {
        Toggle(isOn: isOn) {
            HStack(spacing: 6) {
                Text(label)
                    .font(.custom("Figtree", size: 12).weight(.medium))
                    .foregroundStyle(disabled ? BrandTheme.labelLight : BrandTheme.textPrimary)
                if let detail {
                    Text(detail)
                        .font(.custom("Figtree", size: 10).weight(.medium))
                        .foregroundStyle(BrandTheme.labelLight)
                }
            }
        }
        .toggleStyle(.switch)
        .tint(BrandTheme.accent)
        .disabled(disabled)
    }
}
