import Foundation
@main struct TransportChecks {
    static func main() throws {
        let object:[String:Any] = ["durationMinutes":jsonNullable(Optional<Int>.none),"dueDate":jsonNullable(Optional<String>.none),"knownDuration":jsonNullable(Optional(30))]
        precondition(JSONSerialization.isValidJSONObject(object))
        let encoded=try JSONSerialization.data(withJSONObject:object)
        let decoded=try JSONSerialization.jsonObject(with:encoded) as! [String:Any]
        precondition(decoded["durationMinutes"] is NSNull && decoded["dueDate"] is NSNull)
        precondition((decoded["knownDuration"] as? Int)==30)
        for zone in ["Europe/Moscow","Pacific/Kiritimati","America/Los_Angeles"] {
            let date=Dates.dateOnly("2026-11-04",zone:zone)!
            precondition(Dates.day(date,zone:zone)=="2026-11-04")
        }
        let url=URL(fileURLWithPath:CommandLine.arguments[1])
        let snapshot=try JSONDecoder().decode(Snapshot.self,from:Data(contentsOf:url))
        precondition(snapshot.tasks.count>0 && snapshot.proposals.count>0)
        precondition(snapshot.proposals[0].actions.count==2)
        print("Native transport checks passed: nulls, numeric payloads, three time zones, full snapshot decode")
    }
}
