const path = require('node:path');
const root = __dirname;

module.exports = {
  apps: [
    {
      name: 'heisenberg-poker',
      cwd: root,
      script: path.join(root, 'server/src/index.js'),
      env: { NODE_ENV: 'production' },
      error_file: path.join(root, 'logs/error.log'),
      out_file: path.join(root, 'logs/out.log'),
      time: true,
    },
  ],
};
