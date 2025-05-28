
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Site, SelectorConfig } from '@/lib/types';
import { createSiteAction, updateSiteAction, getSelectorsForUrlAction } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import React, { useEffect, useTransition, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import Link from 'next/link';
import { sitePresets, defaultSelectorConfig } from '@/lib/site-presets';
import { Wand2 } from 'lucide-react';

// This schema is used to validate the parsed JSON from the selectorConfig string
const parsedSelectorConfigSchema = z.object({
  item_selector: z.string().min(1, "Öğe seçici gereklidir ve boş olamaz."),
  title_selector: z.string().min(1, "Başlık seçici gereklidir ve boş olamaz."),
  link_selector: z.string().min(1, "Bağlantı seçici gereklidir ve boş olamaz."),
  summary_selector: z.string(), // Must be present as a string (can be empty)
  date_selector: z.string(),    // Must be present as a string (can be empty)
  image_selector: z.string().optional(), // Optional string, aligning with SelectorConfig type
  base_url: z.string()
    .url({ message: "Temel URL için geçersiz URL formatı." })
    .or(z.literal(''))
    .optional(), // Optional, and if present, must be a valid URL or an empty string
});

const formSchema = z.object({
  name: z.string().min(2, { message: "Site adı en az 2 karakter olmalıdır." }).default(''),
  homepageUrl: z.string().url({ message: "Lütfen taranacak HTML sayfası için geçerli bir URL girin." }).default(''),
  slug: z.string().min(2, { message: "Kısa ad en az 2 karakter olmalıdır." }).regex(/^[a-z0-9-]+$/, "Kısa ad küçük harf, rakam ve tire içermelidir.").default(''),
  active: z.boolean().default(true),
  country: z.string().optional().default(''),
  selectorConfig: z.string().refine((val, ctx) => {
    let parsed;
    try {
      parsed = JSON.parse(val);
    } catch (e) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "JSON formatı bozuk. Lütfen yapıyı kontrol edin.",
      });
      return z.NEVER;
    }
    const result = parsedSelectorConfigSchema.safeParse(parsed);
    if (!result.success) {
      result.error.errors.forEach((err) => {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${err.path.join('.')} için hata: ${err.message}`,
        });
      });
      return z.NEVER;
    }
    return true;
  }, {
    message: "Geçersiz Seçici Yapılandırması. Lütfen JSON formatını ve alanların doğruluğunu kontrol edin. 'item_selector', 'title_selector', 'link_selector' dolu olmalı. 'summary_selector' ve 'date_selector' metin olmalı (boş olabilir). 'image_selector' ve 'base_url' isteğe bağlıdır (base_url boş veya geçerli URL olmalı)."
  })
  .default(JSON.stringify(defaultSelectorConfig, null, 2)),
});

type SiteFormValues = z.infer<typeof formSchema>;

interface SiteFormProps {
  site?: Site | null;
}

export function SiteForm({ site }: SiteFormProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isDetectingSelectors, setIsDetectingSelectors] = useState(false);

  const memoizedDefaultValues = React.useMemo(() => {
    if (site) {
      const sc = site.selectorConfig;
      const completeScObject: SelectorConfig = {
        item_selector: sc.item_selector || "",
        title_selector: sc.title_selector || "",
        link_selector: sc.link_selector || "",
        summary_selector: sc.summary_selector || "",
        date_selector: sc.date_selector || "",
        image_selector: sc.image_selector || "", 
        base_url: sc.base_url || "",
      };
      const currentSelectorConfigString = JSON.stringify(completeScObject, null, 2);

      return {
        name: site.name || '',
        homepageUrl: site.homepageUrl || '',
        slug: site.slug || '',
        active: site.active === undefined ? true : site.active,
        country: site.country || '',
        selectorConfig: currentSelectorConfigString,
      };
    }
    return {
      name: '',
      homepageUrl: '',
      slug: '',
      active: true,
      country: '',
      selectorConfig: JSON.stringify(defaultSelectorConfig, null, 2),
    };
  }, [site]);

  const form = useForm<SiteFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: memoizedDefaultValues,
    mode: 'onChange',
  });

  useEffect(() => {
    form.reset(memoizedDefaultValues);
  }, [form, memoizedDefaultValues]);

  const handlePresetChange = (presetName: string) => {
    const selectedPreset = sitePresets.find(p => p.name === presetName);
    if (selectedPreset) {
      form.setValue('selectorConfig', JSON.stringify(selectedPreset.config, null, 2), { shouldValidate: true, shouldDirty: true });
    } else if (presetName === "default") {
      form.setValue('selectorConfig', JSON.stringify(defaultSelectorConfig, null, 2), { shouldValidate: true, shouldDirty: true });
    }
  };

  const handleAutoDetectSelectors = async () => {
    const homepageUrl = form.getValues('homepageUrl');
    if (!homepageUrl) {
      toast({ title: "Anasayfa URL'si Gerekli", description: "Seçicileri otomatik algılamak için lütfen bir Anasayfa URL'si girin.", variant: "destructive" });
      return;
    }
    try {
      new URL(homepageUrl);
    } catch (e) {
      toast({ title: "Geçersiz Anasayfa URL'si", description: "Lütfen geçerli bir Anasayfa URL'si girin.", variant: "destructive" });
      return;
    }

    setIsDetectingSelectors(true);
      try {
        const result = await getSelectorsForUrlAction(homepageUrl);
        if (result.success && result.selectors) {
          const completeSelectors: SelectorConfig = {
            item_selector: result.selectors.item_selector || "",
            title_selector: result.selectors.title_selector || "",
            link_selector: result.selectors.link_selector || "",
            summary_selector: result.selectors.summary_selector || "",
            date_selector: result.selectors.date_selector || "",
            image_selector: result.selectors.image_selector || "",
            base_url: result.selectors.base_url || "",
          };
          form.setValue('selectorConfig', JSON.stringify(completeSelectors, null, 2), { shouldValidate: true, shouldDirty: true });
          toast({ title: "Seçiciler Otomatik Algılandı", description: "Lütfen seçicileri gözden geçirin ve gerektiği gibi ayarlayın." });
        } else {
          toast({ title: "Otomatik Algılama Başarısız", description: result.message || "Seçiciler otomatik algılanamadı. Lütfen el ile girin veya farklı bir hazır ayar deneyin.", variant: "destructive" });
        }
      } catch (error) {
        const err = error as Error;
        toast({ title: "Otomatik Algılama Hatası", description: err.message || "Seçiciler algılanırken bir hata oluştu.", variant: "destructive" });
      } finally {
        setIsDetectingSelectors(false);
      }
  };

  const onSubmit = async (values: SiteFormValues) => {
    const formData = new FormData();
    Object.entries(values).forEach(([key, value]) => {
      if (key === 'active') {
        formData.append(key, value ? 'on' : '');
      } else if (key === 'country') {
        formData.append(key, value || '');
      }
      else {
        formData.append(key, String(value));
      }
    });

    startTransition(async () => {
      const result = site?.id
        ? await updateSiteAction(site.id, formData)
        : await createSiteAction(formData);

      if (result?.errors) {
        toast({
            title: 'Doğrulama Hatası',
            description: result.message || 'Lütfen formdaki hataları kontrol edin.',
            variant: 'destructive',
        });

        Object.entries(result.errors).forEach(([field, fieldErrors]) => {
            const errors = Array.isArray(fieldErrors) ? fieldErrors : [String(fieldErrors)];
            if (formSchema.shape.hasOwnProperty(field)) {
                 form.setError(field as keyof SiteFormValues, {
                    type: 'server',
                    message: errors.join(', '),
                });
            } else {
                if (field !== 'selectorConfig') {
                    console.warn(`Sunucudan bilinmeyen alan hatası: ${field}`);
                }
            }
        });

      } else if (result?.message?.includes('başarıyla')) {
        toast({
          title: 'Başarılı!',
          description: result.message,
        });
        router.push('/');
        router.refresh();
      } else {
        toast({
          title: 'Hata',
          description: result?.message || 'Beklenmedik bir hata oluştu.',
          variant: 'destructive',
        });
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{site ? 'Siteyi Düzenle' : 'Yeni Site Ekle'}</CardTitle>
        <CardDescription>
          {site ? 'Bu sitenin yapılandırmasını güncelleyin.' : 'RSS beslemeleri için taranacak yeni bir site yapılandırın.'}
          {' Anasayfa URL\'sinin doğrudan bir RSS beslemesine değil, bir HTML sayfasına işaret ettiğinden emin olun.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Site Adı</FormLabel>
                  <FormControl>
                    <Input placeholder="Örn., Teknoloji Haberleri Günlüğü" {...field} />
                  </FormControl>
                  <FormDescription>Haber sitesinin görünen adı.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="homepageUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Anasayfa URL'si (HTML Sayfası)</FormLabel>
                  <FormControl>
                    <Input type="url" placeholder="https://www.ornek.com/haberler" {...field} />
                  </FormControl>
                  <FormDescription>Makalelerin listelendiği sitenin HTML sayfasının tam URL'si (bir RSS beslemesi URL'si değil).</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Kısa Ad (Slug)</FormLabel>
                  <FormControl>
                    <Input placeholder="örn., teknoloji-haberleri-gunlugu" {...field} />
                  </FormControl>
                  <FormDescription>Kısa, URL dostu bir tanımlayıcı. RSS beslemesi URL'si için kullanılır (örn: /rss/kisa-ad.xml).</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="country"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ülke</FormLabel>
                  <FormControl>
                    <Input placeholder="Örn., Türkiye, Almanya, BE, LU" {...field} />
                  </FormControl>
                  <FormDescription>Sitenin yayın yaptığı veya ait olduğu ülke (isteğe bağlı). Kısa kod (örn. TR, DE) veya tam ad kullanabilirsiniz.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="space-y-2">
                <FormLabel>Seçici Yapılandırması Ön Ayarları</FormLabel>
                <div className="flex items-center gap-2">
                    <Select onValueChange={handlePresetChange}>
                        <FormControl>
                        <SelectTrigger className="w-auto">
                            <SelectValue placeholder="Hazır Ayar Yükle" />
                        </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                        <SelectItem value="default">Varsayılan Seçiciler</SelectItem>
                        {sitePresets.map(preset => (
                            <SelectItem key={preset.name} value={preset.name}>
                            {preset.name}
                            </SelectItem>
                        ))}
                        </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" onClick={handleAutoDetectSelectors} disabled={isDetectingSelectors || isPending}>
                        <Wand2 className="mr-2 h-4 w-4" />
                        {isDetectingSelectors ? 'Algılanıyor...' : 'Seçicileri Otomatik Algıla'}
                    </Button>
                </div>
                 <FormDescription>
                    İsteğe bağlı olarak sık kullanılan site türleri için bir hazır ayar yükleyin veya yapay zeka ile seçicileri otomatik algılamayı deneyin (deneysel).
                    Otomatik algılama sonrası üretilen seçicileri aşağıdaki metin alanında dikkatlice kontrol edin ve gerekirse düzenleyin.
                  </FormDescription>
            </div>

            <FormField
              control={form.control}
              name="selectorConfig"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CSS Seçici Yapılandırması (JSON)</FormLabel>
                  <FormControl>
                    <Textarea
                        rows={14}
                        placeholder={JSON.stringify(defaultSelectorConfig, null, 2)}
                        {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Haber öğelerini ayrıştırmak için CSS seçicilerini içeren JSON nesnesi. Alanlar:
                    `item_selector` (her haber öğesinin ana kapsayıcısı - zorunlu),
                    `title_selector` (başlık - zorunlu),
                    `link_selector` (makale bağlantısı - zorunlu),
                    `summary_selector` (özet - metin, boş olabilir),
                    `date_selector` (tarih - metin, boş olabilir),
                    `image_selector` (ana resim - isteğe bağlı metin),
                    `base_url` (göreceli bağlantıların çözümlenmesi için - isteğe bağlı metin, boş veya URL).
                    Seçicilerin hedef HTML sayfasının yapısına uygun olduğundan emin olun.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 shadow">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      id="active"
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel htmlFor="active">Aktif</FormLabel>
                    <FormDescription>
                      Bu siteyi tarama ve RSS oluşturma için etkinleştirin. Pasif siteler taranmaz ve RSS beslemeleri güncellenmez.
                    </FormDescription>
                  </div>
                   <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={isPending || isDetectingSelectors}>
                {isPending ? (site ? 'Güncelleniyor...' : 'Oluşturuluyor...') : (site ? 'Siteyi Güncelle' : 'Site Oluştur')}
              </Button>
              <Button variant="outline" asChild type="button" disabled={isPending || isDetectingSelectors}>
                <Link href="/">İptal</Link>
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
