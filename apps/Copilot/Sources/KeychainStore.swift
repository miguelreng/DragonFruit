import Foundation
import Security

enum KeychainStore {
    private static let service = "DragonFruit Atlas Session"
    private static let legacyService = "sh.dragonfruit.copilot"
    private static let cache = KeychainValueCache()

    static func save(account: String, value: String) {
        if save(account: account, value: value, service: service) {
            cache.store(value: value, account: account, service: service)
        }
    }

    static func load(account: String) -> String? {
        if let cached = cache.value(account: account, service: service) {
            return cached
        }

        let current = load(account: account, service: service)
        if let value = current.value, !value.isEmpty {
            cache.store(value: value, account: account, service: service)
            return value
        }

        cache.store(value: nil, account: account, service: service)
        guard current.status == errSecItemNotFound else {
            return nil
        }

        if let cached = cache.value(account: account, service: legacyService) {
            return cached
        }

        let legacy = load(account: account, service: legacyService)
        guard let legacyValue = legacy.value, !legacyValue.isEmpty else {
            cache.store(value: nil, account: account, service: legacyService)
            return nil
        }

        save(account: account, value: legacyValue)
        cache.store(value: legacyValue, account: account, service: legacyService)
        return legacyValue
    }

    static func delete(account: String) {
        delete(account: account, service: service)
        delete(account: account, service: legacyService)
        cache.remove(account: account, service: service)
        cache.remove(account: account, service: legacyService)
    }

    @discardableResult
    private static func save(account: String, value: String, service: String) -> Bool {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        let update: [String: Any] = [
            kSecValueData as String: data,
        ]
        let updateStatus = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if updateStatus == errSecSuccess {
            return true
        }
        guard updateStatus == errSecItemNotFound else {
            return false
        }

        var insert = query
        insert[kSecValueData as String] = data
        return SecItemAdd(insert as CFDictionary, nil) == errSecSuccess
    }

    private static func load(account: String, service: String) -> (value: String?, status: OSStatus) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess,
              let data = result as? Data,
              let value = String(data: data, encoding: .utf8)
        else {
            return (nil, status)
        }
        return (value, status)
    }

    private static func delete(account: String, service: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}

private final class KeychainValueCache: @unchecked Sendable {
    private enum Entry {
        case value(String)
        case missing
    }

    private let lock = NSLock()
    private var entries: [String: Entry] = [:]

    func value(account: String, service: String) -> String?? {
        lock.lock()
        defer { lock.unlock() }

        switch entries[key(account: account, service: service)] {
        case let .value(value):
            return .some(value)
        case .missing:
            return .some(nil)
        case nil:
            return .none
        }
    }

    func store(value: String?, account: String, service: String) {
        lock.lock()
        defer { lock.unlock() }

        entries[key(account: account, service: service)] = value.map(Entry.value) ?? .missing
    }

    func remove(account: String, service: String) {
        lock.lock()
        defer { lock.unlock() }

        entries.removeValue(forKey: key(account: account, service: service))
    }

    private func key(account: String, service: String) -> String {
        "\(service)\u{1F}\(account)"
    }
}
