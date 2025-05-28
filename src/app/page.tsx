
import Link from 'next/link';
import { getSites, initializeAirtable } from '@/lib/airtable';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Rss, Edit3, AlertTriangle } from 'lucide-react';
import { IndividualScrapeButton } from '@/components/shared/IndividualScrapeButton';

export const dynamic = 'force-dynamic'; // Ensure fresh data on each request

export default async function HomePage() {
  let sites = [];
  let airtableError: Error | null = null;

  try {
    await initializeAirtable();
    sites = await getSites();
  } catch (error) {
    console.error("Airtable başlatılırken veya siteler alınırken hata oluştu (Anasayfa):", error);
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
  
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold">Site Kontrol Paneli</h1>
        <Button asChild>
          <Link href="/sites/new">Yeni Site Ekle</Link>
        </Button>
      </div>

      {sites.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-lg text-muted-foreground">Henüz yapılandırılmış site yok.</p>
            <Button asChild className="mt-4">
              <Link href="/sites/new">İlk Sitenizi Ekleyin</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {sites.map((site) => (
          <Card key={site.id} className="flex flex-col">
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-lg">{site.name}</CardTitle> {/* Adjusted size for consistency */}
                <Badge variant={site.active ? 'default' : 'secondary'} className="flex-shrink-0">
                  {site.active ? 'Aktif' : 'Pasif'}
                </Badge>
              </div>
              <CardDescription>
                <Link href={site.homepageUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm hover:underline text-primary break-all">
                  {site.homepageUrl} <ExternalLink className="h-3 w-3 flex-shrink-0" />
                </Link>
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-grow space-y-2">
              <p className="text-sm text-muted-foreground">
                Kısa Ad: <span className="font-medium text-foreground">{site.slug}</span>
              </p>
              {site.country && (
                <p className="text-sm text-muted-foreground">
                  Ülke: <span className="font-medium text-foreground">{site.country}</span>
                </p>
              )}
              {site.id && (
                <Link href={`/rss/${site.slug}.xml`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm text-primary hover:underline">
                  <Rss className="h-4 w-4" /> RSS Beslemesini Görüntüle
                </Link>
              )}
            </CardContent>
            <CardFooter className="grid grid-cols-2 gap-2 border-t pt-4"> 
              <Button variant="outline" size="sm" asChild className="w-full">
                <Link href={`/sites/edit/${site.id}`} className="flex items-center justify-center gap-1">
                  <Edit3 className="h-4 w-4" /> Düzenle
                </Link>
              </Button>
              {site.id && <IndividualScrapeButton siteId={site.id} siteName={site.name} variant="outline" size="sm" className="w-full" />}
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
