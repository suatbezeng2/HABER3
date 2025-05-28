
'use client';

import Link from 'next/link';
import type { Site } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Edit3, PlusCircle, Eye } from 'lucide-react';
import { DeleteSiteButton } from './DeleteSiteButton';
import { IndividualScrapeButton } from '@/components/shared/IndividualScrapeButton';
import { useState, useMemo, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface SitesListProps {
  initialSites: Site[];
}

export function SitesList({ initialSites }: SitesListProps) {
  const [selectedCountry, setSelectedCountry] = useState<string>('all');
  const [countries, setCountries] = useState<string[]>(['all']);

  useEffect(() => {
    if (initialSites) {
      const siteCountries = new Set(initialSites.map(site => site.country).filter(Boolean as (value: string | undefined) => value is string));
      setCountries(['all', ...Array.from(siteCountries)].sort((a,b) => {
        if (a === 'all') return -1;
        if (b === 'all') return 1;
        return a.localeCompare(b);
      }));
    }
  }, [initialSites]);

  const filteredSites = useMemo(() => {
    if (!initialSites) return [];
    if (selectedCountry === 'all') {
      return initialSites;
    }
    return initialSites.filter(site => site.country === selectedCountry);
  }, [initialSites, selectedCountry]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold">Siteleri Yönet</h1>
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          {countries.length > 1 && ( 
            <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground shrink-0">Kategoriler:</span>
                <Select value={selectedCountry} onValueChange={setSelectedCountry}>
                    <SelectTrigger className="w-auto min-w-[150px] sm:min-w-[180px]">
                    <SelectValue placeholder="Ülkeye Göre Filtrele" />
                    </SelectTrigger>
                    <SelectContent>
                    {countries.map(country => (
                        <SelectItem key={country} value={country}>
                        {country === 'all' ? 'Tüm Ülkeler' : country}
                        </SelectItem>
                    ))}
                    </SelectContent>
                </Select>
            </div>
          )}
          <Button asChild>
            <Link href="/sites/new">
              <PlusCircle className="mr-2 h-4 w-4" /> Yeni Site Ekle
            </Link>
          </Button>
        </div>
      </div>

      {initialSites.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-lg text-muted-foreground">Henüz yapılandırılmış site yok.</p>
            <Button asChild className="mt-4">
              <Link href="/sites/new">İlk Sitenizi Ekleyin</Link>
            </Button>
          </CardContent>
        </Card>
      ) : filteredSites.length === 0 && selectedCountry !== 'all' ? (
         <Card>
          <CardContent className="p-6 text-center">
            <p className="text-lg text-muted-foreground">Seçilen ülke için site bulunamadı.</p>
             <Button variant="link" onClick={() => setSelectedCountry('all')}>Tüm siteleri göster</Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 md:p-2">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ad</TableHead>
                    <TableHead className="hidden md:table-cell">Kısa Ad (Slug)</TableHead>
                    <TableHead className="hidden lg:table-cell">Ülke</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead className="text-right">Eylemler</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSites.map((site) => (
                    <TableRow key={site.id}>
                      <TableCell className="font-medium">{site.name}</TableCell>
                      <TableCell className="hidden md:table-cell">{site.slug}</TableCell>
                      <TableCell className="hidden lg:table-cell">{site.country || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={site.active ? 'default' : 'secondary'}>
                          {site.active ? 'Aktif' : 'Pasif'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-0.5">
                          {site.id && <IndividualScrapeButton siteId={site.id} siteName={site.name} variant="ghost" size="icon" title={`"${site.name}" sitesini hemen tara (test)`} />}
                          <Button variant="ghost" size="icon" asChild title={`"${site.name}" RSS Beslemesini Görüntüle`}>
                            <Link href={`/rss/${site.slug}.xml`} target="_blank" rel="noopener noreferrer">
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button variant="ghost" size="icon" asChild title={`"${site.name}" sitesini düzenle`}>
                            <Link href={`/sites/edit/${site.id}`}>
                              <Edit3 className="h-4 w-4" />
                            </Link>
                          </Button>
                          {site.id && <DeleteSiteButton siteId={site.id} siteName={site.name} />}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

