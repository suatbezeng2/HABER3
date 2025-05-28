import { getSiteById } from '@/lib/airtable';
import { SiteForm } from '@/app/sites/components/SiteForm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import Link from 'next/link'; 

export const dynamic = 'force-dynamic';

export default async function EditSitePage({ params }: { params: { id: string } }) {
  const site = await getSiteById(params.id);

  if (!site) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Site Bulunamadı</CardTitle>
            <CardDescription>
              Aradığınız ID'ye sahip site yapılandırması bulunamadı. Lütfen ID'yi kontrol edin veya{' '}
              <Link href="/sites" className="underline text-primary hover:text-primary/80">site listesine geri dönün</Link>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">ID: {params.id}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <SiteForm site={site} />
    </div>
  );
}
