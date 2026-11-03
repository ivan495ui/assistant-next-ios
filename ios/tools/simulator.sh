#!/usr/bin/env bash
set -euo pipefail
mkdir -p build/artifacts
xcrun simctl list -j > build/artifacts/simulator-inventory.json
read -r runtime device_type < <(python3 tools/select-simulator.py < build/artifacts/simulator-inventory.json)
device=$(xcrun simctl create AssistantNextReview "$device_type" "$runtime")
echo "$device" > build/sim-device.txt
trap 'xcrun simctl shutdown "$device" >/dev/null 2>&1 || true; xcrun simctl delete "$device" >/dev/null 2>&1 || true' EXIT
python3 tools/bounded.py 360 xcodebuild -project AssistantNext.xcodeproj -scheme AssistantNext -configuration Debug -sdk iphonesimulator -destination "id=$device" -derivedDataPath build/simulator CODE_SIGNING_ALLOWED=NO build-for-testing 2>&1 | tee build/artifacts/simulator-build.log
xcrun simctl boot "$device"
python3 tools/bounded.py 360 xcrun simctl bootstatus "$device" -b
xcrun simctl ui "$device" appearance dark
xcrun simctl status_bar "$device" override --time '09:41' --dataNetwork wifi --wifiMode active --wifiBars 3 --batteryState charged --batteryLevel 100
xcrun simctl install "$device" build/simulator/Build/Products/Debug-iphonesimulator/AssistantNext.app
for screen in today chat tasks projects plan; do
  xcrun simctl terminate "$device" app.assistant.next >/dev/null 2>&1 || true
  xcrun simctl launch "$device" app.assistant.next --demo "--screen=$screen"
  sleep 2
  xcrun simctl io "$device" screenshot "build/artifacts/assistant-$screen.png"
done
python3 tools/bounded.py 480 xcodebuild -project AssistantNext.xcodeproj -scheme AssistantNext -configuration Debug -destination "id=$device" -derivedDataPath build/simulator -resultBundlePath build/artifacts/UITests.xcresult -parallel-testing-enabled NO -test-timeouts-enabled YES -default-test-execution-time-allowance 180 -maximum-test-execution-time-allowance 180 CODE_SIGNING_ALLOWED=NO test-without-building 2>&1 | tee build/artifacts/ui-tests.log
