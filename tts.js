const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VOICE = 'pt-BR-FranciscaNeural';
const TTS_DIR = '/tmp/whatsapp-tts';

if (!fs.existsSync(TTS_DIR)) fs.mkdirSync(TTS_DIR, { recursive: true });

function textToSpeech(text) {
  const id = crypto.randomUUID().slice(0, 8);
  const outputPath = path.join(TTS_DIR, `tts_${id}.mp3`);

  const script = [
    'import asyncio, edge_tts, sys',
    'text = sys.stdin.read()',
    'asyncio.run(edge_tts.Communicate(text, sys.argv[1]).save(sys.argv[2]))',
  ].join('\n');

  const result = spawnSync('python3', ['-c', script, VOICE, outputPath], {
    input: text,
    encoding: 'utf8',
    timeout: 30000,
  });

  if (result.signal === 'SIGTERM') {
    throw new Error('TTS timeout: edge-tts demorou mais de 30s');
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || 'edge-tts falhou');
  }
  if (!fs.existsSync(outputPath)) {
    throw new Error('Arquivo de áudio não encontrado após TTS');
  }

  return outputPath;
}

module.exports = { textToSpeech };
