const path = require('node:path');

module.exports = {
  apps: [
    {
      name: 'pianomotion',
      script: path.join(__dirname, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
      args: 'server/index.ts',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
