
import Airtable, { type FieldSet, type Record } from 'airtable';
import { AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_SITES_TABLE_NAME, AIRTABLE_ARTICLES_TABLE_NAME } from '@/lib/config';
import type { Site, Article, SelectorConfig } from '@/lib/types';
import { normalizeUrl } from './url-utils';


let airtableInstance: Airtable | null = null;
let baseInstance: Airtable.Base | null = null;
let sitesTableInstance: Airtable.Table<FieldSet> | null = null;
let articlesTableInstance: Airtable.Table<FieldSet> | null = null;
let isInitialized = false;
let airtableInitializationPromise: Promise<void> | null = null;
let airtableInitializationError: string | null = null;

const DEFAULT_RSS_ITEM_LIMIT = 50;


const SITES_TABLE_FIELDS = [
  { name: 'Name', type: 'singleLineText', description: 'Sitenin görünen adı.' },
  { name: 'HomepageURL', type: 'url', description: 'Kazınacak sitenin ana URL\'si.' },
  { name: 'Slug', type: 'singleLineText', description: 'RSS beslemesi için URL dostu bir kısa ad.' },
  { name: 'Active', type: 'checkbox', options: { icon: 'check', color: 'greenBright' }, description: 'Sitenin kazıma için aktif olup olmadığı.' },
  { name: 'SelectorConfig', type: 'multilineText', description: 'CSS seçicileri için JSON yapılandırması.' },
  { name: 'Country', type: 'singleLineText', description: 'Sitenin ait olduğu ülke (isteğe bağlı).' },
  {
    name: 'Tür',
    type: 'singleSelect',
    options: {
      choices: [
        { name: 'HTML', color: 'blueBright' },
        { name: 'RSS', color: 'yellowBright' }
      ]
    },
    description: 'Sitenin türü (HTML veya RSS).'
  },
  { name: 'LastScrapedAt', type: 'dateTime', options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'client' }, description: 'Sitenin en son kazındığı zaman.' },
];
const SITES_TABLE_DESCRIPTION = 'Kazınacak web sitelerinin yapılandırmalarını saklar.';

const ARTICLES_TABLE_FIELDS = (sitesTableId: string) => [
  { name: 'Title', type: 'singleLineText', description: 'Makalenin başlığı.' },
  { name: 'URL', type: 'url', description: 'Makaleye doğrudan URL.' },
  { name: 'NormalizedURL', type: 'singleLineText', description: 'Tekilleştirme ve arama için normalleştirilmiş URL.'},
  { name: 'Site', type: 'multipleRecordLinks', options: { linkedTableId: sitesTableId, isReversed: false, prefillValueSources:['lookup'] }, description: 'Bu makalenin ait olduğu Site bağlantısı.' },
  { name: 'Summary', type: 'multilineText', description: 'Makalenin kısa bir özeti veya alıntısı.' },
  { name: 'Date', type: 'dateTime', options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'client' }, description: 'Makalenin yayın tarihi. ISO 8601 formatında saklanır.' },
  { name: 'ImageURL', type: 'url', description: 'Makale için ana resmin URL\'si.' },
  { name: 'Language', type: 'singleLineText', description: 'Makalenin dili (örneğin, en, tr).' },
];
const ARTICLES_TABLE_DESCRIPTION = 'Web sitelerinden kazınan makaleleri saklar.';

async function _upsertTable(
  tableName: string,
  definedSchemaFields: {name: string, type: string, options?: any, description?: string}[],
  tableDescription: string
): Promise<{ id: string, name: string } | null> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    let errorDetail = `_upsertTable (tablo: ${tableName}) için Airtable API Anahtarı veya Temel ID eksik. Lütfen .env dosyasını kontrol edin.`;
    errorDetail += `\nAPI Anahtarı Sağlandı: ${AIRTABLE_API_KEY ? 'Evet' : 'Hayır'}`;
    errorDetail += `\nTemel ID Sağlandı: ${AIRTABLE_BASE_ID ? 'Evet' : 'Hayır'}`;
    airtableInitializationError = errorDetail;
    console.error(airtableInitializationError);
    throw new Error(airtableInitializationError);
  }
  console.log(`[AIRTABLE_META] "${tableName}" tablosu için _upsertTable çağrıldı. API Anahtarı var: ${!!AIRTABLE_API_KEY}, Temel ID var: ${!!AIRTABLE_BASE_ID}`);

  let listResponse;
  try {
    console.log(`[AIRTABLE_META] Airtable Meta API'sine istek yapılıyor: GET https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`);
    listResponse = await fetch(`https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`, {
      headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` },
    });
    console.log(`[AIRTABLE_META] Tablo listeleme yanıt durumu: ${listResponse.status} (Tablo: ${tableName})`);
  } catch (networkError) {
      const netErr = networkError instanceof Error ? networkError.message : String(networkError);
      const err = `Tablolar listelenirken ağ hatası: ${netErr}. İnternet bağlantınızı ve Airtable erişilebilirliğini kontrol edin. (Tablo: ${tableName})`;
      console.error(err, networkError);
      airtableInitializationError = err;
      throw new Error(err);
  }


  if (!listResponse.ok) {
    const errorText = await listResponse.text().catch(() => `Durum kodu ${listResponse.status} için yanıt gövdesi okunamadı.`);
    let errorData;
    try {
        errorData = JSON.parse(errorText || '{}');
    } catch (parseError) {
        errorData = { error: { message: errorText }}; // JSON ayrıştırma hatası durumunda ham metni kullan
    }
    
    let detail = errorData.error?.message || errorData.message || listResponse.statusText || `HTTP ${listResponse.status}`;
    let permissionHint = "";
    if (listResponse.status === 403 || (typeof detail === 'string' && detail.toLowerCase().includes("permission"))) {
      permissionHint = " (Bu genellikle API anahtarının gerekli 'schema:bases:read' veya 'schema:bases:write' izinlerine sahip olmadığı anlamına gelir. Lütfen Airtable API anahtarı izinlerinizi kontrol edin.)";
    } else if (listResponse.status === 401) {
      detail += " (API anahtarının geçersiz veya süresi dolmuş olduğu anlamına gelir. Lütfen Airtable API anahtarınızı kontrol edin.)";
    } else if (listResponse.status === 404 && errorData.error?.type === 'BASE_NOT_FOUND') {
       detail += ` (Belirtilen AIRTABLE_BASE_ID ("${AIRTABLE_BASE_ID}") bulunamadı. Lütfen .env dosyasındaki değerin doğru olduğundan emin olun.)`;
    }
    const err = `Tablolar listelenemedi: ${detail}${permissionHint} (Tablo: ${tableName})`;
    console.error(`[AIRTABLE_META_ERROR_BODY] _upsertTable için hata (Tablo: ${tableName}): ${err}. Yanıt gövdesi: ${errorText}`);
    airtableInitializationError = err;
    throw new Error(err);
  }

  const { tables } = await listResponse.json();
  const existingTable = tables.find((t: any) => t.name === tableName);

  if (existingTable) {
    console.log(`[AIRTABLE_META] Tablo "${tableName}" zaten ID: ${existingTable.id} ile mevcut. Eksik alanlar kontrol ediliyor...`);
    const existingFieldNames = existingTable.fields.map((f: any) => f.name);

    for (const definedField of definedSchemaFields) {
      // Sistem tarafından yönetilen 'createdTime' alanını oluşturmaya çalışma
      if (definedField.type.toLowerCase() === 'createdtime' || definedField.name.toLowerCase() === 'created' || definedField.name.toLowerCase() === 'airtablecreatedat') {
          continue;
      }

      if (!existingFieldNames.includes(definedField.name)) {
        console.log(`[AIRTABLE_META] Alan "${definedField.name}" mevcut "${tableName}" tablosunda eksik. Oluşturulmaya çalışılıyor.`);
        const createFieldPayload: any = {
          name: definedField.name,
          type: definedField.type,
          description: definedField.description,
        };
        if (definedField.options) {
          createFieldPayload.options = definedField.options;
        }

        const createFieldResponse = await fetch(`https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables/${existingTable.id}/fields`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(createFieldPayload),
        });
         console.log(`[AIRTABLE_META] Alan "${definedField.name}" oluşturma yanıt durumu: ${createFieldResponse.status} (Tablo: ${tableName})`);

        if (!createFieldResponse.ok) {
          const fieldErrorText = await createFieldResponse.text().catch(() => `Durum kodu ${createFieldResponse.status} için alan oluşturma yanıt gövdesi okunamadı.`);
          console.error(`[AIRTABLE_META_ERROR_BODY] Alan oluşturma başarısız (Tablo: ${tableName}, Alan: ${definedField.name}): ${fieldErrorText}`);
          const fieldErrorData = JSON.parse(fieldErrorText || '{}');

          const fieldApiErrorMessage = fieldErrorData.error?.message || (typeof fieldErrorData.error === 'string' ? fieldErrorData.error : 'Bilinmeyen alan oluşturma hatası');
          let errDetail = `"${tableName}" tablosunda eksik alan "${definedField.name}" oluşturulamadı. Durum: ${createFieldResponse.status}, Hata: ${fieldApiErrorMessage}`;
          if (fieldErrorData.error?.type === 'INVALID_OPTIONS_FOR_FIELD_TYPE' && fieldErrorData.error?.message) {
             errDetail += ` Detaylar: ${fieldErrorData.error.message}`;
          }
          console.error(errDetail, fieldErrorData);
          airtableInitializationError = errDetail; 
          throw new Error(errDetail); // Alan oluşturma başarısız olursa hata fırlat
        } else {
          console.log(`[AIRTABLE_META] "${tableName}" tablosunda "${definedField.name}" alanı başarıyla oluşturuldu.`);
        }
      }
    }
    return { id: existingTable.id, name: existingTable.name };
  }

  console.log(`[AIRTABLE_META] Tablo "${tableName}" bulunamadı. Alanlarla oluşturuluyor:`, definedSchemaFields.map(f => ({name: f.name, type: f.type, options: f.options})));

  // 'createdTime' türündeki alanlar Airtable tarafından otomatik yönetilir, bunları biz oluşturamayız.
  const creatableFields = definedSchemaFields.filter(f => f.type.toLowerCase() !== 'createdtime' && f.name.toLowerCase() !== 'created' && f.name.toLowerCase() !== 'airtablecreatedat');

  const createTableResponse = await fetch(`https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: tableName, fields: creatableFields, description: tableDescription }),
  });
  console.log(`[AIRTABLE_META] Tablo "${tableName}" oluşturma yanıt durumu: ${createTableResponse.status}`);

  if (!createTableResponse.ok) {
    const errorText = await createTableResponse.text().catch(() => `Durum kodu ${createTableResponse.status} için tablo oluşturma yanıt gövdesi okunamadı.`);
    console.error(`[AIRTABLE_META_ERROR_BODY] Tablo oluşturma başarısız (Tablo: ${tableName}): ${errorText}`);
    const errorData = JSON.parse(errorText || '{}');

    const apiErrorMessage = errorData.error?.message || (typeof errorData.error === 'string' ? errorData.error : 'Bilinmeyen tablo oluşturma hatası detayı');
    let errDetail = `"${tableName}" tablosu oluşturulamadı: ${apiErrorMessage || createTableResponse.statusText}`;
    console.error(`"${tableName}" tablosu oluşturulamadı. Durum: ${createTableResponse.status}, Yanıt:`, errorData);

    const fieldErrorDetails = errorData.error?.details?.invalidValueByPath;
    if (fieldErrorDetails) {
        Object.entries(fieldErrorDetails).forEach(([path, detail]) => {
            const detailMsg = ` - Alan Hatası (${path}): ${JSON.stringify(detail)}`;
            console.error(detailMsg);
            errDetail += detailMsg;
        });
    }
    airtableInitializationError = errDetail;
    throw new Error(errDetail);
  }
  const newTableData = await createTableResponse.json();
  console.log(`[AIRTABLE_META] Tablo "${tableName}" ID: ${newTableData.id} ile başarıyla oluşturuldu.`);
  return { id: newTableData.id, name: newTableData.name };

}

async function _initializeAirtableInternal(): Promise<void> {
  if (isInitialized) return;
  if (airtableInitializationError) {
    console.error("[AIRTABLE_INIT] Airtable başlatma daha önce başarısız oldu:", airtableInitializationError);
    throw new Error(airtableInitializationError);
  }

  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    airtableInitializationError = `[AIRTABLE_INIT_FAIL] Airtable API Anahtarı veya Temel ID yapılandırılmamış. Lütfen .env dosyasını kontrol edin.\nAPI Anahtarı Sağlandı: ${AIRTABLE_API_KEY ? 'Evet' : 'Hayır'}\nTemel ID Sağlandı: ${AIRTABLE_BASE_ID ? 'Evet' : 'Hayır'}\nAirtable işlevselliği devre dışı bırakılacak.`;
    console.error(airtableInitializationError);
    throw new Error(airtableInitializationError);
  }

  try {
    console.log("[AIRTABLE_INIT] Airtable başlatılıyor...");
    airtableInstance = new Airtable({ apiKey: AIRTABLE_API_KEY });
    baseInstance = airtableInstance.base(AIRTABLE_BASE_ID);
    console.log(`[AIRTABLE_INIT] Airtable örneği ve Temel örneği ("${AIRTABLE_BASE_ID}") oluşturuldu.`);

    const sitesTableData = await _upsertTable(AIRTABLE_SITES_TABLE_NAME, SITES_TABLE_FIELDS, SITES_TABLE_DESCRIPTION);
    if (!sitesTableData) {
      const specificError = airtableInitializationError || `[AIRTABLE_INIT_FAIL] Başlatma sırasında "${AIRTABLE_SITES_TABLE_NAME}" tablosu oluşturulamadı veya bulunamadı.`;
      airtableInitializationError = specificError;
      throw new Error(specificError);
    }
    sitesTableInstance = baseInstance(sitesTableData.name); // Use actual table name from metadata
    console.log(`[AIRTABLE_INIT] Siteler tablo örneği şunun için yapılandırıldı: ${sitesTableData.name} (ID: ${sitesTableData.id})`);

    const articlesTableSchema = ARTICLES_TABLE_FIELDS(sitesTableData.id);
    const articlesTableData = await _upsertTable(AIRTABLE_ARTICLES_TABLE_NAME, articlesTableSchema, ARTICLES_TABLE_DESCRIPTION);
    if (!articlesTableData) {
      const specificError = airtableInitializationError || `[AIRTABLE_INIT_FAIL] Başlatma sırasında "${AIRTABLE_ARTICLES_TABLE_NAME}" tablosu oluşturulamadı veya bulunamadı.`;
      airtableInitializationError = specificError;
      throw new Error(specificError);
    }
    articlesTableInstance = baseInstance(articlesTableData.name); // Use actual table name
    console.log(`[AIRTABLE_INIT] Makaleler tablo örneği şunun için yapılandırıldı: ${articlesTableData.name} (ID: ${articlesTableData.id})`);

    isInitialized = true;
    airtableInitializationError = null; 
    console.log('[AIRTABLE_INIT] Airtable başarıyla başlatıldı, tabloların ve tanımlanmış alanlarının varlığı sağlandı.');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!airtableInitializationError) airtableInitializationError = `[AIRTABLE_INIT_FAIL] "${AIRTABLE_SITES_TABLE_NAME}" veya "${AIRTABLE_ARTICLES_TABLE_NAME}" tablosunun varlığı sağlanamadı: ${errorMessage}`;
    console.error(airtableInitializationError, error);
    isInitialized = false;
    airtableInstance = null;
    baseInstance = null;
    sitesTableInstance = null;
    articlesTableInstance = null;
    throw new Error(airtableInitializationError);
  }
}

export function initializeAirtable(): Promise<void> {
  if (!airtableInitializationPromise) {
    console.log("[AIRTABLE_INIT_WRAPPER] initializeAirtable çağrıldı, _initializeAirtableInternal başlatılıyor.");
    airtableInitializationPromise = _initializeAirtableInternal().catch(err => {
      console.error("[AIRTABLE_INIT_WRAPPER] initializeAirtable sarmalayıcısında başlatma hatası yakalandı:", err.message);
      airtableInitializationPromise = null; 
      isInitialized = false;
      return Promise.reject(err); 
    });
  } else {
    console.log("[AIRTABLE_INIT_WRAPPER] initializeAirtable çağrıldı, mevcut başlatma sözü döndürülüyor.");
  }
  return airtableInitializationPromise;
}


export function getValidatedTableInstances() {
  if (!isInitialized || !sitesTableInstance || !articlesTableInstance || !baseInstance) {
    const errorMsg = airtableInitializationError || "[AIRTABLE_VALIDATE_INSTANCE_FAIL] Airtable istemcisi düzgün başlatılmadı. Önce initializeAirtable() çağırın veya yapılandırmayı ve önceki hataları kontrol edin.";
    console.error("getValidatedTableInstances kontrolü başarısız:", errorMsg);
    throw new Error(errorMsg);
  }
  return { base: baseInstance, sitesTable: sitesTableInstance, articlesTable: articlesTableInstance };
}

const mapRecordToSite = (record: Airtable.Record<FieldSet>): Site => {
  const fields = record.fields;
  let parsedSelectorConfig: SelectorConfig;
  const defaultSCValues: SelectorConfig = { title_selector: '', link_selector: '', summary_selector: '', date_selector: '', item_selector: '', base_url: '', image_selector: '' };

  if (typeof fields.SelectorConfig === 'string' && fields.SelectorConfig.trim() !== '') {
    try {
      const parsed = JSON.parse(fields.SelectorConfig);
      parsedSelectorConfig = { ...defaultSCValues, ...parsed };
    } catch (error) {
      console.warn(`${record.id} site ID'si için SelectorConfig JSON'u ayrıştırılamadı: "${fields.SelectorConfig}". Varsayılana dönülüyor. Hata: ${error instanceof Error ? error.message : String(error)}`);
      parsedSelectorConfig = { ...defaultSCValues };
    }
  } else if (typeof fields.SelectorConfig === 'object' && fields.SelectorConfig !== null) {
    parsedSelectorConfig = { ...defaultSCValues, ...(fields.SelectorConfig as Partial<SelectorConfig>) };
  } else {
    if (fields.SelectorConfig !== undefined && fields.SelectorConfig !== null && String(fields.SelectorConfig).trim() !== '') {
       console.warn(`${record.id} site ID'si için SelectorConfig geçerli bir JSON dizesi veya nesne değil ("${String(fields.SelectorConfig)}"). Varsayılana dönülüyor.`);
    }
    parsedSelectorConfig = { ...defaultSCValues };
  }
  
  const airtableCreatedAt = record.fields.Created as string | undefined; // Use Airtable's system field

  return {
    id: record.id,
    name: (fields.Name as string) || 'Adsız Site',
    homepageUrl: (fields.HomepageURL as string) || '',
    slug: (fields.Slug as string) || '',
    active: fields.Active === true,
    selectorConfig: parsedSelectorConfig,
    country: (fields.Country as string) || undefined,
    type: (fields.Tür as string) || "HTML",
    airtableCreatedAt: airtableCreatedAt,
    lastScrapedAt: fields.LastScrapedAt as string | undefined,
  };
};

const mapSiteToRecordFields = (site: Partial<Omit<Site, 'id' | 'airtableCreatedAt' >>): FieldSet => {
  const fields: FieldSet = {};
  if (site.name !== undefined) fields.Name = site.name;
  if (site.homepageUrl !== undefined) fields.HomepageURL = site.homepageUrl;
  if (site.slug !== undefined) fields.Slug = site.slug;
  if (site.active !== undefined) fields.Active = site.active;
  if (site.country !== undefined) fields.Country = site.country;
  if (site.type !== undefined) fields.Tür = site.type;
  else if (!('id' in site) || !site.id) { // Yeni site oluşturuluyorsa ve Tür belirtilmemişse
    fields.Tür = "HTML";
  }
  if (site.lastScrapedAt !== undefined) fields.LastScrapedAt = site.lastScrapedAt;


  if (site.selectorConfig !== undefined) {
    const sc = { ...site.selectorConfig };
    sc.item_selector = sc.item_selector || "";
    sc.title_selector = sc.title_selector || "";
    sc.link_selector = sc.link_selector || "";
    sc.summary_selector = sc.summary_selector || "";
    sc.date_selector = sc.date_selector || "";
    sc.image_selector = sc.image_selector || "";
    sc.base_url = sc.base_url || "";
    fields.SelectorConfig = JSON.stringify(sc);
  }
  return fields;
};

export const getSites = async (): Promise<Site[]> => {
  await initializeAirtable();
  const { sitesTable } = getValidatedTableInstances();
  try {
    const records = await sitesTable.select({
      filterByFormula: `{Tür} = "HTML"`,
      // fields: undefined, // Let Airtable return all non-computed fields, including 'Created'
    }).all();
    const sites = records.map(mapRecordToSite);

    // Sort by Airtable's createdTime if available, otherwise no specific client-side sort
    sites.sort((a, b) => {
        const dateA = a.airtableCreatedAt ? new Date(a.airtableCreatedAt).getTime() : 0;
        const dateB = b.airtableCreatedAt ? new Date(b.airtableCreatedAt).getTime() : 0;
        return dateB - dateA; // Newest first
    });
    return sites;
  } catch (error) {
    const message = `Airtable'dan siteler alınırken hata oluştu: ${error instanceof Error ? error.message : String(error)}`;
    console.error(message, error);
    throw new Error(message);
  }
};

export const getSiteById = async (id: string): Promise<Site | null> => {
  await initializeAirtable();
  const { sitesTable } = getValidatedTableInstances();
  try {
    const record = await sitesTable.find(id);
    return mapRecordToSite(record);
  } catch (error) {
    const err = error as any;
    if (err.error === 'NOT_FOUND' || err.statusCode === 404) {
        console.warn(`${id} ID'li site Airtable'da bulunamadı.`);
        return null;
    }
    const message = `${id} ID'li site Airtable'dan alınırken hata oluştu: ${err.message || String(error)}`;
    console.error(message, error);
    throw new Error(message);
  }
};

export const getSiteBySlug = async (slug: string): Promise<Site | null> => {
  await initializeAirtable();
  const { sitesTable } = getValidatedTableInstances();
  try {
    const records = await sitesTable.select({
      filterByFormula: `AND({Slug} = "${slug}", {Tür} = "HTML")`,
      // fields: undefined,
      maxRecords: 1
    }).firstPage();
    if (records.length > 0) {
      return mapRecordToSite(records[0]);
    }
    return null;
  } catch (error) {
    const message = `${slug} kısa adına sahip site Airtable'dan alınırken hata oluştu: ${error instanceof Error ? error.message : String(error)}`;
    console.error(message, error);
    throw new Error(message);
  }
};

export const createSite = async (siteData: Omit<Site, 'id' | 'airtableCreatedAt' | 'lastScrapedAt'>): Promise<Site | null> => {
  await initializeAirtable();
  const { sitesTable } = getValidatedTableInstances();
  try {
    const recordFields = mapSiteToRecordFields({ ...siteData, type: siteData.type || "HTML" });
    const createdRecords = await sitesTable.create([{ fields: recordFields }]);
    if (!createdRecords || createdRecords.length === 0) {
        throw new Error("Airtable'da site oluşturma işlemi kayıt döndürmedi.");
    }
    return mapRecordToSite(createdRecords[0]);
  } catch (error) {
    const message = `Airtable'da site oluşturulurken hata oluştu: ${error instanceof Error ? error.message : String(error)}`;
    console.error(message, error);
    throw new Error(message);
  }
};

export const updateSite = async (id: string, siteData: Partial<Omit<Site, 'id' | 'airtableCreatedAt' | 'lastScrapedAt'>>): Promise<Site | null> => {
  await initializeAirtable();
  const { sitesTable } = getValidatedTableInstances();
  try {
    const recordFields = mapSiteToRecordFields(siteData);
    if (Object.keys(recordFields).length === 0) {
        console.warn(`UpdateSite ID ${id} için güncellenecek alan olmadan çağrıldı. Mevcut site alınıp döndürülüyor.`);
        const currentSite = await getSiteById(id);
        return currentSite;
    }
    const updatedRecords = await sitesTable.update([{ id, fields: recordFields }]);
     if (!updatedRecords || updatedRecords.length === 0) {
        throw new Error("Airtable'da site güncelleme işlemi kayıt döndürmedi.");
    }
    return mapRecordToSite(updatedRecords[0]);
  } catch (error) {
    const message = `${id} ID'li site Airtable'da güncellenirken hata oluştu: ${error instanceof Error ? error.message : String(error)}`;
    console.error(message, error);
    throw new Error(message);
  }
};

export const deleteSite = async (id: string): Promise<boolean> => {
  await initializeAirtable();
  const { sitesTable, articlesTable } = getValidatedTableInstances();
  try {

    const articlesToDeleteRecords = await articlesTable.select({
      filterByFormula: `FIND("${id}", ARRAYJOIN(ARRAYCOMPACT({Site})))`,
    }).all();

    const articleIdsToDelete = articlesToDeleteRecords.map(record => record.id);

    if (articleIdsToDelete.length > 0) {
      console.log(`[DELETE_SITE] Site ID'si "${id}" ile ilişkili ${articleIdsToDelete.length} makale siliniyor.`);
      for (let i = 0; i < articleIdsToDelete.length; i += 10) {
        const chunk = articleIdsToDelete.slice(i, i + 10);
        await articlesTable.destroy(chunk);
      }
      console.log(`[DELETE_SITE] Site ID'si "${id}" için ilişkili makaleler başarıyla silindi.`);
    }

    await sitesTable.destroy(id);
    console.log(`[DELETE_SITE] Site ID'si "${id}" başarıyla silindi.`);
    return true;
  } catch (error) {
    const message = `${id} ID'li site Airtable'dan silinirken hata oluştu: ${error instanceof Error ? error.message : String(error)}`;
    console.error(message, error);
    throw new Error(message);
  }
};

const mapRecordToArticle = (record: Record<FieldSet>): Article => {
  const fields = record.fields;
  const siteIds = fields.Site as string[] | undefined;
  const airtableCreatedAt = record.fields.Created as string | undefined; // Use Airtable's system field

  let parsedDate = fields.Date as string | undefined;
  if (parsedDate) {
      try {
          const dateObj = new Date(parsedDate);
          if (isNaN(dateObj.getTime())) {
              console.warn(`[mapRecordToArticle] Airtable'dan gelen geçersiz tarih değeri: "${fields.Date}", ID: ${record.id}. Tarih boş bırakılacak.`);
              parsedDate = undefined;
          } else {
              const year = dateObj.getFullYear();
              if (year < 1900 || year > new Date().getFullYear() + 10) { 
                  console.warn(`[mapRecordToArticle] Airtable'dan gelen tarih değeri (${fields.Date}) aralık dışında, ID: ${record.id}. Tarih boş bırakılacak.`);
                  parsedDate = undefined;
              }
          }
      } catch (e) {
          console.warn(`[mapRecordToArticle] Airtable'dan gelen tarihi ("${fields.Date}") ayrıştırırken hata, ID: ${record.id}. Tarih boş bırakılacak. Hata: ${e}`);
          parsedDate = undefined;
      }
  }

  return {
    id: record.id,
    siteId: siteIds && siteIds.length > 0 ? siteIds[0] : '',
    title: (fields.Title as string) || 'Başlıksız Makale',
    url: (fields.URL as string) || '',
    normalizedUrl: (fields.NormalizedURL as string) || normalizeUrl(fields.URL as string) || '',
    summary: (fields.Summary as string) || '',
    date: parsedDate,
    imageUrl: (fields.ImageURL as string) || undefined,
    language: (fields.Language as string) || 'tr',
    airtableCreatedAt: airtableCreatedAt,
  };
};

export const getArticlesBySiteId = async (siteId: string, limit: number = DEFAULT_RSS_ITEM_LIMIT): Promise<Article[]> => {
  await initializeAirtable();
  const { articlesTable } = getValidatedTableInstances();
  try {
    const records = await articlesTable.select({
      filterByFormula: `FIND("${siteId}", ARRAYJOIN(ARRAYCOMPACT({Site})))`,
      // fields: undefined, 
    }).all();

    const articles = records.map(mapRecordToArticle);
    articles.sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : (a.airtableCreatedAt ? new Date(a.airtableCreatedAt).getTime() : 0);
        const dateB = b.date ? new Date(b.date).getTime() : (b.airtableCreatedAt ? new Date(b.airtableCreatedAt).getTime() : 0);
        return dateB - dateA; 
    });
    return articles.slice(0, limit);
  } catch (error) {
    const message = `Airtable'dan ${siteId} site ID'si için makaleler alınırken hata oluştu: ${error instanceof Error ? error.message : String(error)}`;
    console.error(`[AIRTABLE_GET_ARTICLES_ERROR] ${message}`, error);
    throw new Error(message);
  }
};


export const createArticle = async (
  articleData: Omit<Article, 'id' | 'airtableCreatedAt' | 'normalizedUrl'>,
  normalizedUrlToStore: string | null
): Promise<Article | null> => {
  await initializeAirtable();
  const { articlesTable } = getValidatedTableInstances();

  if (!normalizedUrlToStore && !articleData.url) {
    console.warn(`[AIRTABLE_CREATE_ARTICLE_WARN] "${articleData.title}" makalesi için hem Normalleştirilmiş URL hem de Ham URL boş. Kayıt atlanıyor.`);
    return null;
  }

  const urlForLogging = normalizedUrlToStore || articleData.url;
  console.log(`[AIRTABLE_PRE_CREATE_ARTICLE_INFO] Makale oluşturuluyor: Başlık="${articleData.title}", Ham URL="${articleData.url}", Kontrol/Kayıt NormURL="${urlForLogging}", SiteID="${articleData.siteId}", Tarih="${articleData.date}"`);

  try {
    const fields: FieldSet = {
      Site: [articleData.siteId],
      Title: articleData.title,
      URL: articleData.url,
      NormalizedURL: normalizedUrlToStore || normalizeUrl(articleData.url) || articleData.url,
      Summary: articleData.summary,
      ImageURL: articleData.imageUrl,
      Language: articleData.language || 'tr',
    };

    if (articleData.date) {
        try {
            const dateObj = new Date(articleData.date);
            if (isNaN(dateObj.getTime())) {
                console.warn(`[AIRTABLE_CREATE_ARTICLE_WARN] "${articleData.title}" için geçersiz tarih: ${articleData.date}. Tarih alanı boş bırakılacak.`);
            } else {
                const year = dateObj.getFullYear();
                 if (year < 1900 || year > new Date().getFullYear() + 10) { 
                    console.warn(`[AIRTABLE_CREATE_ARTICLE_WARN] "${articleData.title}" için tarih aralık dışında: ${articleData.date}. Tarih alanı boş bırakılacak.`);
                 } else {
                    fields.Date = dateObj.toISOString();
                 }
            }
        } catch (e) {
            console.warn(`[AIRTABLE_CREATE_ARTICLE_WARN] "${articleData.title}" için tarih ayrıştırılamadı: ${articleData.date}. Tarih alanı boş bırakılacak. Hata: ${e}`);
        }
    } else {
        console.log(`[AIRTABLE_CREATE_ARTICLE_INFO] "${articleData.title}" için tarih verisi sağlanmadı. Tarih alanı boş bırakılacak.`);
    }

    Object.keys(fields).forEach(key => {
        if (fields[key] === undefined || fields[key] === null) {
           delete fields[key];
        }
    });
    console.log(`[AIRTABLE_CREATE_FIELDS] Makale oluşturulacak alanlar: ${JSON.stringify(fields)}`);


    const createdRecords = await articlesTable.create([{ fields }]);
    if (!createdRecords || createdRecords.length === 0) {
        throw new Error("Airtable makale oluşturma işlemi bir kayıt döndürmedi.");
    }
    const createdArticle = mapRecordToArticle(createdRecords[0]);
    console.log(`[AIRTABLE_CREATE_ARTICLE_SUCCESS] Makale başarıyla oluşturuldu. ID: ${createdArticle.id}, Başlık: "${createdArticle.title}", URL: "${createdArticle.url}", NormURL: "${createdArticle.normalizedUrl}"`);
    return createdArticle;
  } catch (error) {
    const message = `Airtable'da makale oluşturulurken hata oluştu (NormURL: ${urlForLogging}): ${error instanceof Error ? error.message : String(error)}`;
    console.error(`[AIRTABLE_CREATE_ARTICLE_ERROR] ${message}`, error);
    throw new Error(message);
  }
};

export const findArticleByUrlAndSiteId = async (rawArticleUrl: string | null, siteId: string): Promise<Article | null> => {
  await initializeAirtable();
  const { articlesTable } = getValidatedTableInstances();

  if (!rawArticleUrl) {
    console.warn(`[AIRTABLE_FIND_ARTICLE_WARN] Sağlanan ham makale URL'si boş (Site ID: ${siteId}). Mevcut makale bulunamadığı varsayılıyor.`);
    return null;
  }
  
  const escapedRawQueryUrl = rawArticleUrl.replace(/"/g, '""');
  // REGEX_MATCH ile Site ID'nin tam eşleşmesini arıyoruz (virgülle ayrılmış listede)
  const filterFormula = `AND(TRIM({URL}) = TRIM("${escapedRawQueryUrl}"), REGEX_MATCH(ARRAYJOIN(ARRAYCOMPACT(Site)), "(^|,)${siteId}(,|$)"))`;

  console.log(`[AIRTABLE_FIND_ARTICLE_QUERY] Attempting to find article with formula: ${filterFormula}`);
  console.log(`[AIRTABLE_FIND_ARTICLE_QUERY_DETAILS] Querying with: Escaped Raw URL part = TRIM("${escapedRawQueryUrl}"), SiteID part = REGEX_MATCH(ARRAYJOIN(ARRAYCOMPACT(Site)), "(^|,)${siteId}(,|$)") for siteId = ${siteId}`);

  try {
    const records = await articlesTable.select({
      filterByFormula: filterFormula,
      // fields: undefined, // Get all fields
      maxRecords: 1, 
    }).all();

    console.log(`[AIRTABLE_FIND_ARTICLE_DEBUG] Airtable select for formula "${filterFormula}" returned ${records.length} record(s).`);

    if (records.length > 0) {
      const foundRecord = records[0];
      const airtableUrl = foundRecord.fields.URL as string;
      const airtableSiteLinks = foundRecord.fields.Site as string[] | string | undefined;

      console.log(`[AIRTABLE_FIND_ARTICLE_FOUND_RAW_DATA] Found Record ID: ${foundRecord.id}, Airtable Raw URL: "${airtableUrl}", Airtable Raw Site Links: "${JSON.stringify(airtableSiteLinks)}"`);
      console.log(`[AIRTABLE_FIND_ARTICLE_FOUND_RAW_DATA] Comparing with Query URL: "${rawArticleUrl}", Query SiteID: "${siteId}"`);
      
      let directUrlMatch = (airtableUrl || "").trim() === (rawArticleUrl || "").trim();
      let siteIdMatch = false;
      if (Array.isArray(airtableSiteLinks) && airtableSiteLinks.length > 0) {
        siteIdMatch = airtableSiteLinks.includes(siteId);
      } else if (typeof airtableSiteLinks === 'string' && airtableSiteLinks.trim() !== '') { // Less ideal, but handle if it's a single string
        console.warn(`[AIRTABLE_FIND_ARTICLE_WARN] SiteLinks field is a string: "${airtableSiteLinks}". Expected array. Attempting direct match.`);
        siteIdMatch = airtableSiteLinks === siteId;
      } else if (airtableSiteLinks && !Array.isArray(airtableSiteLinks)) {
         console.warn(`[AIRTABLE_FIND_ARTICLE_WARN] SiteLinks field is not an array or string but: ${typeof airtableSiteLinks}. Value: ${JSON.stringify(airtableSiteLinks)}`);
      }


      console.log(`[AIRTABLE_FIND_ARTICLE_STRICT_COMPARISON] Direct URL Match: ${directUrlMatch}, Site ID Match (includes): ${siteIdMatch}`);

      if (directUrlMatch && siteIdMatch) {
        console.log(`[AIRTABLE_FIND_ARTICLE_CONFIRMED_MATCH_STRICT] Article found with strict URL and SiteID match. Record ID: ${foundRecord.id}`);
        return mapRecordToArticle(foundRecord);
      } else {
        console.warn(`[AIRTABLE_FIND_ARTICLE_MISMATCH_POST_QUERY] Airtable found a record via formula, but strict JS comparison failed. URL Match: ${directUrlMatch}, SiteID Match: ${siteIdMatch}. Formula was: "${filterFormula}". Treating as not found to be safe.`);
        return null;
      }
    }
    console.log(`[AIRTABLE_FIND_ARTICLE_NOT_FOUND] No existing article found for Raw URL: "${rawArticleUrl}", SiteID: "${siteId}" with formula "${filterFormula}".`);
    return null;
  } catch (error) {
    const message = `${siteId} sitesi için "${rawArticleUrl}" URL'sine sahip makale bulunurken hata oluştu: ${error instanceof Error ? error.message : String(error)}`;
    console.error(`[AIRTABLE_FIND_ARTICLE_ERROR] ${message}`, error);
    return null; 
  }
};

    