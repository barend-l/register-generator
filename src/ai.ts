const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

function getApiKey(): string {
  return localStorage.getItem('openrouter_api_key') || '';
}

function getModel(): string {
  return localStorage.getItem('openrouter_model') || 'anthropic/claude-sonnet-4';
}

async function callAI(messages: { role: string; content: string }[], temperature = 0.1, signal?: AbortSignal): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('Geen API-key geconfigureerd. Klik op het tandwiel-icoon rechtsboven.');

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: getModel(),
      messages,
      temperature,
    }),
    signal,
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`API-fout (${response.status}): ${errBody}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

function extractJson(content: string, type: 'array' | 'object'): unknown {
  const pattern = type === 'array' ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/;
  const match = content.match(pattern);
  if (!match) return type === 'array' ? [] : {};
  return JSON.parse(match[0]);
}

// Step 2: Analyze a single page for register terms
export async function analyzePageTerms(
  pageText: string,
  bookPageNumber: number,
  signal?: AbortSignal
): Promise<string[]> {
  const prompt = `Je bent een professionele registermaker voor een Nederlands onderwijskundig boek.
Analyseer de volgende tekst van pagina ${bookPageNumber} en identificeer alle begrippen die in een register (index) thuishoren.

Categorieën om op te letten:
- Vakbegrippen en concepten (bijv. constructieve afstemming, cognitive offloading, formatief handelen)
- Theoretische kaders en modellen (bijv. 4Ps-framework, AIAS, PIC-RAT)
- Eigennamen van personen die inhoudelijk worden besproken (achternaam, bijv. Biggs, Fawns)
- Organisaties en instituten (bijv. UNESCO, SLO)
- Wetten en regelgeving (bijv. AI Act, AVG)
- Tools en systemen (bijv. ChatGPT, Claude)
- Onderwijsvormen en -methoden (bijv. probleemgestuurd onderwijs, technasium)
- Psychologische en pedagogische kernbegrippen (bijv. intrinsieke motivatie, metacognitie)

Regels:
- Gebruik de term zoals die in de tekst staat (Nederlands of Engels).
- Eigennamen: alleen achternaam.
- Basisvorm (enkelvoud, infinitief).
- Neem GEEN generieke woorden op (onderwijs, leren, docent, leerling, student, AI).
- Alleen termen die inhoudelijk worden behandeld op deze pagina, niet terloops genoemd.

Antwoord uitsluitend met een JSON-array van strings. Geen toelichting.`;

  const content = await callAI(
    [{ role: 'user', content: `${prompt}\n\nTekst van pagina ${bookPageNumber}:\n\n${pageText}` }],
    0.1,
    signal
  );

  try {
    const terms = extractJson(content, 'array') as string[];
    return terms.filter((t) => typeof t === 'string' && t.length > 0);
  } catch {
    return [];
  }
}

// Step 3: AI-powered smart filtering of terms
export async function smartFilterTerms(
  terms: { term: string; pages: number[]; frequency: number }[],
  userPrompt: string,
  signal?: AbortSignal
): Promise<{ keep: string[]; rename: Record<string, string>; suggestions: string }> {
  const prompt = `Je bent een professionele registermaker. Hieronder staat een lijst met ${terms.length} kandidaat-termen voor een boekregister, met hun frequentie (aantal pagina's waarop ze voorkomen).

De gebruiker geeft de volgende instructie:
"${userPrompt}"

Analyseer de termenlijst en geef terug:
1. "keep": een array met termen die behouden moeten worden op basis van de instructie
2. "rename": een object met termen die hernoemd moeten worden (key = oude term, value = nieuwe term). Gebruik dit om varianten samen te voegen of termen naar de juiste basisvorm om te zetten (bijv. "formatieve toetsing" → "formatief toetsen", "summatieve" → "summatief toetsen").
3. "suggestions": een korte samenvatting in het Nederlands van wat je hebt gedaan en waarom.

De termen:
${JSON.stringify(terms.map(t => ({ term: t.term, freq: t.frequency })), null, 0)}

Antwoord uitsluitend in JSON:
{
  "keep": ["term1", "term2"],
  "rename": {"oude_term": "nieuwe_term"},
  "suggestions": "Uitleg van wijzigingen"
}`;

  const content = await callAI(
    [{ role: 'user', content: prompt }],
    0.2,
    signal
  );

  try {
    const result = extractJson(content, 'object') as {
      keep?: string[];
      rename?: Record<string, string>;
      suggestions?: string;
    };
    return {
      keep: Array.isArray(result.keep) ? result.keep : terms.map(t => t.term),
      rename: result.rename && typeof result.rename === 'object' ? result.rename : {},
      suggestions: typeof result.suggestions === 'string' ? result.suggestions : '',
    };
  } catch {
    throw new Error('Kon het AI-antwoord niet verwerken');
  }
}

// Step 4: Classify terms into 3 hierarchy levels (real terms, not invented categories)
export async function classifyTermLevels(
  terms: string[],
  signal?: AbortSignal
): Promise<{ term: string; level: 1 | 2 | 3; parent: string | null }[]> {
  const prompt = `Je bent een professionele registermaker voor een Nederlands (onderwijs)boek.

Hieronder staat een lijst met registertermen die allemaal in het boek voorkomen met eigen paginanummers. Bepaal voor elke term het inspringniveau in het register:

- Niveau 1 (hoofdterm): Brede, overkoepelende begrippen die als kopje in het register staan. Dit zijn ECHTE termen uit het boek, GEEN verzonnen categorieën. Bijvoorbeeld: "AI geletterdheid", "formatief toetsen", "constructieve afstemming".
- Niveau 2 (subterm): Specifiekere begrippen die logisch onder een hoofdterm vallen. Bijvoorbeeld: "kritisch denken" onder "AI geletterdheid".
- Niveau 3 (sub-subterm): Heel specifieke begrippen die onder een subterm vallen. Gebruik dit spaarzaam.

BELANGRIJK:
- Alle niveaus zijn ECHTE termen uit het boek met eigen paginanummers
- Verzin GEEN nieuwe categorienamen - gebruik alleen termen uit de lijst
- De meeste termen zullen niveau 1 zijn (zelfstandig in het register)
- Alleen als er een duidelijke hiërarchische relatie bestaat, maak je een term niveau 2 of 3
- Een term kan alleen parent zijn als die zelf ook in de lijst staat
- Geef voor niveau 2 en 3 termen de exacte naam van de bovenliggende term als "parent"

Antwoord uitsluitend in JSON-array:
[
  { "term": "AI geletterdheid", "level": 1, "parent": null },
  { "term": "kritisch denken", "level": 2, "parent": "AI geletterdheid" },
  { "term": "bronnenonderzoek", "level": 3, "parent": "kritisch denken" }
]

De termen:
${JSON.stringify(terms)}`;

  const content = await callAI(
    [{ role: 'user', content: prompt }],
    0.2,
    signal
  );

  try {
    const result = extractJson(content, 'array') as { term?: string; level?: number; parent?: string | null }[];

    const termSet = new Set(terms);
    const entries: { term: string; level: 1 | 2 | 3; parent: string | null }[] = [];
    const classified = new Set<string>();

    for (const item of result) {
      if (!item.term || !termSet.has(item.term) || classified.has(item.term)) continue;
      const level = (item.level === 1 || item.level === 2 || item.level === 3) ? item.level : 1;
      const parent = level === 1 ? null : (item.parent && termSet.has(item.parent) ? item.parent : null);
      entries.push({ term: item.term, level: level as 1 | 2 | 3, parent });
      classified.add(item.term);
    }

    // Add any terms that weren't classified as level 1
    for (const t of terms) {
      if (!classified.has(t)) {
        entries.push({ term: t, level: 1, parent: null });
      }
    }

    return entries;
  } catch {
    // Fallback: all terms as level 1
    return terms.map(t => ({ term: t, level: 1, parent: null }));
  }
}

// Step 4 (legacy): Categorize terms into a register structure
export async function categorizeTerms(
  terms: string[],
  signal?: AbortSignal
): Promise<{ categories: { name: string; subcategories: { name: string; terms: string[] }[] }[] }> {
  const prompt = `Hier is een lijst registertermen voor een onderwijskundig boek over AI in het onderwijs. Stel een categorisering voor op twee niveaus: hoofdcategorieën en subcategorieën. Elke term hoort bij precies één subcategorie.

Regels:
- Maximaal 8 hoofdcategorieën.
- Subcategorieën zijn optioneel. Als een hoofdcategorie maar 3 of minder termen bevat, gebruik dan één subcategorie met dezelfde naam als de hoofdcategorie.
- De categorisering is bedoeld voor een register in een boek. Houd het praktisch en voor de lezer logisch.
- BELANGRIJK: elke hoofdcategorie MOET een "subcategories" array bevatten, ook als er maar één subcategorie is.
- BELANGRIJK: elke subcategorie MOET een "terms" array bevatten.
- Antwoord in JSON-formaat:
{
  "categories": [
    {
      "name": "Hoofdcategorie",
      "subcategories": [
        {
          "name": "Subcategorie",
          "terms": ["term1", "term2"]
        }
      ]
    }
  ]
}

De termen:
${JSON.stringify(terms)}`;

  const content = await callAI(
    [{ role: 'user', content: prompt }],
    0.2,
    signal
  );

  try {
    const result = extractJson(content, 'object') as {
      categories?: { name?: string; subcategories?: { name?: string; terms?: string[] }[] }[];
    };

    // Sanitize: ensure all categories have subcategories arrays, all subcategories have terms arrays
    const categories = (result.categories || []).map(cat => ({
      name: cat.name || 'Zonder categorie',
      subcategories: (cat.subcategories || [{ name: cat.name || '', terms: [] }]).map(sub => ({
        name: sub.name || '',
        terms: Array.isArray(sub.terms) ? sub.terms.filter(t => typeof t === 'string') : [],
      })),
    }));

    // Check for terms that weren't categorized
    const categorizedTerms = new Set(categories.flatMap(c => c.subcategories.flatMap(s => s.terms)));
    const uncategorized = terms.filter(t => !categorizedTerms.has(t));
    if (uncategorized.length > 0) {
      categories.push({
        name: 'Overig',
        subcategories: [{ name: 'Overig', terms: uncategorized }],
      });
    }

    return { categories };
  } catch {
    throw new Error('Kon het AI-antwoord niet verwerken. Probeer opnieuw.');
  }
}
