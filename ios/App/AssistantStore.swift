import Foundation
import SwiftUI
import Combine

@MainActor final class AssistantStore: ObservableObject {
    @Published var snapshot = Snapshot()
    @Published var draft = ""
    @Published var connected = false
    @Published var loading = false
    @Published var notice: String?
    @Published var lastUpdated: Date?
    @Published var tab = 0
    @Published var selectedDate = Date()
    @Published var isDemo = false
    @Published var pending: [PendingAction] = []
    private var connection: Connection?
    private var sending = false
    private var pollTask: Task<Void,Never>?
    var zone: String {snapshot.profile.timeZone}
    var activeJobs: Bool {snapshot.jobs.contains { ["queued","running"].contains($0.status) }}
    var latestProposal: Proposal? {snapshot.proposals.last {$0.status == "draft"}}
    var todayKey: String {Dates.day(selectedDate,zone:zone)}
    var todayItems: [Entity] {(snapshot.events + snapshot.tasks.filter {$0.status != "done"}).filter {($0.startDate.map {Dates.day($0,zone:zone)} ?? $0.allDayDate) == todayKey}.sorted {($0.start ?? "") < ($1.start ?? "")}}
    var inbox: [Entity] {snapshot.tasks.filter {$0.status == "open" && $0.start == nil}}

    init() {
        connection = SecureConnection.read(); connected = connection != nil
        do {if let saved = try LocalSession.read(){snapshot=saved.snapshot;pending=saved.pending;draft=saved.draft;lastUpdated=Dates.parse(saved.snapshot.serverTime)}}catch{notice=error.localizedDescription}
        #if targetEnvironment(simulator)
        if ProcessInfo.processInfo.arguments.contains("--demo"), let url = Bundle.main.url(forResource:"demo",withExtension:"json"),let data=try? Data(contentsOf:url),let sample=try? JSONDecoder().decode(Snapshot.self,from:data) {
            snapshot=sample;isDemo=true;connected=true;selectedDate=Dates.parse("2026-11-04T09:00:00+03:00")!;pending=[]
            let args=ProcessInfo.processInfo.arguments
            if args.contains("--screen=chat") || args.contains("--screen=plan"){tab=1}
            if args.contains("--screen=tasks"){tab=2}
            if args.contains("--screen=projects"){tab=3}
        }
        #endif
    }
    func persist() throws {if !isDemo {try LocalSession.write(SavedSession(snapshot:snapshot,pending:pending,draft:draft))}}
    func saveDraft(){do{try persist()}catch{notice="Черновик пока не записан на телефон: "+error.localizedDescription}}
    func request(_ route: String, body: Data? = nil, using supplied: Connection? = nil) async throws -> Data {
        guard let config = supplied ?? connection, let base=URL(string:config.server),base.scheme == "https",let host=base.host,!host.isEmpty else {throw APIError(status:401,message:"Добавь подключение в настройках.")}
        let url=base.appendingPathComponent("v1").appendingPathComponent(route)
        var request=URLRequest(url:url);request.httpMethod=body == nil ? "GET":"POST";request.timeoutInterval=25
        request.setValue("Bearer "+config.token,forHTTPHeaderField:"Authorization");request.setValue("application/json",forHTTPHeaderField:"Content-Type");request.httpBody=body
        let (data,response)=try await URLSession.shared.data(for:request)
        guard let http=response as? HTTPURLResponse else {throw APIError(status:0,message:"Сервер не ответил.")}
        guard (200..<300).contains(http.statusCode) else {
            let object=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any]
            throw APIError(status:http.statusCode,message:object?["error"] as? String ?? "Сервер временно недоступен.")
        }
        return data
    }
    func connect(_ config: Connection) async {
        loading=true;defer{loading=false}
        do {
            guard config.token.count>=32,let url=URL(string:config.server),url.scheme=="https",url.query==nil,url.fragment==nil,url.user==nil,url.password==nil else {throw APIError(status:0,message:"Нужен HTTPS-адрес и ключ подключения.")}
            let data=try await request("snapshot",using:config),next=try JSONDecoder().decode(Snapshot.self,from:data)
            try SecureConnection.save(config);connection=config;connected=true;snapshot=next;try persist();notice=nil;lastUpdated=Date();loading=false;await refresh()
        }catch{notice=error.localizedDescription}
    }
    func refresh() async {
        guard connected,!isDemo,!loading else{return}
        loading=true
        do {
            let data=try await request("snapshot"),next=try JSONDecoder().decode(Snapshot.self,from:data)
            let previous=snapshot;snapshot=next
            do {try persist()}catch{snapshot=previous;throw error}
            lastUpdated=Date();notice=nil
        }catch{notice="Нет связи · показана сохранённая копия. "+error.localizedDescription}
        loading=false
        await drain()
        if activeJobs {startPolling()}
    }
    func startPolling(){
        guard pollTask==nil,!isDemo else{return}
        pollTask=Task { [weak self] in
            defer{self?.pollTask=nil}
            for _ in 0..<60 {
                guard !Task.isCancelled else{return}
                try? await Task.sleep(for:.seconds(2))
                guard let self else{return}
                await self.refresh()
                if !self.activeJobs {return}
            }
        }
    }
    func suspend(){pollTask?.cancel();pollTask=nil;saveDraft()}
    func enqueue(route: String, values: [String:Any], id: String = UUID().uuidString) async {
        guard !isDemo else {notice="Это просмотр на тестовых данных. Записи не отправлялись.";return}
        do {
            let body=try JSONSerialization.data(withJSONObject:values)
            let command=PendingAction(id:id,route:route,body:body);pending.append(command)
            do {try persist()}catch{pending.removeAll {$0.id==id};throw error}
            await drain()
        }catch{notice=error.localizedDescription}
    }
    func drain() async {
        guard !sending,connected,!isDemo else{return};sending=true;defer{sending=false}
        while let command=pending.first {
            do {
                _=try await request(command.route,body:command.body)
                pending.removeFirst();try persist()
                let data=try await request("snapshot");snapshot=try JSONDecoder().decode(Snapshot.self,from:data);try persist();lastUpdated=Date()
            }catch let error as APIError {
                if (400..<500).contains(error.status) && error.status != 401 && error.status != 429 {pending.removeAll {$0.id==command.id};try? persist()}
                notice=error.message;break
            }catch{notice="Запрос сохранён на телефоне. Проверю его после восстановления связи.";break}
        }
        if activeJobs {startPolling()}
    }
    func send() async {
        let text=draft.trimmingCharacters(in:.whitespacesAndNewlines);guard !text.isEmpty,text.count<=24000 else{return}
        let id=UUID().uuidString
        await enqueue(route:"messages",values:["requestID":id,"text":text],id:id)
        if draft.trimmingCharacters(in:.whitespacesAndNewlines)==text && (pending.contains(where:{$0.id==id}) || snapshot.messages.contains(where:{$0.id==id})) {draft="";saveDraft()}
    }
    func confirm(_ id: String) async {await enqueue(route:"proposals/confirm",values:["proposalID":id],id:"confirm-"+id)}
    func decline(_ id: String) async {await enqueue(route:"proposals/decline",values:["proposalID":id])}
    func saveTask(existing: Entity?,title: String,duration: Int?,dueDate: String?,projectID: String?,done: Bool = false) async {
        let id=UUID().uuidString
        var values:[String:Any]=["requestID":id,"title":title,"durationMinutes":duration as Any? ?? NSNull(),"dueDate":dueDate as Any? ?? NSNull(),"projectID":projectID as Any? ?? NSNull(),"status":done ? "done":"open"]
        if let existing {values["id"]=existing.id;values["expectedRevision"]=existing.revision}
        await enqueue(route:"tasks",values:values,id:id)
    }
    func toggle(_ task: Entity) async {await saveTask(existing:task,title:task.displayTitle,duration:task.durationMinutes,dueDate:task.dueDate,projectID:task.projectID,done:task.status != "done")}
    func saveProfile(_ profile: Profile,revision: Int) async {
        do {let object=try JSONSerialization.jsonObject(with:JSONEncoder().encode(profile));await enqueue(route:"profile",values:["profile":object,"expectedRevision":revision])}catch{notice=error.localizedDescription}
    }
    func editPlan(_ proposal: Proposal,action: PlanAction,duration: Int,dueDate: String?) async {await enqueue(route:"proposals/edit",values:["proposalID":proposal.id,"taskID":action.id,"durationMinutes":duration,"dueDate":dueDate as Any? ?? NSNull()])}
    func importConnection(_ url: URL) async {
        let access=url.startAccessingSecurityScopedResource();defer{if access{url.stopAccessingSecurityScopedResource()}}
        do {let config=try JSONDecoder().decode(Connection.self,from:Data(contentsOf:url));await connect(config)}catch{notice="Не удалось прочитать файл подключения."}
    }
    func importLegacy(_ url: URL) async {
        let access=url.startAccessingSecurityScopedResource();defer{if access{url.stopAccessingSecurityScopedResource()}}
        do {
            let data=try Data(contentsOf:url)
            guard data.count<=1200000,let object=try JSONSerialization.jsonObject(with:data) as? [String:Any] else {throw APIError(status:0,message:"Нужен JSON-экспорт 25.3 размером до 1,2 МБ.")}
            await enqueue(route:"import/preview",values:object)
        }catch{notice=error.localizedDescription}
    }
}
