const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './test/e2e',
  reporter: [['html', { open: 'never' }], ['list']],
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'node index.js',
    port: 3000,
    reuseExistingServer: false,
    timeout: 15000,
    env: {
      TWILIO_ACCOUNT_SID: 'ACtest00000000000000000000000000000',
      TWILIO_AUTH_TOKEN: 'test',
      TWILIO_WHATSAPP_NUMBER: '+15550000000',
      AUTHORIZED_NUMBER: '5511999999999',
      ANTHROPIC_API_KEY: 'test',
      PORT: '3000',
    },
  },
});
