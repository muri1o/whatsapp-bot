const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const WHISPER_MODEL = 'small';
const TMP_DIR = '/tmp/whatsapp-audio';

// Garante que o diretório temporário existe
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

function downloadFile(url, destPath, authHeader) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const options = {
      headers: authHeader ? { Authorization: authHeader } : {}
    };

    const req = protocol.get(url, options, (res) => {
      // Segue redirecionamentos
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
        return downloadFile(res.headers.location, destPath, authHeader)
          .then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`Download falhou: HTTP ${res.statusCode}`));
      }

      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Timeout ao baixar áudio'));
    });
  });
}

async function transcribeAudio(mediaUrl) {
  const timestamp = Date.now();
  const inputPath = path.join(TMP_DIR, `audio_${timestamp}.ogg`);
  const outputPath = path.join(TMP_DIR, `audio_${timestamp}.txt`);

  try {
    console.log('[transcriber] Baixando áudio:', mediaUrl);

    // Autenticação básica do Twilio para acessar o arquivo de mídia
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    await downloadFile(mediaUrl, inputPath, authHeader);
    console.log('[transcriber] Áudio baixado em:', inputPath);

    // Transcreve com Whisper
    console.log('[transcriber] Transcrevendo com Whisper modelo:', WHISPER_MODEL);
    execSync(
      `whisper "${inputPath}" --model ${WHISPER_MODEL} --language pt --output_format txt --output_dir ${TMP_DIR}`,
      { timeout: 120000, encoding: 'utf8' }
    );

    // Whisper gera o arquivo com o mesmo nome do input mas extensão .txt
    const baseName = path.basename(inputPath, '.ogg');
    const whisperOutput = path.join(TMP_DIR, `${baseName}.txt`);

    if (!fs.existsSync(whisperOutput)) {
      throw new Error('Arquivo de transcrição não encontrado');
    }

    const transcription = fs.readFileSync(whisperOutput, 'utf8').trim();
    console.log('[transcriber] Transcrição:', transcription);

    return transcription;

  } finally {
    // Limpa arquivos temporários
    try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); } catch {}
    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}
  }
}

module.exports = { transcribeAudio };
