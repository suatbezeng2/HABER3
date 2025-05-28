import type { SelectorConfig } from '@/lib/types';

export interface SitePreset {
  name: string;
  config: SelectorConfig;
}

export const sitePresets: SitePreset[] = [
  {
    name: 'Genel WordPress',
    config: {
      item_selector: 'article.post, .type-post, .td_module_flex', 
      title_selector: 'h1.entry-title a, h2.entry-title a, .entry-title a, h3.td-module-title a, .post-title a',
      link_selector: 'h1.entry-title a, h2.entry-title a, .entry-title a, h3.td-module-title a, .post-title a',
      summary_selector: '.entry-summary, .entry-content p:first-of-type, .td-excerpt, .post-excerpt p',
      date_selector: 'time.published, time.updated, .entry-date, .post-date, .td-post-date time',
      image_selector: '.post-thumbnail img, .featured-image img, .entry-content img:first-of-type',
      base_url: '', 
    },
  },
  {
    name: 'Haber Sitesi (Yaygın Yapı 1)',
    config: {
      item_selector: '.news-item, .story-card, .article-preview',
      title_selector: 'h2.title a, h3.headline a, .story-title a',
      link_selector: 'h2.title a, h3.headline a, .story-title a',
      summary_selector: '.summary, .dek, .article-snippet p',
      date_selector: 'time.timestamp, .date-published, .story-date',
      image_selector: '.article-image img, .teaser-image img, figure img',
      base_url: '',
    },
  },
  {
    name: 'AktifTV (Örnek - Doğrulama Gerekli)',
    config: {
      item_selector: '.td_module_flex', 
      title_selector: 'h3.td-module-title a', 
      link_selector: 'h3.td-module-title a',  
      summary_selector: '.td-excerpt',      
      date_selector: '.td-post-date time',   
      image_selector: '.td-image-wrap img',
      base_url: '', 
    }
  },
  {
    name: 'BBC News (Örnek)',
    config: {
      item_selector: 'div[type="article"]',
      title_selector: 'h3 a',
      link_selector: 'h3 a',
      summary_selector: 'p[class*="summary"]',
      date_selector: 'time[datetime]',
      image_selector: 'div[data-component="image-block"] img',
      base_url: 'https://www.bbc.com',
    }
  },
  {
    name: 'Le Monde (Örnek)',
    config: {
      item_selector: 'article.teaser', 
      title_selector: '.teaser__title a',
      link_selector: '.teaser__title a',
      summary_selector: '.teaser__desc',
      date_selector: 'time.meta__date',
      image_selector: '.teaser__media img',
      base_url: 'https://www.lemonde.fr',
    }
  },
  {
    name: 'Der Spiegel (Örnek)',
    config: {
      item_selector: 'article[data-sara-type="Teaser"]',
      title_selector: 'header h2 a span',
      link_selector: 'header h2 a',
      summary_selector: 'div[data-sara-type="RichText"] p',
      date_selector: 'footer time',
      image_selector: 'header picture img',
      base_url: 'https://www.spiegel.de',
    }
  }
];

export const defaultSelectorConfig: SelectorConfig = {
  item_selector: "article",
  title_selector: "h2 a",
  link_selector: "h2 a",
  summary_selector: "p.summary, .article-summary, .entry-summary",
  date_selector: "time, .date, .published-date",
  image_selector: "img, .featured-image img, .article-image img",
  base_url: "",
};
