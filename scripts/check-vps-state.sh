#!/bin/bash
# VPS'te kaybolan ne var kontrol et
echo "=== LOGO DOSYALARI ==="
ls -la /var/www/public/logo_TRG* 2>&1
ls -la /var/www/.next/standalone/public/logo_TRG* 2>&1

echo ""
echo "=== NGINX CONFIG — logo referansları ==="
grep -n "logo_TRG" /etc/nginx/sites-enabled/* 2>&1
echo ""
echo "nginx reload gerekli mi:"
grep -c "logo_TRG" /etc/nginx/sites-enabled/* 2>&1

echo ""
echo "=== PIPELINE DURUMU ==="
echo "Tarih kuralı (Eski hatalı mı yeni düzeltilmiş mi?):"
grep -A1 "5 Ekim 2026" /var/www/scripts/pipeline-all.js | head -3
echo ""
echo "Plagiarizm kuralı (4 mu 6 mı?):"
grep -E "(4|6) kelimelik ardışık" /var/www/scripts/pipeline-all.js | head -3
echo ""
echo "2/3 cümle örtüşmesi var mı:"
grep -c "2/3" /var/www/scripts/pipeline-all.js
echo ""
echo "SON DAKIKA baslik temizleme var mı:"
grep -c "BAŞLIK temizliği" /var/www/scripts/pipeline-all.js

echo ""
echo "=== GIT DURUMU ==="
cd /var/www
git log --oneline -3
echo ""
echo "Local commit'ler (origin/main'in üstünde kalanlar):"
git log --oneline origin/main..HEAD 2>&1 | head -10
echo ""
echo "Modified (commit edilmemiş değişiklikler):"
git status --short | head -20

echo ""
echo "=== PM2 DURUMU ==="
pm2 list 2>&1 | head -10

echo ""
echo "=== CRON DURUMU ==="
crontab -l 2>&1 | grep -v "^#" | grep -v "^$" | head -10
