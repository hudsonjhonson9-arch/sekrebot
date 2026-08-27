import sys
with open(r'D:\Code\absensi_refactored_v6\js\admin.js', 'r', encoding='utf-8') as f:
    c = f.read()

idx = c.find('function switchSATab')
if idx >= 0:
    end = c.find('\n\n', idx)
    if end < 0: end = idx + 3000
    sys.stdout.buffer.write(c[idx:end].encode('utf-8', errors='replace'))
else:
    # search for it differently
    idx = c.find('switchSATab')
    if idx >= 0:
        start = max(0, idx - 200)
        end = min(len(c), idx + 2000)
        sys.stdout.buffer.write(('...found at %d...\n' % idx).encode('utf-8'))
        sys.stdout.buffer.write(c[start:end].encode('utf-8', errors='replace'))
