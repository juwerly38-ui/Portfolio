module.exports = {
  apps: [
    {
      name: 'webapp',
      script: 'npx',
      args: 'serve -s . -l 3000',
      cwd: '/home/user/webapp',
      env: { NODE_ENV: 'production' },
      watch: false,
      instances: 1,
      exec_mode: 'fork'
    }
  ]
}
