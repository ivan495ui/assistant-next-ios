import SwiftUI
struct ProfileEditor:View {
    @EnvironmentObject var store:AssistantStore
    @Environment(\.dismiss) var dismiss
    @State private var profile=Profile()
    @State private var revision=0
    @State private var saving=false
    private let days=[(1,"Понедельник"),(2,"Вторник"),(3,"Среда"),(4,"Четверг"),(5,"Пятница"),(6,"Суббота"),(0,"Воскресенье")]
    var body:some View {
        NavigationStack {
            Form {
                Section("Распорядок") {
                    TextField("Часовой пояс",text:$profile.timeZone).textInputAutocapitalization(.never).autocorrectionDisabled()
                    TextField("Начало, ЧЧ:ММ",text:$profile.dayStart).keyboardType(.numbersAndPunctuation)
                    TextField("Окончание, ЧЧ:ММ",text:$profile.dayEnd).keyboardType(.numbersAndPunctuation)
                    Stepper("Перерывы: \(profile.breakMinutes) мин",value:$profile.breakMinutes,in:0...120,step:5)
                }
                Section("Дни для планирования") {
                    ForEach(days,id:\.0) {day in
                        Toggle(day.1,isOn:Binding(get:{profile.workDays.contains(day.0)},set:{enabled in if enabled{profile.workDays.append(day.0)}else{profile.workDays.removeAll{$0==day.0}}}))
                    }
                }
                if let notice=store.notice {Text(notice).font(.caption).foregroundStyle(.orange)}
            }
            .navigationTitle("Рабочее время")
            .toolbar {
                ToolbarItem(placement:.cancellationAction){Button("Отмена"){dismiss()}}
                ToolbarItem(placement:.confirmationAction) {
                    Button("Сохранить") {
                        saving=true
                        Task {
                            await store.saveProfile(profile,revision:revision)
                            saving=false
                            if store.notice==nil || !store.pending.isEmpty {dismiss()}
                        }
                    }.disabled(saving || profile.workDays.isEmpty)
                }
            }
        }.onAppear{profile=store.snapshot.profile;revision=store.snapshot.dataRevision}
    }
}
