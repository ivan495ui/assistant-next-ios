import XCTest
final class AssistantNextUITests:XCTestCase {
    @MainActor func testBudgetWarningDoesNotDisableComposer() throws {
        executionTimeAllowance=300
        let app=XCUIApplication();app.launchArguments=["--demo","--screen=chat","--budget-warning"];app.launch()
        XCTAssertTrue(app.descendants(matching:.any).matching(identifier:"budget-warning").firstMatch.waitForExistence(timeout:10))
        let field=app.descendants(matching:.any).matching(identifier:"message-input").firstMatch
        XCTAssertTrue(field.exists);field.tap();field.typeText("Новый план")
        XCTAssertTrue(app.buttons["Отправить сообщение"].isEnabled)
    }
    @MainActor func testTabsAndPlan() throws {
        let app=XCUIApplication();app.launchArguments=["--demo"];app.launch()
        XCTAssertTrue(app.tabBars.buttons["Сегодня"].waitForExistence(timeout:15))
        app.tabBars.buttons["Ассистент"].tap()
        XCTAssertTrue(app.buttons["Открыть план"].waitForExistence(timeout:5))
        app.buttons["Открыть план"].tap()
        XCTAssertTrue(app.buttons.matching(NSPredicate(format:"label CONTAINS %@","Подтвердить")).firstMatch.waitForExistence(timeout:5))
        app.buttons["Закрыть"].tap();app.tabBars.buttons["Дела"].tap()
        XCTAssertTrue(app.staticTexts["Освободи\nголову."].waitForExistence(timeout:5))
        app.tabBars.buttons["Проекты"].tap();XCTAssertTrue(app.staticTexts["Три коротких ролика"].waitForExistence(timeout:5))
    }
    @MainActor func testLongMultilineInput() throws {
        let app=XCUIApplication();app.launchArguments=["--demo","--screen=chat"];app.launch()
        let field=app.descendants(matching:.any).matching(identifier:"message-input").firstMatch
        XCTAssertTrue(field.waitForExistence(timeout:10));field.tap();field.typeText(String(repeating:"Длинная просьба с исправлением. ",count:30))
        XCTAssertTrue((field.value as? String)?.contains("Длинная") == true)
    }
}
