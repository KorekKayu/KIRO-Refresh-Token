# 🤖 KIRO Auto-Register Bot — Gmail SSO

Bot otomatis untuk registrasi akun [Kiro](https://kiro.dev) via Google SSO menggunakan Playwright.

> **⚠️ Proyek ini dibuat untuk tujuan pembelajaran dan riset otomasi browser. Gunakan secara bertanggung jawab.**

---

## 📋 Fitur

- ✅ Login otomatis via Google SSO (redirect flow)
- ✅ Handle Google OAuth consent screen (`Lanjutkan` / `Continue`)
- ✅ Handle security challenge dengan fallback manual (60s timeout)
- ✅ Intercept token dari network response & cookies
- ✅ Simpan `refreshToken` dan `accessToken` per akun
- ✅ Kumpulkan semua refresh token di `RT.txt`
- ✅ Skip akun yang sudah berhasil (tidak proses ulang)
- ✅ Screenshot otomatis saat error untuk debugging
- ✅ Log berwarna di terminal

---

## 📁 Struktur Folder

```
KIRO/
├── index.js            # Script utama bot
├── accounts.txt        # Daftar akun (email:password)
├── RT.txt              # Kumpulan refresh token (1 per baris)
├── START_BOT.bat       # Launcher Windows
├── package.json        # Dependencies
├── results/            # Hasil per akun (JSON + screenshot)
│   ├── token_*.json    # Token per akun
│   ├── *_error.png     # Screenshot error
│   └── summary_*.json  # Ringkasan batch
└── ress/               # Hasil lama (arsip)
```

---

## ⚙️ Instalasi

### Prasyarat

- [Node.js](https://nodejs.org/) v18+
- npm (sudah termasuk di Node.js)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Install browser Playwright (Chromium)
npx playwright install chromium
```

---

## 🚀 Cara Pakai

### 1. Isi `accounts.txt`

Format: `email:password` — satu akun per baris.

```
email1@gmail.com:password123
email2@domain.com:mypassword
```

### 2. Jalankan Bot

**Opsi A** — Via terminal:

```bash
node index.js
```

**Opsi B** — Via batch file (Windows):

```
Klik 2x START_BOT.bat
```

### 3. Hasil

- Token per akun tersimpan di `results/token_*.json`
- Semua refresh token terkumpul di `RT.txt`
- Summary batch di `results/summary_*.json`

---

## ⚙️ Konfigurasi

Edit bagian `CONFIG` di `index.js`:

| Variable | Default | Deskripsi |
|---|---|---|
| `DELAY_BETWEEN_ACCOUNTS` | `3000` | Delay antar akun (ms) |
| `HEADLESS` | `false` | `true` = tanpa tampilan browser |
| `SKIP_DONE` | `true` | Skip akun yang sudah SUCCESS |

---

## 🔧 Flow Bot

```
1. Buka app.kiro.dev/signin
2. Klik tombol "Google"
3. Isi email di Google login
4. Isi password
5. Klik "Lanjutkan" di consent screen
6. Tunggu redirect ke Kiro
7. Ambil token dari cookies (AccessToken, RefreshToken)
8. Simpan ke results/ dan RT.txt
9. Lanjut akun berikutnya
```

---

## 🐛 Troubleshooting

| Error | Solusi |
|---|---|
| `Tombol Google SSO tidak ditemukan` | Cek koneksi internet, halaman Kiro mungkin berubah |
| `Input email Google tidak ditemukan` | Google mungkin menampilkan CAPTCHA, coba kurangi jumlah akun |
| `Google security challenge` | Bot akan tunggu 60s — selesaikan verifikasi manual di browser |
| `Gagal mendapatkan token` | Login berhasil tapi token tidak terdeteksi, coba reload |

---

## 📦 Dependencies

| Package | Fungsi |
|---|---|
| `playwright` | Browser automation |
| `dotenv` | Environment variables |
| `chalk` | Terminal coloring |

---

## 📄 Lisensi

Lihat [LICENSE](LICENSE) — Hanya untuk pembelajaran dan riset.
