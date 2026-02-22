module.exports = {
  apps: [
    {
      name: "3pl-web",
      cwd: "/var/www/3pl",
      script: "npm",
      args: "run start -- -p 3000",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      out_file: "/var/log/3pl-web/out.log",
      error_file: "/var/log/3pl-web/error.log",
      time: true,
    },
  ],
};
