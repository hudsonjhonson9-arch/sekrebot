import re, json, os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

with open('AbsensiBot V.5.1 1.json', 'r', encoding='utf-8') as f:
    raw = f.read()

# Find all references to face_photo, face_histogram, face_model
patterns = ['face_photo', 'face_histogram', 'face_model', 'face_saved_at']
for pat in patterns:
    count = raw.count(pat)
    print(f"'{pat}' appears {count} times")
    
# Find body/JSON payloads that reference face data
body_pattern = r'"body":\s*"((?:[^"\\]|\\.){0,500})"'
bodies = re.findall(body_pattern, raw)
print(f"\n--- Body payloads with face references ---")
for i, b in enumerate(bodies):
    decoded = b.replace('\\n', '\n').replace('\\t', '\t')
    if 'face' in decoded.lower():
        print(f"Body {i+1}:")
        print(decoded[:300])
        print()
