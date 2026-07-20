import AppKit
import Charts
import Combine
import CoreImage
import CoreImage.CIFilterBuiltins
import SwiftUI

/// Borderless panel that can still take key focus so the chat text field
/// receives typed characters (borderless windows refuse key status by default).
private final class AtlasChatPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

/// Transparent SwiftUI host so the behind-window glass shows through.
private final class ChatHostingView<Content: View>: NSHostingView<Content> {
    override var isOpaque: Bool { false }

    required init(rootView: Content) {
        super.init(rootView: rootView)
        // Fill the panel bounds instead of collapsing to the content's intrinsic
        // size (the default on macOS 13+, which centered the panel as a small box).
        sizingOptions = []
        makeTransparent()
    }

    @MainActor @preconcurrency required dynamic init?(coder: NSCoder) {
        super.init(coder: coder)
        sizingOptions = []
        makeTransparent()
    }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        makeTransparent()
        window?.backgroundColor = .clear
        window?.isOpaque = false
    }

    private func makeTransparent() {
        wantsLayer = true
        layer?.backgroundColor = NSColor.clear.cgColor
        layer?.isOpaque = false
    }
}

/// Owns the floating glass chat window and mirrors `store.isAtlasChatVisible`.
/// Modeled on the other overlay controllers (`VoiceToastController`, …) but,
/// unlike them, this panel activates and takes key focus so the user can type.
@MainActor
final class AtlasChatOverlayController: ObservableObject {
    private var panel: AtlasChatPanel?
    private var cancellables: Set<AnyCancellable> = []
    private weak var store: MeetingStore?
    private var escMonitor: Any?
    private var selectionTimer: Timer?

    /// Card is inset from the panel edges so the SwiftUI drop shadow has room
    /// to fade out completely. Must exceed the shadow blur radius (22) + offset,
    /// otherwise the blur is clipped at the window bound and leaves a hard seam.
    static let shadowInset: CGFloat = 44
    private static let cardWidth: CGFloat = 384
    /// Gap between the card and the right screen edge.
    private static let edgeGap: CGFloat = 12

    private func panelFrame() -> NSRect {
        let screen = NSScreen.main?.visibleFrame ?? .zero
        let width = Self.cardWidth + Self.shadowInset * 2
        // Full usable height, docked to the right — mirrors the web Atlas sidebar.
        let height = screen.height
        let x = screen.maxX - width - Self.edgeGap + Self.shadowInset
        let y = screen.minY
        return NSRect(x: x, y: y, width: width, height: height)
    }

    func bind(to store: MeetingStore) {
        guard self.store !== store else { return }
        self.store = store
        cancellables.removeAll()

        store.$isAtlasChatVisible
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .sink { [weak self, weak store] visible in
                guard let self, let store else { return }
                if visible {
                    self.showPanel(for: store)
                } else {
                    self.hidePanel()
                }
            }
            .store(in: &cancellables)
    }

    private func showPanel(for store: MeetingStore) {
        let frame = panelFrame()
        let panel = panel ?? makePanel(size: frame.size)
        self.panel = panel
        panel.contentView = ChatHostingView(rootView: AtlasChatView(store: store))
        panel.setFrame(frame, display: true)

        // The entrance (fade + slide + blur) is driven inside SwiftUI, so the
        // window itself is opaque from the first frame.
        NSApp.activate(ignoringOtherApps: true)
        panel.alphaValue = 1
        panel.makeKeyAndOrderFront(nil)
        installEscapeMonitor()
        startSelectionWatch()
    }

    private func hidePanel() {
        removeEscapeMonitor()
        stopSelectionWatch()
        guard let panel, panel.isVisible else { return }
        NSAnimationContext.runAnimationGroup({ context in
            context.duration = 0.28
            context.timingFunction = AtlasMotion.standardTimingFunction
            panel.animator().alphaValue = 0
        }, completionHandler: { [weak panel] in
            panel?.orderOut(nil)
        })
    }

    private func makePanel(size: NSSize) -> AtlasChatPanel {
        let panel = AtlasChatPanel(
            contentRect: NSRect(origin: .zero, size: size),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.backgroundColor = .clear
        panel.isOpaque = false
        panel.hasShadow = false
        panel.isMovableByWindowBackground = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient]
        panel.animationBehavior = .none
        // Stay open across app switches — the panel only closes on ⌥A or the
        // close button, never on focus loss / clicking into another window.
        panel.hidesOnDeactivate = false
        return panel
    }

    private func installEscapeMonitor() {
        guard escMonitor == nil else { return }
        escMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            if event.keyCode == 53 { // Escape
                self?.store?.closeAtlasChat()
                return nil
            }
            return event
        }
    }

    private func removeEscapeMonitor() {
        if let escMonitor {
            NSEvent.removeMonitor(escMonitor)
            self.escMonitor = nil
        }
    }

    // Poll the frontmost app's text selection while the panel is open so a
    // selection made AFTER opening still shows up as chat context.
    private func startSelectionWatch() {
        guard selectionTimer == nil else { return }
        let timer = Timer.scheduledTimer(withTimeInterval: 0.6, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.store?.refreshAtlasChatSelectionFromFrontmost()
            }
        }
        RunLoop.main.add(timer, forMode: .common)
        selectionTimer = timer
    }

    private func stopSelectionWatch() {
        selectionTimer?.invalidate()
        selectionTimer = nil
    }
}

/// Behind-window blur that samples the desktop for a true glass effect.
/// `leadingFade` feathers the blur's left edge (via `maskImage`) so the panel
/// melts into the content behind it instead of ending in a hard vertical edge.
private struct VisualEffectBlur: NSViewRepresentable {
    let material: NSVisualEffectView.Material
    var leadingFade: CGFloat = 0
    /// Alpha at the very leading edge — 0 = fully transparent, higher keeps some
    /// glass so the panel blends softly without a big see-through region.
    var fadeMinAlpha: CGFloat = 0
    /// Overall glass opacity — below 1 lets more of the desktop show through the
    /// whole panel body (not just the feathered edge).
    var intensity: CGFloat = 1

    func makeNSView(context: Context) -> NSVisualEffectView {
        let view = NSVisualEffectView()
        view.material = material
        view.blendingMode = .behindWindow
        view.state = .active
        view.isEmphasized = true
        view.alphaValue = intensity
        if leadingFade > 0 { view.maskImage = Self.leadingFadeMask(width: leadingFade, minAlpha: fadeMinAlpha) }
        return view
    }

    func updateNSView(_ nsView: NSVisualEffectView, context: Context) {
        nsView.material = material
        nsView.alphaValue = intensity
        if leadingFade > 0, nsView.maskImage == nil {
            nsView.maskImage = Self.leadingFadeMask(width: leadingFade, minAlpha: fadeMinAlpha)
        }
    }

    /// A horizontal alpha ramp (minAlpha → opaque over `width`) whose opaque
    /// right side stretches to fill via cap insets, so the mask fits any height.
    private static func leadingFadeMask(width: CGFloat, minAlpha: CGFloat) -> NSImage {
        let size = NSSize(width: width, height: 8)
        let image = NSImage(size: size)
        image.lockFocus()
        let gradient = NSGradient(colors: [
            NSColor(white: 1, alpha: minAlpha),
            NSColor(white: 1, alpha: 1),
        ])
        gradient?.draw(in: NSRect(origin: .zero, size: size), angle: 0)
        image.unlockFocus()
        image.capInsets = NSEdgeInsets(top: 0, left: width - 1, bottom: 0, right: 0)
        image.resizingMode = .stretch
        return image
    }
}

/// Native port of the web Atlas chat sidebar (agent-chat-drawer.tsx): a
/// full-height right-docked panel with a 56px header, a scrollable message
/// list (right-aligned pill user bubbles, plain left-aligned assistant text),
/// and a rounded composer with a send arrow + mode/scope pills. Rendered on a
/// behind-window glass backing.
/// A behind-window blur whose edges are feathered on ALL sides into a soft,
/// large-radius rounded shape — so the panel reads as an organic blob melting
/// into the desktop rather than a crisp rectangle. The mask is a white
/// rounded-rect Gaussian-blurred to a soft alpha falloff, regenerated to fit
/// the view's bounds on layout.
private final class BlobEffectView: NSVisualEffectView {
    var featherInset: CGFloat = 46
    var cornerRadius: CGFloat = 130
    private var lastSize: NSSize = .zero

    override func layout() {
        super.layout()
        let size = bounds.size
        guard size.width > 1, size.height > 1, size != lastSize else { return }
        lastSize = size
        maskImage = Self.blobMask(size: size, inset: featherInset, radius: cornerRadius)
    }

    private static func blobMask(size: NSSize, inset: CGFloat, radius: CGFloat) -> NSImage? {
        let width = Int(size.width.rounded())
        let height = Int(size.height.rounded())
        guard width > 0, height > 0,
              let rep = NSBitmapImageRep(
                bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height,
                bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0),
              let ctx = NSGraphicsContext(bitmapImageRep: rep)
        else { return nil }

        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = ctx
        NSColor.clear.setFill()
        NSRect(x: 0, y: 0, width: size.width, height: size.height).fill()
        let inner = NSRect(x: 0, y: 0, width: size.width, height: size.height).insetBy(dx: inset, dy: inset)
        let r = max(0, min(radius, min(inner.width, inner.height) / 2))
        NSColor.white.setFill()
        NSBezierPath(roundedRect: inner, xRadius: r, yRadius: r).fill()
        NSGraphicsContext.restoreGraphicsState()

        guard let cg = rep.cgImage else { return nil }
        let blur = CIFilter.gaussianBlur()
        blur.inputImage = CIImage(cgImage: cg)
        blur.radius = Float(inset * 0.55)
        guard let output = blur.outputImage else { return NSImage(cgImage: cg, size: size) }
        let cropRect = CGRect(x: 0, y: 0, width: width, height: height)
        guard let outCG = CIContext(options: nil).createCGImage(output, from: cropRect) else {
            return NSImage(cgImage: cg, size: size)
        }
        return NSImage(cgImage: outCG, size: size)
    }
}

private struct BlobVisualEffect: NSViewRepresentable {
    let material: NSVisualEffectView.Material
    var intensity: CGFloat = 1
    var featherInset: CGFloat = 46
    var cornerRadius: CGFloat = 130

    func makeNSView(context: Context) -> BlobEffectView {
        let view = BlobEffectView()
        view.material = material
        view.blendingMode = .behindWindow
        view.state = .active
        view.isEmphasized = true
        view.alphaValue = intensity
        view.featherInset = featherInset
        view.cornerRadius = cornerRadius
        return view
    }

    func updateNSView(_ nsView: BlobEffectView, context: Context) {
        nsView.material = material
        nsView.alphaValue = intensity
    }
}

struct AtlasChatView: View {
    @ObservedObject var store: MeetingStore
    @State private var draft = ""
    @State private var aiMode: AtlasAiMode = .ask
    @State private var entered = false
    @FocusState private var inputFocused: Bool

    private var theme: CopilotThemeTokens { store.copilotTheme.tokens }
    private var isDark: Bool { store.copilotTheme == .dark }
    private var glassMaterial: NSVisualEffectView.Material {
        isDark ? .hudWindow : .headerView
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            transcript
            composer
        }
        // Always fill the panel so the glass is the same size whether the chat
        // is empty or full (an empty page would otherwise collapse to content).
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        // Uniform behind-window glass across the entire panel — no tint gradient
        // and no feathered edge; the frosted material alone is the backing.
        .background(VisualEffectBlur(material: glassMaterial))
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .compositingGroup()
        .shadow(color: theme.shadow.opacity(0.5), radius: 24, y: 12)
        .padding(AtlasChatOverlayController.shadowInset)
        // Web panel motion (--panel-ease / --panel-open-dur): fade + slide + blur.
        .opacity(entered ? 1 : 0)
        .offset(x: entered ? 0 : 28)
        .blur(radius: entered ? 0 : 6)
        .onAppear {
            entered = false
            withAnimation(.timingCurve(0.22, 1, 0.36, 1, duration: 0.42)) {
                entered = true
            }
            inputFocused = true
        }
    }

    // MARK: Header — min-h-14 (56px), "Atlas" title left, icon buttons right

    private var header: some View {
        HStack(spacing: 8) {
            Text("Atlas")
                .font(.custom("Figtree", size: 13).weight(.medium))
                .foregroundStyle(theme.textPrimary)

            Spacer(minLength: 0)

            HeaderIconButton(system: "square.and.pencil", theme: theme, accessibility: "New chat") {
                store.startNewAtlasChat()
                draft = ""
                inputFocused = true
            }
            HeaderIconButton(system: "xmark", theme: theme, accessibility: "Close chat") {
                store.closeAtlasChat()
            }
        }
        .padding(.horizontal, 16)
        .frame(height: 56)
    }

    // MARK: Message list — px-4 py-5, gap-4

    private var transcript: some View {
        Group {
            if store.atlasChatMessages.isEmpty {
                emptyState
            } else {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 16) {
                            ForEach(store.atlasChatMessages) { message in
                                AtlasChatBubble(message: message, theme: theme, isDark: isDark, appURL: store.appURL)
                                    .id(message.id)
                            }
                            if store.isAtlasChatSending, store.atlasChatMessages.last?.text.isEmpty ?? false {
                                thinkingRow.id("thinking")
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 20)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .onChange(of: store.atlasChatMessages) { messages in
                        guard let last = messages.last else { return }
                        withAnimation(AtlasMotion.standard) {
                            proxy.scrollTo(last.id, anchor: .bottom)
                        }
                    }
                }
            }
        }
    }

    // Starter shortcuts, workspace scope — the mac panel has no open doc or
    // project context, so it always shows the web drawer's workspace set.
    private static let emptyStateSuggestions: [(icon: AtlasIconName, label: String)] = [
        (.search, "What's happening in my workspace?"),
        (.checkList, "Help me plan my week"),
        (.file, "Draft a doc for me"),
        (.lightbulb, "Brainstorm ideas"),
    ]

    // Empty state — mirrors the web drawer: centered dragon, "How can Atlas
    // help?", explainer, and starter suggestions that prefill the composer.
    private var emptyState: some View {
        VStack(spacing: 12) {
            // Logo tinted to the primary text color so it reads on the glass
            // in both light and dark, like the web dragon's dark:invert.
            if let dragon = BrandTheme.dragonGlyphTemplate {
                Image(nsImage: dragon)
                    .renderingMode(.template)
                    .resizable()
                    .scaledToFit()
                    .frame(height: 48)
                    .foregroundStyle(theme.textPrimary)
            }
            VStack(spacing: 4) {
                Text("How can Atlas help?")
                    .font(.custom("Figtree", size: 14).weight(.medium))
                    .foregroundStyle(theme.textPrimary)
                Text("Ask a question, brainstorm, or paste in something you want rewritten. Tasks and pages are not auto-attached.")
                    .font(.custom("Figtree", size: 12).weight(.regular))
                    .foregroundStyle(theme.textTertiary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            VStack(spacing: 0) {
                ForEach(Self.emptyStateSuggestions, id: \.label) { suggestion in
                    EmptyStateSuggestionButton(icon: suggestion.icon, label: suggestion.label, theme: theme) {
                        draft = suggestion.label
                        inputFocused = true
                    }
                }
            }
            .padding(.top, 4)
        }
        .frame(maxWidth: 320)
        .padding(.horizontal, 24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // "Thinking…" with the morphing-infinity loader. text-secondary to stay
    // legible over light backgrounds (matching the Ask / scope pills).
    private var thinkingRow: some View {
        HStack(spacing: 7) {
            MorphingInfinityLoader(color: theme.textSecondary)
                .frame(width: 18, height: 18)
            Text("Thinking…")
                .font(.custom("Figtree", size: 12).weight(.regular))
                .foregroundStyle(theme.textSecondary)
        }
    }

    // MARK: Composer

    private var composer: some View {
        VStack(spacing: 2) {
            // Input box: flex flex-col gap-1.5 · rounded-xl (12px) · border-[0.5px]
            // · px-3 py-2 · focus-within:border-strong
            VStack(alignment: .leading, spacing: 6) {
            if let selection = store.atlasChatSelectionContext, !selection.isEmpty {
                SelectionContextChip(text: selection, theme: theme) {
                    store.clearAtlasChatSelectionContext()
                }
            }
            if store.atlasChatWillCaptureScreen(for: draft) {
                ScreenContextHint(theme: theme)
            }
            HStack(alignment: .bottom, spacing: 8) {
                TextField("Message Atlas…  type @ to add a doc or task", text: $draft, axis: .vertical)
                    .textFieldStyle(.plain)
                    .font(.custom("Figtree", size: 13).weight(.regular))
                    .foregroundStyle(theme.textPrimary)
                    .tint(theme.accent)
                    .lineSpacing(2) // leading-snug on 13px
                    .lineLimit(1...7)
                    .focused($inputFocused)
                    .modifier(ComposerSubmitModifier(send: send))

                // Send: UndoLeft rotated 180 · size-4 (16px) · text-secondary → primary
                Button(action: send) {
                    AtlasIcon(.undo)
                        .frame(width: 16, height: 16)
                        .rotationEffect(.degrees(180))
                        .foregroundStyle(canSend ? theme.textPrimary : theme.textSecondary)
                        .opacity(canSend ? 1 : 0.4)
                }
                .buttonStyle(.plain)
                .disabled(!canSend)
                .accessibilityLabel("Send message")
            }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(theme.surface.opacity(isDark ? 0.35 : 0.5))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(inputFocused ? theme.borderStrong : theme.border, lineWidth: 1)
            )

            // Toolbar row: attach · integrations · mode · scope (mt-0.5, px-1, gap-1)
            HStack(spacing: 4) {
                ComposerIconButton(icon: .paperclip, theme: theme, accessibility: "Attach file",
                                   tint: store.atlasChatPendingAttachmentCount > 0 ? theme.accent : nil) {
                    presentAttachmentPicker()
                }
                ComposerIconButton(
                    icon: .cursor,
                    theme: theme,
                    accessibility: store.atlasChatScreenVisionEnabled
                        ? "Screen vision on — Atlas sees your screen"
                        : "Let Atlas see your screen",
                    tint: store.atlasChatScreenVisionEnabled ? theme.accent : nil,
                    bold: store.atlasChatScreenVisionEnabled
                ) {
                    store.toggleAtlasChatScreenVision()
                }
                ComposerIconButton(icon: .layoutGrid, theme: theme, accessibility: "Integrations") {
                    store.openAtlasIntegrations()
                }

                Menu {
                    ForEach(AtlasAiMode.allCases) { mode in
                        Button(mode.label) { aiMode = mode }
                    }
                } label: {
                    PillLabel(text: aiMode.label, theme: theme)
                }
                .menuStyle(.borderlessButton)
                .menuIndicator(.hidden)
                .fixedSize()

                Menu {
                    ForEach(store.availableWorkspaces) { workspace in
                        Button(workspace.name) { store.selectedWorkspaceSlug = workspace.slug }
                    }
                } label: {
                    PillLabel(text: store.selectedWorkspaceName, theme: theme)
                }
                .menuStyle(.borderlessButton)
                .menuIndicator(.hidden)
                .fixedSize()

                Spacer(minLength: 0)
            }
            .padding(.horizontal, 4)
            .padding(.top, 2)

        }
        .padding(.horizontal, 12)
        .padding(.top, 8)
        .padding(.bottom, 10)
    }

    private func presentAttachmentPicker() {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.allowedContentTypes = [.image, .pdf, .commaSeparatedText, .plainText]
        if panel.runModal() == .OK {
            store.attachAtlasChatFiles(panel.urls)
        }
        inputFocused = true
    }

    private var canSend: Bool {
        !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !store.isAtlasChatSending
    }

    private func send() {
        guard canSend else { return }
        let text = draft
        draft = ""
        store.sendAtlasChatMessage(text)
        inputFocused = true
    }
}

// MARK: - Composer submit behavior (Return sends · Shift+Return = newline)

/// Return sends the message; Shift+Return (and macOS-native Option+Return)
/// inserts a line break in the composer. Uses `.onKeyPress` on macOS 14+ to
/// distinguish the modifier. On macOS 13 we fall back to `.onSubmit`, which
/// only fires on plain Return.
private struct ComposerSubmitModifier: ViewModifier {
    let send: () -> Void

    func body(content: Content) -> some View {
        if #available(macOS 14.0, *) {
            content.onKeyPress { press in
                guard press.key == .return else { return .ignored }
                // Native ⌥↩ is already bound to a line break in the field
                // editor — let it through untouched.
                if press.modifiers.contains(.option) { return .ignored }
                if press.modifiers.contains(.shift) {
                    // .ignored would NOT produce a line break here: the field
                    // editor maps Shift+Return to the same `insertNewline:`
                    // (submit) path as plain Return, so the press would just
                    // vanish. Insert the break ourselves — the same selector
                    // ⌥↩ triggers — and the binding picks it up.
                    guard let editor = activeFieldEditor else { return .ignored }
                    editor.insertNewlineIgnoringFieldEditor(nil)
                    return .handled
                }
                send()
                return .handled
            }
        } else {
            content.onSubmit(send)
        }
    }

    /// The focused field editor (an `NSTextView`) hosting the composer text.
    /// The chat panel is key while typing; the windows scan covers the
    /// non-activating-panel case where `keyWindow` can be nil.
    private var activeFieldEditor: NSTextView? {
        if let editor = NSApp.keyWindow?.firstResponder as? NSTextView { return editor }
        return NSApp.windows.lazy.compactMap { $0.firstResponder as? NSTextView }.first
    }
}

// MARK: - Header icon button (size-7 · rounded-md · text-secondary → primary on hover)

private struct HeaderIconButton: View {
    let system: String
    let theme: CopilotThemeTokens
    let accessibility: String
    let action: () -> Void
    @State private var isHovered = false

    var body: some View {
        Button(action: action) {
            Image(systemName: system)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(isHovered ? theme.textPrimary : theme.textSecondary)
                .frame(width: 28, height: 28)
                .background(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(isHovered ? theme.surface2.opacity(0.9) : Color.clear)
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibility)
        .onHover { isHovered = $0 }
    }
}

// MARK: - Atlas AI mode (mirrors web AI_MODES)

enum AtlasAiMode: String, CaseIterable, Identifiable {
    case ask, create, plan, summarize
    var id: String { rawValue }
    var label: String {
        switch self {
        case .ask: return "Ask"
        case .create: return "Create"
        case .plan: return "Plan"
        case .summarize: return "Summarize"
        }
    }
}

// MARK: - Selection context chip (mirrors the web "Replying to selection" badge)

private struct SelectionContextChip: View {
    let text: String
    let theme: CopilotThemeTokens
    let onRemove: () -> Void
    @State private var isHovered = false

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            VStack(alignment: .leading, spacing: 1) {
                Text("Selected text")
                    .font(.custom("Figtree", size: 11).weight(.medium))
                    .foregroundStyle(theme.accent)
                Text(text)
                    .font(.custom("Figtree", size: 12).weight(.regular))
                    .foregroundStyle(theme.textTertiary)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.vertical, 2)

            Spacer(minLength: 0)

            Button(action: onRemove) {
                AtlasIcon(.cancel)
                    .frame(width: 11, height: 11)
                    .foregroundStyle(isHovered ? theme.textPrimary : theme.textTertiary)
                    .frame(width: 20, height: 20)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Remove selected text context")
            .onHover { isHovered = $0 }
        }
        .padding(.leading, 10)
        .padding(.trailing, 2)
        .padding(.vertical, 4)
        .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(theme.surface2.opacity(0.7))
        )
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        // Hug the content's height so the chip never stretches the composer.
        .fixedSize(horizontal: false, vertical: true)
    }
}

// MARK: - Screen context hint ("see what I see")

/// Shown above the composer when the draft asks about the screen, so the user
/// knows Atlas will attach a screenshot of the frontmost window with this send.
private struct ScreenContextHint: View {
    let theme: CopilotThemeTokens

    var body: some View {
        HStack(spacing: 6) {
            AtlasIcon(.cursor, bold: true)
                .frame(width: 11, height: 11)
                .foregroundStyle(theme.accent)
            Text("Atlas will look at your current screen")
                .font(.custom("Figtree", size: 11).weight(.medium))
                .foregroundStyle(theme.textTertiary)
            Spacer(minLength: 0)
        }
        .padding(.leading, 10)
        .padding(.trailing, 8)
        .padding(.vertical, 5)
        .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(theme.surface2.opacity(0.7))
        )
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .fixedSize(horizontal: false, vertical: true)
    }
}

// MARK: - Composer toolbar icon button (size-6 · rounded-md · text-tertiary → primary)

private struct ComposerIconButton: View {
    let icon: AtlasIconName
    let theme: CopilotThemeTokens
    var accessibility: String
    var tint: Color? = nil
    var bold: Bool = false
    let action: () -> Void
    @State private var isHovered = false

    var body: some View {
        Button(action: action) {
            AtlasIcon(icon, bold: bold)
                .frame(width: 14, height: 14)
                .foregroundStyle(tint ?? (isHovered ? theme.textPrimary : theme.textSecondary))
                .frame(width: 24, height: 24)
                .background(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(isHovered ? theme.surface2.opacity(0.9) : Color.clear)
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibility)
        .onHover { isHovered = $0 }
    }
}

// MARK: - Empty-state suggestion row (px-2 py-1.5 · rounded-md · icon + text-13)

private struct EmptyStateSuggestionButton: View {
    let icon: AtlasIconName
    let label: String
    let theme: CopilotThemeTokens
    let action: () -> Void
    @State private var isHovered = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                AtlasIcon(icon)
                    .frame(width: 16, height: 16)
                    .foregroundStyle(theme.textTertiary)
                Text(label)
                    .font(.custom("Figtree", size: 13).weight(.regular))
                    .foregroundStyle(isHovered ? theme.textPrimary : theme.textSecondary)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .background(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(isHovered ? theme.surface2.opacity(0.9) : Color.clear)
            )
            .contentShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        }
        .buttonStyle(.plain)
        .onHover { isHovered = $0 }
        .accessibilityLabel(label)
    }
}

// MARK: - Composer toolbar pill label (h-6 · px-2 · text-13 font-medium text-secondary)

private struct PillLabel: View {
    let text: String
    let theme: CopilotThemeTokens
    @State private var isHovered = false

    var body: some View {
        Text(text)
            .font(.custom("Figtree", size: 13).weight(.medium))
            .foregroundStyle(isHovered ? theme.textPrimary : theme.textSecondary)
            .lineLimit(1)
            .frame(maxWidth: 130)
            .padding(.horizontal, 8)
            .frame(height: 24)
            .background(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(isHovered ? theme.surface2.opacity(0.9) : Color.clear)
            )
            .contentShape(Rectangle())
            .onHover { isHovered = $0 }
    }
}

// MARK: - Message bubble

private struct AtlasChatBubble: View {
    let message: AtlasChatMessage
    let theme: CopilotThemeTokens
    let isDark: Bool
    let appURL: String
    @State private var isHovered = false
    @State private var hoveredBlocks = 0

    // layer-1 reads nearly black on the dark glass — lift the user bubble a
    // step lighter so it separates from the backdrop.
    private var bubbleFill: Color {
        isDark ? Color(red: 0.29, green: 0.285, blue: 0.28) : theme.layer1
    }

    var body: some View {
        if message.role == .user {
            // Right-aligned pill · rounded-2xl + rounded-br-md · max-w-85%
            HStack {
                Spacer(minLength: 0)
                Text(message.text)
                    .font(.custom("Figtree", size: 13).weight(.regular))
                    .foregroundStyle(theme.textPrimary)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(
                        bubbleFill,
                        in: UnevenRoundedRectangle(
                            topLeadingRadius: 16,
                            bottomLeadingRadius: 16,
                            bottomTrailingRadius: 6,
                            topTrailingRadius: 16,
                            style: .continuous
                        )
                    )
                    .frame(maxWidth: 260, alignment: .trailing)
            }
        } else if !message.text.isEmpty {
            // Left-aligned rendered markdown (bold, lists, headings, links).
            // An empty assistant bubble renders nothing — the "Thinking…" row
            // covers the in-flight state, so there's no "(empty reply)" filler.
            HStack {
                AtlasMarkdownText(
                    text: message.text,
                    theme: theme,
                    isDark: isDark,
                    appURL: appURL,
                    hoveredBlocks: $hoveredBlocks
                )
                    .frame(maxWidth: .infinity, alignment: .leading)
                Spacer(minLength: 0)
            }
            // Hover-revealed copy chip at the reply's top-right (mirrors the
            // web drawer's BlockActions pill). Hidden while a block-level chip
            // is up so the two never stack on the first paragraph.
            .overlay(alignment: .topTrailing) {
                CopyChipButton(copyText: markdownPlainText(from: message.text), theme: theme, accessibility: "Copy reply")
                    .opacity(isHovered && hoveredBlocks == 0 ? 1 : 0)
            }
            .onHover { hovering in
                withAnimation(.easeOut(duration: 0.15)) { isHovered = hovering }
            }
        }
    }
}

// MARK: - Copy chip button (hover chip · copies the given text verbatim)

private struct CopyChipButton: View {
    let copyText: String
    let theme: CopilotThemeTokens
    var accessibility: String = "Copy text"
    @State private var copied = false
    @State private var isHovered = false
    @State private var copyGeneration = 0

    var body: some View {
        Button(action: copy) {
            Image(systemName: copied ? "checkmark" : "doc.on.doc")
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(copied || isHovered ? theme.textPrimary : theme.textSecondary)
                .frame(width: 22, height: 22)
                .background(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(theme.surface2.opacity(isHovered ? 1 : 0.9))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .stroke(theme.border, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibility)
        .help("Copy text")
        .onHover { isHovered = $0 }
    }

    private func copy() {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(copyText, forType: .string)
        copied = true
        copyGeneration += 1
        let generation = copyGeneration
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            if generation == copyGeneration { copied = false }
        }
    }
}

/// Strip markdown down to the plain text the user actually sees — the mac
/// port of the web drawer's `inlineMarkdownToPlainText`, plus heading/fence
/// markers so it also serves whole-reply copies.
private func markdownPlainText(from markdown: String) -> String {
    var text = markdown
    for (pattern, template) in [
        ("(?m)^#{1,6}\\s+", ""),
        ("(?m)^```.*$", ""),
        ("`([^`]+)`", "$1"),
        ("\\*\\*(.+?)\\*\\*", "$1"),
        ("__(.+?)__", "$1"),
        ("(^|[^*])\\*(?!\\s)(.+?)(?<!\\s)\\*", "$1$2"),
        ("(^|[^_])_(?!\\s)(.+?)(?<!\\s)_", "$1$2"),
        ("\\[([^\\]]+)\\]\\([^)]+\\)", "$1"),
    ] {
        text = text.replacingOccurrences(of: pattern, with: template, options: .regularExpression)
    }
    return text.trimmingCharacters(in: .whitespacesAndNewlines)
}

/// Wraps a rendered block and floats a copy chip at its top-right while the
/// mouse is over it — the mac port of the web drawer's per-block BlockActions,
/// so a rewritten paragraph or a code fence can be copied without taking the
/// whole reply. Reports hover through `hoveredBlocks` so the reply-level chip
/// can stand down while a block chip is up.
private struct CopyableBlock<Content: View>: View {
    let copyText: String
    let theme: CopilotThemeTokens
    @Binding var hoveredBlocks: Int
    var insetChip: Bool = false
    @ViewBuilder let content: () -> Content
    @State private var isHovered = false

    var body: some View {
        content()
            .overlay(alignment: .topTrailing) {
                if isHovered {
                    CopyChipButton(copyText: copyText, theme: theme)
                        .padding(insetChip ? 6 : 0)
                        .offset(y: insetChip ? 0 : -3)
                        .transition(.opacity)
                }
            }
            .onHover { hovering in
                guard hovering != isHovered else { return }
                withAnimation(.easeOut(duration: 0.12)) { isHovered = hovering }
                hoveredBlocks += hovering ? 1 : -1
            }
            .onDisappear {
                if isHovered {
                    isHovered = false
                    hoveredBlocks -= 1
                }
            }
    }
}

// MARK: - Lightweight markdown renderer for assistant replies

/// Renders the common markdown Atlas produces — paragraphs, headings, bullet /
/// numbered lists, and inline **bold** / *italic* / `code` / [links](url) —
/// mirroring the web AssistantMarkdown without pulling in a full parser.
private struct AtlasMarkdownText: View {
    let text: String
    let theme: CopilotThemeTokens
    let isDark: Bool
    let appURL: String
    @Binding var hoveredBlocks: Int

    var body: some View {
        // spacing 9 (was 5) — replies were reading cramped; give blocks air.
        VStack(alignment: .leading, spacing: 9) {
            ForEach(Array(Self.blocks(from: text).enumerated()), id: \.offset) { _, block in
                row(for: block)
            }
        }
        .tint(theme.accent)
        .textSelection(.enabled)
        .environment(\.openURL, OpenURLAction { url in
            guard let resolvedURL = resolvedAtlasOutputURL(url, appURL: appURL) else { return .discarded }
            return NSWorkspace.shared.open(resolvedURL) ? .handled : .discarded
        })
    }

    @ViewBuilder
    private func row(for block: MDBlock) -> some View {
        switch block {
        case let .heading(text):
            inline(text)
                .font(.custom("Figtree", size: 14).weight(.semibold))
                .foregroundStyle(theme.textPrimary)
        case let .paragraph(text):
            CopyableBlock(copyText: markdownPlainText(from: text), theme: theme, hoveredBlocks: $hoveredBlocks) {
                inline(text)
                    .font(.custom("Figtree", size: 13).weight(.regular))
                    .foregroundStyle(theme.textPrimary)
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
        case let .listItem(marker, text):
            CopyableBlock(copyText: markdownPlainText(from: text), theme: theme, hoveredBlocks: $hoveredBlocks) {
                HStack(alignment: .top, spacing: 6) {
                    Text(marker)
                        .font(.custom("Figtree", size: 13).weight(.regular))
                        .foregroundStyle(theme.textTertiary)
                    inline(text)
                        .font(.custom("Figtree", size: 13).weight(.regular))
                        .foregroundStyle(theme.textPrimary)
                        .lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        case let .code(text, language, closed):
            if language.lowercased() == "chart", let spec = AtlasChartSpec.parse(text) {
                AtlasChartView(spec: spec, theme: theme, isDark: isDark)
            } else if language.lowercased() == "chart", !closed {
                AtlasChartStreamingPlaceholder(theme: theme)
            } else {
                CopyableBlock(copyText: text, theme: theme, hoveredBlocks: $hoveredBlocks, insetChip: true) {
                    Text(text)
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(theme.textPrimary)
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(theme.surface2.opacity(0.7), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                }
            }
        }
    }

    // Inline markdown (bold/italic/code/links) via AttributedString; the bold
    // intent resolves against whatever font the row applies.
    private func inline(_ string: String) -> Text {
        if let attributed = try? AttributedString(
            markdown: string,
            options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        ) {
            return Text(attributed)
        }
        return Text(verbatim: string)
    }

    private enum MDBlock {
        case heading(String)
        case paragraph(String)
        case listItem(String, String)
        case code(String, language: String, closed: Bool)
    }

    private static func blocks(from text: String) -> [MDBlock] {
        var blocks: [MDBlock] = []
        var inFence = false
        var fenceLanguage = ""
        var codeLines: [String] = []

        for rawLine in text.components(separatedBy: "\n") {
            let line = rawLine
            let trimmed = line.trimmingCharacters(in: .whitespaces)

            if trimmed.hasPrefix("```") {
                if inFence {
                    blocks.append(.code(codeLines.joined(separator: "\n"), language: fenceLanguage, closed: true))
                    codeLines.removeAll()
                    fenceLanguage = ""
                } else {
                    fenceLanguage = String(trimmed.dropFirst(3)).trimmingCharacters(in: .whitespacesAndNewlines)
                }
                inFence.toggle()
                continue
            }
            if inFence {
                codeLines.append(line)
                continue
            }
            if trimmed.isEmpty { continue }

            if let hashRange = trimmed.range(of: #"^#{1,6}\s+"#, options: .regularExpression) {
                blocks.append(.heading(String(trimmed[hashRange.upperBound...])))
            } else if trimmed.hasPrefix("- ") || trimmed.hasPrefix("* ") {
                blocks.append(.listItem("•", String(trimmed.dropFirst(2))))
            } else if let match = trimmed.range(of: #"^(\d+)\.\s+"#, options: .regularExpression) {
                let marker = String(trimmed[trimmed.startIndex..<trimmed.index(before: match.upperBound)]).trimmingCharacters(in: .whitespaces)
                blocks.append(.listItem(marker, String(trimmed[match.upperBound...])))
            } else {
                blocks.append(.paragraph(trimmed))
            }
        }
        if inFence {
            blocks.append(.code(codeLines.joined(separator: "\n"), language: fenceLanguage, closed: false))
        }
        return blocks
    }
}

/// Resolve links emitted in Atlas replies. Workspace tools intentionally use
/// app-relative paths so the same response works across environments; macOS
/// needs a fully qualified URL before it can hand the link to a browser.
private func resolvedAtlasOutputURL(_ url: URL, appURL: String) -> URL? {
    if let scheme = url.scheme?.lowercased() {
        guard ["http", "https", "mailto"].contains(scheme) else { return nil }
        return url
    }

    let trimmedAppURL = appURL
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    guard var destination = URLComponents(string: trimmedAppURL),
          let scheme = destination.scheme?.lowercased(),
          ["http", "https"].contains(scheme),
          destination.host != nil,
          let relative = URLComponents(url: url, resolvingAgainstBaseURL: false)
    else { return nil }

    let path = relative.percentEncodedPath
    destination.percentEncodedPath = path.hasPrefix("/") ? path : "/\(path)"
    destination.percentEncodedQuery = relative.percentEncodedQuery
    destination.percentEncodedFragment = relative.percentEncodedFragment
    return destination.url
}

// MARK: - Portable Atlas charts

/// Native counterpart of the web app's `TChartSpec`. The backend sends this
/// JSON inside a `chart` fence, so both clients share one response contract.
private struct AtlasChartSpec {
    enum Kind: String {
        case bar
        case line
        case area
        case pie
        case donut
    }

    struct Series {
        let name: String
        let values: [Double]
        let colorHex: String?
    }

    struct Options {
        let stacked: Bool
        let legend: Bool?
        let xLabel: String?
        let yLabel: String?
    }

    let kind: Kind
    let title: String?
    let labels: [String]
    let series: [Series]
    let options: Options

    /// Mirrors the web parser's defensive boundaries: malformed completed
    /// output falls back to visible JSON instead of crashing the chat view.
    static func parse(_ raw: String) -> AtlasChartSpec? {
        guard let data = raw.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data),
              let dictionary = object as? [String: Any],
              let rawKind = cleanString(dictionary["type"], maxLength: 16)?.lowercased(),
              let kind = Kind(rawValue: rawKind),
              let rawLabels = dictionary["labels"] as? [Any]
        else { return nil }

        let labels = rawLabels.prefix(48).enumerated().map { index, rawLabel in
            cleanString(rawLabel, maxLength: 80) ?? "Item \(index + 1)"
        }
        guard !labels.isEmpty, let rawSeries = dictionary["series"] as? [Any] else { return nil }

        var series: [Series] = []
        for rawEntry in rawSeries.prefix(6) {
            guard let entry = rawEntry as? [String: Any],
                  let rawValues = entry["values"] as? [Any]
            else { continue }

            let values = labels.indices.map { index -> Double in
                guard index < rawValues.count else { return 0 }
                let rawValue = rawValues[index]
                if let number = rawValue as? NSNumber { return number.doubleValue }
                if let string = rawValue as? String, let number = Double(string) { return number }
                return 0
            }
            let name = cleanString(entry["name"], maxLength: 80) ?? "Series \(series.count + 1)"
            let colorHex = cleanString(entry["color"], maxLength: 9).flatMap { atlasChartColor(hex: $0) == nil ? nil : $0 }
            series.append(Series(name: name, values: values, colorHex: colorHex))
        }
        guard !series.isEmpty else { return nil }

        let rawOptions = dictionary["options"] as? [String: Any]
        let options = Options(
            stacked: rawOptions?["stacked"] as? Bool ?? false,
            legend: rawOptions?["legend"] as? Bool,
            xLabel: cleanString(rawOptions?["xLabel"], maxLength: 60),
            yLabel: cleanString(rawOptions?["yLabel"], maxLength: 60)
        )
        return AtlasChartSpec(
            kind: kind,
            title: cleanString(dictionary["title"], maxLength: 160),
            labels: labels,
            series: series,
            options: options
        )
    }

    private static func cleanString(_ value: Any?, maxLength: Int) -> String? {
        let string: String
        if let value = value as? String {
            string = value
        } else if let value = value as? NSNumber {
            string = value.stringValue
        } else {
            return nil
        }
        let cleaned = string.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return nil }
        return String(cleaned.prefix(maxLength))
    }
}

private struct AtlasChartPoint: Identifiable {
    let seriesIndex: Int
    let labelIndex: Int
    let seriesKey: String
    let label: String
    let value: Double

    var id: String { "\(seriesIndex)-\(labelIndex)" }
}

private struct AtlasChartView: View {
    let spec: AtlasChartSpec
    let theme: CopilotThemeTokens
    let isDark: Bool

    private var palette: [Color] {
        let base = isDark
            ? ["#6B7CDE", "#8E9DE6", "#D45D9E", "#2EAF85", "#D4A246", "#29A7C1"]
            : ["#6172E8", "#8B6EDB", "#E05F99", "#29A383", "#CB8A37", "#3AA7C1"]
        return spec.series.indices.map { index in
            if let override = spec.series[index].colorHex.flatMap(atlasChartColor) { return override }
            return atlasChartColor(hex: base[index % base.count]) ?? theme.accent
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            if let title = spec.title {
                Text(title)
                    .font(.custom("Figtree", size: 13).weight(.semibold))
                    .foregroundStyle(theme.textPrimary)
                    .lineLimit(2)
            }

            switch spec.kind {
            case .bar, .line, .area:
                AtlasAxisChartView(spec: spec, colors: palette, theme: theme)
            case .pie, .donut:
                AtlasPieChartView(spec: spec, colors: palette, theme: theme)
            }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .contain)
    }
}

private struct AtlasAxisChartView: View {
    let spec: AtlasChartSpec
    let colors: [Color]
    let theme: CopilotThemeTokens

    private var points: [AtlasChartPoint] {
        spec.series.enumerated().flatMap { seriesIndex, series in
            spec.labels.indices.map { labelIndex in
                AtlasChartPoint(
                    seriesIndex: seriesIndex,
                    labelIndex: labelIndex,
                    seriesKey: "series-\(seriesIndex)",
                    label: spec.labels[labelIndex],
                    value: series.values[labelIndex]
                )
            }
        }
    }

    private var seriesKeys: [String] { spec.series.indices.map { "series-\($0)" } }
    private var plotWidth: CGFloat { max(300, CGFloat(spec.labels.count) * 52) }
    private var showLegend: Bool { spec.options.legend ?? (spec.series.count > 1) }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let yLabel = spec.options.yLabel {
                Text(yLabel)
                    .font(.custom("Figtree", size: 11).weight(.medium))
                    .foregroundStyle(theme.textSecondary)
            }

            ScrollView(.horizontal, showsIndicators: spec.labels.count > 6) {
                Chart {
                    switch spec.kind {
                    case .bar:
                        ForEach(points) { point in
                            if spec.options.stacked {
                                BarMark(
                                    x: .value("Category", point.label),
                                    y: .value("Value", point.value)
                                )
                                .foregroundStyle(by: .value("Series", point.seriesKey))
                                .cornerRadius(4)
                            } else {
                                BarMark(
                                    x: .value("Category", point.label),
                                    y: .value("Value", point.value)
                                )
                                .foregroundStyle(by: .value("Series", point.seriesKey))
                                .position(by: .value("Series", point.seriesKey))
                                .cornerRadius(4)
                            }
                        }
                    case .line:
                        ForEach(points) { point in
                            LineMark(
                                x: .value("Category", point.label),
                                y: .value("Value", point.value)
                            )
                            .foregroundStyle(by: .value("Series", point.seriesKey))
                            .interpolationMethod(.catmullRom)
                            if spec.labels.count <= 16 {
                                PointMark(
                                    x: .value("Category", point.label),
                                    y: .value("Value", point.value)
                                )
                                .foregroundStyle(by: .value("Series", point.seriesKey))
                            }
                        }
                    case .area:
                        ForEach(points) { point in
                            AreaMark(
                                x: .value("Category", point.label),
                                y: .value("Value", point.value)
                            )
                            .foregroundStyle(by: .value("Series", point.seriesKey))
                            .opacity(0.2)
                            .interpolationMethod(.catmullRom)
                            LineMark(
                                x: .value("Category", point.label),
                                y: .value("Value", point.value)
                            )
                            .foregroundStyle(by: .value("Series", point.seriesKey))
                            .interpolationMethod(.catmullRom)
                        }
                    case .pie, .donut:
                        RuleMark(y: .value("Value", 0)).opacity(0)
                    }
                }
                .chartForegroundStyleScale(domain: seriesKeys, range: colors)
                .chartLegend(.hidden)
                .chartYAxis {
                    AxisMarks(position: .leading) {
                        AxisGridLine().foregroundStyle(theme.borderStrong)
                        AxisTick().foregroundStyle(theme.borderStrong)
                        AxisValueLabel()
                            .font(.custom("Figtree", size: 10).weight(.regular))
                            .foregroundStyle(theme.textTertiary)
                    }
                }
                .chartXAxis {
                    AxisMarks {
                        AxisValueLabel()
                            .font(.custom("Figtree", size: 10).weight(.medium))
                            .foregroundStyle(theme.textSecondary)
                    }
                }
                .frame(width: plotWidth, height: 190)
                .padding(.trailing, 4)
            }

            if let xLabel = spec.options.xLabel {
                Text(xLabel)
                    .font(.custom("Figtree", size: 11).weight(.medium))
                    .foregroundStyle(theme.textSecondary)
                    .frame(maxWidth: .infinity)
            }
            if showLegend {
                AtlasChartLegend(
                    entries: spec.series.enumerated().map { index, series in
                        (label: series.name, value: nil, color: colors[index])
                    },
                    theme: theme
                )
            }
        }
    }
}

private struct AtlasPieSlice: Identifiable {
    let index: Int
    let label: String
    let value: Double
    let start: Double
    let end: Double

    var id: Int { index }
}

private struct AtlasPieChartView: View {
    let spec: AtlasChartSpec
    let colors: [Color]
    let theme: CopilotThemeTokens

    private var slices: [AtlasPieSlice] {
        let values = spec.series[0].values.map { max(0, $0) }
        let total = values.reduce(0, +)
        guard total > 0 else { return [] }
        var cursor = -90.0
        return values.enumerated().map { index, value in
            let sweep = value / total * 360
            defer { cursor += sweep }
            return AtlasPieSlice(index: index, label: spec.labels[index], value: value, start: cursor, end: cursor + sweep)
        }
    }

    private var sliceColors: [Color] {
        let fallback = [
            "#6172E8", "#8B6EDB", "#E05F99", "#29A383", "#CB8A37", "#3AA7C1",
            "#F1B24A", "#E84855", "#50C799", "#B35F9E",
        ]
        return spec.labels.indices.map { index in
            atlasChartColor(hex: fallback[index % fallback.count]) ?? colors[index % colors.count]
        }
    }

    var body: some View {
        if slices.isEmpty {
            Text("No chart data")
                .font(.custom("Figtree", size: 12).weight(.regular))
                .foregroundStyle(theme.textTertiary)
                .frame(maxWidth: .infinity, minHeight: 120)
        } else {
            VStack(spacing: 10) {
                ZStack {
                    ForEach(slices) { slice in
                        AtlasPieSliceShape(
                            startAngle: .degrees(slice.start),
                            endAngle: .degrees(slice.end),
                            innerRadiusRatio: spec.kind == .donut ? 0.56 : 0
                        )
                        .fill(sliceColors[slice.index])
                        .overlay {
                            AtlasPieSliceShape(
                                startAngle: .degrees(slice.start),
                                endAngle: .degrees(slice.end),
                                innerRadiusRatio: spec.kind == .donut ? 0.56 : 0
                            )
                            .stroke(theme.surface.opacity(0.75), lineWidth: 1.5)
                        }
                        .accessibilityLabel(slice.label)
                        .accessibilityValue(atlasChartNumber(slice.value))
                    }
                }
                .frame(width: 146, height: 146)

                if spec.options.legend ?? true {
                    AtlasChartLegend(
                        entries: slices.map { slice in
                            (label: slice.label, value: atlasChartNumber(slice.value), color: sliceColors[slice.index])
                        },
                        theme: theme
                    )
                }
            }
            .frame(maxWidth: .infinity)
        }
    }
}

private struct AtlasPieSliceShape: Shape {
    let startAngle: Angle
    let endAngle: Angle
    let innerRadiusRatio: CGFloat

    func path(in rect: CGRect) -> Path {
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let outerRadius = min(rect.width, rect.height) / 2
        let innerRadius = outerRadius * innerRadiusRatio
        let start = CGPoint(
            x: center.x + cos(startAngle.radians) * outerRadius,
            y: center.y + sin(startAngle.radians) * outerRadius
        )
        var path = Path()
        path.move(to: start)
        path.addArc(center: center, radius: outerRadius, startAngle: startAngle, endAngle: endAngle, clockwise: false)
        if innerRadius > 0 {
            let innerEnd = CGPoint(
                x: center.x + cos(endAngle.radians) * innerRadius,
                y: center.y + sin(endAngle.radians) * innerRadius
            )
            path.addLine(to: innerEnd)
            path.addArc(center: center, radius: innerRadius, startAngle: endAngle, endAngle: startAngle, clockwise: true)
        } else {
            path.addLine(to: center)
        }
        path.closeSubpath()
        return path
    }
}

private struct AtlasChartLegend: View {
    let entries: [(label: String, value: String?, color: Color)]
    let theme: CopilotThemeTokens

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 96), alignment: .leading)], alignment: .leading, spacing: 5) {
            ForEach(Array(entries.enumerated()), id: \.offset) { _, entry in
                HStack(spacing: 5) {
                    Circle()
                        .fill(entry.color)
                        .frame(width: 7, height: 7)
                    Text(entry.label)
                        .font(.custom("Figtree", size: 10).weight(.medium))
                        .foregroundStyle(theme.textSecondary)
                        .lineLimit(1)
                    if let value = entry.value {
                        Text(value)
                            .font(.custom("Figtree", size: 10).weight(.regular))
                            .foregroundStyle(theme.textTertiary)
                    }
                }
            }
        }
    }
}

private struct AtlasChartStreamingPlaceholder: View {
    let theme: CopilotThemeTokens

    var body: some View {
        VStack(spacing: 8) {
            HStack(alignment: .bottom, spacing: 4) {
                RoundedRectangle(cornerRadius: 2).frame(width: 7, height: 14)
                RoundedRectangle(cornerRadius: 2).frame(width: 7, height: 24)
                RoundedRectangle(cornerRadius: 2).frame(width: 7, height: 18)
            }
            .foregroundStyle(theme.textTertiary.opacity(0.65))
            Text("Building chart…")
                .font(.custom("Figtree", size: 12).weight(.regular))
                .foregroundStyle(theme.textTertiary)
        }
        .frame(maxWidth: .infinity, minHeight: 140)
        .background(theme.surface2.opacity(0.5), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(theme.border, lineWidth: 1)
        )
        .accessibilityLabel("Building chart")
    }
}

private func atlasChartColor(hex: String) -> Color? {
    var value = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    guard value.hasPrefix("#") else { return nil }
    value.removeFirst()
    if value.count == 3 {
        value = value.map { "\($0)\($0)" }.joined()
    }
    guard value.count == 6 || value.count == 8,
          let number = UInt64(value, radix: 16)
    else { return nil }
    let hasAlpha = value.count == 8
    let red = Double((number >> (hasAlpha ? 24 : 16)) & 0xFF) / 255
    let green = Double((number >> (hasAlpha ? 16 : 8)) & 0xFF) / 255
    let blue = Double((number >> (hasAlpha ? 8 : 0)) & 0xFF) / 255
    let alpha = hasAlpha ? Double(number & 0xFF) / 255 : 1
    return Color(red: red, green: green, blue: blue, opacity: alpha)
}

private func atlasChartNumber(_ value: Double) -> String {
    if value.rounded() == value { return String(format: "%.0f", value) }
    return String(format: "%.2f", value)
        .replacingOccurrences(of: #"0+$"#, with: "", options: .regularExpression)
        .replacingOccurrences(of: #"\.$"#, with: "", options: .regularExpression)
}

/// Morphing-infinity loader (loading-ui.com/morphing-infinity): an SVG path
/// that morphs circle → infinity → circle over a 5s loop.
struct MorphingInfinityLoader: View {
    let color: Color
    @State private var progress: Double = 0

    var body: some View {
        MorphingInfinityShape(progress: progress)
            .stroke(color, style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
            .onAppear {
                progress = 0
                withAnimation(.linear(duration: 5).repeatForever(autoreverses: false)) {
                    progress = 1
                }
            }
    }
}

/// Interpolates between the circle/infinity keyframes (verbatim control points
/// from the loading-ui morphing-infinity SVG paths) in a 24×24 space.
private struct MorphingInfinityShape: Shape {
    var progress: Double
    var animatableData: Double {
        get { progress }
        set { progress = newValue }
    }

    // start + 4×(cp1, cp2, end) = 13 points per keyframe.
    private static let circleA: [CGPoint] = [
        CGPoint(x: 12, y: 8),
        CGPoint(x: 14.21, y: 8), CGPoint(x: 16, y: 9.79), CGPoint(x: 16, y: 12),
        CGPoint(x: 16, y: 14.21), CGPoint(x: 14.21, y: 16), CGPoint(x: 12, y: 16),
        CGPoint(x: 9.79, y: 16), CGPoint(x: 8, y: 14.21), CGPoint(x: 8, y: 12),
        CGPoint(x: 8, y: 9.79), CGPoint(x: 9.79, y: 8), CGPoint(x: 12, y: 8),
    ]
    private static let infinity: [CGPoint] = [
        CGPoint(x: 12, y: 12),
        CGPoint(x: 14, y: 8.5), CGPoint(x: 19, y: 8.5), CGPoint(x: 19, y: 12),
        CGPoint(x: 19, y: 15.5), CGPoint(x: 14, y: 15.5), CGPoint(x: 12, y: 12),
        CGPoint(x: 10, y: 8.5), CGPoint(x: 5, y: 8.5), CGPoint(x: 5, y: 12),
        CGPoint(x: 5, y: 15.5), CGPoint(x: 10, y: 15.5), CGPoint(x: 12, y: 12),
    ]
    private static let circleB: [CGPoint] = [
        CGPoint(x: 12, y: 16),
        CGPoint(x: 14.21, y: 16), CGPoint(x: 16, y: 14.21), CGPoint(x: 16, y: 12),
        CGPoint(x: 16, y: 9.79), CGPoint(x: 14.21, y: 8), CGPoint(x: 12, y: 8),
        CGPoint(x: 9.79, y: 8), CGPoint(x: 8, y: 9.79), CGPoint(x: 8, y: 12),
        CGPoint(x: 8, y: 14.21), CGPoint(x: 9.79, y: 16), CGPoint(x: 12, y: 16),
    ]
    private static let keyframes: [[CGPoint]] = [circleA, infinity, circleB, infinity, circleA]

    func path(in rect: CGRect) -> Path {
        let pts = interpolated()
        let scale = min(rect.width, rect.height) / 24
        func P(_ i: Int) -> CGPoint {
            CGPoint(x: rect.minX + pts[i].x * scale, y: rect.minY + pts[i].y * scale)
        }
        var path = Path()
        path.move(to: P(0))
        for seg in 0..<4 {
            let base = 1 + seg * 3
            path.addCurve(to: P(base + 2), control1: P(base), control2: P(base + 1))
        }
        path.closeSubpath()
        return path
    }

    private func interpolated() -> [CGPoint] {
        let frames = Self.keyframes
        let segments = frames.count - 1
        let clamped = max(0, min(1, progress))
        let scaled = clamped * Double(segments)
        let i = min(segments - 1, Int(scaled))
        let t = CGFloat(scaled - Double(i))
        let a = frames[i]
        let b = frames[i + 1]
        return zip(a, b).map { p, q in
            CGPoint(x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t)
        }
    }
}
