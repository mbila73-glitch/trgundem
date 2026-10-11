// SMTP test scripti — nodemailer ile mail gönderir
// Kullanım: node /home/z/my-project/scripts/test-smtp.js

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// .env oku
const envPath = '/var/www/.env';
try {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const idx = line.indexOf('=');
    if (idx > 0) {
      process.env[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
    }
  });
} catch (e) {
  console.log('⚠ .env okunamadı, hardcoded değerler kullanılacak');
}

const HOST = process.env.SMTP_HOST || 'mail.trgundem.net';
const PORT = parseInt(process.env.SMTP_PORT || '465', 10);
const USER = process.env.SMTP_USER || 'temsilci@trgundem.net';
const PASS = process.env.SMTP_PASS || 'Merhaba135791315';
const FROM = process.env.SMTP_FROM || USER;

console.log('=== SMTP TEST ===');
console.log('Host:', HOST);
console.log('Port:', PORT);
console.log('User:', USER);
console.log('Pass:', PASS ? '***' : '(yok)');
console.log('From:', FROM);
console.log('');

async function test() {
  // Test 1: 465 (SSL)
  console.log('--- Test 1: Port 465 (SSL) ---');
  try {
    const transport465 = nodemailer.createTransport({
      host: HOST,
      port: 465,
      secure: true,
      auth: { user: USER, pass: PASS },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });
    
    console.log('  Bağlanıyor...');
    await transport465.verify();
    console.log('  ✓ SMTP 465 bağlantı başarılı!');
    
    console.log('  Mail gönderiliyor...');
    const info = await transport465.sendMail({
      from: FROM,
      to: USER, // kendine gönder
      subject: '[TEST] TRGUNDEM SMTP Test - 465',
      text: 'Bu bir test mesajıdır. 465 portu ile gönderildi.\n\nTarih: ' + new Date().toISOString(),
      html: '<h2>SMTP Test</h2><p>Bu mesaj 465 portu ile gönderildi.</p><p>Tarih: ' + new Date().toISOString() + '</p>',
    });
    console.log('  ✓ Mail gönderildi! MessageId:', info.messageId);
    console.log('  Response:', info.response);
    return;
  } catch (e) {
    console.log('  ✗ Hata:', e.message);
    console.log('  Code:', e.code || '(yok)');
  }

  // Test 2: 587 (TLS)
  console.log('');
  console.log('--- Test 2: Port 587 (TLS) ---');
  try {
    const transport587 = nodemailer.createTransport({
      host: HOST,
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: USER, pass: PASS },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });
    
    console.log('  Bağlanıyor...');
    await transport587.verify();
    console.log('  ✓ SMTP 587 bağlantı başarılı!');
    
    console.log('  Mail gönderiliyor...');
    const info = await transport587.sendMail({
      from: FROM,
      to: USER,
      subject: '[TEST] TRGUNDEM SMTP Test - 587',
      text: 'Bu bir test mesajıdır. 587 portu ile gönderildi.\n\nTarih: ' + new Date().toISOString(),
      html: '<h2>SMTP Test</h2><p>Bu mesaj 587 portu ile gönderildi.</p><p>Tarih: ' + new Date().toISOString() + '</p>',
    });
    console.log('  ✓ Mail gönderildi! MessageId:', info.messageId);
    return;
  } catch (e) {
    console.log('  ✗ Hata:', e.message);
    console.log('  Code:', e.code || '(yok)');
  }

  // Test 3: 25 (plain)
  console.log('');
  console.log('--- Test 3: Port 25 (plain) ---');
  try {
    const transport25 = nodemailer.createTransport({
      host: HOST,
      port: 25,
      secure: false,
      auth: { user: USER, pass: PASS },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });
    
    console.log('  Bağlanıyor...');
    await transport25.verify();
    console.log('  ✓ SMTP 25 bağlantı başarılı!');
  } catch (e) {
    console.log('  ✗ Hata:', e.message);
    console.log('  Code:', e.code || '(yok)');
  }

  console.log('');
  console.log('=== SONUÇ ===');
  console.log('Hiçbir port çalışmadı. Olası sebepler:');
  console.log('1. mail.trgundem.net yanlış host (hosting panelinden MX/SMTP sunucu adını kontrol et)');
  console.log('2. Hosting dış SMTP bağlantılarını engelliyor');
  console.log('3. Şifre yanlış');
  console.log('4. Hosting hesabında SMTP yetkisi yok');
}

test().catch(e => {
  console.log('FATAL:', e.message);
  process.exit(1);
});
