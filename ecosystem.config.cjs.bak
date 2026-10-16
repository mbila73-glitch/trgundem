// PM2 Ecosystem — trgundem
//
// Kullanım:
//   pm2 delete trgundem
//   pm2 start /var/www/ecosystem.config.cjs
//   pm2 save
//   pm2 startup
//
// .env dosyası runtime'da okunur ve PM2 env'ine enjekte edilir
// Build'e gerek yok — env değişiklikleri için sadece `pm2 restart trgundem --update-env` yeterli

const fs = require('fs');

// /var/www/.env dosyasını oku, key=value satırlarını parse et
function loadEnvFile() {
  const envPath = '/var/www/.env';
  const vars = {};
  try {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.substring(0, idx).trim();
        // Değeri temizle: baş/son tırnakları kaldır
        let val = trimmed.substring(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (key.length > 0) vars[key] = val;
      }
    });
  } catch (e) {
    console.warn('[ecosystem] .env okunamadı:', e.message);
  }
  return vars;
}

const dotenvVars = loadEnvFile();

module.exports = {
  apps: [
    {
      name: 'trgundem',
      script: 'server.js',
      cwd: '/var/www/.next/standalone',
      instances: 1,
      exec_mode: 'fork',  // Next.js standalone cluster modda çöküyor — fork zorunlu
      autorestart: true,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        // /var/www/.env'deki tüm değişkenler runtime'da enjekte edilir
        // GOOGLE_API_KEY, GOOGLE_CSE_ID, GEMINI_API_KEY*, SMTP_*, ADMIN_PASSWORD vb.
        ...dotenvVars,
        // Explicit defaults (.env'de yoksa bu değerler kullanılır)
        SMTP_HOST: dotenvVars.SMTP_HOST || 'mail.trgundem.net',
        SMTP_PORT: dotenvVars.SMTP_PORT || '465',
        SMTP_USER: dotenvVars.SMTP_USER || 'temsilci@trgundem.net',
        SMTP_PASS: dotenvVars.SMTP_PASS || 'Merhaba135791315',
        SMTP_FROM: dotenvVars.SMTP_FROM || 'temsilci@trgundem.net',
        ADMIN_PASSWORD: dotenvVars.ADMIN_PASSWORD || 'Trgundem123',
        DATABASE_URL: dotenvVars.DATABASE_URL || 'file:/var/www/db/custom.db',
      },
    },
  ],
};
