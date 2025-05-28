
import { getSites, initializeAirtable } from '@/lib/airtable';
import { BulkScrapeForm } from './components/BulkScrapeForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function BulkScrapePage() {
  try {
    await initializeAirtable();
  } catch (error) {
    console.error("Airtable başlatılırken hata oluştu (Toplu Tarama):", error);
    return (
      <div className="space-y-6 p-4 md:p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6">Toplu Site Tarama</h1>
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-6 w-6" />
              Kritik Hata
            </CardTitle>
            <CardDescription>
              Uygulama yapılandırmasında bir sorun oluştu (Airtable bağlantısı kurulamadı). Lütfen sistem yöneticisi ile iletişime geçin.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
              {error instanceof Error ? error.message : String(error)}
            </pre>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  const sites = await getSites();
  const activeSites = sites.filter(site => site.active);

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-4xl mx-auto">
       <h1 className="text-2xl sm:text-3xl font-bold">Toplu Site Tarama</h1>
      <Card>
        <CardHeader>
          <CardTitle>Tüm Siteleri Tara</CardTitle>
          <CardDescription>
            Tüm aktif siteleri aynı anda, belirlediğiniz genel bir tarama sayısıyla tarayın. Tarama işlemi zaman alabilir.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sites.length > 0 ? ( 
            activeSites.length > 0 ? (
              <BulkScrapeForm sites={activeSites} /> 
            ) : (
               <p className="text-muted-foreground py-4">Tarama için yapılandırılmış aktif site bulunmuyor. Lütfen sitelerinizi kontrol edin veya yeni site ekleyin.</p>
            )
          ) : (
            <p className="text-muted-foreground py-4">Tarama için yapılandırılmış site bulunmuyor.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
