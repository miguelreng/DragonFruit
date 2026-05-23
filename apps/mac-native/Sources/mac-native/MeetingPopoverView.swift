import SwiftUI

struct MeetingPopoverView: View {
    @StateObject private var store = MeetingStore()

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header

            if !store.isAuthenticated {
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

    private var settingsCard: some View {
        card {
            labelRow("Settings", value: store.googleConnected ? "Connected" : "Connect")
            Text(store.googleConnected ? "Calendar connected and voice capture ready." : "Connect Google Calendar to bring meetings here.")
                .font(.custom("Figtree", size: 12).weight(.medium))
                .foregroundStyle(BrandTheme.textSecondary)
            HStack(spacing: 8) {
                Button(store.googleConnected ? "Refresh meetings" : "Connect Google Calendar") {
                    Task {
                        if store.googleConnected {
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
            labelRow("Upcoming meeting", value: store.countdownLabel)
            if store.googleConnected {
                Text(store.meeting.title)
                    .font(.custom("Newsreader", size: 18).weight(.medium))
                    .foregroundStyle(BrandTheme.textPrimary)
                    .lineSpacing(0)
                    .lineLimit(2)
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
                labelRow("Recorder", value: store.meetingState)
                Spacer()
                Button(store.meetingState == "Recording" ? "Stop" : "Start") {
                    store.toggleRecording()
                }
                .buttonStyle(DragonFruitPrimaryButtonStyle())
            }
        }
    }

    private var voiceCard: some View {
        card {
            labelRow("Voice notes", value: store.isListening ? "Listening" : "⌥⌘Space")
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
    private func labelRow(_ label: String, value: String) -> some View {
        HStack {
            Text(label.uppercased())
                .font(.custom("Figtree", size: 10).weight(.medium))
                .foregroundStyle(BrandTheme.labelLight)
            Spacer()
            Text(value)
                .font(.custom("Figtree", size: 11).weight(.medium))
                .foregroundStyle(BrandTheme.textSecondary)
        }
    }
}
