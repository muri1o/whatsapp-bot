require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const { handleMessage, sendMessage } = require('./bot.js');
const { chat } = require('./claude.js');
const scheduler = require('./scheduler.js');
const { transcribeAudio } = require('./transcriber.js');

const app = express();
app.use(express.urlencoded({ extended: false }));

const AUTHORIZED_NUMBER = `whatsapp:+${process.env.AUTHORIZED_NUMBER}`;

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

app.get('/media/:filename', (req, res) => {
  const filename = req.params.filename;
  if (!/^[\w.-]+$/.test(filename)) return res.status(400).send('Invalid filename');
  const filePath = path.join('/tmp/whatsapp-tts', filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.sendFile(filePath);
});

app.post('/webhook', async (req, res) => {
  const from = req.body.From;
  let body = (req.body.Body || '').trim();
  const mediaUrl = req.body.MediaUrl0;
  const mediaType = req.body.MediaContentType0 || '';

  console.log('Received from:', from, '| Expected:', AUTHORIZED_NUMBER, '| Match:', from === AUTHORIZED_NUMBER);

  res.status(200).send('');

  if (from !== AUTHORIZED_NUMBER) return;

  // Detecta áudio e transcreve
  if (mediaUrl && mediaType.startsWith('audio/')) {
    console.log('[webhook] Áudio recebido:', mediaType, mediaUrl);
    try {
      await sendMessage(from, '🎙️ Transcrevendo áudio...');
      const transcription = await transcribeAudio(mediaUrl);
      if (!transcription) {
        await sendMessage(from, '❌ Não consegui entender o áudio. Tente novamente.');
        return;
      }
      console.log('[webhook] Transcrição:', transcription);
      await sendMessage(from, `🎙️ _"${transcription}"_`);
      body = transcription;
    } catch (err) {
      console.error('[webhook] Erro ao transcrever:', err);
      await sendMessage(from, '❌ Erro ao processar o áudio. Tente novamente.');
      return;
    }
  }

  if (!body) return;

  await handleMessage(from, body);
});

app.listen(3000, '0.0.0.0', () => {
  console.log('Bot online! Webhook em http://0.0.0.0:3000/webhook');
  console.log('Configure no Twilio: https://console.twilio.com → Messaging → Sandbox → Webhook URL');
  scheduler.init(sendMessage, chat);
});
