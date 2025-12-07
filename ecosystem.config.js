module.exports = {
  apps: [
    {
      name: 'backend-api',
      script: './bin/www',
      // Run multiple instances for better CPU utilization behind Nginx
      instances: process.env.PM2_INSTANCES || 'max',
      exec_mode: 'cluster',

      // Load environment variables from .env
      env_file: '.env',

      // Use only .env via env_file; no inline env overrides

      // Stability & lifecycle
      watch: false,
      max_memory_restart: process.env.PM2_MAX_MEM || '512M',
      listen_timeout: 10000,
      kill_timeout: 5000,
      autorestart: true,
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 2000,
      exp_backoff_restart_delay: 100,

      // Logs (merged, timestamped). Nginx will proxy to PORT above.
      time: true,
      merge_logs: true,
      out_file: './logs/pm2-out.log',
      error_file: './logs/pm2-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    // Optional: manage Redis with PM2 (uncomment if you want PM2 to run Redis)
    // {
    //   name: 'redis-server',
    //   script: 'redis-server',
    //   args: '--protected-mode yes --port 6379',
    //   exec_mode: 'fork',
    //   autorestart: true,
    //   time: true,
    //   merge_logs: true,
    //   out_file: './logs/redis-out.log',
    //   error_file: './logs/redis-error.log'
    // }
  ]
};


