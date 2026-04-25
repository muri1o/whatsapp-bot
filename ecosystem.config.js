module.exports = {
  apps: [{
    name: 'whatsapp-bot',
    script: 'index.js',
    cwd: __dirname,
    restart_delay: 10000,
    max_restarts: 20,
    min_uptime: '10s',
    watch: false,
    env: { NODE_ENV: 'production' }
  }]
};
