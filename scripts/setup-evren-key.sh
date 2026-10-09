#!/bin/bash
# EVREN'i 2. key (öncelikli) yap, Gemini'leri 3, 4, 5, 6'ya kaydır
#
# Önce:
#   .gemini-key2 = Gemini key (çalışıyor)
#   .gemini-key3 = Gemini key (429)
#   .gemini-key4 = Gemini key (429)
#   .gemini-key5 = Gemini key (çalışıyor)
#
# Sonra:
#   .evren-key   = EVREN API key (öncelik 1 — önce denenir)
#   .gemini-key3 = (eski key2) → fallback 1
#   .gemini-key4 = (eski key3) → fallback 2
#   .gemini-key5 = (eski key4) → fallback 3
#   .gemini-key6 = (eski key5) → fallback 4

set -e

EVREN_KEY="evren_llm_oyuYjrDCv8-mijCHVvWBWigNJUK7RqXMMAH25KoF4MY"

echo "=== MEVCUT KEY DOSYALARI ==="
ls -la /var/www/.gemini-key* /var/www/.evren-key 2>&1 | head -10

echo ""
echo "=== GEMINI KEY'LERİ KAYDIR (5→6, 4→5, 3→4, 2→3) ==="

# Ters sırayla kaydır — üstüne yazmayı önle
# .gemini-key5 → .gemini-key6
if [ -f /var/www/.gemini-key5 ]; then
  mv /var/www/.gemini-key5 /var/www/.gemini-key6
  echo "✓ .gemini-key5 → .gemini-key6"
fi

# .gemini-key4 → .gemini-key5
if [ -f /var/www/.gemini-key4 ]; then
  mv /var/www/.gemini-key4 /var/www/.gemini-key5
  echo "✓ .gemini-key4 → .gemini-key5"
fi

# .gemini-key3 → .gemini-key4
if [ -f /var/www/.gemini-key3 ]; then
  mv /var/www/.gemini-key3 /var/www/.gemini-key4
  echo "✓ .gemini-key3 → .gemini-key4"
fi

# .gemini-key2 → .gemini-key3
if [ -f /var/www/.gemini-key2 ]; then
  mv /var/www/.gemini-key2 /var/www/.gemini-key3
  echo "✓ .gemini-key2 → .gemini-key3"
fi

echo ""
echo "=== EVREN KEY'İ YAZ (.evren-key) ==="
echo -n "$EVREN_KEY" > /var/www/.evren-key
chmod 600 /var/www/.evren-key
echo "✓ /var/www/.evren-key yazıldı (key prefix: $(echo $EVREN_KEY | cut -c1-20)...)"

echo ""
echo "=== YENİ KEY YAPISI ==="
ls -la /var/www/.gemini-key* /var/www/.evren-key 2>&1

echo ""
echo "=== ENV GÜNCELLE (EVREN_API_BASE + EVREN_MODEL) ==="
# .env'e EVREN ayarları ekle (yoksa)
if ! grep -q "EVREN_API_BASE" /var/www/.env 2>/dev/null; then
  cat >> /var/www/.env << 'EOF'

# EVREN LLM API (öncelik 1 — Gemini'den önce denenir)
EVREN_API_BASE=https://api.evren.ai/v1
EVREN_MODEL=evren-llm
EOF
  echo "✓ .env'e EVREN_API_BASE + EVREN_MODEL eklendi"
else
  echo "ℹ EVREN ayarları zaten .env'de var"
fi

echo ""
echo "=== PM2 ENV YENİLE ==="
pm2 restart trgundem --update-env
echo "✓ PM2 env yenilendi"

echo ""
echo "=== TEST: EVREN KEY OKUNABİLİYOR MU? ==="
if [ -f /var/www/.evren-key ]; then
  echo "✓ /var/www/.evren-key var"
  echo "  Key prefix: $(cat /var/www/.evren-key | cut -c1-25)..."
else
  echo "✗ .evren-key bulunamadı"
fi

echo ""
echo "=== BİLGİ ==="
echo "EVREN API base URL ve model adını doğrula:"
echo "  EVREN_API_BASE: $(grep EVREN_API_BASE /var/www/.env | cut -d= -f2)"
echo "  EVREN_MODEL: $(grep EVREN_MODEL /var/www/.env | cut -d= -f2)"
echo ""
echo "Eğer EVREN API URL'si farklıysa (örn. https://evren.ai/api/v1), .env'i güncelle:"
echo "  nano /var/www/.env"
echo "  EVREN_API_BASE=https://... (değiştir)"
echo "  pm2 restart trgundem --update-env"
