import SwiftUI
import UniformTypeIdentifiers
struct SettingsView:View {
    @EnvironmentObject var store:AssistantStore
    @Environment(\.dismiss) var dismiss
    @State private var showConnection=false
    @State private var showProfile=false
    @State private var importing=false
    var body:some View {
        NavigationStack {
            Form {
                Section("Подключение") {
                    Label(store.connected ? "Помощник подключён":"Подключение не добавлено",systemImage:store.connected ? "checkmark.circle":"link")
                    Button("Импортировать файл подключения"){importing=true}
                    Button("Указать подключение вручную"){showConnection=true}
                    Button("Обновить данные"){Task{await store.refresh()}}
                }
                Section("Планирование") {
                    LabeledContent("Часовой пояс",value:store.zone)
                    LabeledContent("Рабочее время",value:store.snapshot.profile.dayStart+" — "+store.snapshot.profile.dayEnd)
                    LabeledContent("Перерывы",value:"\(store.snapshot.profile.breakMinutes) мин")
                    Button("Изменить рабочее время"){showProfile=true}
                }
                Section("Память помощника") {
                    if store.snapshot.memory.isEmpty {
                        Text("Здесь появятся факты и предпочтения, которые ты попросишь запомнить.").foregroundStyle(Design.secondary)
                    } else {ForEach(store.snapshot.memory){item in Text(item.displayTitle).font(.subheadline)}}
                }
                Section("Состояние") {
                    LabeledContent("ИИ",value:store.snapshot.aiAvailable ? "Подключён":"Не подключён")
                    LabeledContent("На отправку",value:"\(store.pending.count)")
                    LabeledContent("Google",value:"Синхронизация не включена")
                    Text("Рабочая версия 25.3 и её данные сохранены отдельно. Эта версия использует собственное хранилище.").font(.caption).foregroundStyle(Design.secondary)
                }
                Section {Text("Ассистент · новая версия 4.0 (1)").font(.caption).foregroundStyle(Design.secondary)}
            }
            .scrollContentBackground(.hidden).background(Design.background).navigationTitle("Настройки")
            .toolbar{ToolbarItem(placement:.confirmationAction){Button("Готово"){dismiss()}}}
            .sheet(isPresented:$showConnection){ConnectionView()}
            .sheet(isPresented:$showProfile){ProfileEditor()}
            .fileImporter(isPresented:$importing,allowedContentTypes:[.json]){result in if case .success(let url)=result{Task{await store.importConnection(url)}}}
        }
    }
}
struct ConnectionView:View {
    @EnvironmentObject var store:AssistantStore
    @Environment(\.dismiss) var dismiss
    @State private var server=""
    @State private var token=""
    @State private var connecting=false
    var body:some View {
        NavigationStack {
            Form {
                Section("Адрес сервера") {TextField("https://…",text:$server).textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)}
                Section {
                    SecureField("Ключ из файла подключения",text:$token).textInputAutocapitalization(.never).autocorrectionDisabled()
                } header: {Text("Ключ подключения")} footer: {Text("Ключ хранится в Keychain этого iPhone. API-ключ модели остаётся на сервере.")}
                if let notice=store.notice {Text(notice).font(.caption).foregroundStyle(.orange)}
            }
            .navigationTitle("Подключить")
            .toolbar {
                ToolbarItem(placement:.cancellationAction){Button("Отмена"){dismiss()}}
                ToolbarItem(placement:.confirmationAction) {
                    Button("Подключить") {
                        connecting=true
                        Task {
                            await store.connect(Connection(server:server.trimmingCharacters(in:.whitespacesAndNewlines),token:token.trimmingCharacters(in:.whitespacesAndNewlines)))
                            connecting=false
                            if store.connected && store.notice==nil {dismiss()}
                        }
                    }.disabled(server.isEmpty || token.count<32 || connecting)
                }
            }
        }
    }
}
