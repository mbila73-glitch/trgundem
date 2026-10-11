#!/bin/bash
# Güvenilen siteler test script'i
# Her sitenin arama URL'ini deneyip HTTP durum kodunu ve haber link sayısını raporlar
# Kullanım: bash scripts/test-trusted-sites.sh

QUERY="Erdoğan"
ENCODED=$(echo "$QUERY" | python3 -c "import urllib.parse; print(urllib.parse.quote(input()))")

SITES=(
  "Evrensel|https://www.evrensel.net/ara?q="
  "BirGün|https://www.birgun.net/arama?q="
  "Sol Haber|https://haber.sol.org.tr/ara?q="
  "Artı Gerçek|https://www.artigercek.com/?s="
  "Yeni Yaşam|https://www.yeniyasamgazetesi9.com/?s="
  "Sendika|https://sendika.org/?s="
  "İleri Haber|https://www.ilerihaber.org/ara?q="
  "Manifesto|https://www.gazetemanifesto.com/?s="
  "Bianet|https://www.bianet.org/arama?q="
  "ETHA|https://www.etha15.com/?s="
  "Cumhuriyet|https://www.cumhuriyet.com.tr/ara?q="
  "Sözcü|https://www.sozcu.com.tr/ara/?q="
  "Halk TV|https://www.halktv.com.tr/arama?q="
  "Diken|https://www.diken.com.tr/?s="
  "Gazete Duvar|https://www.gazeteduvar.com.tr/ara?q="
  "Medyascope|https://medyascope.tv/?s="
  "T24|https://t24.com.tr/arama?q="
  "Gerçek Gündem|https://www.gercekgundem.com/?s="
  "Odatv|https://www.odatv.com/ara?q="
  "Kısa Dalga|https://www.kisadalga.net/?s="
)

echo "=== GÜVENİLEN SİTELER TEST ==="
echo "Arama kelimesi: $QUERY"
echo ""

printf "%-4s %-20s %-8s %-10s %s\n" "#" "Site" "HTTP" "Link" "Arama URL"
echo "------------------------------------------------------------------------"

i=1
for SITE in "${SITES[@]}"; do
  IFS='|' read -r NAME URL <<< "$SITE"
  FULL_URL="${URL}${ENCODED}"
  
  # HTTP durum kodu al
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -L -m 10 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "$FULL_URL" 2>/dev/null)
  
  if [ "$STATUS" = "200" ]; then
    # HTML çek, haber linklerini say (site domain'inde <a href> linkleri)
    HTML=$(curl -s -L -m 10 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "$FULL_URL" 2>/dev/null)
    DOMAIN=$(echo "$URL" | sed -e 's|https\?://||' -e 's|/.*||' -e 's|www\.||')
    LINK_COUNT=$(echo "$HTML" | grep -oP "<a[^>]+href=\"[^\"]*${DOMAIN}[^\"]*\"" | head -20 | wc -l)
    
    if [ "$LINK_COUNT" -gt 0 ]; then
      printf "%-4s %-20s %-8s %-10s %s\n" "$i" "$NAME" "✓ $STATUS" "$LINK_COUNT link" "$URL{query}"
    else
      printf "%-4s %-20s %-8s %-10s %s\n" "$i" "$NAME" "⚠ $STATUS" "0 link" "$URL{query}"
    fi
  else
    printf "%-4s %-20s %-8s %-10s %s\n" "$i" "$NAME" "✗ $STATUS" "-" "$URL{query}"
  fi
  
  i=$((i + 1))
done

echo ""
echo "=== TEST TAMAM ==="
echo ""
echo "✓ 200 + link var: Site çalışıyor, arama URL doğru"
echo "⚠ 200 ama 0 link: Site açılıyor ama arama URL yanlış olabilir"
echo "✗ 000/403/404: Site erişilemiyor veya arama URL yanlış"
