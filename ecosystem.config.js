module.exports = {
  apps: [{
    name: 'heisenberg-poker',
    script: 'server/src/index.js',
    cwd: '/home/sven/poker',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
    },
    error_file: '/home/sven/poker/logs/error.log',
    out_file: '/home/sven/poker/logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }]
};
