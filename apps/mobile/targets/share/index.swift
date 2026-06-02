import UIKit
import Social
import UniformTypeIdentifiers

// Share Extension: saves a shared link as a bookmark.
//
// The extension is a separate process — it can't read the app's keychain or run
// our JS. The app writes everything we need into the App Group (see
// lib/share-bookmark.ts) and we read it back here. The App Group name + keys
// MUST match that file and expo-target.config.js.
private let appGroup = "group.sh.dragonfruit.mobile"

private enum Key {
  static let apiBaseUrl = "share_api_base_url"
  static let token = "share_api_token"
  static let workspaceSlug = "share_workspace_slug"
  static let projectId = "share_default_project_id"
}

private struct ShareConfig {
  let apiBaseUrl: String
  let token: String
  let workspaceSlug: String
  let projectId: String
}

// NOTE: declared as a plain Swift class (no @objc rename). Info.plist's
// NSExtensionPrincipalClass is "$(PRODUCT_MODULE_NAME).ShareViewController", so
// the class must be resolvable by its module-qualified Swift name.
class ShareViewController: SLComposeServiceViewController {
  private var sharedURL: URL?
  private var config: ShareConfig?

  override func viewDidLoad() {
    super.viewDidLoad()
    title = "DragonFruit"
    placeholder = "Add a note (optional)"
    config = loadConfig()
    extractSharedURL()
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    // Can't save without credentials — explain why, then dismiss.
    if config == nil {
      presentNotSignedIn()
    }
  }

  // MARK: - App Group config

  private func loadConfig() -> ShareConfig? {
    guard let defaults = UserDefaults(suiteName: appGroup) else { return nil }
    guard
      let base = defaults.string(forKey: Key.apiBaseUrl), !base.isEmpty,
      let token = defaults.string(forKey: Key.token), !token.isEmpty,
      let slug = defaults.string(forKey: Key.workspaceSlug), !slug.isEmpty,
      let project = defaults.string(forKey: Key.projectId), !project.isEmpty
    else { return nil }
    return ShareConfig(apiBaseUrl: base, token: token, workspaceSlug: slug, projectId: project)
  }

  // MARK: - Extract the shared URL

  private func extractSharedURL() {
    guard
      let item = extensionContext?.inputItems.first as? NSExtensionItem,
      let providers = item.attachments
    else { return }

    let urlType = UTType.url.identifier
    let textType = UTType.plainText.identifier

    // Prefer a real URL attachment; fall back to a URL found inside shared text.
    if let provider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(urlType) }) {
      provider.loadItem(forTypeIdentifier: urlType, options: nil) { [weak self] data, _ in
        let url = data as? URL ?? (data as? String).flatMap { URL(string: $0) }
        DispatchQueue.main.async {
          self?.sharedURL = url
          self?.validateContent()
        }
      }
      return
    }

    if let provider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(textType) }) {
      provider.loadItem(forTypeIdentifier: textType, options: nil) { [weak self] data, _ in
        let url = (data as? String).flatMap { Self.firstURL(in: $0) }
        DispatchQueue.main.async {
          self?.sharedURL = url
          self?.validateContent()
        }
      }
    }
  }

  private static func firstURL(in text: String) -> URL? {
    let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
    let range = NSRange(text.startIndex..., in: text)
    return detector?.firstMatch(in: text, options: [], range: range)?.url
  }

  // MARK: - SLComposeServiceViewController

  override func isContentValid() -> Bool {
    return config != nil && sharedURL != nil
  }

  override func didSelectPost() {
    guard let url = sharedURL, let config = config else {
      complete()
      return
    }

    let note = (contentText ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    // The API requires a non-empty title; fall back to the host, then the URL.
    let bookmarkTitle = note.isEmpty ? (url.host ?? url.absoluteString) : note

    var body: [String: Any] = ["title": bookmarkTitle, "url": url.absoluteString]
    if !note.isEmpty { body["description"] = note }

    let path = "\(config.apiBaseUrl)/workspaces/\(config.workspaceSlug)/projects/\(config.projectId)/bookmarks/"
    guard
      let endpoint = URL(string: path),
      let payload = try? JSONSerialization.data(withJSONObject: body)
    else {
      complete()
      return
    }

    var request = URLRequest(url: endpoint)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue(config.token, forHTTPHeaderField: "X-Api-Key")
    request.httpBody = payload

    // The compose sheet dismisses as soon as this method returns, but the system
    // keeps the extension process alive until completeRequest. URLSession retains
    // the task until its handler runs, so the POST survives the dismissal.
    URLSession.shared.dataTask(with: request) { [weak self] _, _, _ in
      self?.complete()
    }.resume()
  }

  override func configurationItems() -> [Any]! {
    // Workspace-level save — no project picker.
    return []
  }

  // MARK: - Helpers

  private func complete() {
    DispatchQueue.main.async {
      self.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
    }
  }

  private func presentNotSignedIn() {
    let alert = UIAlertController(
      title: "Sign in to DragonFruit",
      message: "Open the DragonFruit app and sign in, then try sharing again.",
      preferredStyle: .alert
    )
    alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak self] _ in
      self?.extensionContext?.cancelRequest(withError: NSError(domain: "sh.dragonfruit.share", code: 0))
    })
    present(alert, animated: true)
  }
}
