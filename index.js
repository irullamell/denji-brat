import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import ffmpeg from '@ffmpeg-installer/ffmpeg';

const exec = promisify(execFile);

const TEMP_BASE = path.resolve('temp'); // Folder lokal di root

if (!fs.existsSync(TEMP_BASE)) fs.mkdirSync(TEMP_BASE, { recursive: true });

export default async function handler(req, res) {
  const { text } = req.query;
  const route = req.url.split('?')[0];
  if (!text) return res.status(400).json({ error: 'Parameter "text" wajib diisi.' });

  const requestId = Date.now();
  const tempDir = path.join(TEMP_BASE, `request-${requestId}`);
  fs.mkdirSync(tempDir);

  const cleanup = () => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      console.warn('Gagal hapus temp:', e);
    }
  };

  try {
    if (route === '/' || route === '') {
      const r = await axios.get(`https://aqul-brat.hf.space/api/brat?text=${encodeURIComponent(text)}`, {
        responseType: 'arraybuffer'
      });
      const out = path.join(tempDir, `brat.mp4`);
      fs.writeFileSync(out, r.data);
      res.setHeader('Content-Type', 'video/mp4');
      return res.sendFile(out, () => cleanup());
    }

    if (route === '/animated') {
      const words = text.split(' ');
      const frames = [];

      for (let i = 0; i < words.length; i++) {
        const t = words.slice(0, i + 1).join(' ');
        const r = await axios.get(`https://aqul-brat.hf.space/api/brat?text=${encodeURIComponent(t)}`, {
          responseType: 'arraybuffer'
        });
        const f = path.join(tempDir, `frame${i}.mp4`);
        fs.writeFileSync(f, r.data);
        frames.push(f);
      }

      const list = frames.map(f => `file '${f.replace(/\\/g, '/')}'\nduration 0.5`).join('\n') +
        `\nfile '${frames[frames.length - 1].replace(/\\/g, '/')}'\nduration 2\n`;

      const listPath = path.join(tempDir, 'list.txt');
      fs.writeFileSync(listPath, list);

      const output = path.join(tempDir, 'output.mp4');
      await exec(ffmpeg.path, [
        '-y', '-f', 'concat', '-safe', '0',
        '-i', listPath,
        '-vf', 'fps=30',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-pix_fmt', 'yuv420p',
        output
      ]);

      res.setHeader('Content-Type', 'video/mp4');
      return res.sendFile(output, () => cleanup());
    }

    return res.status(404).json({ error: 'Endpoint tidak ditemukan.' });
  } catch (err) {
    console.error(err);
    cleanup();
    return res.status(500).json({ error: 'Terjadi kesalahan saat proses', detail: err.message });
  }
}
