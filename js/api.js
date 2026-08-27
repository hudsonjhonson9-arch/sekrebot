    /* ════ API HELPERS — Lapisan konsisten di atas apiFetch ════
       Menangani pola-pola berulang:
         - POST JSON dengan body
         - GET dengan query params
         - Response parsing (ok/fail + json)
         - Error logging terpusat
    */

    /**
     * POST JSON ke endpoint n8n. Wrapper ringkas untuk pola paling umum.
     * @param {string} endpoint - Path endpoint dari P.* (e.g. P.absen)
     * @param {Object} body - Data yang akan dikirim sebagai JSON
     * @returns {Promise<{ok: boolean, data: any, status: number}>}
     */
    async function apiPost(endpoint, body) {
      try {
        const res = await apiFetch(endpoint, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        let data = null;
        try { data = await res.json(); } catch (_) {}
        return { ok: res.ok, data, status: res.status };
      } catch (e) {
        console.error(`[apiPost] ${endpoint}:`, e.message);
        return { ok: false, data: null, status: 0 };
      }
    }

    /**
     * GET dari endpoint n8n dengan query params opsional.
     * @param {string} endpoint - Path endpoint dari P.*
     * @param {Object} [params={}] - Query parameters
     * @returns {Promise<{ok: boolean, rows: any[], data: any, status: number}>}
     */
    async function apiGet(endpoint, params = {}) {
      try {
        let path = endpoint;
        const qs = Object.entries(params)
          .filter(([, v]) => v !== null && v !== undefined && v !== '')
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .join('&');
        if (qs) path += (path.includes('?') ? '&' : '?') + qs;

        const res = await apiFetch(path, { method: 'GET' });
        let raw = null;
        let rows = [];
        if (res.ok) {
          try {
            raw = await res.json();
            rows = parseApiResponse(raw);
          } catch (_) {}
        }
        return { ok: res.ok, rows, data: raw, status: res.status };
      } catch (e) {
        console.error(`[apiGet] ${endpoint}:`, e.message);
        return { ok: false, rows: [], data: null, status: 0 };
      }
    }

    /**
     * Upload file (multipart/form-data) ke endpoint n8n.
     * @param {string} endpoint - Path endpoint
     * @param {FormData} formData - Data form dengan file
     * @returns {Promise<{ok: boolean, data: any, status: number}>}
     */
    async function apiUpload(endpoint, formData) {
      try {
        const hdrs = {};
        if (window._session?.token) hdrs['Authorization'] = 'Bearer ' + window._session.token;
        const res = await fetch(SERVER_1 + endpoint, {
          method: 'POST',
          body: formData,
          headers: hdrs
          // Jangan set Content-Type — biarkan browser set boundary otomatis
        });
        let data = null;
        try { data = await res.json(); } catch (_) {}
        return { ok: res.ok, data, status: res.status };
      } catch (e) {
        console.error(`[apiUpload] ${endpoint}:`, e.message);
        return { ok: false, data: null, status: 0 };
      }
    }

    /**
     * Cek apakah response API sukses berdasarkan berbagai pola n8n.
     * n8n kadang kirim { ok: true }, { status: 'success' }, atau HTTP 200 langsung.
     * @param {any} data - Parsed JSON response
     * @param {boolean} httpOk - Apakah HTTP status 2xx
     * @returns {boolean}
     */
    function isApiSuccess(data, httpOk = true) {
      if (!httpOk) return false;
      if (data === null || data === undefined) return true; // 200 no body = success
      if (typeof data === 'object') {
        if (data.ok === false || data.status === 'error' || data.error) return false;
        if (data.ok === true || data.status === 'success') return true;
      }
      if (Array.isArray(data)) return true; // array response = data ditemukan
      return httpOk; // fallback ke HTTP status
    }

    /**
     * Ambil pesan error dari berbagai format response n8n.
     * @param {any} data - Parsed JSON response
     * @param {string} [fallback='Terjadi kesalahan.'] - Pesan default
     * @returns {string}
     */
    function getApiErrorMsg(data, fallback = 'Terjadi kesalahan.') {
      if (!data) return fallback;
      return data.message || data.error || data.msg || data.keterangan || fallback;
    }
