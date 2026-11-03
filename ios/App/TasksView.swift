import SwiftUI
struct TasksView: View {
    @EnvironmentObject var store:AssistantStore
    @State private var filter=0
    @State private var query=""
    @State private var editing:Entity?
    @State private var adding=false
    var filtered:[Entity]{store.snapshot.tasks.filter{task in (filter==2 ? task.status=="done":task.status=="open") && (filter != 1 || task.start==nil) && (query.isEmpty || task.displayTitle.localizedCaseInsensitiveContains(query))}.sorted{($0.dueDate ?? "9999")<($1.dueDate ?? "9999")}}
    var body:some View {
        ScrollView{VStack(alignment:.leading,spacing:22){HStack(alignment:.firstTextBaseline){Text("Освободи\nголову.").font(.system(size:35,weight:.semibold,design:.rounded)).tracking(-1);Spacer();Text("\(store.snapshot.tasks.filter{$0.status=="open"}.count)").font(.system(size:43,weight:.light,design:.rounded)).foregroundStyle(Design.secondary)};Picker("Показать дела",selection:$filter){Text("Все").tag(0);Text("Без времени").tag(1);Text("Готово").tag(2)}.pickerStyle(.segmented)
                if filtered.isEmpty {EmptyCard(symbol:filter==2 ? "checkmark.seal":"tray",title:filter==2 ? "Здесь будут завершённые дела":"Всё на своём месте",text:"Добавь новое дело вручную или надиктуй несколько задач ассистенту.")}
                else {VStack(spacing:0){ForEach(filtered){task in TaskLine(task:task){editing=task};if task.id != filtered.last?.id{Divider().overlay(Design.line).padding(.leading,37)}}}.surface()}
            }.padding(20)}.background(Design.background).navigationTitle("Дела").navigationBarTitleDisplayMode(.inline).safeAreaInset(edge:.top,spacing:0){StatusBanner()}.searchable(text:$query,prompt:"Найти дело").toolbar{ToolbarItem(placement:.topBarLeading){Button{adding=true}label:{Image(systemName:"plus")}.accessibilityLabel("Добавить дело")}}.refreshable{await store.refresh()}.sheet(item:$editing){TaskEditor(task:$0)}.sheet(isPresented:$adding){TaskEditor(task:nil)}
    }
}
struct TaskEditor: View {
    @EnvironmentObject var store:AssistantStore
    @Environment(\.dismiss) var dismiss
    var task:Entity?
    @State private var title=""
    @State private var duration=30
    @State private var knownDuration=false
    @State private var hasDue=false
    @State private var due=Date()
    @State private var projectID=""
    @State private var saving=false
    var body:some View {
        NavigationStack {
            Form {
                Section("Дело") {
                    TextField("Что нужно сделать",text:$title,axis:.vertical).lineLimit(2...6).accessibilityIdentifier("task-title")
                }
                Section {
                    Toggle("Оценить длительность",isOn:$knownDuration)
                    if knownDuration {Stepper("\(duration) минут",value:$duration,in:5...1440,step:5)}
                    Toggle("Есть срок",isOn:$hasDue)
                    if hasDue {DatePicker("Успеть до",selection:$due,displayedComponents:.date).environment(\.timeZone,TimeZone(identifier:store.zone) ?? .current)}
                } footer: {
                    Text("Дата без времени останется сроком. Встреча в полночь не создаётся.")
                }
                if !store.snapshot.projects.isEmpty {
                    Section("Проект") {
                        Picker("Проект",selection:$projectID) {
                            Text("Без проекта").tag("")
                            ForEach(store.snapshot.projects) {Text($0.displayTitle).tag($0.id)}
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden).background(Design.background)
            .navigationTitle(task==nil ? "Новое дело":"Редактировать").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement:.cancellationAction) {Button("Отмена"){dismiss()}}
                ToolbarItem(placement:.confirmationAction) {
                    Button("Сохранить") {
                        saving=true
                        Task {
                            await store.saveTask(existing:task,title:title,duration:knownDuration ? duration:nil,dueDate:hasDue ? Dates.day(due,zone:store.zone):nil,projectID:projectID.isEmpty ? nil:projectID,done:task?.status=="done")
                            saving=false
                            if store.notice==nil || !store.pending.isEmpty {dismiss()}
                        }
                    }
                    .disabled(title.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty||saving)
                    .accessibilityIdentifier("save-task")
                }
            }
        }
        .onAppear {
            if let task {
                title=task.displayTitle;duration=task.durationMinutes ?? 30;knownDuration=task.durationMinutes != nil
                hasDue=task.dueDate != nil;projectID=task.projectID ?? ""
                if let date=task.dueDate {due=Dates.dateOnly(date,zone:store.zone) ?? Date()}
            }
        }
    }
}
