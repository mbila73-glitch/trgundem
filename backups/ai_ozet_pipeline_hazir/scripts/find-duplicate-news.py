#!/usr/bin/env python3
"""
Find news articles that appear in multiple RSS sources by comparing
their RSS description text (NOT exact match — uses shingle/Jaccard similarity).

For each duplicate group, write the shared description + every source URL that
carried the same story to /home/z/my-project/download/rss_kaynak_sayi.md.

Run: python3 /home/z/my-project/scripts/find-duplicate-news.py
"""

import sqlite3
import re
import sys
import time
from datetime import datetime, timezone
from collections import defaultdict
from dataclasses import dataclass, field

DB_PATH = "/home/z/my-project/db/custom.db"
OUTPUT_PATH = "/home/z/my-project/download/rss_kaynak_sayi.md"
SHINGLE_SIZE = 4
SIMILARITY_THRESHOLD = 0.40  # Jaccard >= 40% → considered same story
MIN_GROUP_SIZE = 2  # only groups with >= 2 sources are interesting

# Turkish month names for date formatting
TR_MONTHS = [
    "Oca", "Şub", "Mar", "Nis", "May", "Haz",
    "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara",
]


@dataclass
class Article:
    id: str
    title: str
    link: str
    description: str
    published_at: str  # raw value from DB
    source_id: str
    source_name: str
    source_url: str
    category: str
    shingles: frozenset = field(default_factory=frozenset)


def normalize(text: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace."""
    if not text:
        return ""
    text = text.lower()
    # Turkish lower fixes for İ and I
    text = text.replace("İ", "i").replace("I", "ı")
    # Remove all non-word chars except whitespace
    text = re.sub(r"[^\w\sçğıöşüâîû]", " ", text, flags=re.UNICODE)
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text


def shingles(text: str, n: int = SHINGLE_SIZE) -> frozenset:
    """Split text into n-gram word shingles."""
    if not text:
        return frozenset()
    words = text.split()
    if len(words) < n:
        return frozenset({" ".join(words)})
    return frozenset(
        " ".join(words[i : i + n]) for i in range(len(words) - n + 1)
    )


def jaccard(a: frozenset, b: frozenset) -> float:
    if not a or not b:
        return 0.0
    inter = len(a & b)
    if inter == 0:
        return 0.0
    union = len(a | b)
    return inter / union if union else 0.0


# ---- Union-Find for grouping duplicates ----
class UnionFind:
    def __init__(self, n: int):
        self.parent = list(range(n))
        self.rank = [0] * n

    def find(self, x: int) -> int:
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a: int, b: int) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return
        if self.rank[ra] < self.rank[rb]:
            ra, rb = rb, ra
        self.parent[rb] = ra
        if self.rank[ra] == self.rank[rb]:
            self.rank[ra] += 1


def fmt_date(raw) -> str:
    """Parse SQLite-stored DateTime (epoch ms OR ISO string) and format in Turkish."""
    if not raw:
        return ""
    # Epoch ms (Prisma SQLite stores DateTime as INTEGER milliseconds)
    if isinstance(raw, int):
        try:
            dt = datetime.fromtimestamp(raw / 1000, tz=timezone.utc)
            return f"{dt.day} {TR_MONTHS[dt.month - 1]} {dt.year} {dt.hour:02d}:{dt.minute:02d}"
        except Exception:
            return str(raw)
    s = str(raw)
    # Try ISO format
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return f"{dt.day} {TR_MONTHS[dt.month - 1]} {dt.year} {dt.hour:02d}:{dt.minute:02d}"
    except Exception:
        # Try epoch ms as numeric string
        try:
            n = int(s)
            dt = datetime.fromtimestamp(n / 1000, tz=timezone.utc)
            return f"{dt.day} {TR_MONTHS[dt.month - 1]} {dt.year} {dt.hour:02d}:{dt.minute:02d}"
        except Exception:
            return s


def main() -> None:
    started = time.time()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    print("=== Aynı Haber Tespiti (shingle + Jaccard) ===")

    rows = c.execute(
        """
        SELECT a.id, a.sourceId, a.title, a.link, a.description, a.publishedAt,
               a.category, s.name AS sourceName, s.url AS sourceUrl, s.category AS sourceCategory
        FROM Article a
        JOIN Source s ON s.id = a.sourceId
        WHERE a.description IS NOT NULL AND LENGTH(a.description) >= 30
        ORDER BY a.publishedAt DESC
        """
    ).fetchall()

    print(f"Açıklamalı makale: {len(rows)}")

    # Build Article objects with shingles
    articles: list[Article] = []
    for r in rows:
        desc = r["description"] or ""
        norm = normalize(desc)
        sh = shingles(norm, SHINGLE_SIZE)
        if len(sh) == 0:
            continue
        # Use source's category (more reliable than article.category which is RSS feed's own tag)
        category = r["sourceCategory"] or r["category"] or ""
        articles.append(
            Article(
                id=r["id"],
                title=r["title"] or "",
                link=r["link"] or "",
                description=desc,
                published_at=r["publishedAt"],
                source_id=r["sourceId"],
                source_name=r["sourceName"] or "",
                source_url=r["sourceUrl"] or "",
                category=category,
                shingles=sh,
            )
        )
    print(f"İşlenecek makale: {len(articles)}")

    # Inverted index: shingle -> article indexes (so we only compare pairs that share at least one shingle)
    inverted: dict[str, list[int]] = defaultdict(list)
    for i, art in enumerate(articles):
        for sh in art.shingles:
            inverted[sh].append(i)
    print(f"Benzersiz shingle: {len(inverted)}")

    # Build candidate pairs ONLY across different sources (not within same source).
    # This avoids treating multiple variations of the same story published by the
    # same outlet (e.g. Onedio's 12 different horoscope variants with similar
    # boilerplate description) as a duplicate group.
    candidates: set[tuple[int, int]] = set()
    for sh, idxs in inverted.items():
        if len(idxs) < 2:
            continue
        for i in range(len(idxs)):
            for j in range(i + 1, len(idxs)):
                a_idx, b_idx = idxs[i], idxs[j]
                if a_idx == b_idx:
                    continue
                # Skip pairs from the same source
                if articles[a_idx].source_id == articles[b_idx].source_id:
                    continue
                if a_idx > b_idx:
                    a_idx, b_idx = b_idx, a_idx
                candidates.add((a_idx, b_idx))
    print(f"Aday çift (farklı kaynaklar arası): {len(candidates):,}")

    # Compute Jaccard for each candidate pair, union the ones above threshold
    uf = UnionFind(len(articles))
    same_count = 0
    for a_idx, b_idx in candidates:
        sim = jaccard(articles[a_idx].shingles, articles[b_idx].shingles)
        if sim >= SIMILARITY_THRESHOLD:
            uf.union(a_idx, b_idx)
            same_count += 1

    print(
        f"Benzer çift (≥ %{int(SIMILARITY_THRESHOLD * 100)} jaccard): {same_count:,}"
    )

    # Group articles by union-find root
    groups: dict[int, list[int]] = defaultdict(list)
    for i in range(len(articles)):
        root = uf.find(i)
        groups[root].append(i)

    # Keep only groups with >= 2 DIFFERENT sources
    duplicate_groups: list[list[int]] = []
    for group in groups.values():
        unique_sources = {articles[i].source_id for i in group}
        if len(unique_sources) >= MIN_GROUP_SIZE:
            duplicate_groups.append(group)
    # Sort by number of unique sources desc, then by group size desc
    duplicate_groups.sort(
        key=lambda g: (
            -len({articles[i].source_id for i in g}),
            -len(g),
        )
    )
    print(f"Tekrar eden haber grubu: {len(duplicate_groups)}")
    total_duplicated_articles = sum(len(g) for g in duplicate_groups)
    total_duplicated_unique_sources = sum(
        len({articles[i].source_id for i in g}) for g in duplicate_groups
    )
    print(f"Tekrar eden toplam makale: {total_duplicated_articles}")
    print(f"Tekrar eden toplam farklı kaynak: {total_duplicated_unique_sources}")

    # Build output file
    total_articles = c.execute("SELECT COUNT(*) FROM Article").fetchone()[0]
    total_sources = c.execute("SELECT COUNT(*) FROM Source").fetchone()[0]

    lines: list[str] = []
    lines.append("# RSS Kaynak Sayısı — Tekrar Eden Haberler")
    lines.append("")
    lines.append(
        "Aynı haberin kaç farklı RSS kaynağında geçtiğini gösterir. "
        "Birebir eşleşme yerine açıklama metinlerinin shingle/Jaccard benzerliğine "
        f"(≥ %{int(SIMILARITY_THRESHOLD * 100)}) bakılarak tespit edilmiştir."
    )
    lines.append("")
    lines.append(f"- **Oluşturulma:** {datetime.now().strftime('%d ' + TR_MONTHS[datetime.now().month - 1] + ' %Y %H:%M')}")
    lines.append(f"- **Toplam makale:** {total_articles}")
    lines.append(f"- **Toplam kaynak:** {total_sources}")
    lines.append(f"- **İşlenen makale (açıklamalı):** {len(articles)}")
    lines.append(f"- **Benzersiz shingle:** {len(inverted):,}")
    lines.append(f"- **Aday çift:** {len(candidates):,}")
    lines.append(f"- **Tekrar eden haber grubu:** {len(duplicate_groups)}")
    lines.append(
        f"- **Tekrar eden toplam makale:** {total_duplicated_articles} "
        f"(toplam makalenin %{round(total_duplicated_articles / max(total_articles, 1) * 100, 1)}'i)"
    )
    lines.append(
        f"- **Tekrar eden toplam farklı kaynak:** {total_duplicated_unique_sources} "
        f"(grup başına ortalama {round(total_duplicated_unique_sources / max(len(duplicate_groups), 1), 1)} farklı kaynak)"
    )
    lines.append("")
    lines.append("---")
    lines.append("")

    # Top 20 most-repeated stories first (by unique source count)
    lines.append("## En Çok Tekrar Eden 20 Haber (Farklı Kaynak Sayısına Göre)")
    lines.append("")
    lines.append("| # | Farklı Kaynak | Toplam Makale | Kategori | Başlık |")
    lines.append("|---|---|---|---|---|")
    for rank, group in enumerate(duplicate_groups[:20], start=1):
        rep_idx = max(group, key=lambda i: len(articles[i].description))
        rep = articles[rep_idx]
        unique_src = len({articles[i].source_id for i in group})
        title = rep.title.replace("|", "\\|").strip()
        if len(title) > 70:
            title = title[:67] + "…"
        cat = (rep.category or "(belirsiz)").replace("|", "\\|")
        lines.append(f"| {rank} | {unique_src} | {len(group)} | {cat} | {title} |")
    lines.append("")
    lines.append("---")
    lines.append("")

    # Full listing
    lines.append("## Tüm Tekrar Eden Haber Grupları")
    lines.append("")

    for rank, group in enumerate(duplicate_groups, start=1):
        # Representative: longest description
        rep_idx = max(group, key=lambda i: len(articles[i].description))
        rep = articles[rep_idx]
        unique_src_count = len({articles[i].source_id for i in group})
        lines.append(
            f"### [{rank}] {rep.title}  ({unique_src_count} farklı kaynakta, {len(group)} makale)"
        )
        lines.append("")
        lines.append(f"**Kategori:** {rep.category or '(belirsiz)'}")
        lines.append("")
        lines.append("**Açıklama:**")
        lines.append("")
        lines.append(f"> {rep.description.strip()}")
        lines.append("")
        lines.append(f"**Farklı kaynak sayısı:** {unique_src_count}")
        lines.append(f"**Toplam makale sayısı:** {len(group)}")
        lines.append("")
        lines.append("**Geçtiği farklı kaynaklar:**")
        lines.append("")
        # Group by source, show all articles per source together
        source_groups: dict[str, list[Article]] = defaultdict(list)
        for i in group:
            source_groups[articles[i].source_id].append(articles[i])
        # Sort source groups by earliest publishedAt in each group (chronological)
        source_groups_list = sorted(
            source_groups.values(),
            key=lambda arts: min(a.published_at for a in arts) or "",
        )
        src_rank = 0
        for arts in source_groups_list:
            src_rank += 1
            first = arts[0]
            m = re.match(r"https?://(?:www\.)?([^/]+)", first.source_url)
            host = m.group(1) if m else first.source_url
            lines.append(
                f"{src_rank}. **{first.source_name}** (`{host}`) — {len(arts)} makale"
            )
            lines.append("")
            for j, art in enumerate(sorted(arts, key=lambda a: a.published_at or ""), start=1):
                title_short = art.title if len(art.title) <= 90 else art.title[:87] + "…"
                lines.append(
                    f"   - {j}. [{title_short}]({art.link}) — {fmt_date(art.published_at)}"
                )
            lines.append("")
        lines.append("---")
        lines.append("")

    # Footer
    duration = time.time() - started
    lines.append("## Üretim Bilgisi")
    lines.append("")
    lines.append(f"- **Oluşturan:** find-duplicate-news.py")
    lines.append(f"- **Tarih:** {datetime.now().isoformat()}")
    lines.append(
        f"- **Algoritma:** n-gram shingle (n={SHINGLE_SIZE}) + Jaccard ≥ %{int(SIMILARITY_THRESHOLD * 100)} + Union-Find"
    )
    lines.append(f"- **Çalışma süresi:** {duration:.1f} saniye")
    lines.append("")

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    size_kb = round(len("\n".join(lines)) / 1024, 1)
    print(f"\nDosya yazıldı: {OUTPUT_PATH} ({size_kb} KB, {len(lines)} satır)")
    print(f"Çalışma süresi: {duration:.1f} saniye")
    conn.close()


if __name__ == "__main__":
    main()
