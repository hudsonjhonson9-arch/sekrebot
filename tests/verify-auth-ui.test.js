import fs from 'fs';
import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

console.log('--- Verifying login.html & index.html auth elements ---');

const expectedIds = [
  'authOverlay',
  'tabLogin', 'tabRegister', 'formLogin', 'formRegister',
  'loginNip', 'loginPasswordWrapper', 'loginPassword', 'btnLogin',
  'regNama', 'regNip', 'regJabatan', 'regNomor', 'regTelegramWrapper',
  'regTelegram', 'regInstansi', 'regBidang', 'regTipe', 'regPangkat', 'btnRegister'
];

// 1. Verify login.html
const loginHtml = fs.readFileSync(path.join(ROOT, 'login.html'), 'utf8');
const missingInLogin = expectedIds.filter(id => id !== 'authOverlay' && !loginHtml.includes(`id="${id}"`));
assert.strictEqual(missingInLogin.length, 0, `Missing IDs in login.html: ${missingInLogin.join(', ')}`);
console.log('✓ login.html contains all expected auth elements.');

// 2. Verify index.html
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const missingInIndex = expectedIds.filter(id => !indexHtml.includes(`id="${id}"`));
assert.strictEqual(missingInIndex.length, 0, `Missing IDs in index.html: ${missingInIndex.join(', ')}`);
console.log('✓ index.html contains all 20 expected auth overlay elements.');

// 3. Verify script inclusions in index.html
assert(indexHtml.includes('src="js/config.js"'), 'Missing js/config.js script tag in index.html');
assert(indexHtml.includes('src="js/constants.js"'), 'Missing js/constants.js script tag in index.html');
assert(indexHtml.includes('src="js/api.js"'), 'Missing js/api.js script tag in index.html');
assert(indexHtml.includes('src="js/auth.js"'), 'Missing js/auth.js script tag in index.html');
console.log('✓ index.html correctly includes config.js, constants.js, api.js, and auth.js.');

// 4. Verify logout handler & session gating in index.html / js/stitch-app.js
const stitchAppJs = fs.existsSync(path.join(ROOT, 'js', 'stitch-app.js'))
  ? fs.readFileSync(path.join(ROOT, 'js', 'stitch-app.js'), 'utf8')
  : '';
const indexAndApp = indexHtml + '\n' + stitchAppJs;
assert(indexAndApp.includes('logoutUser()') || indexAndApp.includes('window.logoutUser'), 'Missing logoutUser in index.html / js/stitch-app.js');
assert(indexAndApp.includes("authOverlayEl.style.display = 'flex'"), 'Missing auth gating in bootstrapFromDatabase');
console.log('✓ index.html + js/stitch-app.js has session gating and logout handler.');

console.log('--- ALL AUTH UI VERIFICATIONS PASSED ---');
