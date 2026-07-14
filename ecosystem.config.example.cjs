/**
 * PM2 example config. Copy to `ecosystem.config.cjs` (gitignored) and inject
 * secrets via the environment or a process manager — never hardcode them here.
 *
 *   cp ecosystem.config.example.cjs ecosystem.config.cjs
 *   pm2 start ecosystem.config.cjs
 */
module.exports = {
  apps: [
    {
      name: 'tharaa-api',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      // Load variables from the local `.env` file (not committed).
      // Alternatively export vars in the shell / host before `pm2 start`.
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
