import Foundation
import Security

enum SecureConnection {
    static let service = "app.assistant.next.connection"
    static func read() -> Connection? {
        let query: [String:Any] = [kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:service,kSecAttrAccount as String:"owner",kSecReturnData as String:true,kSecMatchLimit as String:kSecMatchLimitOne]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary,&result) == errSecSuccess, let data = result as? Data else {return nil}
        return try? JSONDecoder().decode(Connection.self,from:data)
    }
    static func save(_ connection: Connection) throws {
        let data = try JSONEncoder().encode(connection)
        let query: [String:Any] = [kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:service,kSecAttrAccount as String:"owner"]
        let update = SecItemUpdate(query as CFDictionary,[kSecValueData as String:data] as CFDictionary)
        if update == errSecItemNotFound {
            var item = query; item[kSecValueData as String] = data; item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            guard SecItemAdd(item as CFDictionary,nil) == errSecSuccess else {throw APIError(status:0,message:"Не удалось сохранить подключение в Keychain.")}
        } else if update != errSecSuccess {throw APIError(status:0,message:"Не удалось обновить подключение в Keychain.")}
    }
}
enum LocalSession {
    static func file(_ name: String) throws -> URL {
        let folder = try FileManager.default.url(for:.applicationSupportDirectory,in:.userDomainMask,appropriateFor:nil,create:true).appendingPathComponent("AssistantNext",isDirectory:true)
        try FileManager.default.createDirectory(at:folder,withIntermediateDirectories:true)
        return folder.appendingPathComponent(name)
    }
    static func read() throws -> SavedSession? {
        let url = try file("session.json")
        guard FileManager.default.fileExists(atPath:url.path) else {return nil}
        do {return try JSONDecoder().decode(SavedSession.self,from:Data(contentsOf:url))}
        catch {
            let backup = try file("session.backup.json")
            guard let data = try? Data(contentsOf:backup),let recovered = try? JSONDecoder().decode(SavedSession.self,from:data) else {throw APIError(status:0,message:"Сохранённая копия повреждена. Она сохранена для восстановления; подключение можно проверить в настройках.")}
            return recovered
        }
    }
    static func write(_ session: SavedSession) throws {
        let url = try file("session.json"),backup = try file("session.backup.json")
        if let previous = try? Data(contentsOf:url), (try? JSONDecoder().decode(SavedSession.self,from:previous)) != nil {try previous.write(to:backup,options:[.atomic,.completeFileProtectionUntilFirstUserAuthentication])}
        try JSONEncoder().encode(session).write(to:url,options:[.atomic,.completeFileProtectionUntilFirstUserAuthentication])
    }
}
