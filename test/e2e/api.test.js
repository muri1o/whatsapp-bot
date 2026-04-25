const { test, expect } = require('@playwright/test');

test('GET /health retorna 200 e status ok', async ({ request }) => {
  const res = await request.get('/health');
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ status: 'ok' });
});

test('POST /webhook corpo vazio retorna 200', async ({ request }) => {
  const res = await request.post('/webhook', { form: {} });
  expect(res.status()).toBe(200);
});

test('POST /webhook de número não autorizado retorna 200', async ({ request }) => {
  const res = await request.post('/webhook', {
    form: { From: 'whatsapp:+5511000000000', Body: 'hello' },
  });
  expect(res.status()).toBe(200);
});

test('GET /media com path traversal retorna 400', async ({ request }) => {
  const res = await request.get('/media/..%2F..%2Fetc%2Fpasswd');
  expect(res.status()).toBe(400);
});
