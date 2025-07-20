module.exports = {
  apps: [
    {
      name: 'hieubiet-net',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3011
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3011
      },
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm Z',
      merge_logs: true,
      time: true,
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
};
