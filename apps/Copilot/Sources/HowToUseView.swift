// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import AppKit
import SwiftUI

/// In-app instructions: what Atlas does, how each feature works, and which
/// macOS permissions it needs. Reached from the "?" button in the popover
/// header and from Settings → "How to use Atlas".
struct HowToUseView: View {
    let theme: CopilotThemeTokens
    var onDismiss: () -> Void

    private let cardCornerRadius: CGFloat = 12

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            titleRow

            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 10) {
                    introCard
                    featuresCard
                    permissionsCard
                }
            }
            .frame(maxHeight: 430)
        }
    }

    private var titleRow: some View {
        HStack(spacing: 8) {
            sectionLabel("How to use")
            Spacer()
            Button {
                onDismiss()
            } label: {
                AtlasIcon(.cancel)
                    .frame(width: 11, height: 11)
                    .foregroundStyle(theme.textTertiary)
                    .frame(width: 20, height: 20)
                    .background(theme.layer1)
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help("Back")
        }
    }

    private var introCard: some View {
        card {
            HStack(alignment: .center, spacing: 10) {
                if let logo = BrandTheme.dragonLogo {
                    Image(nsImage: logo)
                }
                Text("DragonFruit Atlas")
                    .font(.custom("Newsreader", size: 17).weight(.regular))
                    .foregroundStyle(theme.textPrimary)
            }
            Text("Atlas lives in your menu bar and connects this Mac to DragonFruit. Speak to capture work, let it take meeting notes, and keep your tasks one click away.")
                .font(.custom("Figtree", size: 11).weight(.medium))
                .foregroundStyle(theme.textSecondary)
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var featuresCard: some View {
        card {
            sectionLabel("Features")
            featureRow(
                icon: .mic01,
                title: "Talk to Atlas",
                hotkey: "Hold ⌥Space",
                detail: "Speak naturally — Atlas creates tasks, docs, stickies, and bookmarks in your workspace, answers questions, or looks things up. Release the keys to send."
            )
            featureRow(
                icon: .voice,
                title: "Dictation",
                hotkey: "Hold ⌥",
                detail: "Hold Option and speak; Atlas types what you say into the field your cursor is in. Turn it on in Settings first."
            )
            featureRow(
                icon: .file,
                title: "Meeting notes",
                detail: "Connect Google Calendar and Atlas surfaces your next meeting. Start notes to transcribe the call — Atlas drafts notes into a DragonFruit doc when you stop."
            )
            featureRow(
                icon: .message,
                title: "Atlas follow-ups",
                detail: "Agent runs that need your input — a question or an approval — show up here, along with anything that finished while you were away."
            )
            featureRow(
                icon: .checkCircle,
                title: "My tasks",
                detail: "Your open DragonFruit tasks at a glance. Mark them done here or jump to them on the web."
            )
            featureRow(
                icon: .record,
                title: "Pomodoro",
                detail: "Run focus sessions from the menu bar — the countdown shows next to the Atlas icon, so you can keep this popover closed."
            )
            featureRow(
                icon: .cursor,
                title: "Atlas cursor",
                detail: "An optional companion that follows your pointer and shows what Atlas is doing — listening, thinking, done. Tune or hide it in Settings."
            )
        }
    }

    private var permissionsCard: some View {
        card {
            sectionLabel("Permissions")
            Text("Microphone and speech recognition are required to use Atlas; the others are optional and unlock extras. Change any of them later in System Settings → Privacy & Security.")
                .font(.custom("Figtree", size: 11).weight(.medium))
                .foregroundStyle(theme.textSecondary)
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
            permissionRow(
                icon: .mic01,
                name: "Microphone",
                isRequired: true,
                detail: "How Atlas hears you. Needed for voice capture, dictation, and meeting notes."
            )
            permissionRow(
                icon: .voice,
                name: "Speech recognition",
                isRequired: true,
                detail: "Turns your voice into text so Atlas can act on it."
            )
            permissionRow(
                icon: .volumeHigh,
                name: "System audio",
                isRequired: false,
                detail: "Screen-recording permission (System Audio Recording Only). Lets meeting notes hear the other people in your call — without it, Atlas only hears your side."
            )
            permissionRow(
                icon: .cursor,
                name: "Accessibility",
                isRequired: false,
                detail: "Lets Atlas see where your cursor is and type dictation into the active field. Skip it and dictation stays off."
            )
            permissionRow(
                icon: .record,
                name: "Screen Recording",
                isRequired: false,
                detail: "Lets Atlas see what's on your screen. Ask “what's on my screen?” or toggle the screen button in the chat composer, and Atlas answers about the window you're looking at. Grant it, then reopen Atlas."
            )
        }
    }

    private func featureRow(
        icon: AtlasIconName,
        title: String,
        hotkey: String? = nil,
        detail: String
    ) -> some View {
        HStack(alignment: .top, spacing: 9) {
            AtlasIcon(icon)
                .frame(width: 14, height: 14)
                .foregroundStyle(theme.accent)
                .frame(width: 18)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(title)
                        .font(.custom("Figtree", size: 12).weight(.semibold))
                        .foregroundStyle(theme.textPrimary)
                    if let hotkey {
                        hotkeyPill(hotkey)
                    }
                }
                Text(detail)
                    .font(.custom("Figtree", size: 11).weight(.medium))
                    .foregroundStyle(theme.textSecondary)
                    .lineSpacing(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
    }

    private func permissionRow(
        icon: AtlasIconName,
        name: String,
        isRequired: Bool,
        detail: String
    ) -> some View {
        HStack(alignment: .top, spacing: 9) {
            AtlasIcon(icon)
                .frame(width: 14, height: 14)
                .foregroundStyle(isRequired ? theme.accent : theme.textTertiary)
                .frame(width: 18)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(name)
                        .font(.custom("Figtree", size: 12).weight(.semibold))
                        .foregroundStyle(theme.textPrimary)
                    requirementPill(isRequired: isRequired)
                }
                Text(detail)
                    .font(.custom("Figtree", size: 11).weight(.medium))
                    .foregroundStyle(theme.textSecondary)
                    .lineSpacing(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
    }

    private func requirementPill(isRequired: Bool) -> some View {
        Text(isRequired ? "Required" : "Optional")
            .font(.custom("Figtree", size: 9).weight(.semibold))
            .foregroundStyle(isRequired ? theme.accent : theme.textTertiary)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(isRequired ? theme.accentSubtle : theme.layer1)
            .clipShape(Capsule())
    }

    private func hotkeyPill(_ label: String) -> some View {
        Text(label)
            .font(.custom("Figtree", size: 10).weight(.semibold))
            .foregroundStyle(theme.textTertiary)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(theme.layer1)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }

    @ViewBuilder
    private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            content()
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: cardCornerRadius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: cardCornerRadius, style: .continuous)
                .stroke(theme.border, lineWidth: 0.75)
        )
    }

    @ViewBuilder
    private func sectionLabel(_ label: String) -> some View {
        Text(label.uppercased())
            .font(.custom("Figtree", size: 10).weight(.medium))
            .foregroundStyle(theme.textTertiary)
    }
}
