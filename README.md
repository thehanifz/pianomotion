# PianoMotion

Aplikasi **Web UI + Hybrid Python & Remotion** untuk mengunggah lagu piano (audio / MIDI), mengatur sensitivitas pembacaan not, melihat **preview langsung** (`1920x1080` @ `30 fps`, 88 tuts + Falling Notes + Spektrum Audio), dan me-render video `.mp4` langsung dari browser.

---

## Cara Menjalankan (Tanpa CLI Harian)

### Windows
Double-click file **[start-pianomotion.bat](file:///D:/pianomotion/start-pianomotion.bat)** (otomatis build UI bila belum ada, menyalakan server lokal di port `4000`, dan membuka browser ke `http://localhost:4000`).

### Linux / Server Produksi (Direct atau PM2 Background)
1. *(Opsional)* Salin template konfigurasi `.env`:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` sesuai kebutuhan (`PORT`, `HOST`, `REMOTION_CONCURRENCY`, `TORCH_NUM_THREADS`, `CHROMIUM_NO_SANDBOX`). Jika tidak diset, thread CPU & worker render memakai mode **auto-adaptif** sesuai jumlah core mesin/LXC.

2. **Jalankan langsung:**
   ```bash
   chmod +x start-pianomotion.sh
   ./start-pianomotion.sh
   ```

3. **Jalankan di background dengan PM2:**
   ```bash
   npm run app:build
   npm run pm2:start
   pm2 save
   ```
   Perintah PM2 lain: `npm run pm2:logs`, `npm run pm2:restart`, `npm run pm2:stop`.

* Untuk render video di server Linux headless (termasuk LXC CasaOS), pastikan dependensi shared library Chromium (`libnss3`, `libatk1.0-0`, `libgbm1`, `libasound2`, dll.) serta `ffmpeg` sudah terpasang.

### Development Mode
```bash
npm run app:dev
```
*(API berjalan di `:4000`, Vite UI dev server di `:5173` dengan proxy `/api`).*

---

## Alur Web UI
1. **Upload Lagu:** Mendukung `.mp3`, `.wav`, `.flac`, `.ogg`, `.m4a`, `.aac`, `.opus`, `.webm`, `.wma`, dan `.mid`/`.midi`.
2. **Atur Sensitivitas:** Pilih preset (**Ketat**, **Seimbang**, **Sensitif**) atau buka *Atur Detail* (`Min Velocity`, `Min Duration`, `Onset`, `Frame/Hold`, `Offset`, `Max Duration`).
3. **Proses Lagu:** Menjalankan transkripsi (`scripts/transcribe.py`) dengan progress bar real-time per segmen.
4. **Preview Interaktif (`@remotion/player`):** Putar visualisasi sinkron dengan audio langsung di browser; jika ubah filter velocity/durasi tanpa mengubah threshold model, **Terapkan Sensitivitas** bekerja instan dari file `.mid` yang sudah ada.
5. **Generate & Download MP4:** Klik **Generate Video (.mp4)** untuk render lewat `@remotion/renderer`, lalu klik **Download MP4**.

---

## Struktur Proyek

```text
D:\pianomotion\
├── start-pianomotion.bat     # Shortcut launcher Windows
├── start-pianomotion.sh      # Shortcut launcher Linux/Server
├── vite.config.ts            # Konfigurasi Vite untuk Web UI
├── server/                   # Backend Express + Job Queue + @remotion/renderer
├── web/                      # Frontend React + @remotion/player
├── src/                      # Komponen Remotion (88 tuts, Falling Notes, AudioSpectrum)
├── scripts/                  # Python transcriber (piano_transcription_inference) & MIDI helper
├── jobs/                     # Direktori kerja terisolasi per lagu yang diupload
├── data/                     # Sample/CLI notes.json & notes.mid
└── public/                   # Asset audio untuk Remotion Studio CLI (`npm run dev`)
```
