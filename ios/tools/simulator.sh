#!/usr/bin/env bash
set -euo pipefail
mkdir -p build/artifacts
runtime=$(xcrun simctl list runtimes -j | python3 -c 'import json,sys; r=[x for x in json.load(sys.stdin)["runtimes"] if x.get("isAvailable") and x["name"].startswith("iOS")]; print(sorted(r,key=lambda x:[int(i) for i in x["version"].split(".")])[-1]["identifier"])')
device=$(xcrun simctl create AssistantNextReview com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro "$runtime")
echo "$device" > build/sim-device.txt
trap 'xcrun simctl shutdown "$device" >/dev/null 2>&1 || true; xcrun simctl delete "$device" >/dev/null 2>&1 || true' EXIT
xcrun simctl boot "$device"
xcrun simctl bootstatus "$device" -b
xcodebuild -project AssistantNext.xcodeproj -scheme AssistantNext -configuration Debug -sdk iphonesimulator -destination "id=$device" -derivedDataPath build/simulator CODE_SIGNING_ALLOWED=NO build >build/artifacts/simulator-build.log 2>&1
xcrun simctl status_bar "$device" override --time '09:41' --dataNetwork wifi --wifiMode active --wifiBars 3 --batteryState charged --batteryLevel 100
xcrun simctl install "$device" build/simulator/Build/Products/Debug-iphonesimulator/AssistantNext.app
for screen in today chat tasks projects plan; do
  xcrun simctl terminate "$device" app.assistant.next >/dev/null 2>&1 || true
  xcrun simctl launch "$device" app.assistant.next --demo "--screen=$screen"
  sleep 2
  xcrun simctl io "$device" screenshot "build/artifacts/assistant-$screen.png"
done
xcodebuild -project AssistantNext.xcodeproj -scheme AssistantNext -configuration Debug -destination "id=$device" -derivedDataPath build/simulator -resultBundlePath build/artifacts/UITests.xcresult CODE_SIGNING_ALLOWED=NO test >build/artifacts/ui-tests.log 2>&1
