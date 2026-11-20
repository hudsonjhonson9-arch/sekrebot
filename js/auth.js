/* ════ AUTH — LOGIN, REGISTER, LOGOUT ════ */

    // ── AUTH LOGIC (LOGIN & REGISTRATION) ──
    function switchAuthTab(mode) {
      if (mode === 'login') {
        $('tabLogin').classList.add('active');
        $('tabRegister').classList.remove('active');
        $('formLogin').style.display = 'block';
        $('formRegister').style.display = 'none';
      } else {
        $('tabLogin').classList.remove('active');
        $('tabRegister').classList.add('active');
        $('formLogin').style.display = 'none';
        $('formRegister').style.display = 'block';
        // Populate & Toggle Telegram ID visibility
        const regTg = $('regTelegram');
        const regTgWrapper = $('regTelegramWrapper');
        if (regTg) {
          regTg.value = window.MY_ID || '';
          if (window.MY_ID) {
            if (regTgWrapper) regTgWrapper.style.display = 'block';
            regTg.style.border = '1px solid rgba(100, 255, 100, 0.2)';
            regTg.style.color = '#4ade80'; 
          } else {
            if (regTgWrapper) regTgWrapper.style.display = 'none';
          }
        }
        // Pre-fill Instansi from URL if present
        const urlParams = new URLSearchParams(window.location.search);
        const instParam = urlParams.get('instansi') || urlParams.get('instansi_id');
        if (instParam && $('regInstansi')) {
          $('regInstansi').value = instParam;
        }
      }
    }

    async function handleAuthAction(mode) {
      const btn = mode === 'login' ? $('btnLogin') : $('btnRegister');
      const originalText = btn.innerHTML;

      btn.disabled = true;
      btn.innerHTML = '<span class="spin-sm"></span> Memproses...';

      try {
        if (mode === 'login') {
          const nip = $('loginNip').value.trim().replace(/\s/g, '');
          if (!nip) throw new Error('Silakan masukkan NIP');
          if (nip.length < 3) throw new Error('ID / NIP minimal terdiri dari 3 karakter');

          const pwdInput = $('loginPassword');
          const password = pwdInput ? pwdInput.value : '';

          // Login NIP (web, non-Telegram): satu panggilan menerbitkan sesi native
          // dan mengembalikan baris user; tidak lagi butuh /api/user-list (yang
          // berada di balik requireRole dan tak terjangkau sebelum punya token).
          const loginRes = await fetch(API_BASE + P.webLogin, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nip, password }),
          });
          const loginBody = await loginRes.json().catch(() => ({}));
          if (!loginRes.ok) {
            if (loginBody?.require_password) {
              const wrapper = $('loginPasswordWrapper');
              if (wrapper) wrapper.style.display = 'block';
              if (pwdInput) {
                pwdInput.focus();
                if (!password) {
                  throw new Error('Verifikasi sandi aktif. Masukkan kata sandi akun Anda.');
                }
              }
            }
            throw new Error(loginBody?.message || 'Login gagal. Coba lagi.');
          }

          const user = loginBody.user;
          if (!user || !user.id) throw new Error('Data pegawai tidak lengkap. Hubungi admin.');

          const sessionToken = loginBody.session_token;
          const userNip = String(user.nip || '').trim();
          const targetId = String(user.id);

          // Token native harus siap SEBELUM panggilan face-toggle/face lain agar
          // tidak 401 (endpoints media dibalik requireRole).
          setNativeToken(sessionToken);

          // ── FACE VERIFICATION LOGIN (PASSWORDLESS) ──
          // Check per-instansi face toggle from pengaturan table
          let isFaceEnabled = false;
          try {
            const userInstansi = (user.instansi_id || user.Instansi_Id || '').trim();
            console.log('[FaceToggle] userInstansi:', userInstansi);
            if (userInstansi) {
              const faceRes = await apiGet(P.faceToggle, { instansi_id: userInstansi });
              console.log('[FaceToggle] faceRes:', faceRes);
              if (faceRes.ok) {
                const rawFT = faceRes.rows?.length ? faceRes.rows[0] : (faceRes?.data ?? {});
                const d = Array.isArray(rawFT) ? rawFT[0] : rawFT;
                console.log('[FaceToggle] parsed:', d);
                isFaceEnabled = d?.enabled === true || d?.enabled === '1' || d?.enabled === 1 || d?.value === '1';
                console.log('[FaceToggle] isFaceEnabled:', isFaceEnabled);
              } else {
                console.warn('[FaceToggle] API not ok:', faceRes.status);
              }
            } else {
              console.warn('[FaceToggle] instansi_id empty on user');
            }
          } catch (e) {
            console.warn('[FaceToggle] error:', e);
          }
          // Ponytail: API error/timeout → safe default = OFF, no face required

          // Cek apakah NIP ini wajib face recognition
          let isMandatoryFace = user.is_mandatory_face === true;
          if (!isMandatoryFace && typeof window !== 'undefined' && Array.isArray(window.MANDATORY_FACE_NIPS)) {
            isMandatoryFace = window.MANDATORY_FACE_NIPS.map(s => String(s).trim()).includes(userNip);
          }
          if (!isMandatoryFace) {
            try {
              const fsRes = await apiGet(P.faceSettings, { instansi_id: (user.instansi_id || user.Instansi_Id || '').trim() || 'bapperida' });
              if (fsRes?.ok) {
                const sett = fsRes.data?.settings || fsRes.data || {};
                const list = sett.mandatory_nips || [];
                if (Array.isArray(list)) {
                  window.MANDATORY_FACE_NIPS = list;
                  isMandatoryFace = list.map(s => String(s).trim()).includes(userNip);
                }
              }
            } catch (_) {}
          }

          const requireFace = isFaceEnabled || isMandatoryFace;

          const hasFace = !!(user.face_histogram && user.face_histogram !== '[]' && user.face_histogram !== '')
            || !!(user.face_photo && user.face_photo !== '' && user.face_photo !== 'null')
            || !!(user.foto_base64 && user.foto_base64 !== '')
            || !!(user.descriptor && user.descriptor !== '[]');

          const finalizeLogin = async () => {
            setNativeToken(sessionToken);
            setSession(sessionToken, { nip: userNip, role: user.role || 'USER', instansi_id: user.instansi_id || '' });
            window.MY_ID = targetId;
            try {
              if (typeof STORAGE_KEYS !== 'undefined' && STORAGE_KEYS.USER_ID) {
                localStorage.setItem(STORAGE_KEYS.USER_ID, window.MY_ID);
                localStorage.setItem(STORAGE_KEYS.USER_OBJ, JSON.stringify(user));
              }
              localStorage.setItem('stitch_active_nip', userNip);
              localStorage.setItem('MY_NIP', userNip);
              localStorage.setItem('_native_token', sessionToken);
              localStorage.setItem('native_token', sessionToken);
              localStorage.setItem('MY_ROLE', String(user.role || 'USER').toUpperCase());
              localStorage.setItem('MY_NAME', String(user.nama || 'User'));
              const finalInst = (user.instansi_id || user.Instansi_Id || '').trim();
              if (finalInst) localStorage.setItem('MY_INSTANSI', finalInst);
              else localStorage.removeItem('MY_INSTANSI');
            } catch (_) {}

            // Jika berada di halaman standalone login.html, navigasi ke landing sesuai viewport/mode
            if (window.location && (window.location.pathname.endsWith('login.html') || window.location.href.includes('login.html'))) {
              const targetUrl = (window.StitchRoute && typeof window.StitchRoute.getLandingUrl === 'function') ? window.StitchRoute.getLandingUrl() : (window.innerWidth >= 1024 ? 'desktop.html' : 'index.html');
              window.location.href = targetUrl;
              return;
            }

            // Jika di index.html dengan modal authOverlay.
            // Modal baru ditutup SETELAH data pegawai benar-benar termuat. Dulu modal
            // ditutup lebih dulu dan kegagalan selectUserByNip (yang menelan error)
            // tidak terlihat, sehingga yang "berhasil" hanya menghilangkan modal.
            const overlayEl = document.getElementById('authOverlay');

            if (typeof state !== 'undefined' && (typeof bootstrapFromDatabase === 'function' || typeof selectUserByNip === 'function')) {
              state.currentUser = null;
              // bootstrapFromDatabase() sudah memuat user aktif, bootstrap & face config secara paralel;
              // hindari memanggil selectUserByNip() terpisah agar tidak terjadi double fetch saat login.
              if (typeof bootstrapFromDatabase === 'function') {
                try { await bootstrapFromDatabase({ keepOverlay: true }); } catch (_) {}
              } else {
                await selectUserByNip(userNip, { skipSecondaryLoads: true });
              }

              if (!state.currentUser) {
                // Data pegawai gagal dimuat: batalkan sesi, tampilkan modal lagi + pesan.
                setNativeToken(null);
                try { clearSession(); } catch (_) {}
                ['_native_token', 'native_token', 'stitch_active_nip', 'stitch_boot_cache_v1', 'MY_NIP', 'MY_ROLE', 'MY_NAME']
                  .forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
                window.MY_ID = null;
                state.isLoggedIn = false;
                if (overlayEl) overlayEl.style.display = 'flex';
                btn.disabled = false;
                btn.innerHTML = originalText;
                const failMsg = 'Autentikasi berhasil, tetapi data pegawai gagal dimuat dari server (/api/stitch/user-data). Periksa log server lalu coba lagi.';
                if (typeof showDynamicIsland === 'function') {
                  showDynamicIsland({ type: 'error', title: 'Login Gagal', message: failMsg });
                } else {
                  alert(failMsg);
                }
                return;
              }

              state.isLoggedIn = true;
              if (overlayEl) overlayEl.style.display = 'none';
              const consumedAutoNotice = (window.AutoAbsenLogin && typeof window.AutoAbsenLogin.consumeAutoAbsenNotice === 'function')
                ? window.AutoAbsenLogin.consumeAutoAbsenNotice()
                : false;
              if (!consumedAutoNotice && typeof showDynamicIsland === 'function') {
                showDynamicIsland({ type: 'success', title: 'Login Berhasil', message: `Selamat datang, ${user.nama || userNip}` });
              }
              return;
            }

            if (overlayEl) overlayEl.style.display = 'none';
            location.reload();
          };

          const maybeAutoAbsenAfterFace = async () => {
            const chkEl = document.getElementById('chkAutoAbsenLogin');
            const autoEnabled = chkEl ? Boolean(chkEl.checked) : true;
            if (window.AutoAbsenLogin && typeof window.AutoAbsenLogin.tryAutoAbsenAfterFaceLogin === 'function') {
              await window.AutoAbsenLogin.tryAutoAbsenAfterFaceLogin({
                nip: userNip,
                token: sessionToken,
                autoEnabled
              });
            }
          };

          if (requireFace) {
             if (typeof openCamOverlay !== 'function') {
               if (isMandatoryFace) {
                 setNativeToken(null);
                 throw new Error('NIP Anda wajib verifikasi wajah, namun modul kamera face recognition belum siap. Silakan muat ulang halaman atau hubungi admin.');
               }
               // Jika hanya toggle instansi tapi modul kamera tidak tersedia, lanjutkan
               await finalizeLogin();
               return;
             }
             // Sembunyikan form login
             const overlayEl = document.getElementById('authOverlay');
             if (overlayEl) overlayEl.style.display = 'none';

             // Inject variabel sementara untuk face.js
             window.MY_ID = targetId;
             window.tgUser = { first_name: user.nama || 'User', username: userNip };
             
             if (!hasFace) {
                 // REGISTRASI WAJAH PERTAMA KALI
                 alert(isMandatoryFace
                   ? 'NIP Anda diwajibkan melakukan verifikasi wajah.\nWajah Anda belum terdaftar di sistem. Silakan rekam wajah Anda sekarang untuk melanjutkan.'
                   : 'Wajah Anda belum terdaftar.\nSilakan daftarkan wajah Anda ke sistem sekarang untuk mengamankan akun (Passwordless).'
                 );
                 openCamOverlay({
                    isRegister: true,
                    onDone: async (camResult) => {
                       if (!camResult || !camResult.dataUrl) {
                          alert('Gagal mengambil data wajah.');
                          setNativeToken(null);
                          if (overlayEl) overlayEl.style.display = 'flex';
                          btn.disabled = false;
                          btn.innerHTML = originalText;
                          return;
                       }
                       
                       try {
                          const faceOk = await syncFaceToServer(targetId, camResult.dataUrl, camResult.descriptor, user.nama, new Date().toISOString());
                          if (!faceOk) throw new Error('Gagal menyimpan data wajah ke server. Hubungi Admin.');
                          alert('Wajah berhasil didaftarkan! Selamat datang.');
                          await maybeAutoAbsenAfterFace();
                          await finalizeLogin();
                       } catch (err) {
                          alert(' ' + err.message);
                          setNativeToken(null);
                          if (overlayEl) overlayEl.style.display = 'flex';
                          btn.disabled = false;
                          btn.innerHTML = originalText;
                       }
                    },
                    onCancel: () => {
                       setNativeToken(null);
                       window.MY_ID = null; // revert
                       window.tgUser = {};
                       if (overlayEl) overlayEl.style.display = 'flex';
                       btn.disabled = false;
                       btn.innerHTML = originalText;
                    }
                 });
             } else {
                openCamOverlay({
                    onDone: async (camResult) => {
                    let similarity = 0;
                    let failReason = "Wajah tidak cocok. Silakan coba lagi.";

                    if (camResult && camResult.descriptor) {
                       // '[]'/'null'/'' = stored-empty (sama dgn guard hasFace di atas) → anggap null
                       const descriptorOrEmpty = (v) => (v && v !== '[]' && v !== 'null') ? v : null;
                       let refDescRaw = descriptorOrEmpty(user.face_histogram) || descriptorOrEmpty(user.face_descriptor) || descriptorOrEmpty(user.descriptor) || descriptorOrEmpty(user.histogram) || null;

                       // AUTO-GENERATE: Jika database tidak mengirim descriptor tapi ada foto base64
                       if (!refDescRaw && (user.foto_base64 || user.face_photo) && typeof getDescriptorFromDataUrl === 'function') {
                           try {
                               console.log('[Login] Descriptor kosong dari server. Generate ulang dari foto_base64 secara live...');
                               refDescRaw = await getDescriptorFromDataUrl(user.foto_base64 || user.face_photo);
                               if (refDescRaw) {
                                   console.log('[Login] Berhasil generate ulang descriptor wajah dari foto.');
                               }
                           } catch(e) {
                               console.warn('[Login] Gagal mengekstrak descriptor dari foto:', e);
                           }
                       }

                       if (!refDescRaw) {
                           failReason = "Data biometrik wajah (descriptor) tidak ditemukan di server. Hubungi Admin untuk mendaftar ulang wajah.";
                       } else {
                           try {
                              let refDesc = typeof refDescRaw === 'string' ? JSON.parse(refDescRaw) : refDescRaw;
                              if (typeof refDesc === 'string') {
                                 try { refDesc = JSON.parse(refDesc); } catch(e){}
                              }
                              if (refDesc && !Array.isArray(refDesc) && typeof refDesc === 'object') {
                                 refDesc = Object.values(refDesc);
                              } else if (refDesc) {
                                 refDesc = Array.from(refDesc);
                              }

                              const capDesc = Array.from(camResult.descriptor);
                              const refDim = refDesc ? refDesc.length : 0;
                              const capDim = capDesc.length;

                              if (refDim === 0) {
                                  failReason = "Data biometrik wajah Anda di database rusak (dimensi 0). Hubungi Admin.";
                              } else if (refDim > 0 && capDim > 0) {
                                  const AI = typeof HumanInstance !== 'undefined' ? HumanInstance : window.HumanInstance;
                                  if (capDim >= 512 && refDim >= 512 && AI) {
                                      similarity = AI.match.similarity(refDesc, capDesc);
                                      failReason = `Wajah tidak cocok (Akurasi: ${(similarity*100).toFixed(0)}%). Posisikan wajah dengan lurus.`;
                                  } else if (capDim >= 512 && refDim >= 512) {
                                      // Fallback manual Cosine Similarity
                                      let dot = 0, normA = 0, normB = 0;
                                      for(let i=0; i<refDim; i++) {
                                         dot += refDesc[i] * capDesc[i];
                                         normA += refDesc[i] * refDesc[i];
                                         normB += capDesc[i] * capDesc[i];
                                      }
                                      similarity = dot / (Math.sqrt(normA) * Math.sqrt(normB));
                                      failReason = `Wajah tidak cocok (Akurasi: ${(similarity*100).toFixed(0)}%).`;
                                  } else if (capDim === 128 && refDim === 128) {
                                      let sum = 0;
                                      for(let i=0; i<refDim; i++) {
                                         sum += (refDesc[i] - capDesc[i]) ** 2;
                                      }
                                      const dist = Math.sqrt(sum);
                                      similarity = Math.max(0, 1 - (dist / 1.5));
                                      failReason = `Wajah tidak cocok (Akurasi: ${(similarity*100).toFixed(0)}%).`;
                                  } else {
                                       failReason = `Data wajah format lama (${refDim}-dim). Silakan daftar ulang wajah di menu Profil → Face AI.`;
                                  }
                              }
                           } catch(e){
                              console.error('[Login] Error parsing face reference:', e);
                              failReason = "Terjadi kesalahan saat memproses data wajah dari server.";
                           }
                       }
                    } else {
                       failReason = "Kamera gagal memindai wajah Anda dengan benar.";
                    }

                    // Threshold 0.50 untuk kemiripan wajah
                    if (similarity >= 0.50) {
                       await maybeAutoAbsenAfterFace();
                       await finalizeLogin();
                    } else {
                       alert(`Verifikasi Gagal!\n${failReason}`);
                       setNativeToken(null);
                       window.MY_ID = null; // Revert
                       window.tgUser = {};
                       if (overlayEl) overlayEl.style.display = 'flex';
                       btn.disabled = false;
                       btn.innerHTML = originalText;
                   }
                },
                onCancel: () => {
                   setNativeToken(null);
                   window.MY_ID = null; // Revert
                   window.tgUser = {};
                   if (overlayEl) overlayEl.style.display = 'flex';
                   btn.disabled = false;
                   btn.innerHTML = originalText;
                }
             });
             }
             // Biarkan tombol disable selagi kamera aktif
             return; 
           } else {
              // Jika Face Recognition didisable dari admin dan bukan NIP wajib face, login normal
              await finalizeLogin();
              return;
           }
        } else {
          const payload = {
            id: $('regTelegram')?.value.trim() || window.MY_ID || String(Math.floor(Math.random() * 1000000)),
            nama: $('regNama').value.trim(),
            nip: $('regNip').value.trim().replace(/\s/g, ''),
            jabatan: $('regJabatan').value.trim(),
            no_hp: $('regNomor')?.value.trim() || '',
            bidang: $('regBidang').value || '',
            pangkat: $('regPangkat').value || '',
            status: 'AKTIF',
            role: 'USER',
            instansi_id: ($('regInstansi')?.value || '').trim() || getScopedInstansiId() || ''
          };

          if (!payload.nama || !payload.nip) throw new Error('Nama dan NIP wajib diisi');
          if (payload.nip.length < 3) throw new Error('ID / NIP minimal terdiri dari 3 karakter');
          if (payload.no_hp && payload.no_hp.length < 10) throw new Error('Nomor WhatsApp minimal 10 digit');

          // Sembunyikan form pendaftaran sementara untuk scan wajah
          const overlayEl = document.getElementById('authOverlay');
          if (overlayEl) overlayEl.style.display = 'none';

          alert('Untuk menyelesaikan pendaftaran, silakan scan wajah Anda.');

          // Buka kamera untuk mendaftarkan wajah
          openCamOverlay({
            isRegister: true,
            onDone: async (camResult) => {
              if (!camResult || !camResult.dataUrl) {
                alert('Pendaftaran dibatalkan: Gagal memindai wajah.');
                if (overlayEl) overlayEl.style.display = 'flex';
                btn.disabled = false;
                btn.innerHTML = originalText;
                return;
              }

              btn.disabled = true;
              btn.innerHTML = '<span class="spin-sm"></span> Menyimpan Akun...';

              try {
                // 1. Daftarkan akun & terbitkan sesi native melalui /api/auth/register
                const regRes = await fetch(API_BASE + (P.webRegister || '/api/auth/register'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload),
                });
                const d = await regRes.json().catch(() => ({}));
                if (!regRes.ok || d?.ok === false || !d?.session_token) {
                  throw new Error(d?.message || 'Pendaftaran user gagal');
                }

                const regToken = d.session_token;
                const registeredId = String(d.user?.id || payload.id);
                setNativeToken(regToken);

                // 2. Simpan wajah ke server menggunakan sesi native yang baru terbit
                window.MY_ID = registeredId;
                window.tgUser = { first_name: payload.nama, username: payload.nip };
                
                const faceOk = await syncFaceToServer(registeredId, camResult.dataUrl, camResult.descriptor, payload.nama, new Date().toISOString());
                if (!faceOk) throw new Error('Gagal menyimpan data wajah ke server. Hubungi Admin.');

                // 3. Simpan sesi ke state lokal
                setNativeToken(regToken);
                setSession(regToken, { nip: payload.nip, role: 'USER', instansi_id: payload.instansi_id || '' });
                localStorage.setItem(STORAGE_KEYS.USER_ID, String(window.MY_ID));
                localStorage.setItem('MY_NIP', String(payload.nip));
                localStorage.setItem('MY_ROLE', 'USER');
                localStorage.setItem('MY_NAME', String(payload.nama));
                localStorage.setItem(STORAGE_KEYS.USER_OBJ, JSON.stringify(d.user || payload));
                if (payload.instansi_id) localStorage.setItem('MY_INSTANSI', payload.instansi_id);

                alert('Pendaftaran berhasil! Wajah Anda telah terdaftar.');
                location.reload();
              } catch (err) {
                alert(' ' + err.message);
                setNativeToken(null);
                window.MY_ID = null;
                window.tgUser = {};
                if (overlayEl) overlayEl.style.display = 'flex';
                btn.disabled = false;
                btn.innerHTML = originalText;
              }
            },
            onCancel: () => {
              if (overlayEl) overlayEl.style.display = 'flex';
              btn.disabled = false;
              btn.innerHTML = originalText;
            }
          });
          return;
        }
      } catch (err) {
        if (typeof Swal !== 'undefined' && Swal.fire) {
          Swal.fire({
            icon: 'error',
            title: 'Login Gagal',
            text: err.message || 'Terjadi kesalahan sistem',
            confirmButtonColor: '#2563eb'
          });
        } else {
          alert(' ' + err.message);
        }
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    }


    // Global Logout Handler
    async function handleLogout() {
      let confirmed;
      if (typeof Swal !== 'undefined') {
        const r = await Swal.fire({
          title: 'Keluar dari akun?',
          text: 'Anda perlu login lagi untuk memakai aplikasi.',
          icon: 'question',
          showCancelButton: true,
          confirmButtonText: 'Ya, keluar',
          cancelButtonText: 'Batal'
        });
        confirmed = r.isConfirmed;
      } else {
        confirmed = confirm('Apakah Anda yakin ingin keluar dari akun ini?');
      }
      if (!confirmed) return;
      console.log('[Auth] Logging out user...');
      const activeToken = (typeof _nativeToken !== 'undefined' && _nativeToken) || localStorage.getItem('_native_token') || localStorage.getItem('native_token') || window._session?.token;
      if (activeToken && /^[0-9a-f]{192}$/.test(activeToken)) {
        // Cabut sesi di server, tapi jangan menahan logout bila jaringan lambat (maks 4 dtk).
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 4000);
          await fetch(API_BASE + '/api/auth/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_token: activeToken }),
            signal: ctrl.signal,
          });
          clearTimeout(t);
        } catch (_) {}
      }
      setNativeToken(null);
      try { clearSession(); } catch (_) {}
      // Hapus SEMUA kunci sesi (termasuk native_token, stitch_active_nip, MY_NAME) agar
      // token lama tidak ikut terkirim. Data wajah + preferensi tetap disimpan.
      if (window.StitchSession) window.StitchSession.clear();
      ['_native_token', 'native_token', 'stitch_active_nip', 'MY_NIP', 'MY_ROLE', 'MY_NAME', 'MY_INSTANSI']
        .forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
      try {
        localStorage.removeItem(STORAGE_KEYS.USER_ID);
        localStorage.removeItem(STORAGE_KEYS.USER_OBJ);
      } catch (_) {}
      window.MY_ID = null;

      // Kembali ke layar login (tanpa hash, tanpa riwayat halaman terautentikasi).
      location.replace(location.pathname);
    }

    async function _checkIdentityOnLoad() {
      if (!window.MY_ID) {
        $('authOverlay').style.display = 'flex';
        const splash = $('appSplash');
        if (splash) splash.remove();
        return false;
      }
      const isTg = !!(window.Telegram?.WebApp?.initData || new URLSearchParams(window.location.search).has('id'));
      const hasNativeOrDevice = !!(
        (typeof _nativeToken !== 'undefined' && _nativeToken) ||
        (typeof _deviceToken !== 'undefined' && _deviceToken)
      );
      // MY_ID ada tapi token sesi atau token native tidak ada → auto-login TG atau re-login
      if (!window._session.token || (!isTg && !hasNativeOrDevice)) {
        if (isTg && !window._session.token) {
          console.log('[Auth] Telegram user without session → auto-login from Telegram ID');
          // Simple token — tidak perlu server call
          const token = 'tg_' + window.MY_ID + '_' + Date.now();
          setSession(token, { nip: '', role: 'USER', instansi_id: '' });
          console.log('[Auth] Auto-login success:', { targetId: window.MY_ID, hasToken: !!window._session.token });
          return true;
        }
        // Non-Telegram tanpa sesi valid: force re-login sebelum memanggil API
        console.warn('[Auth] No valid session/native token → forcing re-login');
        localStorage.removeItem(STORAGE_KEYS.USER_ID);
        localStorage.removeItem(STORAGE_KEYS.USER_OBJ);
        localStorage.removeItem('MY_NIP');
        localStorage.removeItem('MY_ROLE');
        window.MY_ID = null;
        window.tgUser = {};
        window.userProfile = null;
        try { clearSession(); } catch (_) {}
        $('authOverlay').style.display = 'flex';
        const splash = $('appSplash');
        if (splash) splash.remove();
        return false;
      }
      return true;
    }

    if (typeof window !== 'undefined') {
      window.switchAuthTab = switchAuthTab;
      window.handleAuthAction = handleAuthAction;
      window.handleLogout = handleLogout;
      window._checkIdentityOnLoad = _checkIdentityOnLoad;
    }

