
'use client';

import type { Site } from '@/lib/types';
import { useState, useTransition, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
// import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'; Removed as not directly used
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription as ShadcnFormDescription } from '@/components/ui/form';
import { bulkScrapeAction } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { SubmitButton } from '@/components/shared/SubmitButton';
import Link from 'next/link';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogOverlay,
  AlertDialogPortal,
} from '@/components/ui/alert-dialog';
import { Loader2 } from 'lucide-react';

const bulkScrapeFormSchema = z.object({
  scrapeCount: z.coerce.number().int().min(1, "Tarama sayısı en az 1 olmalıdır.").default(1),
});

type BulkScrapeFormValues = z.infer<typeof bulkScrapeFormSchema>;

interface BulkScrapeFormProps {
  sites: Site[];
}

interface SiteBulkScrapeResult {
    siteId: string;
    siteName: string;
    status: string;
    newArticles: number;
    skippedArticles: number;
}

export function BulkScrapeForm({ sites }: BulkScrapeFormProps) {
  const { toast } = useToast();
  const [isBulkScrapePending, startBulkScrapeTransition] = useTransition();
  const [isResultDialogOpen, setIsResultDialogOpen] = useState(false);
  const [resultDialogContent, setResultDialogContent] = useState<React.ReactNode>('');


  const form = useForm<BulkScrapeFormValues>({
    resolver: zodResolver(bulkScrapeFormSchema),
    defaultValues: { scrapeCount: 1 },
  });
  
  const { control, handleSubmit, reset } = form;

  useEffect(() => {
    reset({ scrapeCount: 1 });
  }, [sites, reset]);


  const onSubmit = (data: BulkScrapeFormValues) => {
    const { scrapeCount } = data;

    const scrapeJobs = sites
      .filter(site => site.id && site.active) 
      .map(site => ({ siteId: site.id!, count: scrapeCount }));

    if (scrapeJobs.length === 0) {
      toast({
        title: 'Tarama Başlatılamadı',
        description: 'Taranacak aktif site bulunamadı veya seçilen tarama sayısı geçersiz.',
        variant: 'destructive',
      });
      return;
    }

    setIsResultDialogOpen(true);
    setResultDialogContent(
      <>
        <AlertDialogDescription className="text-sm text-muted-foreground pb-2">
          Toplu tarama işlemi başlatılıyor. Lütfen sabırla bekleyin...
        </AlertDialogDescription>
        <div className="flex items-center p-4">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          <span>Toplu tarama başlatılıyor... Lütfen bekleyin.</span>
        </div>
      </>
    );

    startBulkScrapeTransition(async () => {
      const result = await bulkScrapeAction(scrapeJobs);
      if (result.success) {
        setResultDialogContent(
          <>
            <AlertDialogDescription className="text-sm text-muted-foreground pb-2">
              Toplu tarama işlemi tamamlandı. Sonuçlar aşağıdadır.
            </AlertDialogDescription>
            <div className="space-y-2">
                <p className="font-semibold text-green-600">Toplu Tarama Tamamlandı</p>
                <p>{result.message}</p>
                {result.results && result.results.length > 0 && (
                    <div className="mt-4">
                        <h4 className="font-medium mb-2 text-foreground">Detaylar:</h4>
                        <ScrollArea className="h-60 border p-2 rounded-md">
                          <ul className="space-y-1 text-sm">
                              {result.results.map((siteResult: SiteBulkScrapeResult, index: number) => (
                                  <li key={siteResult.siteId || index} className="p-1.5 bg-muted/50 rounded-sm">
                                      <strong>{siteResult.siteName}:</strong>{' '}
                                      {siteResult.status}
                                  </li>
                              ))}
                          </ul>
                        </ScrollArea>
                    </div>
                )}
            </div>
          </>
        );
      } else {
        setResultDialogContent(
          <>
            <AlertDialogDescription className="text-sm text-muted-foreground pb-2">
             Toplu tarama işlemi başarısız oldu veya hatalarla tamamlandı.
            </AlertDialogDescription>
            <div className="space-y-2">
                <p className="font-semibold text-destructive">Toplu Tarama Başarısız</p>
                <p>{result.message || "Bilinmeyen bir hata oluştu."}</p>
                 {result.results && Array.isArray(result.results) && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    Hata detayları için sunucu günlüklerini kontrol edin.
                  </div>
                )}
            </div>
          </>
        );
      }
       toast({ 
        title: result.success ? 'Toplu Tarama Tamamlandı' : 'Toplu Tarama Hatası',
        description: result.message,
        variant: result.success ? 'default' : 'destructive',
      });
    });
  };

  if (sites.length === 0) {
    return (
        <div className="text-center text-muted-foreground py-8">
            <p className="mb-4">Henüz yapılandırılmış site bulunmuyor.</p>
            <Button asChild>
                <Link href="/sites/new">Yeni Site Ekle</Link>
            </Button>
        </div>
    );
  }
  
  const activeSites = sites.filter(site => site.active);

  return (
    <>
      <Form {...form}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            control={control}
            name="scrapeCount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Genel Tarama Sayısı</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min="1"
                    placeholder="Her aktif site için tarama sayısı"
                    {...field}
                    className="max-w-xs"
                  />
                </FormControl>
                <ShadcnFormDescription>
                  Aşağıda listelenen TÜM AKTİF siteler için uygulanacak makale tarama limiti.
                </ShadcnFormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {activeSites.length > 0 ? (
              <>
                  <h3 className="text-lg font-medium">Taranacak Aktif Siteler ({activeSites.length}):</h3>
                  <ScrollArea className="h-72 w-full rounded-md border p-4">
                      <ul className="space-y-2">
                      {activeSites.map((site) => site.id && (
                          <li key={site.id} className="text-sm p-2 bg-muted/50 rounded-md">
                              {site.name} ({site.homepageUrl})
                          </li>
                      ))}
                      </ul>
                  </ScrollArea>
              </>
          ) : (
              <p className="text-muted-foreground">Taranacak aktif site bulunmuyor.</p>
          )}
          
          <SubmitButton disabled={isBulkScrapePending || activeSites.length === 0}>
            {isBulkScrapePending ? 'Taranıyor...' : `Aktif Siteleri Tara (${activeSites.length} site)`}
          </SubmitButton>
        </form>
      </Form>
      
      {isResultDialogOpen && (
        <AlertDialog open={isResultDialogOpen} onOpenChange={setIsResultDialogOpen}>
          <AlertDialogPortal>
            <AlertDialogOverlay />
            <AlertDialogContent className="sm:max-w-lg md:max-w-xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Toplu Tarama Durumu</AlertDialogTitle>
              </AlertDialogHeader>
              <div className="max-h-[60vh] overflow-y-auto p-1 text-sm text-muted-foreground space-y-2"> {/* Reduced p-4 to p-1 to prevent double padding */}
                  {resultDialogContent}
              </div>
              <AlertDialogFooter>
                <Button onClick={() => setIsResultDialogOpen(false)} disabled={isBulkScrapePending} variant="outline">
                  Kapat
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialogPortal>
        </AlertDialog>
      )}
    </>
  );
}
