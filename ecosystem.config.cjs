// PM2 Ecosystem — trgundem
//
// Kullanım:
//   cd /var/www/.next/standalone
//   pm2 start /var/www/ecosystem.config.cjs
//   pm2 restart trgundem
//
// ENV'leri buradan okur (process.env), bu yüzden .env dosyasını source et:
//   set -a; source /var/www/.env; set +a
//   pm2 restart trgundem
//
// Veya her restart'ta otomatik yüklenmesi için:
//   pm2 start ecosystem.config.cjs
//   pm2 save
//   pm2 startup

module.exports = {
  apps: [
    {
      name: 'trgundem',
      script: 'server.js',
      cwd: '/var/www/.next/standalone',
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        // SMTP ayarları .env'den otomatik alınmaz — burada explicit veriyoruz
        SMTP_HOST: process.env.SMTP_HOST || 'mail.trgundem.net',
        SMTP_PORT: process.env.SMTP_PORT || '465',
        SMTP_USER: process.env.SMTP_USER || 'temsilci@trgundem.net',
        SMTP_PASS: process.env.SMTP_PASS || 'Merhaba135791315',
        SMTP_FROM: process.env.SMTP_FROM || 'temsilci@trgundem.net',
        ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'Trgundem123',
        DATABASE_URL: process.env.DATABASE_URL || 'file:/var/www/db/custom.db',
      },
    },
  ],
};
