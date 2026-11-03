import json,sys
inventory=json.load(sys.stdin)
runtimes=[r for r in inventory['runtimes'] if r.get('isAvailable') and r['identifier'].startswith('com.apple.CoreSimulator.SimRuntime.iOS-')]
device='com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro'
for runtime in sorted(runtimes,key=lambda r:tuple(map(int,r['version'].split('.'))),reverse=True):
 if device in {d['identifier'] for d in runtime.get('supportedDeviceTypes',[])}:
  print(runtime['identifier'],device);sys.exit(0)
raise RuntimeError('No compatible iPhone 15 Pro simulator profile')
