import SwiftUI
struct ChatView: View {
    @EnvironmentObject var store:AssistantStore
    @State private var openedPlan:Proposal?
    @FocusState private var writing:Bool
    var body:some View {
        ScrollViewReader{proxy in
            ScrollView {
                LazyVStack(alignment:.leading,spacing:20) {
                    if store.snapshot.messages.isEmpty {intro}
                    if let proposal=store.latestProposal,!store.snapshot.messages.contains(where:{$0.proposalID==proposal.id}) {proposalCard(proposal)}
                    ForEach(store.snapshot.messages){message in messageView(message)}
                    if store.activeJobs {HStack(spacing:12){ProgressView().tint(Design.accent);Text("Разбираю просьбу. Можно свернуть приложение.").font(.caption).foregroundStyle(Design.secondary)}.padding(18).surface()}
                    Color.clear.frame(height:1).id("bottom")
                }.padding(20)
            }.scrollDismissesKeyboard(.interactively).background(Design.background)
                .onChange(of:store.snapshot.messages.count){_,_ in withAnimation(.easeOut(duration:0.2)){proxy.scrollTo("bottom",anchor:.bottom)}}
                .onChange(of:writing){_,value in if value{withAnimation{proxy.scrollTo("bottom",anchor:.bottom)}}}
        }
        .navigationTitle("Ассистент").navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge:.top,spacing:0){StatusBanner()}
        .safeAreaInset(edge:.bottom,spacing:0){composer}
        .sheet(item:$openedPlan){PlanView(proposalID:$0.id)}
        .onAppear {
            #if targetEnvironment(simulator)
            if store.isDemo && ProcessInfo.processInfo.arguments.contains("--screen=plan"){openedPlan=store.latestProposal}
            #endif
        }
    }
    var intro:some View {
        VStack(alignment:.leading,spacing:22){Image(systemName:"asterisk").font(.system(size:44,weight:.ultraLight)).foregroundStyle(Design.accent).padding(.top,20);Text("Расскажи,\nчто на уме.").font(.system(size:35,weight:.semibold,design:.rounded)).tracking(-1);Text("Можно длинно и своими словами. Разберём дела, сроки и то, с чего начать.").font(.body).foregroundStyle(Design.secondary).fixedSize(horizontal:false,vertical:true);VStack(spacing:10){suggestion("Помоги спланировать неделю",symbol:"calendar");suggestion("Разложим большой проект на этапы",symbol:"square.stack.3d.up");suggestion("Выдели мои задачи из заметок",symbol:"text.alignleft")}}.padding(.bottom,20)
    }
    func suggestion(_ text:String,symbol:String)->some View {Button{store.draft=text+". ";writing=true}label:{HStack(spacing:12){Image(systemName:symbol).foregroundStyle(Design.accent);Text(text).font(.subheadline).foregroundStyle(Color.primary);Spacer();Image(systemName:"arrow.up.left").font(.caption).foregroundStyle(Design.secondary)}.padding(16).background(Design.card,in:RoundedRectangle(cornerRadius:18))}.buttonStyle(.plain)}
    @ViewBuilder func messageView(_ message:Message)->some View {
        if message.role=="user" {
            HStack{Spacer(minLength:28);Text(message.text).font(.system(size:16)).lineSpacing(5).textSelection(.enabled).padding(18).background(Design.raised,in:RoundedRectangle(cornerRadius:22)).frame(maxWidth:.infinity,alignment:.trailing)}
        }else {
            VStack(alignment:.leading,spacing:14){Label("Ассистент",systemImage:"asterisk").font(.caption.weight(.semibold)).foregroundStyle(Design.accent);Text(message.text).font(.system(size:16)).lineSpacing(5).textSelection(.enabled).fixedSize(horizontal:false,vertical:true)
                if let id=message.proposalID,let proposal=store.snapshot.proposals.first(where:{$0.id==id}){proposalCard(proposal)}
            }.frame(maxWidth:.infinity,alignment:.leading)
        }
    }
    func proposalCard(_ proposal:Proposal)->some View {
        Button{openedPlan=proposal}label:{VStack(alignment:.leading,spacing:15){HStack{Image(systemName:"rectangle.stack").foregroundStyle(Design.accent);Text(proposal.status=="confirmed" ? "План сохранён":"Посмотреть план").font(.headline);Spacer();Image(systemName:"arrow.up.right").font(.caption).foregroundStyle(Design.secondary)};ForEach(Array(proposal.actions.prefix(3))){action in HStack(alignment:.top,spacing:10){Circle().fill(Design.accent.opacity(0.6)).frame(width:5,height:5).padding(.top,6);VStack(alignment:.leading,spacing:5){Text(action.title).font(.subheadline);if let start=action.after.startDate{Text(Dates.label(start,zone:store.zone)+" · "+Dates.time(start,zone:store.zone)).font(.caption).foregroundStyle(Design.secondary)}}}};if proposal.actions.count>3{Text("И ещё \(proposal.actions.count-3)").font(.caption).foregroundStyle(Design.secondary)};Divider().overlay(Design.line);HStack{Text("\(proposal.actions.count) изменений");Spacer();Text(proposal.status=="draft" ? "Ждёт подтверждения":statusLabel(proposal.status))}.font(.caption).foregroundStyle(Design.secondary)}.surface()}.buttonStyle(.plain).accessibilityLabel("Открыть план")
    }
    func statusLabel(_ status:String)->String {switch status{case "confirmed":return "Сохранено";case "declined":return "Отменено";case "superseded":return "Есть новая версия";default:return "Черновик"}}
    var composer:some View {
        VStack(spacing:8){if store.draft.count>20000{Text("\(store.draft.count) / 24 000 символов").font(.caption2).foregroundStyle(store.draft.count>24000 ? .orange:Design.secondary).frame(maxWidth:.infinity,alignment:.trailing)}
            HStack(alignment:.bottom,spacing:12){TextField("Напиши или надиктуй…",text:$store.draft,axis:.vertical).lineLimit(2...7).font(.system(size:16)).focused($writing).accessibilityIdentifier("message-input").onChange(of:store.draft){_,_ in store.saveDraft()};Button{writing=false;Task{await store.send()}}label:{Image(systemName:"arrow.up").font(.system(size:18,weight:.semibold)).foregroundStyle(Design.background).frame(width:43,height:43).background(Design.accent,in:Circle())}.disabled(store.draft.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty || store.draft.count>24000 || store.activeJobs || !store.pending.isEmpty).opacity(store.activeJobs ? 0.4:1).accessibilityLabel("Отправить сообщение")}.padding(14).background(Design.card,in:RoundedRectangle(cornerRadius:24)).overlay(RoundedRectangle(cornerRadius:24).stroke(Design.line,lineWidth:1))
        }.padding(.horizontal,16).padding(.top,10).padding(.bottom,8).background(Design.background)
    }
}
struct PlanView:View {
    @EnvironmentObject var store:AssistantStore
    @Environment(\.dismiss) var dismiss
    var proposalID:String
    @State private var editing:PlanAction?
    var proposal:Proposal? {store.snapshot.proposals.first{$0.id==proposalID}}
    var body:some View {
        NavigationStack{ScrollView{if let proposal{VStack(alignment:.leading,spacing:22){Eyebrow(text:proposal.status=="draft" ? "Предварительный просмотр":"Сохранённое предложение");Text(proposal.title).font(.largeTitle.weight(.semibold));Text(proposal.reply).font(.subheadline).foregroundStyle(Design.secondary)
                    ForEach(proposal.actions){action in actionRow(action,proposal:proposal)}
                    if !proposal.unscheduled.isEmpty {VStack(alignment:.leading,spacing:12){Label("Без назначенного времени",systemImage:"tray").font(.headline);ForEach(proposal.unscheduled){item in VStack(alignment:.leading,spacing:5){Text(item.title).font(.subheadline);Text(item.reason).font(.caption).foregroundStyle(Design.secondary)}}}.surface()}
                    ForEach(proposal.warnings,id:\.self){warning in Label(warning,systemImage:"info.circle").font(.caption).foregroundStyle(Design.secondary)}
                    if proposal.status=="draft"{Text("Сохранятся только показанные изменения. Пункты без времени останутся в списке дел.").font(.caption).foregroundStyle(Design.secondary)}
                }.padding(20)}}.background(Design.background).navigationTitle("План").navigationBarTitleDisplayMode(.inline).toolbar{ToolbarItem(placement:.cancellationAction){Button("Закрыть"){dismiss()}}}.safeAreaInset(edge:.bottom){if let proposal,proposal.status=="draft"{VStack(spacing:12){Button{Task{await store.confirm(proposal.id);if store.snapshot.proposals.first(where:{$0.id==proposal.id})?.status=="confirmed"{dismiss()}}}label:{Text("Подтвердить \(proposal.actions.count) изменений").font(.headline).frame(maxWidth:.infinity).padding(17).foregroundStyle(Design.background).background(Design.accent,in:RoundedRectangle(cornerRadius:18))}.buttonStyle(.plain).disabled(!store.pending.isEmpty);HStack{Button("Обсудить"){store.tab=1;store.draft="В этом плане хочу изменить: ";dismiss()};Spacer();Button("Отменить план",role:.destructive){Task{await store.decline(proposal.id);dismiss()}}}.font(.subheadline)}.padding(20).background(Design.background)}}.sheet(item:$editing){PlanItemEditor(proposalID:proposalID,action:$0)}}
    }
    func actionRow(_ action:PlanAction,proposal:Proposal)->some View {
        VStack(alignment:.leading,spacing:13){HStack(alignment:.top){VStack(alignment:.leading,spacing:8){Text(action.kind=="task" ? "ДЕЛО":action.kind=="event" ? "ВСТРЕЧА":action.kind=="project" ? "ПРОЕКТ":action.kind=="message" ? "ИСТОРИЯ":action.kind=="archive" ? "АРХИВ":"ПАМЯТЬ").font(.system(size:10,weight:.semibold)).tracking(1.4).foregroundStyle(Design.accent);Text(action.title).font(.headline)};Spacer();if proposal.status=="draft" && action.kind=="task" && proposal.editable != false{Button{editing=action}label:{Image(systemName:"pencil").foregroundStyle(Design.secondary)}.accessibilityLabel("Изменить "+action.title)}}
            if let before=action.before?.startDate,let after=action.after.startDate {HStack{Text(Dates.time(before,zone:store.zone)).strikethrough().foregroundStyle(Design.secondary);Image(systemName:"arrow.right").foregroundStyle(Design.secondary);Text(Dates.label(after,zone:store.zone)+" · "+Dates.time(after,zone:store.zone))}.font(.subheadline)}else if let after=action.after.startDate{Text(Dates.label(after,zone:store.zone)+" · "+Dates.time(after,zone:store.zone)).font(.subheadline).foregroundStyle(Design.accent)}
            if let duration=action.after.durationMinutes{Text("\(duration) минут"+(action.after.durationEstimated==true ? " · предварительная оценка":"")).font(.caption).foregroundStyle(Design.secondary)}
        }.surface()
    }
}
struct PlanItemEditor:View {
    @EnvironmentObject var store:AssistantStore
    @Environment(\.dismiss) var dismiss
    var proposalID:String;var action:PlanAction
    @State private var duration=30
    @State private var due=Date()
    @State private var hasDue=false
    var body:some View {NavigationStack{Form{Section{Text(action.title);Stepper("\(duration) минут",value:$duration,in:5...1440,step:5);Toggle("Есть срок",isOn:$hasDue);if hasDue{DatePicker("Успеть до",selection:$due,displayedComponents:.date).environment(\.timeZone,TimeZone(identifier:store.zone) ?? .current)}}footer:{Text("После изменения времени программа заново проверит свободные места и зависимости.")}}.navigationTitle("Пункт плана").toolbar{ToolbarItem(placement:.cancellationAction){Button("Отмена"){dismiss()}};ToolbarItem(placement:.confirmationAction){Button("Готово"){if let p=store.snapshot.proposals.first(where:{$0.id==proposalID}){Task{await store.editPlan(p,action:action,duration:duration,dueDate:hasDue ? Dates.day(due,zone:store.zone):nil);dismiss()}}}}}}.onAppear{duration=action.after.durationMinutes ?? 30;hasDue=action.after.dueDate != nil;if let day=action.after.dueDate{due=Dates.dateOnly(day,zone:store.zone) ?? Date()}}}
}
