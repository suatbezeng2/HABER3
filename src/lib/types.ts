export interface SelectorConfig {
  item_selector: string; 
  title_selector: string;
  link_selector: string;
  summary_selector: string; // CSS selector for the article summary/excerpt
  date_selector: string;    // CSS selector for the article date
  image_selector?: string; // CSS selector for the main article image
  base_url?: string; // Optional, for resolving relative links if different from homepageUrl
}

export interface Site {
  id?: string; // Airtable record ID
  name: string;
  homepageUrl: string; // URL of the HTML page to scrape
  slug: string;
  active: boolean;
  selectorConfig: SelectorConfig; // Parsed JSON object
  country?: string;
  type?: string; // Türü (HTML, RSS vb.)
  airtableCreatedAt?: string; // Airtable system field: record.createdTime (ISO string)
  lastScrapedAt?: string; // ISO string of the last scrape time
  rssLink?: string; // Generated in the app, e.g., /rss/[slug].xml
}

export interface Article {
  id?: string; // Airtable record ID
  siteId: string; // Linked record to Sites table (Airtable ID)
  title: string;
  url: string; // Original URL of the article
  normalizedUrl: string; // Normalized URL for deduplication
  summary?: string;
  date?: string; // ISO 8601 format
  imageUrl?: string;
  language?: string; // e.g., 'en', 'tr'
  airtableCreatedAt?: string; // Airtable system field: record.createdTime (ISO string)
}
