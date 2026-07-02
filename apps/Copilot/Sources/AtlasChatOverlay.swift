import AppKit
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
        // Adaptive glass that reads on ANY background (white / black / text):
        //  • the frosted material stays present everywhere (min 0.5 at the edge)
        //    so it always tones down whatever is behind — only a subtle blend.
        //  • a uniform surface tint floor guarantees a consistent, readable
        //    backing tone independent of the desktop content behind it.
        .background(
            ZStack {
                VisualEffectBlur(material: glassMaterial, leadingFade: 220, fadeMinAlpha: 0.5)
                LinearGradient(
                    stops: [
                        .init(color: theme.surface.opacity(isDark ? 0.16 : 0.24), location: 0),
                        .init(color: theme.surface.opacity(isDark ? 0.3 : 0.44), location: 0.32),
                        .init(color: theme.surface.opacity(isDark ? 0.3 : 0.44), location: 1),
                    ],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            }
        )
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
        ScrollViewReader { proxy in
            ScrollView {
                if store.atlasChatMessages.isEmpty {
                    emptyState
                } else {
                    LazyVStack(alignment: .leading, spacing: 16) {
                        ForEach(store.atlasChatMessages) { message in
                            AtlasChatBubble(message: message, theme: theme)
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
            }
            .onChange(of: store.atlasChatMessages) { messages in
                guard let last = messages.last else { return }
                withAnimation(AtlasMotion.standard) {
                    proxy.scrollTo(last.id, anchor: .bottom)
                }
            }
        }
    }

    // Empty state: atlas dragon mark + "How can Atlas help?" + subtitle, centered.
    private var emptyState: some View {
        VStack(spacing: 12) {
            // Logo solo — tinted to the primary text color so it reads on the
            // glass in both light and dark, like the web dragon.
            if let dragon = BrandTheme.dragonGlyphTemplate {
                Image(nsImage: dragon)
                    .renderingMode(.template)
                    .resizable()
                    .scaledToFit()
                    .frame(height: 44)
                    .foregroundStyle(theme.textPrimary)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 24)
        .padding(.top, 120)
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
            HStack(alignment: .bottom, spacing: 8) {
                TextField("Message Atlas…  type @ to add a doc or task", text: $draft, axis: .vertical)
                    .textFieldStyle(.plain)
                    .font(.custom("Figtree", size: 13).weight(.regular))
                    .foregroundStyle(theme.textPrimary)
                    .tint(theme.accent)
                    .lineSpacing(2) // leading-snug on 13px
                    .lineLimit(1...7)
                    .focused($inputFocused)
                    .onSubmit(send)

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

// MARK: - Composer toolbar icon button (size-6 · rounded-md · text-tertiary → primary)

private struct ComposerIconButton: View {
    let icon: AtlasIconName
    let theme: CopilotThemeTokens
    var accessibility: String
    var tint: Color? = nil
    let action: () -> Void
    @State private var isHovered = false

    var body: some View {
        Button(action: action) {
            AtlasIcon(icon)
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

    var body: some View {
        if message.role == .user {
            // Right-aligned pill · bg-layer-1 · rounded-2xl + rounded-br-md · max-w-85%
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
                        theme.layer1,
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
                AtlasMarkdownText(text: message.text, theme: theme)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Spacer(minLength: 0)
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

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            ForEach(Array(Self.blocks(from: text).enumerated()), id: \.offset) { _, block in
                row(for: block)
            }
        }
        .tint(theme.accent)
        .textSelection(.enabled)
    }

    @ViewBuilder
    private func row(for block: MDBlock) -> some View {
        switch block {
        case let .heading(text):
            inline(text)
                .font(.custom("Figtree", size: 14).weight(.semibold))
                .foregroundStyle(theme.textPrimary)
        case let .paragraph(text):
            inline(text)
                .font(.custom("Figtree", size: 13).weight(.regular))
                .foregroundStyle(theme.textPrimary)
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
        case let .listItem(marker, text):
            HStack(alignment: .top, spacing: 6) {
                Text(marker)
                    .font(.custom("Figtree", size: 13).weight(.regular))
                    .foregroundStyle(theme.textTertiary)
                inline(text)
                    .font(.custom("Figtree", size: 13).weight(.regular))
                    .foregroundStyle(theme.textPrimary)
                    .lineSpacing(2)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        case let .code(text):
            Text(text)
                .font(.system(size: 12, design: .monospaced))
                .foregroundStyle(theme.textPrimary)
                .padding(8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(theme.surface2.opacity(0.7), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
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
        case code(String)
    }

    private static func blocks(from text: String) -> [MDBlock] {
        var blocks: [MDBlock] = []
        var inFence = false
        var codeLines: [String] = []

        for rawLine in text.components(separatedBy: "\n") {
            let line = rawLine
            let trimmed = line.trimmingCharacters(in: .whitespaces)

            if trimmed.hasPrefix("```") {
                if inFence {
                    blocks.append(.code(codeLines.joined(separator: "\n")))
                    codeLines.removeAll()
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
        if inFence, !codeLines.isEmpty {
            blocks.append(.code(codeLines.joined(separator: "\n")))
        }
        return blocks
    }
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
