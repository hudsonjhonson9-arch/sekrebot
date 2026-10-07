import re, json, os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

with open('AbsensiBot V.5.1 1.json', 'r', encoding='utf-8') as f:
    raw = f.read()

# Find face-settings and face-toggle related sections
for pat in ['face-settings', 'face-toggle', 'face_settings', 'face_photo']:
    for m in re.finditer(re.escape(pat), raw, re.IGNORECASE):
        start = max(0, m.start() - 300)
        end = min(len(raw), m.end() + 300)
        ctx = raw[start:end].replace('\\n', '\n').replace('\\t', ' ')
        print(f"=== {pat} at {m.start()} ===")
        print(ctx[:500])
        print()
