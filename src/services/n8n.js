// Deprecated filename kept for import compatibility. All API calls are native Express.
export async function apiFetch(path, opts = {}) {
  if (!String(path).startsWith('/api/')) throw new Error('Endpoint non-native ditolak: ' + path);
  const token = localStorage.getItem('_native_token') || localStorage.getItem('_device_token');
  const headers = { 'Accept': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = 'Bearer ' + token;
  return fetch(path, { ...opts, headers });
}
