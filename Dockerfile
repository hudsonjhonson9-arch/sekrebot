# nginx:alpine sebagai basis karena Coolify sudah memakai image itu, lalu Node
# ditambahkan di atasnya. Satu container = satu origin: nginx menyajikan statis di
# :80 dan meneruskan /api ke Express di :3000.
FROM nginx:alpine

# tzdata wajib: server/absen.js menghitung waktu WITA (UTC+9). Tanpa ini,
# witaNow() geser satu jam dan seluruh gate jam absen bergeser.
RUN apk add --no-cache nodejs npm tzdata

ENV NODE_ENV=production
ENV TZ=Asia/Makassar
WORKDIR /app

# Manifest dulu supaya layer dependensi tidak ter-cache ulang setiap edit kode.
COPY package.json package-lock.json* ./
# npm ci butuh lockfile. Kalau repo tidak punya, npm install agar build tidak
# gagal total.
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# Hanya server/ yang dibutuhkan runtime. .env, n8n/, docs/, tests/ sudah
# tersaring .dockerignore dan TIDAK akan masuk image.
COPY server/ ./server/

# Statis untuk nginx. Disalin LANGSUNG ke document root nginx, bukan ke /app,
# karena nginx.conf menunjuk root /usr/share/nginx/html. Menyalin ke /app lalu
# memindahkan root-nya akan bocor juga source server/ lewat HTTP.
# favicon.svg dan icons.svg tinggal di public/ (Vite menyalinnya ke dist), bukan
# di root repo.
COPY index.html manifest.json service-worker.js /usr/share/nginx/html/
COPY public/favicon.svg public/icons.svg /usr/share/nginx/html/
COPY js/ /usr/share/nginx/html/js/
COPY css/ /usr/share/nginx/html/css/
# Template BAST (.docx) di-fetch simapo-bast.js sebagai 'bast_template.docx'.
# Tanpa baris ini nginx fallback ke index.html, PizZip gagal "central directory".
COPY bast_template.docx /usr/share/nginx/html/
# Ikon RuneIcons: mask SVG dipakai css/lib/runeicons.css lewat url(../../icons/...).
# Tanpa baris ini semua ikon 404 dan <i class="fas"> kosong total.
COPY icons/ /usr/share/nginx/html/icons/

# Konfigurasi nginx: listen 80, proxy /api ke 127.0.0.1:3000.
COPY nginx.conf /etc/nginx/nginx.conf

# Port 80 = nginx (publik). Express di 8081 hanya internal lewat 127.0.0.1
# dan sengaja tidak diexpose supaya tidak bisa dilewati nginx.
EXPOSE 80

# Supervisor: dua proses dalam satu container. Tanpa supervisor, caraUmum
# "cmd & nginx -g daemon off;" menggantungkan container selamanya kalau Express
# crash, dan load balancer melihat container hidup padahal API mati.
RUN apk add --no-cache supervisor
COPY docker/supervisord.conf /etc/supervisord.conf

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]