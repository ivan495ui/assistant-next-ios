import Foundation

struct Profile: Codable {
    var name = ""
    var timeZone = "Europe/Moscow"
    var dayStart = "09:00"
    var dayEnd = "21:00"
    var workDays = [0, 1, 2, 3, 4, 5, 6]
    var breakMinutes = 10
}
struct Entity: Codable, Identifiable, Hashable {
    var id: String
    var title: String?
    var text: String?
    var goal: String?
    var nextStep: String?
    var status: String?
    var revision: Int
    var durationMinutes: Int?
    var durationEstimated: Bool?
    var dueDate: String?
    var deadlineAt: String?
    var projectID: String?
    var start: String?
    var end: String?
    var allDayDate: String?
    var source: String?
    var externalID: String?
    var dependsOn: [String]?
    var priority: Int?
    var displayTitle: String { title ?? text ?? "Без названия" }
    var startDate: Date? { Dates.parse(start) }
    var endDate: Date? { Dates.parse(end) }
}
struct Message: Codable, Identifiable {
    var id: String
    var role: String
    var text: String
    var at: String
    var proposalID: String?
}
struct PlanAction: Codable, Identifiable {
    var id: String
    var kind: String
    var title: String
    var before: Entity?
    var after: Entity
}
struct Unscheduled: Codable, Identifiable { var id: String; var title: String; var reason: String }
struct Proposal: Codable, Identifiable {
    var id: String
    var status: String
    var baseRevision: Int
    var createdAt: String
    var expiresAt: String
    var title: String
    var reply: String
    var questions: [String]
    var actions: [PlanAction]
    var warnings: [String]
    var unscheduled: [Unscheduled]
    var editable: Bool?
}
struct Job: Codable, Identifiable {
    var id: String
    var status: String
    var createdAt: String
    var updatedAt: String
    var proposalID: String?
    var error: String?
}
struct SyncJob: Codable, Identifiable {var id: String; var status: String; var entityID: String; var kind: String; var revision: Int}
struct Snapshot: Codable {
    var ok = true
    var schema = 1
    var serverTime = ""
    var dataRevision = 0
    var profile = Profile()
    var tasks: [Entity] = []
    var events: [Entity] = []
    var projects: [Entity] = []
    var memory: [Entity] = []
    var messages: [Message] = []
    var proposals: [Proposal] = []
    var jobs: [Job] = []
    var syncJobs: [SyncJob] = []
    var aiAvailable = false
}
struct Connection: Codable {var server: String; var token: String}
struct PendingAction: Codable, Identifiable {var id: String; var route: String; var body: Data}
struct SavedSession: Codable {var snapshot: Snapshot; var pending: [PendingAction]; var draft: String}
struct APIError: Error, LocalizedError {
    var status: Int; var message: String
    var errorDescription: String? {message}
}
enum Dates {
    static func parse(_ value: String?) -> Date? {
        guard let value else {return nil}
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from:value) ?? ISO8601DateFormatter().date(from:value)
    }
    static func calendar(_ zone: String) -> Calendar {var c = Calendar(identifier:.gregorian); c.timeZone = TimeZone(identifier:zone) ?? .current; c.locale = Locale(identifier:"ru_RU"); return c}
    static func day(_ date: Date, zone: String) -> String {let f = DateFormatter(); f.calendar = calendar(zone); f.timeZone = f.calendar.timeZone; f.dateFormat = "yyyy-MM-dd"; return f.string(from:date)}
    static func time(_ date: Date, zone: String) -> String {let f = DateFormatter(); f.timeZone = TimeZone(identifier:zone); f.dateFormat = "HH:mm"; return f.string(from:date)}
    static func label(_ date: Date, format: String = "d MMMM", zone: String) -> String {let f = DateFormatter(); f.locale = Locale(identifier:"ru_RU"); f.timeZone = TimeZone(identifier:zone); f.dateFormat = format; return f.string(from:date)}
    static func dateOnly(_ value:String,zone:String)->Date? {
        let pieces=value.split(separator:"-").compactMap{Int($0)}
        guard pieces.count==3 else{return nil}
        return calendar(zone).date(from:DateComponents(year:pieces[0],month:pieces[1],day:pieces[2],hour:12))
    }
    static func dueLabel(_ value:String,zone:String)->String {guard let date=dateOnly(value,zone:zone) else{return value};return label(date,format:"d MMM",zone:zone)}
}
func jsonNullable<T>(_ value:T?)->Any {if let value{return value};return NSNull()}
