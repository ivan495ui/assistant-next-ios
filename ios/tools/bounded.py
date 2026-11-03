import subprocess,sys
try:sys.exit(subprocess.run(sys.argv[2:],timeout=int(sys.argv[1])).returncode)
except subprocess.TimeoutExpired:print('Bounded command timed out',file=sys.stderr);sys.exit(124)
