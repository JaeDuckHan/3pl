# 3PL Web Deployment Standard

## Runtime standard
- App path: `/var/www/3pl`
- PM2 app name: `3pl-web`
- Next.js port: `3000`
- Nginx upstream: `127.0.0.1:3000`
- Domain: `3pl.kowinsblue.com`

## 1) Deploy latest source
```bash
cd /var/www/3pl
git fetch --all
git reset --hard origin/main
rm -rf .next
npm ci
npm run build
```

## 2) Run with PM2
```bash
sudo mkdir -p /var/log/3pl-web
sudo chown -R $USER:$USER /var/log/3pl-web
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

## 3) Nginx reverse proxy
`/etc/nginx/sites-available/3pl.kowinsblue.com`:

```nginx
server {
  listen 80;
  server_name 3pl.kowinsblue.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Apply:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 4) HTTPS (certbot)
```bash
sudo certbot --nginx -d 3pl.kowinsblue.com
sudo certbot renew --dry-run
```

## 5) Health check
```bash
pm2 list
pm2 logs 3pl-web --lines 100
curl -I http://127.0.0.1:3000
curl -I https://3pl.kowinsblue.com
```
