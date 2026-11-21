# nginx:alpine sebagai basis untuk menyajikan file statis dan proxy ke Express.
FROM nginx:alpine

# tzdata wajib untuk waktu WITA (UTC+9)
RUN apk add --no-cache nodejs npm tzdata supervisor

ENV NODE_ENV=production
ENV TZ=Asia/Makassar
WORKDIR /app

# Dependensi backend
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# Runtime server backend Express
COPY server/ ./server/

# Template SPT/SPPD untuk generator docx sisi server (arsip-sppd-docx.js)
COPY templates/ ./templates/

# File logika komputasi yang di-import server
COPY js/face-quality.js ./js/

# File statis untuk disajikan oleh Nginx
COPY index.html login.html admin.html arsip.html aset-kir.html cetak-tpp.html desktop.html e-slip.html kiosk.html layanan.html rekap.html /usr/share/nginx/html/
COPY Lambang_Kabupaten_Sumba_Barat.png bast_template.docx spt_template.docx sppd_template.docx /usr/share/nginx/html/
COPY public/ /usr/share/nginx/html/
COPY js/ /usr/share/nginx/html/js/
COPY css/ /usr/share/nginx/html/css/
COPY catalog/ /usr/share/nginx/html/catalog/
COPY icons/ /usr/share/nginx/html/icons/

# Konfigurasi nginx & supervisor
COPY nginx.conf /etc/nginx/nginx.conf
COPY docker/supervisord.conf /etc/supervisord.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
