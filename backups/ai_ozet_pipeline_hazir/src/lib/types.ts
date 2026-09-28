export type Source = {
  id: string;
  name: string;
  url: string;
  category: string | null;
  active: boolean;
  lastFetched: string | null;
  createdAt: string;
  _count: { articles: number };
};

export type ArticleListItem = {
  id: string;
  sourceId: string;
  guid: string;
  title: string;
  link: string;
  description: string | null;
  content: string | null;
  author: string | null;
  category: string | null;
  imageUrl: string | null;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
  summary: string | null;
  summarizedAt: string | null;
  summaryError: string | null;
  isFeatured?: boolean;
  source: { id: string; name: string; category: string | null };
};

export type ArticleDetail = ArticleListItem & {
  source: { id: string; name: string; category: string | null };
};

export type RefreshResult = {
  sourceId: string;
  sourceName: string;
  fetched: number;
  added: number;
  error?: string;
};

export type SummarizeResult = {
  articleId: string;
  summary: string;
  ok: boolean;
  error?: string;
};

export type BatchSummarizeResult = {
  attempted: number;
  succeeded: number;
  failed: number;
  results: { id: string; ok: boolean; error?: string }[];
};

export type PublishedArticle = {
  id: string;
  aiTitle: string;
  aiSummary: string;
  imageUrl: string | null;
  category: string;
  wordCount: number;
  sourceArticleIds: string; // JSON array of Article.id
  sourceCount: number;
  earliestPublishedAt: string;
  latestPublishedAt: string;
  status: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// Decoded source article links (used by detail dialog). Populated client-side
// from a separate fetch when the user opens a published article.
export type PublishedSourceLink = {
  id: string;
  title: string;
  link: string;
  description: string | null;
  imageUrl: string | null;
  publishedAt: string;
  sourceName: string;
  sourceUrl: string;
};
