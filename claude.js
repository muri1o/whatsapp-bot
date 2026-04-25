require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-6';
const CONTEXT_FILE = path.join(__dirname, 'context.md');

const bashTool = {
  name: 'bash',
  description: 'Execute a shell command in the sandbox and return its output',
  input_schema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command to execute' }
    },
    required: ['command']
  }
};

function runBash(command) {
  try {
    return execSync(command, { encoding: 'utf8', timeout: 30000 });
  } catch (err) {
    if (err.code === 'ETIMEDOUT') return 'Command timed out after 30 seconds';
    return err.stderr || err.message;
  }
}

function loadSystemPrompt() {
  try {
    const content = fs.readFileSync(CONTEXT_FILE, 'utf8').trim();
    return content || null;
  } catch {
    return null;
  }
}

async function chat(history, userMessage) {
  const messages = [...history, { role: 'user', content: userMessage }];
  const system = loadSystemPrompt();

  const requestParams = {
    model: MODEL,
    max_tokens: 4096,
    tools: [bashTool],
    messages
  };
  if (system) requestParams.system = system;

  let response = await client.messages.create(requestParams);

  const assistantMessages = [{ role: 'assistant', content: response.content }];

  while (response.stop_reason === 'tool_use') {
    const toolResults = response.content
      .filter(b => b.type === 'tool_use')
      .map(b => ({
        type: 'tool_result',
        tool_use_id: b.id,
        content: runBash(b.input.command)
      }));

    messages.push(...assistantMessages);
    assistantMessages.length = 0;
    messages.push({ role: 'user', content: toolResults });

    const loopParams = { model: MODEL, max_tokens: 4096, tools: [bashTool], messages };
    if (system) loopParams.system = system;
    response = await client.messages.create(loopParams);

    assistantMessages.push({ role: 'assistant', content: response.content });
  }

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n');

  return text;
}

async function extractSchedule(text) {
  const now = new Date().toISOString();
  const prompt = `Você é um parser de agendamentos. Analise a mensagem e extraia um agendamento se houver.

Data/hora atual (UTC): ${now}
Fuso horário do usuário: America/Sao_Paulo (UTC-3)

Retorne APENAS JSON válido (sem markdown, sem explicação) neste formato:
{"type":"once","runAt":"2026-04-24T16:00:00.000Z","cronExpr":null,"taskType":"message","task":"texto da tarefa","label":"descrição curta"}

Para recorrente:
{"type":"recurring","runAt":null,"cronExpr":"0 9 * * *","taskType":"shell","task":"comando","label":"descrição curta"}

Ou retorne exatamente: null

Regras:
- runAt deve estar em UTC
- taskType "shell" apenas se o usuário pedir para executar um comando
- Se não for um pedido de agendamento, retorne null

Mensagem: ${JSON.stringify(text)}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }]
  });

  const content = response.content.find(b => b.type === 'text')?.text?.trim();
  if (!content || content === 'null') return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

module.exports = { chat, extractSchedule };
