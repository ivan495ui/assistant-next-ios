import SwiftUI
@main struct AssistantNextApp: App {
    @StateObject private var store=AssistantStore()
    @Environment(\.scenePhase) private var scenePhase
    var body:some Scene {
        WindowGroup {
            RootView().environmentObject(store).preferredColorScheme(.dark).tint(Design.accent)
                .task{await store.refresh()}
                .onChange(of:scenePhase){_,phase in if phase == .active {Task{await store.refresh()}}else{store.suspend()}}
        }
    }
}
struct RootView: View {
    @EnvironmentObject var store:AssistantStore
    @State private var showSettings=false
    var body:some View {
        TabView(selection:$store.tab) {
            Tab("Сегодня",systemImage:"sun.max",value:0){NavigationStack{TodayView().toolbar{settingsButton}}}
            Tab("Ассистент",systemImage:"sparkle",value:1){NavigationStack{ChatView().toolbar{settingsButton}}}
            Tab("Дела",systemImage:"checklist",value:2){NavigationStack{TasksView().toolbar{settingsButton}}}
            Tab("Проекты",systemImage:"square.stack.3d.up",value:3){NavigationStack{ProjectsView().toolbar{settingsButton}}}
        }
        .sheet(isPresented:$showSettings){SettingsView()}
    }
    @ToolbarContentBuilder var settingsButton:some ToolbarContent {ToolbarItem(placement:.topBarTrailing){Button{showSettings=true}label:{Image(systemName:"slider.horizontal.3")}.accessibilityLabel("Настройки")}}
}
