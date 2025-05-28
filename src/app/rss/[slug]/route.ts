import { NextResponse, type NextRequest } from 'next/server';
import { Feed } from 'feed';
import { getSiteBySlug, getArticlesBySiteId, initializeAirtable } from '@/lib/airtable';
import type { Site, Article } from '@/lib/types';

const DEFAULT_RSS_ITEM_LIMIT = 20; 

function getValidDate(...dateSources: (string | number | Date | undefined | null)[]): Date {
  for (const source of dateSources) {
    if (source && String(source).trim() !== '') { 
      const d = new Date(source);
      if (!isNaN(d.getTime())) { 
        return d;
      }
    }
  }
  return new Date(); 
}

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const { slug } = params;
  console.log(`RSS: Oluşturma isteği "${slug}" için alındı.`);

  try {
    await initializeAirtable(); 
    console.log(`RSS: Airtable "${slug}" için başlatıldı.`);

    const siteSlugWithExtension = slug;
    const siteSlug = siteSlugWithExtension.replace(/\.xml$/, '');

    if (!siteSlug) {
      console.error("RSS: Oluşturma başarısız: Site kısa adı gerekli.");
      return new NextResponse('Site kısa adı gerekli', { status: 400 });
    }
    console.log(`RSS: "${siteSlug}" için site bilgisi alınıyor.`);
    const site = await getSiteBySlug(siteSlug);

    if (!site) {
      console.error(`RSS: Oluşturma başarısız: "${siteSlug}" kısa adına sahip site bulunamadı.`);
      return new NextResponse(`"${siteSlug}" kısa adına sahip site bulunamadı`, { status: 404 });
    }
    console.log(`RSS: "${site.name}" (ID: ${site.id}, Slug: ${site.slug}) sitesi bulundu.`);

    if (!site.active) {
      console.warn(`RSS: "${site.name}" sitesi (kısa ad: ${siteSlug}) aktif değil. 404 gönderiliyor.`);
      return new NextResponse(`"${site.name}" sitesi aktif değil`, { status: 404 });
    }
    
    if (!site.id) {
       console.error(`RSS: Oluşturma başarısız: "${site.name}" sitesi (kısa ad: ${siteSlug}) için site ID'si eksik.`);
       return new NextResponse('Alınan site için site ID\'si eksik', { status: 500 });
    }

    console.log(`RSS: "${site.name}" sitesi (ID: ${site.id}) için makaleler alınıyor, Limit: ${DEFAULT_RSS_ITEM_LIMIT}.`);
    const articles = await getArticlesBySiteId(site.id, DEFAULT_RSS_ITEM_LIMIT);
    console.log(`RSS: "${site.name}" (ID: ${site.id}) için ${articles.length} makale bulundu.`);
    if (articles.length === 0) {
        console.warn(`RSS: "${site.name}" için hiç makale bulunamadı. Besleme boş olacak ama oluşturulacak.`);
    }


    const siteLink = site.homepageUrl || `${request.nextUrl.origin}/site/${site.slug}`;
    const siteName = site.name; 

    let feedUpdatedDate: Date;
    if (articles.length > 0) {
      const articleDates = articles
        .map(a => getValidDate(a.date, a.airtableCreatedAt).getTime())
        .filter(ts => !isNaN(ts));
      if (articleDates.length > 0) {
        feedUpdatedDate = new Date(Math.max(...articleDates));
      } else {
        console.warn(`RSS: "${site.name}" sitesi: Geçerli makale tarihi bulunamadı, besleme güncelleme zamanı için site oluşturulma tarihi kullanılıyor.`);
        feedUpdatedDate = getValidDate(site.airtableCreatedAt); 
      }
    } else {
      console.log(`RSS: "${site.name}" sitesi: Makale bulunamadı, besleme güncelleme zamanı için site oluşturulma tarihi kullanılıyor.`);
      feedUpdatedDate = getValidDate(site.airtableCreatedAt);
    }
    console.log(`RSS: "${site.name}" için besleme güncelleme tarihi: ${feedUpdatedDate.toISOString()}`);
    
    let faviconUrl: string | undefined = undefined;
    if (site.homepageUrl) {
      try {
        faviconUrl = `${new URL(site.homepageUrl).origin}/favicon.ico`;
      } catch (e) {
        console.warn(`RSS: "${site.name}" sitesi için favicon oluşturmada geçersiz site.homepageUrl ("${site.homepageUrl}"). Hata: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    
    let imageFeedUrl: string | undefined = faviconUrl;
    if (site.selectorConfig?.base_url && (site.selectorConfig.base_url.startsWith('http://') || site.selectorConfig.base_url.startsWith('https://'))) {
        try {
            imageFeedUrl = `${new URL(site.selectorConfig.base_url).origin}/favicon.ico`;
        } catch (e) {
             console.warn(`RSS: "${site.name}" sitesi için resim URL'si oluşturmada geçersiz site.selectorConfig.base_url ("${site.selectorConfig.base_url}"). Hata: ${e instanceof Error ? e.message : String(e)}. Favicon kullanılacak.`);
        }
    }


    const feed = new Feed({
      title: `${siteName} RSS Beslemesi - aldaGel Platform`,
      description: `${siteName} sitesinden en son haberler`,
      id: siteLink, 
      link: siteLink,
      language: 'tr', 
      image: imageFeedUrl,
      favicon: faviconUrl,
      copyright: `Tüm hakları saklıdır ${new Date().getFullYear()}, ${siteName} (aldaGel Platform aracılığıyla)`,
      updated: feedUpdatedDate,
      generator: 'aldaGel Platform',
      feedLinks: {
        atom: `${request.nextUrl.origin}/rss/${site.slug}.xml`, 
        rss2: `${request.nextUrl.origin}/rss/${site.slug}.xml` 
      },
      author: {
        name: siteName,
        link: siteLink,
      },
    });

    articles.forEach((article: Article, index: number) => {
      console.log(`RSS: Makale beslemesi için işleniyor ${index + 1}/${articles.length}: ID=${article.id}, Başlık="${article.title}", URL="${article.url}", Tarih="${article.date}", Airtable Oluşturulma="${article.airtableCreatedAt}", ÖzetVarMi=${!!article.summary}`);
      
      try {
        let currentArticleUrl = article.url; 

        if (!currentArticleUrl || typeof currentArticleUrl !== 'string' || currentArticleUrl.trim() === '') {
          console.warn(`RSS: Makale (ID: ${article.id}, Başlık: "${article.title}") eksik veya geçersiz URL nedeniyle atlanıyor: "${article.url}"`);
          return;
        }

        try {
          new URL(currentArticleUrl); 
        } catch (urlError) {
          console.warn(`RSS: Makale (ID: ${article.id}, Başlık: "${article.title}") için orijinal URL "${article.url}" geçersiz. Çözümleme deneniyor...`);
          const baseUrl = site.selectorConfig?.base_url || site.homepageUrl;
          if (baseUrl && (baseUrl.startsWith('http://') || baseUrl.startsWith('https://'))) {
            try {
              currentArticleUrl = new URL(currentArticleUrl, baseUrl).href;
              new URL(currentArticleUrl); 
              console.log(`RSS: Makale (ID: ${article.id}) için URL başarıyla "${currentArticleUrl}" adresine çözümlendi.`);
            } catch (resolveError) {
              console.warn(`RSS: Makale (ID: ${article.id}, Başlık: "${article.title}") çözümlenemeyen URL "${article.url}" ve "${baseUrl}" temeli nedeniyle atlanıyor. Hata: ${resolveError instanceof Error ? resolveError.message : String(resolveError)}`);
              return;
            }
          } else {
            console.warn(`RSS: Makale (ID: ${article.id}, Başlık: "${article.title}") geçersiz orijinal URL "${article.url}" ve çözümleme için geçerli temel URL olmaması nedeniyle atlanıyor.`);
            return;
          }
        }

        if (!article.title || typeof article.title !== 'string' || article.title.trim() === '') {
          console.warn(`RSS: Makale (URL: ${currentArticleUrl}) eksik veya boş başlık nedeniyle atlanıyor. Başlık: "${article.title}"`);
          return;
        }
        
        const articleDate = getValidDate(article.date, article.airtableCreatedAt);
        console.log(`RSS: Makale "${article.title}" - Ayrıştırılmış tarih: ${articleDate.toISOString()}`);

        feed.addItem({
          title: article.title, 
          id: currentArticleUrl, 
          link: currentArticleUrl,
          description: article.summary || '', 
          content: article.summary || '', 
          author: [{ name: siteName, link: siteLink }],
          date: articleDate,
          image: article.imageUrl, 
        });
        console.log(`RSS: Makale "${article.title}" beslemeye başarıyla eklendi.`);
      } catch (e) {
        const addItemErrorMsg = e instanceof Error ? e.message : String(e);
        console.error(`RSS: Makale beslemeye eklenemedi (ID: ${article.id}, URL: ${article.url}, Başlık: "${article.title}"):`, addItemErrorMsg, e instanceof Error ? e.stack : undefined, e);
      }
    });

    console.log(`RSS: "${site.name}" için ${feed.items.length} öğeyle RSS beslemesi oluşturuldu.`);
    return new NextResponse(feed.rss2(), {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 's-maxage=300, stale-while-revalidate', 
      },
    });

  } catch (error) {
    let detailedMessage = 'Bilinmeyen bir hata oluştu.';
    let stackTrace: string | undefined = undefined;

    if (error instanceof Error) {
      detailedMessage = error.message;
      stackTrace = error.stack;
    } else if (error && typeof error === 'object') {
      const errObj = error as any;
      if (typeof errObj.message === 'string' && errObj.message.trim() !== '') detailedMessage = errObj.message;
      else if (typeof errObj.error === 'string' && errObj.error.trim() !== '') detailedMessage = errObj.error;
      else {
        try { 
          const stringifiedError = JSON.stringify(error);
          if (stringifiedError !== '{}') { 
            detailedMessage = stringifiedError;
          }
        }
        catch { /* ignore stringify error, stick to generic */ }
      }
    } else if (typeof error === 'string' && error.trim() !== '') {
      detailedMessage = error;
    }

    console.error(
      `RSS: "${slug}" kısa adı için RSS beslemesi oluşturulurken hata: ${detailedMessage}`,
      stackTrace ? `\nStack: ${stackTrace}` : '',
      '\nHam hata nesnesi:', error 
    );
    
    return new NextResponse(`Dahili Sunucu Hatası: ${detailedMessage}. Daha fazla ayrıntı için sunucu günlüklerini kontrol edin.`, { status: 500 });
  }
}
