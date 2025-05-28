
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { triggerScrapeActionWithFormState } from '@/app/actions';
import { Loader2, PlayCircle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { useActionState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SubmitButton } from './SubmitButton';

interface IndividualScrapeButtonProps extends ButtonProps {
  siteId: string;
  siteName: string;
  title?: string;
}

const DEFAULT_SCRAPE_LIMIT = 5;

interface ScrapeActionState {
  message: string;
  timestamp: number;
  success?: boolean;
  newArticlesCount?: number;
  skippedArticlesCount?: number;
  siteId?: string;
  siteName?: string;
}

const initialState: ScrapeActionState = {
  message: '',
  timestamp: 0,
  success: undefined,
  newArticlesCount: 0,
  skippedArticlesCount: 0,
  siteId: '',
  siteName: '',
};

export function IndividualScrapeButton({
  siteId,
  siteName,
  children,
  variant = "outline",
  size = "sm",
  title,
  ...props
}: IndividualScrapeButtonProps) {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [scrapeLimitInput, setScrapeLimitInput] = useState(String(DEFAULT_SCRAPE_LIMIT));
  const [dialogPhase, setDialogPhase] = useState<'input' | 'loading' | 'result'>('input');
  
  const [state, formAction, isPending] = useActionState(triggerScrapeActionWithFormState, {
    ...initialState,
    siteId: siteId, 
    siteName: siteName,
  });

  const prevTimestampRef = useRef<number>(initialState.timestamp);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (isPending) {
      setDialogPhase('loading');
    } else {
      if (state.timestamp > 0 && state.timestamp !== prevTimestampRef.current) {
        prevTimestampRef.current = state.timestamp;
        setDialogPhase('result');
        toast({
          title: `${state.success ? 'Tarama Tamamlandı' : (state.success === false ? 'Tarama Sonucu' : 'Tarama Bilgisi')}: ${state.siteName}`,
          description: (
            <>
              <p>{state.message}</p>
              {(state.newArticlesCount !== undefined && state.newArticlesCount > 0) || (state.skippedArticlesCount !== undefined && state.skippedArticlesCount > 0) ? (
                <p className="text-xs mt-1">
                  Yeni: {state.newArticlesCount || 0}, Atlanan: {state.skippedArticlesCount || 0}
                </p>
              ) : null }
               {!state.success && state.message && (state.message.toLowerCase().includes("unknown_field_name") || state.message.toLowerCase().includes("invalid_value_for_column")) && (
                <p className="text-xs mt-1 text-muted-foreground">
                  Airtable şema hatası olabilir veya geçersiz tarih formatı. Alan adlarını/türlerini kontrol edin veya tabloyu yeniden oluşturmayı deneyin.
                </p>
              )}
            </>
          ),
          variant: state.success ? 'default' : (state.success === false ? 'destructive' : 'default'),
        });
      }
    }
  }, [isPending, state, siteName, toast]);

  const handleOpenDialog = () => {
    setDialogPhase('input');
    setScrapeLimitInput(String(DEFAULT_SCRAPE_LIMIT));
    prevTimestampRef.current = 0; 
    setIsDialogOpen(true);
  };

  const handleDialogFormSubmit = (formData: FormData) => {
    formData.append('siteId', siteId);
    formData.append('siteName', siteName);
    formAction(formData);
  };
  
  const renderDialogContent = () => {
    switch (dialogPhase) {
      case 'input':
        return (
          <>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              "{siteName}" sitesinden kaç adet makale çekmek istediğinizi belirtin.
            </AlertDialogDescription>
            <form
              ref={formRef}
              action={handleDialogFormSubmit}
              className="space-y-4 pt-2"
            >
              <div>
                <Label htmlFor="scrapeLimit" className="text-sm font-medium">
                  Çekilecek Makale Sayısı
                </Label>
                <Input
                  id="scrapeLimit"
                  name="limit" 
                  type="number"
                  value={scrapeLimitInput}
                  onChange={(e) => setScrapeLimitInput(e.target.value)}
                  min="1"
                  className="mt-1"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Bu site için en fazla kaç makalenin taranacağını belirtin.
                </p>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setIsDialogOpen(false)}>İptal</AlertDialogCancel>
                <SubmitButton>
                  <PlayCircle className="mr-2 h-4 w-4" />
                  Tara
                </SubmitButton>
              </AlertDialogFooter>
            </form>
          </>
        );
      case 'loading':
        return (
          <div className="flex flex-col items-center justify-center p-4 space-y-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              `{siteName}` sitesi taranıyor ({scrapeLimitInput} makale limiti)... Lütfen bekleyin.
            </p>
          </div>
        );
      case 'result':
        return (
          <>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              Tarama işlemi sonucu aşağıdadır.
            </AlertDialogDescription>
            <div className="space-y-2 pt-2 text-sm">
              <p className={`font-semibold ${state.success ? 'text-green-600' : 'text-destructive'}`}>
                {state.success ? 'Tarama Başarılı!' : (state.success === false ? 'Tarama Başarısız veya Hatalı!' : 'Tarama Durumu')}
              </p>
              <p className="text-muted-foreground">{state.message}</p>
              {(state.newArticlesCount !== undefined && state.newArticlesCount > 0) || (state.skippedArticlesCount !== undefined && state.skippedArticlesCount > 0) ? (
                <p className="text-xs">
                  Eklenen Yeni Makale Sayısı: {state.newArticlesCount || 0}
                  <br />
                  Atlanan (Mevcut) Makale Sayısı: {state.skippedArticlesCount || 0}
                </p>
              ) : null}
              {!state.success && state.message && (state.message.toLowerCase().includes("unknown_field_name") || state.message.toLowerCase().includes("invalid_value_for_column")) && (
                <p className="text-xs mt-1 text-muted-foreground">
                  Airtable şema hatası olabilir veya geçersiz tarih formatı. Alan adlarını/türlerini kontrol edin veya tabloyu yeniden oluşturmayı deneyin.
                </p>
              )}
              <AlertDialogFooter>
                <Button onClick={() => setIsDialogOpen(false)} variant="outline">
                  Kapat
                </Button>
              </AlertDialogFooter>
            </div>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <Button
        onClick={handleOpenDialog}
        disabled={isPending && dialogPhase === 'loading'}
        aria-label={title || `"${siteName}" sitesini hemen tara`}
        title={title || `Bu siteyi hemen tara (makale sayısını belirleyerek)`}
        variant={variant}
        size={size}
        {...props}
      >
        {(isPending && dialogPhase === 'loading') ? (
          <Loader2 className={`h-4 w-4 animate-spin ${size !== 'icon' ? 'mr-2' : ''}`} />
        ) : (
          size !== 'icon' ? <PlayCircle className="mr-2 h-4 w-4" /> : <PlayCircle className="h-4 w-4" />
        )}
        {size !== 'icon' && ((isPending && dialogPhase === 'loading') ? 'Taranıyor...' : (children || 'Hemen Tara'))}
      </Button>

      <AlertDialog open={isDialogOpen} onOpenChange={(open) => {
          if (isPending && dialogPhase === 'loading' && !open) {
            return; 
          }
          setIsDialogOpen(open);
          if (!open) { 
            setDialogPhase('input');
          }
        }}>
        <AlertDialogPortal>
          <AlertDialogOverlay />
          <AlertDialogContent className="sm:max-w-md md:max-w-lg">
            <AlertDialogHeader>
              <AlertDialogTitle>
                {dialogPhase === 'input' ? `Siteyi Tara: ${siteName}` : `Tarama Durumu: ${siteName}`}
              </AlertDialogTitle>
            </AlertDialogHeader>
            <div className="max-h-[60vh] overflow-y-auto py-2">
              {renderDialogContent()}
            </div>
          </AlertDialogContent>
        </AlertDialogPortal>
      </AlertDialog>
    </>
  );
}
