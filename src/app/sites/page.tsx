
import { getSites, initializeAirtable } from '@/lib/airtable';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';
import { SitesList } from './components/SitesList'; // Import the new client component

export const dynamic = 'force-dynamic';

export default async function SitesListPage() {
  let sites = [];
  let airtableError: Error | null = null;

  try {
    await initializeAirtable();
    sites = await getSites();
  } catch (error) {
    console.error("Airtable başlatılırken veya siteler alınırken hata oluştu (Site Listesi):", error);
    airtableError = error instanceof Error ? error : new Error(String(error));
  }

  if (airtableError) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-6 w-6" />
              Kritik Hata
            </CardTitle>
            <CardDescription>
              Uygulama yapılandırmasında bir sorun oluştu (Airtable bağlantısı kurulamadı veya veriler alınamadı). Lütfen sistem yöneticisi ile iletişime geçin.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
              {airtableError.message}
            </pre>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Pass fetched sites to the client component
  return <SitesList initialSites={sites} />;
}

