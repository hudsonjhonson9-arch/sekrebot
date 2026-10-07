import re, json, os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

with open('AbsensiBot V.5.1 1.json', 'r', encoding='utf-8') as f:
    raw = f.read()

# Find all occurrences of face_photo with surrounding context (200 chars)
for m in re.finditer(r'face_photo', raw):
    start = max(0, m.start() - 150)
    end = min(len(raw), m.end() + 150)
    ctx = raw[start:end].replace('\\n', '\n').replace('\\t', '\t')
    print(f"--- Context at pos {m.start()} ---")
    print(ctx)
    print()
