const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

function getApiKey(): string {
  const key = localStorage.getItem('openrouter_api_key') || '';
  return key;
}

function getModel(): string {
  return localStorage.getItem('openrouter_model') || 'anthropic/claude-sonnet-4';
}

export async function analyzePageTerms(
  pageText: string,
  bookPageNumber: number,
  signal?: AbortSignal
): Promise<string[]> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('Geen API-key geconfigureerd. Klik op het tandwiel-icoon rechtsboven.');

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

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: getModel(),
      messages: [
        { role: 'user', content: `${prompt}\n\nTekst van pagina ${bookPageNumber}:\n\n${pageText}` },
      ],
      temperature: 0.1,
    }),
    signal,
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`API-fout (${response.status}): ${errBody}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim() || '[]';

  // Extract JSON array from response (handle markdown code blocks)
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    const terms: string[] = JSON.parse(jsonMatch[0]);
    return terms.filter((t: unknown) => typeof t === 'string' && t.length > 0);
  } catch {
    return [];
  }
}

export async function categorizeTerms(
  terms: string[],
  signal?: AbortSignal
): Promise<{ categories: { name: string; subcategories: { name: string; terms: string[] }[] }[] }> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('Geen API-key geconfigureerd.');

  const prompt = `Hier is een lijst registertermen voor een onderwijskundig boek over AI in het onderwijs. Stel een categorisering voor op twee niveaus: hoofdcategorieën en subcategorieën. Elke term hoort bij precies één subcategorie.

Regels:
- Maximaal 8 hoofdcategorieën.
- Subcategorieën zijn optioneel. Als een hoofdcategorie maar 3 of minder termen bevat, hoeft er geen subcategorie.
- De categorisering is bedoeld voor een register in een boek. Houd het praktisch en voor de lezer logisch.
- Antwoord in JSON-formaat:
{
  "categories": [
    {
      "name": "Hoofdcategorie",
      "subcategories": [
        {
          "name": "Subcategorie (optioneel)",
          "terms": ["term1", "term2"]
        }
      ]
    }
  ]
}

De termen:
${JSON.stringify(terms)}`;

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: getModel(),
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`API-fout (${response.status})`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim() || '{}';
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Ongeldig AI-antwoord');

  return JSON.parse(jsonMatch[0]);
}
