import SwiftUI
struct ProjectsView:View {
    @EnvironmentObject var store:AssistantStore
    var body:some View {ScrollView{VStack(alignment:.leading,spacing:22){Text("Большое —\nпо шагам.").font(.system(size:35,weight:.semibold,design:.rounded)).tracking(-1);Text("Цель, текущие дела и следующий шаг в одном месте.").font(.subheadline).foregroundStyle(Design.secondary)
                if store.snapshot.projects.isEmpty{EmptyCard(symbol:"square.stack.3d.up",title:"Начни с одной цели",text:"Расскажи ассистенту, что хочешь закончить. Например: подготовить три ролика к концу недели.")}
                ForEach(store.snapshot.projects){project in NavigationLink{ProjectDetail(project:project)}label:{projectCard(project)}.buttonStyle(.plain)}
                Button{store.tab=1;store.draft="Помоги создать проект. Моя цель: "}label:{Label("Обсудить новый проект",systemImage:"plus").font(.subheadline.weight(.medium)).foregroundStyle(Design.accent).frame(maxWidth:.infinity).padding(18).background(Design.card,in:RoundedRectangle(cornerRadius:20))}.buttonStyle(.plain)
            }.padding(20)}.background(Design.background).navigationTitle("Проекты").navigationBarTitleDisplayMode(.inline).safeAreaInset(edge:.top,spacing:0){StatusBanner()}}
    func projectCard(_ project:Entity)->some View {
        let tasks=store.snapshot.tasks.filter{$0.projectID==project.id},done=tasks.filter{$0.status=="done"}.count,next=tasks.first{$0.status=="open"}
        return VStack(alignment:.leading,spacing:17){HStack{Image(systemName:"square.stack.3d.up").foregroundStyle(Design.accent);Spacer();Text("\(done) / \(tasks.count)").font(.caption.monospacedDigit()).foregroundStyle(Design.secondary)};Text(project.displayTitle).font(.title3.weight(.semibold));if let goal=project.goal{Text(goal).font(.subheadline).foregroundStyle(Design.secondary).lineLimit(3)};ProgressView(value:Double(done),total:Double(max(tasks.count,1))).tint(Design.accent);if let next{VStack(alignment:.leading,spacing:5){Eyebrow(text:"Следующий шаг");Text(next.displayTitle).font(.subheadline)}}}.surface()
    }
}
struct ProjectDetail:View {
    @EnvironmentObject var store:AssistantStore
    var project:Entity
    @State private var editing:Entity?
    var tasks:[Entity]{store.snapshot.tasks.filter{$0.projectID==project.id}}
    var body:some View {ScrollView{VStack(alignment:.leading,spacing:22){Eyebrow(text:"Цель");Text(project.goal ?? project.displayTitle).font(.title2.weight(.medium));SectionLine(title:"Этапы",detail:"\(tasks.count)");if tasks.isEmpty{Text("Пока нет этапов. Их можно добавить в разговоре с ассистентом.").foregroundStyle(Design.secondary)}else{VStack(spacing:0){ForEach(tasks){task in TaskLine(task:task){editing=task};Divider().overlay(Design.line)}}.surface()};Button("Обсудить следующий шаг"){store.tab=1;store.draft="По проекту «\(project.displayTitle)» хочу обсудить следующий шаг. "}.foregroundStyle(Design.accent)}.padding(20)}.background(Design.background).navigationTitle(project.displayTitle).navigationBarTitleDisplayMode(.inline).sheet(item:$editing){TaskEditor(task:$0)}}
}
