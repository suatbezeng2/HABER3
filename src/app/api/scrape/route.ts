
import { NextResponse, type NextRequest } from 'next/server';
import { bulkScrapeAction } from '@/app/actions';
import { initializeAirtable, getSites as dbGetSites } from '@/lib/airtable';
import type { Site } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    await initializeAirtable(); // Airtable'ın hazır olduğundan emin ol
    const body = await request.json();

    const { siteIds, scrapeAllActive, limitPerSite = 10 } = body; // Kullanıcının istediği gibi varsayılan limit 10

    if (typeof limitPerSite !== 'number' || limitPerSite < 1) {
      return NextResponse.json({ success: false, message: "Geçersiz 'limitPerSite'. Pozitif bir sayı olmalı." }, { status: 400 });
    }

    let jobs: Array<{ siteId: string; count: number }> = [];

    if (Array.isArray(siteIds) && siteIds.length > 0) {
      jobs = siteIds.map((id: unknown) => {
        if (typeof id !== 'string') {
          // Bu durum 400 Bad Request olarak ele alınmalı
          // throw new Error("siteIds dizisindeki ID'ler metin olmalıdır.");
           return { siteId: "INVALID_ID_FORMAT", count: 0 }; // Hatalı formatı işaretle
        }
        return { siteId: id, count: limitPerSite };
      });
      // Geçersiz ID formatlarını filtrele
      const originalJobCount = jobs.length;
      jobs = jobs.filter(job => job.siteId !== "INVALID_ID_FORMAT");
      if (jobs.length !== originalJobCount) {
         console.warn(`[API_SCRAPE_POST] siteIds içinde geçersiz formatlı ID'ler bulundu ve atlandı.`);
         if (jobs.length === 0 && originalJobCount > 0) {
            return NextResponse.json({ success: false, message: "Sağlanan siteIds dizisindeki tüm ID'ler geçersiz formatta." }, { status: 400 });
         }
      }

    } else if (scrapeAllActive === true) {
      const allSites: Site[] = await dbGetSites();
      const activeSites = allSites.filter((site) => site.active && site.id);
      jobs = activeSites.map((site) => ({ siteId: site.id!, count: limitPerSite }));
    } else {
      return NextResponse.json({ success: false, message: "Geçerli 'siteIds' dizisi sağlanmalı veya 'scrapeAllActive' true olarak ayarlanmalı." }, { status: 400 });
    }

    if (jobs.length === 0) {
      return NextResponse.json({ success: true, message: "Belirtilen kriterlere göre taranacak uygun site bulunamadı.", results: [] }, { status: 200 });
    }

    console.log(`[API_SCRAPE_POST] API üzerinden ${jobs.length} iş için toplu tarama başlatılıyor, her biri için ${limitPerSite} makale limiti.`);
    const result = await bulkScrapeAction(jobs);
    
    // Yanıtın success durumunu, tüm işlerin başarılı olup olmamasına veya kritik bir hata olmamasına göre ayarla
    const overallSuccess = result.success || (result.results && result.results.every(r => (r.newArticles >= 0 && r.errors.length === 0) || (r.newArticles === 0 && r.skippedArticles > 0 && r.errors.length === 0) ));

    return NextResponse.json(
        { ...result, success: overallSuccess }, // API yanıtındaki success durumunu güncelle
        { status: overallSuccess ? 200 : (result.results && result.results.some(r => r.errors.length > 0) ? 207 : 500) } // 207 Multi-Status kısmi başarılar için
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Bilinmeyen bir API hatası oluştu.';
    console.error('[API_SCRAPE_POST_ERROR]', errorMessage, error);
    return NextResponse.json({ success: false, message: `API Hatası: ${errorMessage}` }, { status: 500 });
  }
}
