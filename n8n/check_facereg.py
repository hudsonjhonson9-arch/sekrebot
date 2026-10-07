import re, json, os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

with open('AbsensiBot V.5.1 1.json', 'r', encoding='utf-8') as f:
    raw = f.read()

# Find face-register webhook and its connected nodes
# Look for face-register path
for m in re.finditer(r'face-register', raw):
    start = max(0, m.start() - 500)
    end = min(len(raw), m.end() + 500)
    ctx = raw[start:end].replace('\\n', '\n').replace('\\t', ' ')
    print(f"=== face-register at {m.start()} ===")
    print(ctx[:800])
    print()
