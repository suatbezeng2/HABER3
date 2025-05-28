'use server';
/**
 * @fileOverview HTML içeriğinden haber makaleleri için CSS seçicilerini çıkaran bir AI aracısı.
 *
 * - extractSelectors - HTML içeriğini alan ve önerilen bir SelectorConfig döndüren bir fonksiyon.
 * - ExtractSelectorsInput - extractSelectors fonksiyonu için giriş türü.
 * - ExtractSelectorsOutput - extractSelectors fonksiyonu için dönüş türü (SelectorConfig).
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import type { SelectorConfig } from '@/lib/types';

const ExtractSelectorsInputSchema = z.object({
  htmlContent: z.string().describe('Bir haber web sitesi sayfasının bir parçası veya tam HTML içeriği.'),
  originalUrl: z.string().url().describe('Sayfanın orijinal URL\'si, bağlam ve gerekirse göreceli bağlantıları çözmek için.'),
});
export type ExtractSelectorsInput = z.infer<typeof ExtractSelectorsInputSchema>;

const ExtractSelectorsOutputSchema = z.object({
  item_selector: z.string().describe('Her bir haber makalesi/öğesi için ana kapsayıcının CSS seçicisi. Bu, listedeki her bir haber öğesini benzersiz şekilde saran tekrar eden bir üst öğe olmalıdır. Örnek: "article.post" veya ".news-item"'),
  title_selector: z.string().describe('Haber makalesinin başlığı için CSS seçicisi, item_selector\'a göreceli. Örnek: "h2.entry-title a" veya ".article-title"'),
  link_selector: z.string().describe('Haber makalesinin bağlantısı (&lt;a&gt; etiketi) için CSS seçicisi, item_selector\'a göreceli. Genellikle title_selector ile aynı veya bir alt öğesi. Örnek: "h2.entry-title a" veya "a.read-more"'),
  summary_selector: z.string().optional().describe('Haber makalesinin özeti veya alıntısı için CSS seçicisi, item_selector\'a göreceli. Bulunamazsa veya zor ayırt edilirse boş bırakılabilir. Örnek: "p.excerpt" veya ".article-summary" veya "div.description" veya "article > p:first-of-type"'),
  date_selector: z.string().optional().describe('Haber makalesinin yayın tarihi için CSS seçicisi, `item_selector`\'a göreceli. Öncelikle `datetime` niteliğine sahip `<time>` etiketlerini arayın (örn: "time[datetime]"). Ardından, \'date\', \'published\', \'timestamp\', \'entry-date\', \'post-date\', \'meta-date\', \'article-date\' gibi sınıfları veya kimlikleri içeren öğeleri kontrol edin. Tarih, metin içeriğinde de bulunabilir. İdeal olarak, makinenin okuyabileceği bir tarih formatı (YYYY-MM-DD, DD.MM.YYYY vb.) içeren bir öğe seçin veya `datetime` niteliğini kullanın. Bir tarih öğesi açıkça bulunamıyorsa veya belirsizse, bu alan için boş bir dize ("") döndürün. Örnek: "time.published", "span.post-date", "div.article-meta time[datetime]".'),
  image_selector: z.string().optional().describe('Makalenin ana görseli için CSS seçicisi, `item_selector`\'a göreceli. Örnekler: "figure img[src]", ".article-image img[src]", "picture img[src]". Mümkünse doğrudan <img> etiketini veya <picture> etiketi içindeki <img> etiketini hedefleyin. Resim URL\'sinin `src`, `data-src` veya `srcset` (ilk URL\'yi tercih edin) niteliklerinde bulunup bulunmadığını kontrol edin. Öncelik her zaman doğrudan dosya bağlantılarına (.jpg, .jpeg, .png, .webp, .gif) verilmelidir. Küçük boyutlu yer tutucu görsellerden ve `data:image/...` ile başlayan veri URL\'lerinden KESİNLİKLE kaçının. Görsel bulunamıyorsa veya yalnızca veri URL\'si ise ya da çok küçük bir yer tutucuysa, bu alan için boş bir dize ("") döndürün.'),
  base_url: z.string().optional().describe('Göreceli bağlantıları çözmek için temel URL, algılanırsa veya gerekirse. Genellikle originalUrl\'den türetilebilir. Tam bir URL (http:// veya https:// ile başlayan) veya boş bir dize olmalıdır.'),
});
export type ExtractSelectorsOutput = z.infer<typeof ExtractSelectorsOutputSchema>;

const promptText = `Sen uzman bir web kazıma asistanısın. Görevin, bir haber web sitesinden sağlanan HTML içeriğini analiz etmek ve haber makalelerinin temel öğeleri için DOĞRU ve GEÇERLİ CSS seçicilerini belirlemektir.

Analiz edilecek HTML İçeriği:
\`\`\`html
{{{htmlContent}}}
\`\`\`

Sayfanın Orijinal URL'si: {{{originalUrl}}}

HTML'ye dayanarak, lütfen her makale için ortak bir tekrar eden üst öğeye ('item_selector') göre aşağıdaki CSS seçicilerini sağlayın:
1.  **item_selector**: (ZORUNLU) Her bir haber hikayesi veya makalesi için ana kapsayıcı. Bu, sayfadaki her bir haber listesi öğesini güvenilir bir şekilde tanımlayan bir seçici olmalıdır. Çok dikkatli seçin. Her bir makale için ana yinelenen kapsayıcıyı çıkarmaya özellikle dikkat edin. Diğer tüm seçiciler (başlık, bağlantı, özet, tarih, resim) bu 'item_selector'a göreceli OLMALIDIR.
2.  **title_selector**: (ZORUNLU) 'item_selector' içinde, makalenin başlığını içeren öğe. Genellikle bir &lt;h1&gt;, &lt;h2&gt; veya &lt;h3&gt; etiketi, muhtemelen içinde bir bağlantı ile.
3.  **link_selector**: (ZORUNLU) 'item_selector' içinde, 'href' özelliği tam makalenin URL'si olan &lt;a&gt; etiketi. Başlığın kendisi bir bağlantıysa bu, title_selector ile aynı öğe olabilir.
4.  **summary_selector**: (İSTEĞE BAĞLI AMA ÇOK ÖNEMLİ) 'item_selector' içinde, makalenin kısa bir özetini veya alıntısını içeren öğe. Özel bir özet/alıntı öğesi bulmaya çalışın. Mevcut değilse, 'item_selector' içindeki ana makale içeriği alanındaki ilk paragraf &lt;p&gt; etiketi iyi bir geri dönüş olabilir (örneğin 'article > p:first-of-type'), ancak gezinme metnini veya ilgisiz yan içeriği almamaya dikkat edin. Net bir özet ayırt edilemiyorsa, 'summary_selector' için boş bir dize ("") döndürün.
5.  **date_selector**: (İSTEĞE BAĞLI AMA ÖNEMLİ) 'item_selector' içinde, yayın tarihini gösteren öğe. Öncelikle \`datetime\` niteliğine sahip \`<time>\` etiketlerini arayın (örn: 'time[datetime]'). Ardından, 'date', 'published', 'timestamp', 'entry-date', 'post-date', 'meta-date', 'article-date' gibi sınıfları veya kimlikleri içeren öğeleri kontrol edin. Tarih, metin içeriğinde de bulunabilir. İdeal olarak, makinenin okuyabileceği bir tarih formatı (YYYY-MM-DD, DD.MM.YYYY vb.) içeren bir öğe seçin veya \`datetime\` niteliğini kullanın. Bir tarih öğesi açıkça bulunamıyorsa veya belirsizse, bu alan için boş bir dize ("") döndürebilirsin. Örneğin: "time.published", "span.post-date", "div.article-meta time[datetime]".
6.  **image_selector**: (İSTEĞE BAĞLI) 'item_selector' içinde, makalenin ana görselini içeren etiket için CSS seçicisi. Öncelikli hedefiniz, anlamlı bir \`src\` niteliğine sahip olan bir \`<img>\` etiketi olmalıdır. Eğer resim bir \`<picture>\` elementi içindeyse, \`<picture>\` içindeki \`<img>\` etiketini veya uygun bir \`<source>\` etiketini hedefleyin. \`src\`, \`data-src\` veya \`srcset\` (buradan ilk geçerli URL'yi alın) gibi nitelikleri kontrol edin. **Kesinlikle \`data:image/...\` ile başlayan veri URI'lerinden ve çok küçük (örneğin 1x1 piksel) yer tutucu görsellerden kaçının.** Doğrudan resim dosyası bağlantılarını (\`.jpg\`, \`.jpeg\`, \`.png\`, \`.webp\`, \`.gif\` ile biten) tercih edin. Eğer belirgin bir ana resim bulunamıyorsa, resim bir veri URI ise veya sadece küçük bir yer tutucu ise, bu alan için boş bir dize ("") döndürün. Örnekler: "figure.main-image img[src]", ".article__featured-image img[src]", "picture > img[src]".
7.  **base_url**: (İSTEĞE BAĞLI) Sayfadaki bağlantılar göreliyse (örneğin, "/haber/baslik" gibi) ve originalUrl'den farklı bir temele ihtiyaç duyuyorlarsa, bu alanı doldur. Genellikle originalUrl'nin kök alan adı (örneğin, "https://www.site.com") yeterlidir. 'base_url' YA BOŞ BİR DİZE ("") OLMALI YA DA 'http://' veya 'https://' İLE BAŞLAYAN TAM BİR URL OLMALIDIR. Tüm bağlantılar mutlaksa (yani "http" ile başlıyorsa) veya originalUrl göreceli bağlantılar için doğru temel ise, bu alanı boş bir dize ("") olarak bırak. Eğer göreceli bir yol ise (örneğin /foo/bar), bunu originalUrl'nin köküne ekleyerek tam bir URL oluşturun.

ÇOK ÖNEMLİ: 'item_selector', 'title_selector' ve 'link_selector' için MUTLAKA bir değer bulmaya çalışın. 'summary_selector', 'date_selector' ve 'image_selector' için bir değer bulmak için çaba gösterin, ancak kesin bir eşleşme yoksa boş dize ("") döndürmek kabul edilebilirdir. 'base_url' için yukarıdaki kurallara uyun. Geçerli CSS seçicileri döndürün. İsteğe bağlı bir alan için bir seçici güvenilir bir şekilde belirlenemiyorsa, o seçici için boş bir dize döndürün.

Seçicileri Çıktı şemasıyla eşleşen JSON formatında döndürün.
İyi bir 'item_selector' örneği: 'div.article-card'
İyi bir 'title_selector' örneği (item_selector'a göreceli): 'h2.card-title a'
İyi bir 'image_selector' örneği: 'figure img[src]' veya '.article-image[src]'
`;

const extractSelectorsPrompt = ai.definePrompt({
  name: 'extractSelectorsPrompt',
  input: { schema: ExtractSelectorsInputSchema },
  output: { schema: ExtractSelectorsOutputSchema },
  prompt: promptText,
});

const extractSelectorsFlow = ai.defineFlow(
  {
    name: 'extractSelectorsFlow',
    inputSchema: ExtractSelectorsInputSchema,
    outputSchema: ExtractSelectorsOutputSchema,
  },
  async (input) => {
    const { output } = await extractSelectorsPrompt(input);
    if (!output) {
      throw new Error('Yapay zeka seçicileri oluşturamadı.');
    }

    let finalBaseUrl = "";
    if (output.base_url && output.base_url.trim() !== "") {
      try {
        // Check if it's already a full URL
        new URL(output.base_url); 
        finalBaseUrl = output.base_url;
      } catch (e) {
        // Not a full URL, try to resolve against originalUrl if it's a path
        if (output.base_url.startsWith('/')) { 
          try {
            const original = new URL(input.originalUrl);
            finalBaseUrl = new URL(output.base_url, original.origin).href;
            new URL(finalBaseUrl); // Validate the constructed URL
          } catch (origUrlError) {
            console.warn(`AI tarafından sağlanan base_url ("${output.base_url}") ve originalUrl ("${input.originalUrl}") ile tam URL oluşturulamadı. Base_url boş olarak ayarlanıyor. Hata: ${origUrlError instanceof Error ? origUrlError.message : String(origUrlError)}`);
            finalBaseUrl = ""; 
          }
        } else {
          // If it's not a full URL and not a path starting with '/', it's likely invalid or meant to be empty.
          console.warn(`AI tarafından sağlanan base_url "${output.base_url}" geçerli bir tam URL veya göreli yol değil. Boş olarak ayarlanıyor.`);
          finalBaseUrl = "";
        }
      }
    }
    
    // Final validation of the constructed or provided base_url
    if (finalBaseUrl !== "") {
        try {
            new URL(finalBaseUrl);
        } catch (e) {
            console.warn(`Sonlandırılmış base_url "${finalBaseUrl}" hala geçersiz. Boş dizeye ayarlanıyor. Hata: ${e instanceof Error ? e.message : String(e)}`);
            finalBaseUrl = "";
        }
    }

    return {
        item_selector: output.item_selector || "",
        title_selector: output.title_selector || "",
        link_selector: output.link_selector || "",
        summary_selector: output.summary_selector || "",
        date_selector: output.date_selector || "",
        image_selector: output.image_selector || "",
        base_url: finalBaseUrl,
    };
  }
);

export async function extractSelectors(input: ExtractSelectorsInput): Promise<SelectorConfig> {
  const result = await extractSelectorsFlow(input);
  // Ensure all fields of SelectorConfig are present, even if empty from AI
  return {
    item_selector: result.item_selector,
    title_selector: result.title_selector,
    link_selector: result.link_selector,
    summary_selector: result.summary_selector || "",
    date_selector: result.date_selector || "",
    image_selector: result.image_selector || "",
    base_url: result.base_url || "",
  } as SelectorConfig;
}
