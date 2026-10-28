// pm2 config for a 1 GB server.  pm2 startOrReload ecosystem.config.cjs --update-env && pm2 save
//
// Memory plan (≈1 GB RAM + swap):
//   OS, sshd, nginx ............ ~150-200 MB
//   Node baseline .............. ~50 MB
//   JS heap (users, sessions) .. ≤ 256 MB   ← --max-old-space-size (only the heap!)
//   response cache (Buffers) ... ≤ 400 MB   ← CACHE_MAX_MB; Buffers live outside the heap, so the
//                                            heap flag does not limit them — the cache does it itself
//   RSS_SOFT_MB=700: above this the cache gives back half of its memory (no restart)
//   max_memory_restart=820M: last resort if something leaks
// Only ONE instance: the bot uses long polling, two copies would steal each other's updates.
module.exports = {
  apps: [
    {
      name: 'lingoup',
      script: 'server/main.js',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      node_args: ['--max-old-space-size=256', '--max-semi-space-size=16'],
      max_memory_restart: '820M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOST: '127.0.0.1',
        CACHE_MAX_MB: 400,
        DISK_CACHE_MAX_MB: 2048,
        RSS_SOFT_MB: 700,
        UV_THREADPOOL_SIZE: 2,
      },
      // graceful stop: the app saves the database and its Telegram copy on SIGINT
      kill_timeout: 10_000,
      wait_ready: true,
      listen_timeout: 15_000,
      autorestart: true,
      min_uptime: '20s',
      max_restarts: 30,
      exp_backoff_restart_delay: 200,
      time: true,
      merge_logs: true,
      out_file: './logs/out.log',
      error_file: './logs/error.log',
    },
  ],
};
