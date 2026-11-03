import SwiftUI
enum Design {
    static let background=Color(red:0.047,green:0.055,blue:0.067)
    static let card=Color(red:0.090,green:0.102,blue:0.118)
    static let raised=Color(red:0.125,green:0.141,blue:0.165)
    static let accent=Color(red:0.64,green:0.82,blue:0.74)
    static let secondary=Color(red:0.58,green:0.62,blue:0.67)
    static let line=Color.white.opacity(0.07)
}
struct Surface: ViewModifier {
    func body(content: Content) -> some View {content.padding(20).frame(maxWidth:.infinity,alignment:.leading).background(Design.card,in:RoundedRectangle(cornerRadius:24)).overlay(RoundedRectangle(cornerRadius:24).stroke(Design.line,lineWidth:1))}
}
extension View {func surface()->some View{modifier(Surface())}}
struct Eyebrow: View {var text:String;var body:some View{Text(text.uppercased()).font(.system(size:11,weight:.semibold,design:.rounded)).tracking(1.8).foregroundStyle(Design.secondary)}}
struct SectionLine: View {var title:String;var detail:String?;var body:some View{HStack{Text(title).font(.title3.weight(.semibold));Spacer();if let detail{Text(detail).font(.caption).foregroundStyle(Design.secondary)}}.padding(.top,8)}}
struct EmptyCard: View {var symbol:String;var title:String;var text:String;var body:some View{VStack(alignment:.leading,spacing:12){Image(systemName:symbol).font(.title2).foregroundStyle(Design.accent);Text(title).font(.title3.weight(.semibold));Text(text).font(.subheadline).foregroundStyle(Design.secondary).fixedSize(horizontal:false,vertical:true)}.surface()}}
struct StatusBanner: View {
    @EnvironmentObject var store:AssistantStore
    var body:some View {
        if store.isDemo {Label("Тестовые данные · предпросмотр",systemImage:"circle.dotted").font(.caption).foregroundStyle(Design.accent).padding(.horizontal,20).padding(.vertical,8).frame(maxWidth:.infinity,alignment:.leading)}
        else if let notice=store.notice {HStack(alignment:.top,spacing:10){Image(systemName:"wifi.exclamationmark");Text(notice).fixedSize(horizontal:false,vertical:true);Spacer();Button{Task{await store.refresh()}}label:{Image(systemName:"arrow.clockwise")}.accessibilityLabel("Проверить связь")}.font(.caption).foregroundStyle(.orange).padding(14).background(Color.orange.opacity(0.08),in:RoundedRectangle(cornerRadius:16)).padding(.horizontal,20)}
        else if !store.pending.isEmpty {Label("Сохранено на телефоне · ожидает отправки",systemImage:"arrow.triangle.2.circlepath").font(.caption).foregroundStyle(Design.secondary).padding(.horizontal,20).padding(.vertical,8)}
    }
}
struct TaskLine: View {
    var task:Entity
    @EnvironmentObject var store:AssistantStore
    var onOpen:()->Void
    var body:some View {
        HStack(alignment:.top,spacing:14){
            Button{Task{await store.toggle(task)}}label:{Image(systemName:task.status=="done" ? "checkmark.circle.fill":"circle").font(.system(size:23,weight:.light)).foregroundStyle(task.status=="done" ? Design.accent:Design.secondary.opacity(0.65)).frame(width:44,height:44).contentShape(Rectangle())}.buttonStyle(.plain).accessibilityLabel(task.status=="done" ? "Вернуть дело":"Отметить выполненным")
            Button(action:onOpen) {
                VStack(alignment:.leading,spacing:6) {
                    Text(task.displayTitle).font(.system(size:16,weight:.medium)).foregroundStyle(task.status=="done" ? Design.secondary:Color.primary).strikethrough(task.status=="done")
                    HStack(spacing:8) {
                        if let duration=task.durationMinutes {Text("\(duration) мин"+(task.durationEstimated==true ? " · оценка":""))}
                        if let day=task.dueDate {Text("до "+Dates.dueLabel(day,zone:store.zone))}
                    }.font(.caption).foregroundStyle(Design.secondary)
                    if let pid=task.projectID,let p=store.snapshot.projects.first(where:{$0.id==pid}) {
                        Text(p.displayTitle).font(.caption).foregroundStyle(Design.accent).lineLimit(1)
                    }
                }.frame(maxWidth:.infinity,alignment:.leading).contentShape(Rectangle())
            }.buttonStyle(.plain)
            Image(systemName:"chevron.right").font(.caption2).foregroundStyle(Design.secondary.opacity(0.5)).padding(.top,5)
        }.padding(.vertical,13)
    }
}
