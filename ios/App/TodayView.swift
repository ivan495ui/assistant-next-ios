import SwiftUI
struct TodayView: View {
    @EnvironmentObject var store:AssistantStore
    @State private var selectedTask:Entity?
    @State private var addTask=false
    var body:some View {
        ScrollView {
            VStack(alignment:.leading,spacing:22) {
                HStack(alignment:.top){VStack(alignment:.leading,spacing:9){Eyebrow(text:Dates.label(store.selectedDate,format:"EEEE, d MMMM",zone:store.zone));Text("День в твоём\nритме.").font(.system(size:35,weight:.semibold,design:.rounded)).tracking(-1.1).fixedSize(horizontal:false,vertical:true)};Spacer();Image(systemName:"asterisk").font(.system(size:40,weight:.ultraLight)).foregroundStyle(Design.accent).padding(.top,30)}
                weekStrip
                if !store.connected {EmptyCard(symbol:"link",title:"Твоё пространство готово",text:"Подключение к помощнику добавляется в настройках. Все новые дела будут собраны здесь.")}
                else {dayOverview}
                SectionLine(title:"Расписание",detail:"\(store.todayItems.count) блоков")
                if store.todayItems.isEmpty {EmptyCard(symbol:"calendar",title:"Есть место для важного",text:"Добавь дело или расскажи ассистенту, что нужно успеть. Он предложит план с учётом свободного времени.")}
                else {VStack(spacing:0){ForEach(store.todayItems){item in timelineRow(item);if item.id != store.todayItems.last?.id{Divider().overlay(Design.line).padding(.leading,65)}}}.surface()}
                if !store.inbox.isEmpty {
                    Button{store.tab=2}label:{HStack(spacing:14){Image(systemName:"tray").font(.title2).foregroundStyle(Design.accent);VStack(alignment:.leading,spacing:5){Text("Ещё без времени").font(.subheadline.weight(.semibold));Text("\(store.inbox.count) дел ждут своего места").font(.caption).foregroundStyle(Design.secondary)};Spacer();Image(systemName:"arrow.up.right").foregroundStyle(Design.secondary)}.surface()}.buttonStyle(.plain)
                }
                Button{store.tab=1;if store.draft.isEmpty{store.draft="Помоги спланировать день. "}}label:{HStack{Image(systemName:"sparkle");Text("Обсудить день с ассистентом");Spacer();Image(systemName:"arrow.right")}.font(.subheadline.weight(.medium)).foregroundStyle(Design.accent).padding(.vertical,6)}.buttonStyle(.plain)
            }.padding(20).padding(.bottom,12)
        }
        .background(Design.background).navigationTitle("Сегодня").navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge:.top,spacing:0){StatusBanner()}
        .toolbar{ToolbarItem(placement:.topBarLeading){Button{addTask=true}label:{Image(systemName:"plus")}.accessibilityLabel("Добавить дело")}}
        .refreshable{await store.refresh()}
        .sheet(item:$selectedTask){TaskEditor(task:$0)}.sheet(isPresented:$addTask){TaskEditor(task:nil)}
    }
    var weekStrip:some View {
        let calendar=Dates.calendar(store.zone),base=calendar.startOfDay(for:store.selectedDate),weekday=calendar.component(.weekday,from:base),offset=(weekday+5)%7,start=calendar.date(byAdding:.day,value:-offset,to:base)!
        return HStack(spacing:4){ForEach(0..<7,id:\.self){index in let date=calendar.date(byAdding:.day,value:index,to:start)!,selected=calendar.isDate(date,inSameDayAs:store.selectedDate)
            Button{store.selectedDate=date}label:{VStack(spacing:9){Text(Dates.label(date,format:"EE",zone:store.zone)).font(.system(size:11,weight:.medium)).textCase(.uppercase).foregroundStyle(selected ? Design.background.opacity(0.7):Design.secondary);Text(Dates.label(date,format:"d",zone:store.zone)).font(.system(size:20,weight:.semibold,design:.rounded));Circle().fill(selected ? Design.background:Color.clear).frame(width:3,height:3)}.frame(maxWidth:.infinity).padding(.vertical,12).foregroundStyle(selected ? Design.background:Color.primary).background(selected ? Design.accent:Color.clear,in:RoundedRectangle(cornerRadius:19))}.buttonStyle(.plain).accessibilityLabel(Dates.label(date,format:"d MMMM",zone:store.zone)).accessibilityAddTraits(selected ? .isSelected:[])
        }}
    }
    var dayOverview:some View {
        let minutes=store.todayItems.filter{$0.status != nil}.compactMap(\.durationMinutes).reduce(0,+)
        return HStack(alignment:.center,spacing:20){VStack(alignment:.leading,spacing:7){Eyebrow(text:"В фокусе");HStack(alignment:.firstTextBaseline,spacing:5){Text("\(minutes/60)").font(.system(size:43,weight:.medium,design:.rounded));Text("ч").font(.title3).foregroundStyle(Design.secondary);if minutes%60>0{Text("\(minutes%60)").font(.system(size:30,weight:.medium,design:.rounded));Text("мин").font(.subheadline).foregroundStyle(Design.secondary)}};Text("По твоему расписанию").font(.caption).foregroundStyle(Design.secondary)};Spacer();ZStack{Circle().stroke(Design.raised,lineWidth:5);Circle().trim(from:0,to:min(CGFloat(minutes)/480,1)).stroke(Design.accent,style:StrokeStyle(lineWidth:5,lineCap:.round)).rotationEffect(.degrees(-90));Image(systemName:"sun.max").font(.system(size:27,weight:.ultraLight)).foregroundStyle(Design.accent)}.frame(width:68,height:68)}.surface()
    }
    func timelineRow(_ item:Entity)->some View {
        HStack(alignment:.top,spacing:14){VStack(alignment:.leading,spacing:5){Text(item.startDate.map{Dates.time($0,zone:store.zone)} ?? "День").font(.system(size:13,weight:.semibold,design:.rounded));if let end=item.endDate{Text(Dates.time(end,zone:store.zone)).font(.caption2).foregroundStyle(Design.secondary)}}.frame(width:47,alignment:.leading);RoundedRectangle(cornerRadius:2).fill(item.status != nil ? Design.accent:Color(red:0.69,green:0.67,blue:0.86)).frame(width:3,height:44);VStack(alignment:.leading,spacing:6){Text(item.displayTitle).font(.system(size:16,weight:.medium));HStack(spacing:6){Text(item.status != nil ? "Дело":"Встреча");if let d=item.durationMinutes{Text("· \(d) мин")}}.font(.caption).foregroundStyle(Design.secondary)}.frame(maxWidth:.infinity,alignment:.leading);if item.status != nil{Button{selectedTask=item}label:{Image(systemName:"ellipsis").foregroundStyle(Design.secondary)}.accessibilityLabel("Открыть "+item.displayTitle)}}.padding(.vertical,14)
    }
}
