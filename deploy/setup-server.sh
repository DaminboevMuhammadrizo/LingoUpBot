#!/usr/bin/env bash
# One-time server setup (Ubuntu/Debian, run as root):
#   REPO=git@github.com:you/LingoUpBot.git DOMAIN=app.example.uz bash setup-server.sh
# Installs Node 20, pm2 (+ log rotation, boot start), nginx, swap; clones the project to /var/www/bot/lingoup.
set -euo pipefail
: "${REPO:?set REPO=git url}"
: "${DOMAIN:?set DOMAIN=your domain}"
APP_DIR="${APP_DIR:-/var/www/bot/lingoup}"
APP_USER="${APP_USER:-lingoup}"

apt-get update -y
apt-get install -y curl git nginx ca-certificates
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
npm install -g pm2

# swap: a safety net only (the app keeps itself inside RAM); swappiness 10 = use it as late as possible
if ! swapon --show | grep -q .; then
  fallocate -l 5G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
sysctl -w vm.swappiness=10 vm.vfs_cache_pressure=50
printf 'vm.swappiness=10\nvm.vfs_cache_pressure=50\n' > /etc/sysctl.d/99-lingoup.conf

id "$APP_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash "$APP_USER"
mkdir -p "$APP_DIR" && chown "$APP_USER:$APP_USER" "$APP_DIR"
sudo -u "$APP_USER" bash -c "[ -d '$APP_DIR/.git' ] || git clone --depth 1 '$REPO' '$APP_DIR'"

# pm2: start on boot, rotate logs (10 MB × 5)
sudo -u "$APP_USER" pm2 install pm2-logrotate
sudo -u "$APP_USER" pm2 set pm2-logrotate:max_size 10M
sudo -u "$APP_USER" pm2 set pm2-logrotate:retain 5
sudo -u "$APP_USER" pm2 set pm2-logrotate:compress true
env PATH="$PATH" pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER"

sed "s/__DOMAIN__/$DOMAIN/g" "$APP_DIR/deploy/nginx.conf" > /etc/nginx/sites-available/lingoup
ln -sf /etc/nginx/sites-available/lingoup /etc/nginx/sites-enabled/lingoup
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo
echo "Next:"
echo "  1) $APP_DIR/.env  (cp .env.example .env, fill it in; WEBAPP_URL=https://$DOMAIN/)"
echo "  2) https: Cloudflare (proxied DNS, SSL Full) or: apt install certbot python3-certbot-nginx && certbot --nginx -d $DOMAIN"
echo "  3) sudo -u $APP_USER bash $APP_DIR/deploy/deploy.sh"
