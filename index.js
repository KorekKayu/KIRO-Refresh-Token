// ============================================================
//  KIRO AUTO-REGISTER BOT — Gmail SSO
//  Membuat akun Kiro via Google SSO & save token ke gateway
// ============================================================

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ─── CONFIG ──────────────────────────────────────────────────
const ACCOUNTS_FILE   = path.join(__dirname, 'accounts.txt');
const RESULTS_DIR     = path.join(__dirname, 'results');
const RT_FILE         = path.join(__dirname, 'RT.txt');
const GATEWAY_DIR     = 'E:\\KIRO\\kiro-gateway';
const GATEWAY_CREDS   = path.join(GATEWAY_DIR, 'credentials.json');
const AWS_CACHE_DIR   = path.join(os.homedir(), '.aws', 'sso', 'cache');
const KIRO_SIGNIN_URL = 'https://app.kiro.dev/signin?redirect_to_after_auth=%2Fhome';

const DELAY_BETWEEN_ACCOUNTS = 3000; // ms antara akun (naikkan supaya gak kena rate limit)
const HEADLESS = false;               // false = bisa lihat browser
const SKIP_DONE = true;               // true = skip akun yg sudah SUCCESS
// ─────────────────────────────────────────────────────────────

// ─── WARNA LOG ───────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  gray:   '\x1b[90m',
};
const log = {
  info:    (m) => console.log(`${C.cyan}[INFO]${C.reset}  ${m}`),
  ok:      (m) => console.log(`${C.green}[OK]${C.reset}    ${m}`),
  warn:    (m) => console.log(`${C.yellow}[WARN]${C.reset}  ${m}`),
  error:   (m) => console.log(`${C.red}[ERROR]${C.reset} ${m}`),
  step:    (m) => console.log(`${C.gray}  → ${m}${C.reset}`),
  header:  (m) => console.log(`\n${C.bold}${C.cyan}${'═'.repeat(55)}\n  ${m}\n${'═'.repeat(55)}${C.reset}`),
};
// ─────────────────────────────────────────────────────────────

function ensureDirs() {
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

function loadAccounts() {
  if (!fs.existsSync(ACCOUNTS_FILE)) {
    log.error(`File accounts.txt tidak ditemukan: ${ACCOUNTS_FILE}`);
    process.exit(1);
  }
  const lines = fs.readFileSync(ACCOUNTS_FILE, 'utf8')
    .split('\n')
    .map(l => l.trim().replace(/\r$/, ''))
    .filter(l => l && !l.startsWith('#'));

  const accounts = [];
  for (const line of lines) {
    const sep = line.indexOf(':');
    if (sep === -1) { log.warn(`Skip baris tidak valid: ${line}`); continue; }
    accounts.push({
      email:    line.slice(0, sep).trim(),
      password: line.slice(sep + 1).trim(),
    });
  }
  return accounts;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── CEK APAKAH AKUN SUDAH BERHASIL ──────────────────────────
function isAlreadyDone(email) {
  const rfile = path.join(RESULTS_DIR, `${email.replace(/[@.]/g, '_')}.json`);
  if (!fs.existsSync(rfile)) return false;
  try {
    const data = JSON.parse(fs.readFileSync(rfile, 'utf8'));
    return data.status === 'SUCCESS';
  } catch { return false; }
}

// ─── SIMPAN TOKEN KE RESULTS ──────────────────────────────────
function saveToken(email, tokenData) {
  const safe  = email.replace(/[@.]/g, '_');
  const fname = `token_${safe}.json`;
  const fpath = path.join(RESULTS_DIR, fname);

  fs.writeFileSync(fpath, JSON.stringify(tokenData, null, 2), 'utf8');
  log.ok(`Token tersimpan → ${fpath}`);
  return fpath;
}

// ─── SIMPAN HASIL ─────────────────────────────────────────────
function saveResult(email, status, tokenData = null, error = null) {
  const result = { email, status, timestamp: new Date().toISOString(), tokenData, error };
  const rfile  = path.join(RESULTS_DIR, `${email.replace(/[@.]/g, '_')}.json`);
  fs.writeFileSync(rfile, JSON.stringify(result, null, 2), 'utf8');
}

// ─── HANDLE GOOGLE LOGIN ──────────────────────────────────────
async function handleGoogleLogin(page, email, password) {
  // Tunggu halaman Google / Cognito muncul
  log.step('Menunggu halaman Google login...');
  await page.waitForURL(/accounts\.google\.com|amazoncognito\.com/, { timeout: 30000 });
  log.step('Halaman Google login terbuka');

  // Tunggu sampai halaman fully loaded
  await page.waitForLoadState('domcontentloaded');
  await sleep(1000);

  // ── ISI EMAIL ──────────────────────────────────────────────
  // Google pakai input#identifierId (bukan input[type="email"])
  const emailInput = await page.waitForSelector(
    'input#identifierId, input[type="email"], input[name="identifier"]',
    { state: 'visible', timeout: 15000 }
  );

  if (!emailInput) {
    await page.screenshot({ path: path.join(RESULTS_DIR, `${email.replace(/[@.]/g,'_')}_google_debug.png`) });
    throw new Error('Input email Google tidak ditemukan');
  }

  await emailInput.click();
  await sleep(200);
  await emailInput.fill(email);
  await sleep(300);

  // Klik Next / tekan Enter
  const nextBtn = await page.$('button:has-text("Next"), #identifierNext button, #identifierNext');
  if (nextBtn) {
    await nextBtn.click();
  } else {
    await page.keyboard.press('Enter');
  }
  log.step(`Email diisi: ${email}`);

  // ── TUNGGU FIELD PASSWORD ──────────────────────────────────
  await sleep(2000); // Beri waktu transisi Google

  // Tunggu password input visible
  const passwordInput = await page.waitForSelector(
    'input[type="password"], input[name="Passwd"]',
    { state: 'visible', timeout: 15000 }
  );

  if (!passwordInput) {
    // Mungkin ada error "Couldn't find your Google Account"
    const errorText = await page.$eval(
      '[class*="error"], [class*="Error"], .o6cuMc',
      el => el.textContent
    ).catch(() => null);
    if (errorText) throw new Error(`Google error: ${errorText}`);
    throw new Error('Input password Google tidak ditemukan');
  }

  await passwordInput.click();
  await sleep(200);
  await passwordInput.fill(password);
  await sleep(300);

  // Klik Next / tekan Enter
  const passNextBtn = await page.$('#passwordNext button, #passwordNext, button:has-text("Next")');
  if (passNextBtn) {
    await passNextBtn.click();
  } else {
    await page.keyboard.press('Enter');
  }
  log.step('Password diisi');

  // ── HANDLE CONSENT / CHALLENGES / REDIRECT ─────────────────
  // Setelah password, Google bisa menampilkan:
  // 1. OAuth consent screen ("Lanjutkan" / "Continue" / "Allow")
  // 2. Security challenge ("Verify it's you", "2-Step")
  // 3. Langsung redirect ke Kiro
  // Kita poll setiap 1.5 detik selama max 45 detik

  log.step('Menunggu consent/redirect...');
  const maxWait = 45000;
  const pollInterval = 1500;
  let elapsed = 0;
  let redirected = false;

  await sleep(2000); // Beri waktu halaman transisi

  while (elapsed < maxWait) {
    try {
      const currentUrl = page.url();

      // Cek apakah sudah redirect ke Kiro
      if (currentUrl.includes('app.kiro.dev') && !currentUrl.includes('signin')) {
        log.step('Berhasil redirect ke Kiro');
        redirected = true;
        break;
      }

      // Cek apakah ada tombol consent Google (Lanjutkan / Continue / Allow)
      const consentBtn = await page.$(
        'button:has-text("Lanjutkan"), button:has-text("Continue"), button:has-text("Allow"), ' +
        'button:has-text("Izinkan"), #submit_approve_access'
      );
      if (consentBtn) {
        log.step('Google OAuth consent screen ditemukan, klik Lanjutkan...');
        await consentBtn.click();
        await sleep(3000);
        // Setelah klik, tunggu redirect ke Kiro
        try {
          await page.waitForURL(/app\.kiro\.dev/, { timeout: 30000 });
          log.step('Berhasil redirect ke Kiro setelah consent');
          redirected = true;
        } catch {
          log.warn('Timeout setelah klik consent, cek URL...');
          if (page.url().includes('app.kiro.dev')) redirected = true;
        }
        break;
      }

      // Cek apakah ada security challenge
      const challengeText = await page.$eval(
        'h1, [role="heading"]',
        el => el.textContent?.trim()
      ).catch(() => '');

      if (challengeText && (
        challengeText.includes('Verify') ||
        challengeText.includes('verify') ||
        challengeText.includes('2-Step') ||
        challengeText.includes('Confirm') ||
        challengeText.includes('Verifikasi')
      )) {
        log.warn(`Google security challenge: "${challengeText}"`);
        log.warn('Menunggu 60 detik untuk manual resolve...');
        await page.waitForURL(/app\.kiro\.dev/, { timeout: 60000 });
        redirected = true;
        break;
      }
    } catch (pollErr) {
      // "Execution context was destroyed" berarti halaman sedang navigasi
      // Ini normal — tunggu sebentar lalu cek URL lagi
      log.step('Halaman sedang navigasi...');
      await sleep(2000);

      // Cek apakah sudah sampai di Kiro
      try {
        const newUrl = page.url();
        if (newUrl.includes('app.kiro.dev') && !newUrl.includes('signin')) {
          log.step('Berhasil redirect ke Kiro');
          redirected = true;
          break;
        }
      } catch {
        // Masih navigasi, lanjut polling
      }
    }

    await sleep(pollInterval);
    elapsed += pollInterval;
  }

  if (!redirected) {
    // Satu kali cek terakhir
    try {
      if (page.url().includes('app.kiro.dev')) {
        log.step('Berhasil redirect ke Kiro');
      } else {
        throw new Error('Gagal redirect ke Kiro setelah login Google (timeout)');
      }
    } catch (e) {
      if (e.message.includes('timeout')) throw e;
      throw new Error('Gagal redirect ke Kiro setelah login Google (timeout)');
    }
  }
}

// ─── INTERCEPT TOKEN DARI NETWORK ─────────────────────────────
function setupTokenInterceptor(page) {
  let capturedToken = null;

  page.on('response', async (response) => {
    const url = response.url();

    // Intercept endpoint auth/token dari Kiro / Cognito
    if (
      url.includes('auth.desktop.kiro.dev') ||
      url.includes('kiro.dev/api') ||
      url.includes('kiro.dev/auth') ||
      url.includes('/refreshToken') ||
      url.includes('/token') ||
      url.includes('cognito') ||
      url.includes('/oauth2/') ||
      url.includes('/session')
    ) {
      try {
        const ct = response.headers()['content-type'] || '';
        if (!ct.includes('json') && !ct.includes('text')) return;
        const body = await response.json().catch(() => null);
        if (body && (body.accessToken || body.access_token || body.refreshToken || body.refresh_token || body.id_token)) {
          log.step(`Token dicapture dari: ${url.slice(0, 80)}...`);
          capturedToken = body;
        }
      } catch (_) {}
    }
  });

  return {
    getToken: () => capturedToken,
    setToken: (t) => { capturedToken = t; },
  };
}

// ─── AMBIL TOKEN DARI STORAGE ─────────────────────────────────
async function extractTokenFromStorage(page, email) {
  try {
    // ── Prioritas 1: Ambil dari cookies (AccessToken, RefreshToken sudah ada) ──
    const cookies = await page.context().cookies();
    const cookieMap = {};
    cookies.forEach(c => { cookieMap[c.name] = c.value; });

    const accessToken  = cookieMap['AccessToken']  || cookieMap['accessToken']  || null;
    const refreshToken = cookieMap['RefreshToken'] || cookieMap['refreshToken'] || null;
    const xsrfToken    = cookieMap['XSRF-TOKEN']   || null;

    if (accessToken || refreshToken) {
      log.step(`Cookie auth ditemukan: ${cookies.filter(c =>
        c.name.toLowerCase().includes('token') || c.name.toLowerCase().includes('auth')
      ).map(c => c.name).join(', ')}`);
      return { accessToken, refreshToken, xsrfToken };
    }

    // ── Prioritas 2: Ambil dari localStorage ──────────────────────────────────
    const localData = await page.evaluate(() => {
      const result = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        result[k] = localStorage.getItem(k);
      }
      return result;
    });

    for (const [key, value] of Object.entries(localData)) {
      if (!value) continue;
      try {
        const parsed = JSON.parse(value);
        if (parsed && (parsed.accessToken || parsed.refreshToken || parsed.access_token)) {
          log.step(`Token ditemukan di localStorage key: ${key}`);
          return parsed;
        }
      } catch (_) {
        // raw string token?
        if (typeof value === 'string' && value.length > 100 && key.toLowerCase().includes('token')) {
          log.step(`Raw token di localStorage key: ${key}`);
          return { accessToken: value };
        }
      }
    }

    // ── Prioritas 3: Window object ────────────────────────────────────────────
    const winToken = await page.evaluate(() => {
      if (window.__kiro_token__) return window.__kiro_token__;
      if (window.__auth__) return window.__auth__;
      return null;
    });
    if (winToken) return winToken;

    // ── Prioritas 4: Kiro API session endpoint ────────────────────────────────
    log.step('Mencoba fetch token via Kiro API...');
    const apiToken = await page.evaluate(async () => {
      const endpoints = [
        '/api/auth/session', '/auth/session',
        '/api/auth/token',   '/api/user/token',
      ];
      for (const ep of endpoints) {
        try {
          const r = await fetch(ep, { credentials: 'include' });
          if (r.ok) {
            const data = await r.json();
            if (data && (data.accessToken || data.access_token || data.refreshToken)) return data;
          }
        } catch (_) {}
      }
      return null;
    });

    if (apiToken) return apiToken;

    return null;
  } catch (err) {
    log.warn(`Gagal ekstrak token dari storage: ${err.message}`);
    return null;
  }
}

// ─── PROSES SATU AKUN ─────────────────────────────────────────
async function processAccount(browser, account, idx, total) {
  const { email, password } = account;
  log.header(`[${idx}/${total}] ${email}`);

  // Skip jika sudah berhasil
  if (SKIP_DONE && isAlreadyDone(email)) {
    log.ok(`⏭️  ${email} — SUDAH BERHASIL SEBELUMNYA, skip`);
    return { success: true, email, skipped: true };
  }

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();
  const interceptor = setupTokenInterceptor(page);

  try {
    // ── 1. Buka halaman signin Kiro ──────────────────────────
    log.info('Membuka halaman Kiro signin...');
    await page.goto(KIRO_SIGNIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle').catch(() => {});
    await sleep(1500);

    // ── 2. Klik tombol Google ────────────────────────────────
    log.step('Mencari tombol Google SSO...');

    // Tombol Google sekarang cuma bertuliskan "Google"
    const googleBtn = await page.waitForSelector([
      'button:has-text("Google")',
      'a:has-text("Google")',
      '[data-provider="google"]',
      'button:has-text("Continue with Google")',
      'button:has-text("Sign in with Google")',
    ].join(', '), { state: 'visible', timeout: 15000 }).catch(() => null);

    if (!googleBtn) {
      await page.screenshot({ path: path.join(RESULTS_DIR, `${email.replace(/[@.]/g,'_')}_debug.png`) });

      const btns = await page.$$eval('button, a[role="button"], a[href]', els =>
        els.map(e => ({ tag: e.tagName, text: e.textContent?.trim()?.slice(0,50), href: e.href }))
      );
      log.warn(`Tombol Google tidak ditemukan. Elemen: ${JSON.stringify(btns.slice(0,10))}`);
      throw new Error('Tombol Google SSO tidak ditemukan');
    }

    log.step('Tombol Google ditemukan, klik...');

    // Google login Kiro menggunakan redirect (bukan popup)
    // Tapi kita handle kedua kasus untuk safety
    const popupPromise = context.waitForEvent('page', { timeout: 5000 }).catch(() => null);
    await googleBtn.click();
    await sleep(1000);

    const popup = await popupPromise;
    let loginPage = popup || page;

    if (popup) {
      log.step('Google login terbuka di popup');
      await popup.waitForLoadState('domcontentloaded');
    } else {
      log.step('Google login via redirect');
    }

    // ── 3. Handle Google login ────────────────────────────────
    log.info('Menangani Google login...');
    await handleGoogleLogin(loginPage, email, password);

    // ── 4. Tunggu home page load ──────────────────────────────
    log.info('Menunggu halaman Kiro home...');
    await page.bringToFront();

    // Tunggu URL kiro.dev (bukan signin)
    await page.waitForURL(url => {
      return url.hostname.includes('kiro.dev') && !url.pathname.includes('signin');
    }, { timeout: 30000 });

    await page.waitForLoadState('networkidle').catch(() => {});
    await sleep(2000); // Beri waktu React load & fetch token

    // ── 5. Ambil token ────────────────────────────────────────
    log.info('Mengambil token...');

    // Coba dari network interceptor dulu
    let tokenData = interceptor.getToken();

    // Kalau tidak dapat, coba dari storage
    if (!tokenData) {
      tokenData = await extractTokenFromStorage(page, email);
    }

    // Kalau masih tidak dapat, coba reload dan intercept lagi
    if (!tokenData) {
      log.step('Token belum didapat, mencoba reload...');
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForLoadState('networkidle').catch(() => {});
      await sleep(2000);
      tokenData = interceptor.getToken() || await extractTokenFromStorage(page, email);
    }

    // Coba sekali lagi dengan navigasi ke home
    if (!tokenData) {
      log.step('Masih belum dapat token, navigasi ke /home...');
      await page.goto('https://app.kiro.dev/home', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForLoadState('networkidle').catch(() => {});
      await sleep(2000);
      tokenData = interceptor.getToken() || await extractTokenFromStorage(page, email);
    }

    if (!tokenData) {
      // Screenshot final
      await page.screenshot({ path: path.join(RESULTS_DIR, `${email.replace(/[@.]/g,'_')}_ntoken.png`) });
      throw new Error('Gagal mendapatkan token');
    }

    // ── 6. Normalisasi format token (Kiro Desktop format) ─────
    const normalizedToken = {
      refreshToken: tokenData.refreshToken || tokenData.refresh_token || null,
      accessToken:  tokenData.accessToken  || tokenData.access_token  || null,
      profileArn:   tokenData.profileArn   || tokenData.profile_arn   || null,
      region:       tokenData.region       || 'us-east-1',
      expiresAt:    tokenData.expiresAt    || tokenData.expires_at     ||
                    new Date(Date.now() + 3600 * 1000).toISOString(),
    };

    log.ok(`Token didapat! Region: ${normalizedToken.region}`);
    if (normalizedToken.refreshToken) {
      log.step(`refreshToken: ${normalizedToken.refreshToken.slice(0,20)}...`);
    }
    if (normalizedToken.accessToken) {
      log.step(`accessToken: ${normalizedToken.accessToken.slice(0,20)}...`);
    }

    // ── 7. Simpan token ───────────────────────────────────────
    const tokenPath = saveToken(email, normalizedToken);

    // ── 8. Simpan refresh token ke RT.txt ─────────────────────
    if (normalizedToken.refreshToken) {
      fs.appendFileSync(RT_FILE, normalizedToken.refreshToken + '\n', 'utf8');
      log.ok(`RT disimpan ke RT.txt`);
    }

    // ── 9. Simpan hasil ───────────────────────────────────────
    saveResult(email, 'SUCCESS', normalizedToken);
    log.ok(`✅ ${email} — BERHASIL`);

    return { success: true, email, tokenPath };

  } catch (err) {
    log.error(`❌ ${email} — GAGAL: ${err.message}`);
    await page.screenshot({ path: path.join(RESULTS_DIR, `${email.replace(/[@.]/g,'_')}_error.png`) }).catch(() => {});
    saveResult(email, 'FAILED', null, err.message);
    return { success: false, email, error: err.message };

  } finally {
    await context.close();
  }
}

// ─── MAIN ─────────────────────────────────────────────────────
async function main() {
  log.header('KIRO AUTO-REGISTER BOT — Gmail SSO');
  console.log(`${C.gray}  Gateway: ${GATEWAY_DIR}${C.reset}`);
  console.log(`${C.gray}  Token dir: ${AWS_CACHE_DIR}${C.reset}`);

  ensureDirs();

  const accounts = loadAccounts();
  if (accounts.length === 0) {
    log.error('Tidak ada akun di accounts.txt!');
    log.info('Format: email@gmail.com:password (satu per baris)');
    process.exit(1);
  }

  log.info(`Ditemukan ${accounts.length} akun untuk diproses`);

  const browser = await chromium.launch({
    headless: HEADLESS,
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--start-maximized',
      '--disable-web-security',
    ],
  });

  const results = { success: [], failed: [], skipped: [] };

  for (let i = 0; i < accounts.length; i++) {
    const result = await processAccount(browser, accounts[i], i + 1, accounts.length);
    if (result.success) {
      if (result.skipped) results.skipped.push(result.email);
      else results.success.push(result.email);
    } else {
      results.failed.push({ email: result.email, error: result.error });
    }

    if (i < accounts.length - 1) {
      log.info(`Menunggu ${DELAY_BETWEEN_ACCOUNTS / 1000}s sebelum akun berikutnya...`);
      await sleep(DELAY_BETWEEN_ACCOUNTS);
    }
  }

  await browser.close();

  // ── SUMMARY ─────────────────────────────────────────────────
  log.header('SUMMARY');
  log.ok(`Berhasil : ${results.success.length}`);
  if (results.success.length > 0)
    results.success.forEach(e => log.step(`✅ ${e}`));

  if (results.skipped.length > 0) {
    log.info(`Skipped  : ${results.skipped.length}`);
    results.skipped.forEach(e => log.step(`⏭️  ${e}`));
  }

  if (results.failed.length > 0) {
    log.error(`Gagal    : ${results.failed.length}`);
    results.failed.forEach(r => log.step(`❌ ${r.email} — ${r.error}`));
  }

  // Simpan summary
  const summaryPath = path.join(RESULTS_DIR, `summary_${Date.now()}.json`);
  fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2), 'utf8');
  log.info(`Summary tersimpan: ${summaryPath}`);
}

main().catch(err => {
  log.error(`Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
