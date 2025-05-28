
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  createSite as dbCreateSite,
  updateSite as dbUpdateSite,
  deleteSite as dbDeleteSite,
  getSiteById,
  createArticle,
  findArticleByUrlAndSiteId,
  initializeAirtable,
  getSites as dbGetSites,
  getValidatedTableInstances // For diagnostic logging
} from '@/lib/airtable';
import type { Site, SelectorConfig, Article } from '@/lib/types';
import { extractSelectors } from '@/ai/flows/extract-selectors-flow';
// import { JSDOM } from 'jsdom'; // Dynamically imported
import { normalizeUrl } from '@/lib/url-utils';


const siteFormSchema = z.object({
  name: z.string().min(2, { message: "Site adı en az 2 karakter olmalıdır." }),
  homepageUrl: z.string().url({ message: "Lütfen geçerli bir URL girin." }),
  slug: z.string().min(2, { message: "Kısa ad en az 2 karakter olmalıdır." }).regex(/^[a-z0-9-]+$/, "Kısa ad küçük harf, rakam ve tire içermelidir."),
  active: z.preprocess((val) => val === 'on' || val === true, z.boolean()),
  country: z.string().optional(),
  selectorConfig: z.string().refine((val) => {
    try {
      const parsed = JSON.parse(val);
      const expectedKeys: (keyof Required<SelectorConfig>)[] = ['item_selector', 'title_selector', 'link_selector', 'summary_selector', 'date_selector', 'image_selector', 'base_url'];
      for (const key of expectedKeys) {
          if (!(key in parsed) || typeof parsed[key] !== 'string') {
             throw new Error(`Seçici alan '${key}' JSON'da eksik veya bir dize değil. İsteğe bağlı alanlar boş dize olmalıdır.`);
          }
      }
      if (parsed.item_selector.trim() === '') {
        throw new Error("item_selector gereklidir ve boş olamaz.");
      }
      if (parsed.title_selector.trim() === '') {
        throw new Error("title_selector gereklidir ve boş olamaz.");
      }
      if (parsed.link_selector.trim() === '') {
        throw new Error("link_selector gereklidir ve boş olamaz.");
      }

      if (parsed.base_url && parsed.base_url.trim() !== "") {
        try {
          new URL(parsed.base_url);
        } catch (e) {
          throw new Error("base_url geçerli bir URL veya boş bir dize olmalıdır.");
        }
      }
      return true;
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Bilinmeyen JSON ayrıştırma hatası";
      console.error("selectorConfig doğrulama hatası:", errorMessage, "Giriş:", val);
      return false;
    }
  }, { message: "Geçersiz Seçici Yapılandırması JSON veya şeması. Gerekli seçicilerin (item, title, link) mevcut ve dolu olduğundan emin olun. İsteğe bağlı seçiciler (summary, date, image, base_url) mevcut ve dize olmalıdır (boş olabilir). Base_url geçerli bir URL veya boş dize olmalıdır. JSON yapısını ve tüm alanların varlığını kontrol edin." }),
});

interface SiteActionResponse {
  message: string;
  errors?: Record<string, string[]>;
  site?: Site | null;
  success?: boolean;
}

export async function createSiteAction(formData: FormData): Promise<SiteActionResponse> {
  await initializeAirtable();
  const rawData = Object.fromEntries(formData.entries());
  const validatedFields = siteFormSchema.safeParse(rawData);

  if (!validatedFields.success) {
    return {
      message: 'Form doğrulama başarısız oldu.',
      errors: validatedFields.error.flatten().fieldErrors,
      success: false,
    };
  }

  try {
    const parsedSelectorConfig: SelectorConfig = JSON.parse(validatedFields.data.selectorConfig);
    const newSiteData: Omit<Site, 'id' | 'airtableCreatedAt' | 'lastScrapedAt'> = {
      name: validatedFields.data.name,
      homepageUrl: validatedFields.data.homepageUrl,
      slug: validatedFields.data.slug,
      active: validatedFields.data.active,
      country: validatedFields.data.country || "",
      type: "HTML", // Yeni siteler her zaman HTML olarak ayarlanır
      selectorConfig: {
        item_selector: parsedSelectorConfig.item_selector,
        title_selector: parsedSelectorConfig.title_selector,
        link_selector: parsedSelectorConfig.link_selector,
        summary_selector: parsedSelectorConfig.summary_selector || "",
        date_selector: parsedSelectorConfig.date_selector || "",
        image_selector: parsedSelectorConfig.image_selector || "",
        base_url: parsedSelectorConfig.base_url || "",
      },
    };

    const existingSiteBySlug = await dbGetSites().then(sites => sites.find(s => s.slug === newSiteData.slug));
    if (existingSiteBySlug) {
      return {
        message: `"${newSiteData.slug}" kısa adına sahip bir site zaten mevcut.`,
        errors: { slug: [`"${newSiteData.slug}" kısa adına sahip bir site zaten mevcut.`] },
        success: false,
      };
    }

    const createdSite = await dbCreateSite(newSiteData);
     if (!createdSite) {
      return { message: 'Site oluşturulamadı (Airtable hatası).', success: false };
    }
    revalidatePath('/');
    revalidatePath('/sites');
    return { message: `"${createdSite.name}" sitesi başarıyla oluşturuldu!`, site: createdSite, success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Bilinmeyen bir hata oluştu.';
    console.error("createSiteAction Hatası:", errorMessage, error);
    return { message: `Site oluşturulamadı: ${errorMessage}`, success: false };
  }
}

export async function updateSiteAction(id: string, formData: FormData): Promise<SiteActionResponse> {
  await initializeAirtable();
  const rawData = Object.fromEntries(formData.entries());
  const validatedFields = siteFormSchema.safeParse(rawData);

  if (!validatedFields.success) {
    return {
      message: 'Form doğrulama başarısız oldu.',
      errors: validatedFields.error.flatten().fieldErrors,
      success: false,
    };
  }

  try {
    const parsedSelectorConfig: SelectorConfig = JSON.parse(validatedFields.data.selectorConfig);
    const siteDataToUpdate: Partial<Omit<Site, 'id' | 'airtableCreatedAt' | 'lastScrapedAt'>> = {
      name: validatedFields.data.name,
      homepageUrl: validatedFields.data.homepageUrl,
      slug: validatedFields.data.slug,
      active: validatedFields.data.active,
      country: validatedFields.data.country || "",
      type: "HTML", // Güncellerken de Tür'ü HTML olarak koru veya ayarla
      selectorConfig: {
        item_selector: parsedSelectorConfig.item_selector,
        title_selector: parsedSelectorConfig.title_selector,
        link_selector: parsedSelectorConfig.link_selector,
        summary_selector: parsedSelectorConfig.summary_selector || "",
        date_selector: parsedSelectorConfig.date_selector || "",
        image_selector: parsedSelectorConfig.image_selector || "",
        base_url: parsedSelectorConfig.base_url || "",
      },
    };

    const currentSite = await getSiteById(id);
    if (currentSite && currentSite.slug !== siteDataToUpdate.slug && siteDataToUpdate.slug) {
      const existingSiteBySlug = await dbGetSites().then(sites => sites.find(s => s.slug === siteDataToUpdate.slug));
      if (existingSiteBySlug) {
        return {
          message: `"${siteDataToUpdate.slug}" kısa adına sahip başka bir site zaten mevcut.`,
          errors: { slug: [`"${siteDataToUpdate.slug}" kısa adına sahip başka bir site zaten mevcut.`] },
          success: false,
        };
      }
    }

    const updatedSite = await dbUpdateSite(id, siteDataToUpdate);
    if (!updatedSite) {
      return { message: 'Site güncellenemedi (Airtable hatası).', success: false };
    }
    revalidatePath('/');
    revalidatePath('/sites');
    revalidatePath(`/sites/edit/${id}`);
    return { message: `"${updatedSite.name}" sitesi başarıyla güncellendi!`, site: updatedSite, success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Bilinmeyen bir hata oluştu.';
    console.error("updateSiteAction Hatası:", errorMessage, error);
    return { message: `Site güncellenemedi: ${errorMessage}`, success: false };
  }
}

export async function deleteSiteAction(id: string): Promise<{ message: string, success: boolean }> {
  await initializeAirtable();
  try {
    const site = await getSiteById(id);
    if (!site) {
      return { message: 'Silinecek site bulunamadı.', success: false };
    }
    await dbDeleteSite(id);
    revalidatePath('/');
    revalidatePath('/sites');
    return { message: `"${site.name}" sitesi ve ilişkili makaleleri başarıyla silindi.`, success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Bilinmeyen bir hata oluştu.';
    console.error("deleteSiteAction Hatası:", errorMessage, error);
    return { message: `Site silinemedi: ${errorMessage}`, success: false };
  }
}


interface ScrapeResult {
  newArticlesCount: number;
  skippedArticlesCount: number;
  errors: string[];
}

async function fetchHtmlContent(url: string): Promise<string> {
    const response = await fetch(url, { headers: { 'User-Agent': 'aldaGelPlatformBot/1.0 (+https://aldagel.example.com/bot)' } });
    if (!response.ok) {
      throw new Error(`Sayfa getirilemedi: ${response.status} ${response.statusText} (URL: ${url})`);
    }
    return await response.text();
}

export async function triggerScrapeAction(siteId: string, limit: number = 5): Promise<ScrapeResult> {
  await initializeAirtable();
  console.log(`[SCRAPE_INIT] Site ID: "${siteId}" için tarama başlıyor, limit: ${limit}`);
  const site = await getSiteById(siteId);
  const result: ScrapeResult = { newArticlesCount: 0, skippedArticlesCount: 0, errors: [] };

  if (!site || !site.id) {
    const errorMsg = `Site bulunamadı veya ID eksik: ${siteId}`;
    console.error(`[SCRAPE_ERROR] ${errorMsg}`);
    result.errors.push(errorMsg);
    return result;
  }

  if (!site.active) {
    const warnMsg = `Site aktif değil, tarama atlanıyor: ${site.name}`;
    console.warn(`[SCRAPE_WARN] ${warnMsg}`);
    return result;
  }

  if (!site.selectorConfig || !site.selectorConfig.item_selector || !site.selectorConfig.title_selector || !site.selectorConfig.link_selector) {
    const errorMsg = `Geçersiz veya eksik seçici yapılandırması (item, title, link zorunlu): ${site.name}`;
    console.error(`[SCRAPE_ERROR] ${errorMsg}`);
    result.errors.push(errorMsg);
    return result;
  }

  try {
    console.log(`[SCRAPE_FETCH] "${site.name}" için HTML içeriği alınıyor: ${site.homepageUrl}`);
    const html = await fetchHtmlContent(site.homepageUrl);

    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const items = Array.from(document.querySelectorAll(site.selectorConfig.item_selector));
    console.log(`[SCRAPE_ITEMS_FOUND] Site: "${site.name}", ${items.length} potansiyel öğe bulundu. Tarama limiti: ${limit}.`);

    let articlesAttempted = 0;
    for (const item of items) {
      if (articlesAttempted >= limit) {
        console.log(`[SCRAPE_LIMIT_REACHED] Site: "${site.name}", ${articlesAttempted} makale denendi, limite (${limit}) ulaşıldı.`);
        break;
      }
      articlesAttempted++;

      const titleElement = item.querySelector(site.selectorConfig.title_selector);
      const linkElement = item.querySelector(site.selectorConfig.link_selector) as HTMLAnchorElement | null;

      let title = titleElement?.textContent?.trim() || '';
      let articleUrl = linkElement?.href || '';

      if (!title || !articleUrl) {
        console.warn(`[SCRAPE_SKIP_ITEM #${articlesAttempted}] Site: "${site.name}", başlık veya bağlantı bulunamadı. Başlık: "${title}", Bağlantı: "${articleUrl}"`);
        continue;
      }

      const baseUrlToUse = site.selectorConfig.base_url && site.selectorConfig.base_url.trim() !== '' ? site.selectorConfig.base_url : site.homepageUrl;
      let resolvedArticleUrl = '';
      try {
        resolvedArticleUrl = new URL(articleUrl, baseUrlToUse).href;
      } catch (e) {
        const errMsg = `URL "${articleUrl}" (temel: "${baseUrlToUse}") çözümlenemedi. Hata: ${e instanceof Error ? e.message : String(e)}`;
        console.warn(`[SCRAPE_SKIP_ITEM #${articlesAttempted}] Site: "${site.name}", ${errMsg}`);
        result.errors.push(`URL çözümleme hatası: ${articleUrl} - ${errMsg}`);
        continue;
      }

      if (!site.id) { 
        console.error(`[SCRAPE_ERROR_LOOP] Site ID is undefined for site: "${site.name}" inside article loop. Skipping article.`);
        result.errors.push(`Site ID is missing for ${site.name} during article processing.`);
        continue;
      }
      console.log(`[SCRAPE_PRE_DUPLICATE_CHECK] Site: "${site.name}", Title: "${title}", Checking for duplicate with Raw URL: "${resolvedArticleUrl}", SiteID: "${site.id}"`);
      const existingArticle = await findArticleByUrlAndSiteId(resolvedArticleUrl, site.id);

      if (existingArticle) {
        console.log(`[SCRAPE_DUPLICATE_FOUND] Site: "${site.name}", Makale zaten mevcut. Sorgulanan Ham URL: "${resolvedArticleUrl}", Bulunan Airtable Kayıt ID: ${existingArticle.id}, Bulunan Kayıt Ham URL: "${existingArticle.url}". Atlanıyor.`);
        result.skippedArticlesCount++;
        continue;
      } else {
        console.log(`[SCRAPE_NO_DUPLICATE_FOUND] Site: "${site.name}", Makale mevcut değil. Başlık: "${title}", Ham URL: "${resolvedArticleUrl}". Oluşturulacak.`);
        
        console.log(`[SCRAPE_CREATE_INTENT] Site: "${site.name}", Başlık: "${title}", Airtable'a Kaydedilecek Ham URL: "${resolvedArticleUrl}", SiteID: "${site.id}"`);

        let summary = '';
        if (site.selectorConfig.summary_selector && site.selectorConfig.summary_selector.trim() !== '') {
          const summaryElement = item.querySelector(site.selectorConfig.summary_selector);
          summary = summaryElement?.textContent?.trim() || '';
        }

        let dateStr: string | undefined = undefined;
        if (site.selectorConfig.date_selector && site.selectorConfig.date_selector.trim() !== '') {
            const dateElement = item.querySelector(site.selectorConfig.date_selector);
            let rawDateValue: string | undefined | null = undefined;

            if (dateElement) {
                if (dateElement.hasAttribute('datetime')) {
                    rawDateValue = dateElement.getAttribute('datetime');
                } else if (dateElement.tagName.toLowerCase() === 'time' && dateElement.textContent) {
                     rawDateValue = dateElement.textContent.trim();
                } else {
                    rawDateValue = dateElement.textContent?.trim();
                }
            }

            if (rawDateValue && rawDateValue.trim() !== '' && !/^\s*((\d+)\s+(saniye|dakika|saat|gün|hafta|ay|yıl)\s+önce|dün|bugün)\s*$/i.test(rawDateValue) ) {
                console.log(`[SCRAPE_DATE_RAW] Site: "${site.name}", Article: "${title}", Raw Date Value: "${rawDateValue}"`);
                try {
                    let parsedDate: Date | null = null;
                    
                    const directParseAttempt = new Date(rawDateValue);
                    if (!isNaN(directParseAttempt.getTime())) {
                        parsedDate = directParseAttempt;
                    } else {
                        const datePartsMatch = rawDateValue.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\s+(\d{1,2}:\d{1,2}(?::\d{1,2})?))?/);
                        if (datePartsMatch) {
                            const day = parseInt(datePartsMatch[1], 10);
                            const month = parseInt(datePartsMatch[2], 10) -1; 
                            const year = parseInt(datePartsMatch[3], 10);
                            let hours = 0, minutes = 0, seconds = 0;
                            if (datePartsMatch[4]) { 
                                const timeParts = datePartsMatch[4].split(':');
                                hours = parseInt(timeParts[0],10);
                                minutes = parseInt(timeParts[1],10);
                                if (timeParts[2]) seconds = parseInt(timeParts[2],10);
                            }
                            const tempDate = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
                            if (tempDate.getUTCFullYear() === year && tempDate.getUTCMonth() === month && tempDate.getUTCDate() === day) {
                                parsedDate = tempDate;
                            }
                        }
                    }
                    
                    if (parsedDate && !isNaN(parsedDate.getTime())) {
                        const year = parsedDate.getFullYear(); // getUTCFullYear for UTC dates
                        if (year >= 1900 && year <= new Date().getFullYear() + 5) { 
                            dateStr = parsedDate.toISOString();
                             console.log(`[SCRAPE_DATE_PARSED_SUCCESS] Site: "${site.name}", Article: "${title}", Raw Date: "${rawDateValue}", Parsed ISO: "${dateStr}"`);
                        } else {
                            console.warn(`[SCRAPE_DATE_YEAR_OUT_OF_RANGE] Site: "${site.name}", Article: "${title}", Raw Date: "${rawDateValue}", Parsed Year: ${year}. Date will be omitted.`);
                        }
                    } else {
                        console.warn(`[SCRAPE_DATE_PARSE_FAIL] Site: "${site.name}", Article: "${title}", Raw Date: "${rawDateValue}" geçerli bir mutlak tarih değil. Tarih boş bırakılacak.`);
                    }
                } catch (e) {
                    console.warn(`[SCRAPE_DATE_PARSE_ERROR] Site: "${site.name}", Article: "${title}", Raw Date: "${rawDateValue}", Error: ${e instanceof Error ? e.message : String(e)}. Date will be omitted.`);
                }
            } else if (rawDateValue) { 
                 console.warn(`[SCRAPE_DATE_SKIP_RELATIVE_OR_UNKNOWN] Site: "${site.name}", Article: "${title}", Göreceli veya tanınmayan tarih ifadesi atlanıyor: "${rawDateValue}". Tarih boş bırakılacak.`);
            }
        }


        let imageUrl: string | undefined = undefined;
        if (site.selectorConfig.image_selector && site.selectorConfig.image_selector.trim() !== '') {
            const imageElement = item.querySelector(site.selectorConfig.image_selector) as HTMLElement | null;
            if (imageElement) {
                let rawImageUrl: string | undefined | null = undefined;

                if (imageElement.tagName.toLowerCase() === 'img') {
                    const imgElem = imageElement as HTMLImageElement;
                    rawImageUrl = imgElem.dataset.src || imgElem.src || imgElem.srcset?.split(',')[0]?.split(' ')[0];
                } else if (imageElement.tagName.toLowerCase() === 'picture') {
                    const sourceElement = imageElement.querySelector('source[srcset]') as HTMLSourceElement;
                    const imgFallbackElement = imageElement.querySelector('img') as HTMLImageElement;
                    if (sourceElement && sourceElement.srcset) {
                        rawImageUrl = sourceElement.srcset.split(',')[0]?.split(' ')[0]?.trim();
                    }
                    if ((!rawImageUrl || rawImageUrl.startsWith('data:image')) && imgFallbackElement) {
                        rawImageUrl = imgFallbackElement.dataset.src || imgFallbackElement.src || imgFallbackElement.srcset?.split(',')[0]?.split(' ')[0];
                    }
                } else { 
                    rawImageUrl = imageElement.getAttribute('src') || 
                                  imageElement.getAttribute('data-src') || 
                                  imageElement.style.backgroundImage.match(/url\("?([^"]*)"?\)/)?.[1];
                }
                
                const commonPlaceholders = ['placeholder', '1x1', 'blank.gif', 'loading', 'spinner', 'dummy', 'spacer', 'transparent', 'empty.png'];
                const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

                if (rawImageUrl && rawImageUrl.trim() !== '' && !rawImageUrl.startsWith('data:image/') && !commonPlaceholders.some(p => rawImageUrl!.toLowerCase().includes(p))) {
                    try {
                        const resolvedImageUrl = new URL(rawImageUrl, baseUrlToUse).href;
                        const urlPath = new URL(resolvedImageUrl).pathname.toLowerCase();

                        if (imageExtensions.some(ext => urlPath.endsWith(ext))) {
                            imageUrl = resolvedImageUrl;
                        } else {
                             console.warn(`[SCRAPE_IMAGE_URL_NO_EXTENSION] Site: "${site.name}", "${title}" için çözümlenmiş resim URL'si ("${resolvedImageUrl}") bilinen bir resim uzantısıyla bitmiyor veya desteklenmeyen bir formatta. Atlanıyor.`);
                        }
                    } catch (e) {
                       console.warn(`[SCRAPE_IMAGE_URL_FAIL] Site: "${site.name}", "${title}" makalesi için resim URL'si ("${rawImageUrl}") (temel: "${baseUrlToUse}") işlenemedi/çözümlenemedi. Resim URL'si boş bırakılacak. Hata: ${e instanceof Error ? e.message : String(e)}`);
                       imageUrl = undefined;
                    }
                } else if (rawImageUrl) {
                     console.warn(`[SCRAPE_IMAGE_URL_SKIP_PLACEHOLDER_OR_DATA_URI] Site: "${site.name}", "${title}" makalesi için resim bir veri URI'si veya yer tutucu, atlanıyor: "${rawImageUrl.substring(0,60)}..."`);
                }
            }
        }

        const normalizedArticleUrlForStorage = normalizeUrl(resolvedArticleUrl);
        const newArticleData: Omit<Article, 'id' | 'airtableCreatedAt' | 'normalizedUrl'> = {
          siteId: site.id!,
          title,
          url: resolvedArticleUrl, 
          summary,
          date: dateStr,
          imageUrl,
          language: site.country === "TR" ? "tr" : "en",
        };

        console.log(`[AIRTABLE_PRE_CREATE_ARTICLE_INFO] Site: "${site.name}", Başlık: "${newArticleData.title}", Kaydedilecek Ham URL: "${resolvedArticleUrl}", Kaydedilecek NormURL: "${normalizedArticleUrlForStorage}", Tarih: "${newArticleData.date}"`);
        try {
            const created = await createArticle(newArticleData, normalizedArticleUrlForStorage); 
            if (created) {
                console.log(`[SCRAPE_ARTICLE_CREATED] Site: "${site.name}", Başlık: "${title}", DB ID: ${created.id}, Ham URL: ${created.url}, NormURL: ${created.normalizedUrl}`);
                result.newArticlesCount++;
            } else {
                const errMsg = `createArticle null döndürdü (muhtemelen yinelenen URL normalizasyon hatası veya başka bir ön kontrol başarısız oldu).`;
                console.error(`[SCRAPE_ARTICLE_CREATE_FAIL_NULL] Site: "${site.name}", Başlık: "${title}", Ham URL: ${resolvedArticleUrl}. ${errMsg}`);
                result.errors.push(`Makale oluşturulamadı (boş sonuç): ${title} - ${errMsg}`);
            }
        } catch (createError) {
            const createErrorMsg = createError instanceof Error ? createError.message : String(createError);
            console.error(`[SCRAPE_ARTICLE_CREATE_ERROR] Site: "${site.name}", Başlık: "${title}", Ham URL: ${resolvedArticleUrl}. Hata: ${createErrorMsg}`);
            result.errors.push(`Makale oluşturma hatası: ${title} - ${createErrorMsg}`);
        }
      }
    }

    if (result.newArticlesCount > 0) {
        console.log(`[SCRAPE_REVALIDATE] Site: "${site.name}", ${result.newArticlesCount} yeni makale, yollar yeniden doğrulanıyor.`);
        revalidatePath(`/rss/${site.slug}.xml`);
        revalidatePath('/');
        await dbUpdateSite(site.id!, { lastScrapedAt: new Date().toISOString() });
    }

  } catch (error) {
    const errorMsg = `Site: "${site.name}" için tarama başarısız: ${error instanceof Error ? error.message : String(error)}`;
    console.error(`[SCRAPE_FATAL_ERROR] ${errorMsg}`, error);
    result.errors.push(errorMsg);
  }
  console.log(`[SCRAPE_END] Site ID: "${siteId}", Sonuç: ${result.newArticlesCount} yeni, ${result.skippedArticlesCount} atlandı, ${result.errors.length} hata.`);
  return result;
}


interface TriggerScrapeActionState {
  message: string;
  timestamp: number;
  success?: boolean;
  newArticlesCount?: number;
  skippedArticlesCount?: number;
  siteId?: string;
  siteName?: string;
}

export async function triggerScrapeActionWithFormState(
  prevState: TriggerScrapeActionState,
  formData: FormData
): Promise<TriggerScrapeActionState> {
  const siteId = formData.get('siteId') as string;
  const siteName = formData.get('siteName') as string;
  const limitString = formData.get('limit') as string;
  const limit = limitString ? parseInt(limitString, 10) : 5;

  if (!siteId || !siteName) {
    return {
      ...prevState,
      message: "Site ID'si veya adı form verilerinde eksik.",
      success: false,
      timestamp: Date.now(),
      siteId,
      siteName
    };
  }

  console.log(`[FORM_SCRAPE_TRIGGER] triggerScrapeActionWithFormState çağrıldı. Site: ${siteName} (ID: ${siteId}), Limit: ${limit}`);
  const result = await triggerScrapeAction(siteId, limit);

  if (result.errors.length > 0) {
     console.log(`[FORM_SCRAPE_RESULT_ERROR] Site: ${siteName}, Yeni: ${result.newArticlesCount}, Atlanan: ${result.skippedArticlesCount}, Hatalar: ${result.errors.join('; ')}`);
    return {
      siteId,
      siteName,
      message: `"${siteName}" için tarama hatalarla tamamlandı. ${result.newArticlesCount} yeni, ${result.skippedArticlesCount} atlandı. Hatalar: ${result.errors.join('; ')}`,
      success: result.newArticlesCount > 0 && result.errors.filter(e => !e.toLowerCase().includes("timeout") && !e.toLowerCase().includes("invalid_value_for_column") && !e.toLowerCase().includes("unknown_field_name")).length === 0,
      newArticlesCount: result.newArticlesCount,
      skippedArticlesCount: result.skippedArticlesCount,
      timestamp: Date.now(),
    };
  }
  console.log(`[FORM_SCRAPE_RESULT_SUCCESS] Site: ${siteName}, Yeni: ${result.newArticlesCount}, Atlanan: ${result.skippedArticlesCount}`);
  return {
    siteId,
    siteName,
    message: `"${siteName}" sitesi için tarama başarılı. ${result.newArticlesCount} yeni makale eklendi, ${result.skippedArticlesCount} makale zaten mevcut olduğu için atlandı.`,
    success: true,
    newArticlesCount: result.newArticlesCount,
    skippedArticlesCount: result.skippedArticlesCount,
    timestamp: Date.now(),
  };
}


interface BulkScrapeJob {
  siteId: string;
  count: number;
}

interface BulkScrapeOverallResult {
  success: boolean;
  message: string;
  results?: Array<{
    siteId: string;
    siteName: string;
    status: string;
    newArticles: number;
    skippedArticles: number;
    errors: string[];
  }>;
}

export async function bulkScrapeAction(jobs: BulkScrapeJob[]): Promise<BulkScrapeOverallResult> {
  await initializeAirtable();
  console.log(`[BULK_SCRAPE_START] ${jobs.length} iş için toplu tarama başlatılıyor.`);
  const allSites = await dbGetSites(); 
  const siteMap = new Map(allSites.map(site => [site.id!, site]));

  let totalNewArticles = 0;
  let totalSkippedArticles = 0;
  let successfulScrapes = 0;
  const individualResults = [];

  for (const job of jobs) {
    const site = siteMap.get(job.siteId);
    const siteName = site?.name || `Bilinmeyen Site (ID: ${job.siteId})`;

    if (!site || !site.active) { 
        console.log(`[BULK_SCRAPE_SKIP_SITE] Toplu tarama: "${siteName}" sitesi (ID: ${job.siteId}) atlanıyor (bulunamadı, pasif veya HTML değil).`);
        individualResults.push({
            siteId: job.siteId,
            siteName: siteName,
            status: `Site atlandı (bulunamadı, pasif veya HTML değil).`,
            newArticles: 0,
            skippedArticles: 0,
            errors: ['Site atlandı (bulunamadı, pasif veya HTML değil).'],
        });
        continue;
    }

    console.log(`[BULK_SCRAPE_PROCESSING_SITE] Toplu tarama: "${siteName}" sitesi için ${job.count} makale taranıyor...`);
    const result = await triggerScrapeAction(job.siteId, job.count);

    let statusMessage = '';
    
    const criticalErrors = result.errors.filter(e => 
        !e.toLowerCase().includes("invalid_value_for_column") && 
        !e.toLowerCase().includes("unknown_field_name") &&
        !e.toLowerCase().includes("timeout") 
    );

    const isJobConsideredSuccess = result.newArticlesCount > 0 || criticalErrors.length === 0;


    if (result.errors.length > 0) {
      statusMessage = `"${siteName}" için tarama ${criticalErrors.length > 0 ? 'önemli hatalarla' : 'hatalarla'} tamamlandı. ${result.newArticlesCount} yeni, ${result.skippedArticlesCount} atlandı. Hatalar: ${result.errors.join('; ')}`;
    } else {
      statusMessage = `"${siteName}" sitesi için tarama başarılı. ${result.newArticlesCount} yeni makale eklendi, ${result.skippedArticlesCount} makale zaten mevcut olduğu için atlandı.`;
    }

    if (isJobConsideredSuccess) {
        successfulScrapes++;
    }


    individualResults.push({
      siteId: job.siteId,
      siteName: siteName,
      status: statusMessage,
      newArticles: result.newArticlesCount,
      skippedArticles: result.skippedArticlesCount,
      errors: result.errors,
    });
    totalNewArticles += result.newArticlesCount;
    totalSkippedArticles += result.skippedArticlesCount;
  }

  if (totalNewArticles > 0) {
    revalidatePath('/'); 
    
  }

  const overallMessage = `Toplu tarama tamamlandı. ${jobs.length} site için deneme yapıldı, ${successfulScrapes} göreceli olarak başarılı oldu. Toplam ${totalNewArticles} yeni makale eklendi, ${totalSkippedArticles} makale atlandı.`;
  console.log(`[BULK_SCRAPE_END] ${overallMessage}`);

  return {
    success: successfulScrapes > 0 || (jobs.length === 0 && totalNewArticles === 0 && totalSkippedArticles === 0),
    message: overallMessage,
    results: individualResults,
  };
}


interface GetSelectorsResponse {
  success: boolean;
  selectors?: SelectorConfig;
  message?: string;
}

export async function getSelectorsForUrlAction(url: string): Promise<GetSelectorsResponse> {
  
  console.log(`[GET_SELECTORS_ACTION] URL için seçiciler alınıyor: ${url}`);
  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    const errorMsg = "Lütfen geçerli bir HTTP/HTTPS URL'si girin.";
    console.warn(`[GET_SELECTORS_ACTION_FAIL] ${errorMsg} Alınan: ${url}`);
    return { success: false, message: errorMsg };
  }

  try {
    const htmlContent = await fetchHtmlContent(url);
    
    
    const MAX_HTML_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
    if (new TextEncoder().encode(htmlContent).length > MAX_HTML_SIZE_BYTES) {
      console.warn(`[GET_SELECTORS_ACTION] URL ${url} için HTML içeriği çok büyük (${(new TextEncoder().encode(htmlContent).length / (1024*1024)).toFixed(2)}MB), potansiyel olarak kısaltılıyor veya işlem reddediliyor.`);
      // Gerekirse burada içeriği kısaltabilir veya hata verebilirsiniz. Şimdilik devam ediyoruz.
    }

    console.log(`[GET_SELECTORS_ACTION] URL ${url} için AI'dan seçiciler çıkarılıyor.`);
    const extracted = await extractSelectors({ htmlContent, originalUrl: url });
    console.log(`[GET_SELECTORS_ACTION] URL ${url} için AI tarafından çıkarılan seçiciler:`, extracted);

    const validatedSelectors: SelectorConfig = {
        item_selector: typeof extracted.item_selector === 'string' ? extracted.item_selector : "",
        title_selector: typeof extracted.title_selector === 'string' ? extracted.title_selector : "",
        link_selector: typeof extracted.link_selector === 'string' ? extracted.link_selector : "",
        summary_selector: typeof extracted.summary_selector === 'string' ? extracted.summary_selector : "",
        date_selector: typeof extracted.date_selector === 'string' ? extracted.date_selector : "",
        image_selector: typeof extracted.image_selector === 'string' ? extracted.image_selector : "",
        base_url: typeof extracted.base_url === 'string' ? extracted.base_url : "",
    };

    if (!validatedSelectors.item_selector || !validatedSelectors.title_selector || !validatedSelectors.link_selector) {
        const errorMsg = "Yapay zeka gerekli seçicileri (item, title, link) çıkaramadı. Lütfen manuel olarak girin.";
        console.warn(`[GET_SELECTORS_ACTION_FAIL] URL ${url} için ${errorMsg} Çıkarılan:`, validatedSelectors);
        return { success: false, message: errorMsg };
    }

    console.log(`[GET_SELECTORS_ACTION_SUCCESS] URL ${url} için başarıyla seçiciler çıkarıldı ve doğrulandı.`);
    return { success: true, selectors: validatedSelectors };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Seçiciler alınırken bilinmeyen bir hata oluştu.';
    console.error(`[GET_SELECTORS_ACTION_ERROR] URL ${url} için seçiciler alınırken hata:`, errorMessage, error);
    return { success: false, message: errorMessage };
  }
}


    
