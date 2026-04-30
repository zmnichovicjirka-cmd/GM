
import { GoogleGenAI, Type, Modality, ThinkingLevel } from "@google/genai";
import { StudyResult, StudyFile, CurriculumPlan, VerifiedInfo, QuizSet } from "../types";

const getBaseContents = async (text: string, images: string[], files: StudyFile[]) => {
  const contents: any[] = [];
  if (text) contents.push({ text: `Zadání od uživatele: ${text}` });
  
  for (const imgData of images) {
    let base64 = imgData;
    if (imgData.startsWith('http')) {
      try {
        const resp = await fetch(imgData);
        const blob = await resp.blob();
        base64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      } catch (e) {
        console.error("Failed to fetch image from URL for Gemini:", e);
        continue;
      }
    }

    contents.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: base64.split(',')[1] || base64
      }
    });
  }

  for (const file of files) {
    let fileData = file.data;
    if (fileData.startsWith('http')) {
      try {
        const resp = await fetch(fileData);
        const blob = await resp.blob();
        fileData = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1] || result);
          };
          reader.readAsDataURL(blob);
        });
      } catch (e) {
        console.error("Failed to fetch file from URL for Gemini:", e);
        continue;
      }
    } else {
      // If it's already base64, remove the prefix if present
      if (fileData.includes(',')) {
        fileData = fileData.split(',')[1];
      }
    }

    // List of MIME types officially supported by Gemini for multimodal input
    const isSupportedByGemini = 
      file.mimeType.startsWith('image/') || 
      file.mimeType.startsWith('audio/') || 
      file.mimeType.startsWith('video/') || 
      file.mimeType === 'application/pdf' ||
      file.mimeType.startsWith('text/');

    if (isSupportedByGemini) {
      contents.push({
        inlineData: {
          mimeType: file.mimeType,
          data: fileData
        }
      });
    } else {
      // For unsupported files (like PPTX, DOCX, XLSX), we just mention them in the prompt
      // so the AI knows they are part of the context, even if it can't "see" inside perfectly.
      contents.push({ text: `[Uživatel nahrál soubor: ${file.name} (Typ: ${file.mimeType}). Tento soubor momentálně nelze přímo analyzovat jako multimodalní vstup, ale je uložen v archivu.]` });
    }
  }
  return contents;
};

export const generateCurriculumPlan = async (subject: string, grade: number, level: string): Promise<CurriculumPlan> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const gradePrompt = grade === 0 ? "obecný studijní plán (bez ohledu na ročník)" : `${grade}. ročník`;
  const levelPrompt = level === 'none' ? '' : (level === 'elementary' ? 'základní školy' : 'střední školy');
  const prompt = `Jsi expert na české školství a moderní vzdělávání. Vygeneruj systematický studijní plán pro předmět ${subject} pro ${gradePrompt} ${levelPrompt}.
  Plán musí obsahovat cca 6-8 hlavních témat (kategorií). Pokud je zadán obecný plán, zaměř se na logickou posloupnost od základů po pokročilé techniky.
  Vše v češtině a formátu JSON.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: [{ text: prompt }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          subject: { type: Type.STRING },
          grade: { type: Type.NUMBER },
          topics: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                title: { type: Type.STRING },
                summary: {
                  type: Type.OBJECT,
                  properties: {
                    what: { type: Type.STRING },
                    how: { type: Type.STRING },
                    why: { type: Type.STRING }
                  },
                  required: ["what", "how", "why"]
                },
                mustKnow: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["id", "title", "summary", "mustKnow"]
            }
          }
        },
        required: ["subject", "grade", "topics"]
      }
    }
  });
  return JSON.parse(response.text);
};

export const generateTopicIntro = async (topic: string, images: string[], files: StudyFile[]): Promise<{ subjectName: string, what: string, why: string }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const contents = await getBaseContents(topic, images, files);
  contents.push({ text: "Vygeneruj VELMI KRÁTKÉ úvodní shrnutí pro toto téma (cca 2-3 věty) obsahující: 1. O co jde (předmět), 2. Co to přesně je, 3. Proč je v životě dobré tohle umět/znát. Formát JSON: { subjectName, what, why }. Vše česky." });

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: { parts: contents },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          subjectName: { type: Type.STRING },
          what: { type: Type.STRING },
          why: { type: Type.STRING }
        },
        required: ["subjectName", "what", "why"]
      }
    }
  });

  return JSON.parse(response.text);
};

export const generateInitialSummary = async (
  text: string,
  images: string[],
  files: StudyFile[],
  preAnalyses?: string[],
  tone: 'student' | 'expert' | 'creative' = 'student'
): Promise<Partial<StudyResult>> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const contents = await getBaseContents(text, images, files);
  
  const toneInstruction = {
    student: "Piš jako student pro studenta, srozumitelně, bez příliš složitých slov, kamarádským tónem.",
    expert: "Piš jako odborník, používej přesnou terminologii, formální a profesionální tón.",
    creative: "Piš kreativně, používej metafory, příběhy a zajímavá přirovnání."
  }[tone];

  const instructions = `
    Jsi inteligentní studijní parťák Gymni Mate. Vytvoř hloubkový rozbor v češtině.
    TÓN: ${toneInstruction}
    DŮLEŽITÉ: Striktně dodržuj předmět a téma uvedené v zadání. Pokud je v zadání "Matematika", nesmíš generovat chemii ani nic jiného.
    
    FORMÁTOVÁNÍ:
    - Matematika a chemie VŽDY v KaTeXu ($vzorec$ nebo $$vzorec$$). 
    - Pro chemii používej \\ce{...} VČETNĚ SLOŽENÝCH ZÁVOREK (např. \\ce{H2SO4}, \\ce{Na+}, \\ce{Pb^{II}}).
    - Vzorce piš i v nadpisech a seznamech. 
    - TABULKY: Pokud je to vhodné pro přehlednost (např. srovnání, přehled koncovek, hodnoty), VŽDY vkládej Markdown tabulky. Tabulky jsou pro studenty velmi důležité pro zapamatování.
    
    SHRNUTÍ (fullSummary & lessonContent):
    - ROZBOR LÁTKY: Rozděl učivo na logické kroky (cca 8-15), které do hloubky vysvětlují dané téma.
    - PRVNÍ KAPITOLA (index 0) MUSÍ BÝT VŽDY "Proč je to důležité?" (Why it's important). Zde vysvětli motivaci, k čemu to je v reálném životě a proč by se to student měl učit.
    - NÁSLEDUJÍCÍ KAPITOLY musí být VELMI PODROBNÉ a srozumitelné i pro úplné začátečníky.
    - Každá kapitola by měla být dostatečně konkrétní a obsahlá (cca 200-400 slov), vysvětlovat pojmy od základu.
    - Používej příklady z reálného života, metafory a přirovnání.
    - Každá kapitola musí mít jasný název/otázku (question), která vystihuje danou podkapitolu.
    - OBSAH (lessonContent): Vygeneruj seznam nadpisů (headings) pro každou kapitolu ve stejném pořadí jako ve fullSummary. Nadpisy by měly být stručné a výstižné (např. "Historický kontext", "Vzory a pravidla").

    ASISTENTŮV ÚVOD (lessonIntro):
    Vysvětli studentovi strategii výuky:
    - METODIKA (methodology): Jak se tato látka většinou učí ve školách a jak se podle tebe učí nejlépe (moderní přístup).
    - OČEKÁVÁNÍ (expectations): Co přesně se od studenta po dostudování této látky obvykle vyžaduje (co musí umět prokázat).
    - DOBA STUDIA (totalDuration): Odhadni celkový čas potřebný na zvládnutí této látky.
    - PLÁN VÝUKY (teachingPlan): Seznam bodů, jak přesně plánuješ studenta látku naučit, s odhadovaným časem u každého bodu.
  `;

  if (preAnalyses?.length) contents.push({ text: `Analýza zdrojů: \n${preAnalyses.join('\n---\n')}` });
  contents.push({ text: instructions });

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: { parts: contents },
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          learningGoal: { type: Type.STRING },
          whyImportant: { type: Type.STRING },
          shortSummary: { type: Type.STRING, description: "Velmi stručné shrnutí tématu (max 2 věty)." },
          prerequisites: { type: Type.ARRAY, items: { type: Type.STRING } },
          relatedTopics: { type: Type.ARRAY, items: { type: Type.STRING } },
          enhancementSuggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
          fullSummary: { 
            type: Type.ARRAY, 
            description: "Rozdělení učiva na menší, logické kroky (cca 8-15 kroků pro detailní studium).",
            items: { 
              type: Type.OBJECT, 
              properties: { text: { type: Type.STRING }, question: { type: Type.STRING } },
              required: ["text", "question"]
            } 
          },
          lessonContent: {
            type: Type.ARRAY,
            description: "Seznam nadpisů kapitol pro navigaci v levém panelu.",
            items: {
              type: Type.OBJECT,
              properties: { heading: { type: Type.STRING } },
              required: ["heading"]
            }
          },
          lessonIntro: {
            type: Type.OBJECT,
            properties: {
              methodology: { type: Type.STRING },
              expectations: { type: Type.STRING },
              totalDuration: { type: Type.STRING },
              teachingPlan: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    step: { type: Type.STRING },
                    duration: { type: Type.STRING }
                  },
                  required: ["step", "duration"]
                }
              }
            },
            required: ["methodology", "expectations", "totalDuration", "teachingPlan"]
          },
          slides: { 
            type: Type.ARRAY, 
            items: { 
              type: Type.OBJECT, 
              properties: { title: { type: Type.STRING }, content: { type: Type.ARRAY, items: { type: Type.STRING } } }, 
              required: ["title", "content"] 
            } 
          }
        },
        required: ["title", "learningGoal", "whyImportant", "prerequisites", "relatedTopics", "enhancementSuggestions", "fullSummary", "lessonContent", "slides", "lessonIntro"]
      },
      thinkingConfig: { thinkingBudget: 12000 }
    }
  });

  const parsed = JSON.parse(response.text);
  const searchSources = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => ({
    uri: chunk.web?.uri,
    title: chunk.web?.title
  })).filter((s: any) => s.uri) || [];

  return { ...parsed, sources: searchSources };
};

export const generateExtendedStudy = async (text: string, images: string[], files: StudyFile[]): Promise<Partial<StudyResult>> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const contents = await getBaseContents(text, images, files);
  contents.push({ text: "Vygeneruj: tahák, myšlenkovou mapu (jako seznam nodů), testy a flashcards." });

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: { parts: contents },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          cheatSheet: { type: Type.ARRAY, items: { type: Type.STRING } },
          mindMap: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { topic: { type: Type.STRING }, details: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ["topic", "details"] } },
          quizzes: { 
            type: Type.ARRAY, 
            items: { 
              type: Type.OBJECT, 
              properties: { 
                id: { type: Type.STRING }, 
                title: { type: Type.STRING }, 
                questions: { 
                  type: Type.ARRAY, 
                  items: { 
                    type: Type.OBJECT, 
                    properties: { 
                      question: { type: Type.STRING }, 
                      options: { type: Type.ARRAY, items: { type: Type.STRING } }, 
                      correctIndex: { type: Type.INTEGER } 
                    }, 
                    required: ["question", "options", "correctIndex"] 
                  } 
                } 
              }, 
              required: ["id", "title", "questions"] 
            } 
          },
          flashcards: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { front: { type: Type.STRING }, back: { type: Type.STRING } }, required: ["front", "back"] } }
        },
        required: ["cheatSheet", "mindMap", "quizzes", "flashcards"]
      }
    }
  });
  return JSON.parse(response.text);
};

export const findEducationalVisuals = async (topic: string): Promise<string[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  const prompt = `Najdi kvalitní, ověřené a vzdělávací obrázky/grafy/diagramy pro téma: ${topic}. 
  Vrať seznam PŘÍMÝCH URL adres na tyto obrázky (končící .jpg, .png, .webp).
  Hledej na webech jako Wikipedie, vědecké portály nebo vzdělávací instituce.
  Vrať pouze JSON pole řetězců s URL adresami.`;

  try {
    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });

    const text = result.text;
    const jsonMatch = text.match(/\[.*\]/s);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return [];
  } catch (e) {
    console.error("Failed to find educational visuals:", e);
    return [];
  }
};

export const generateTopicImage = async (topic: string): Promise<string | undefined> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: `High quality educational visual diagram of ${topic}. Dark theme, modern aesthetics.` }] },
      config: { imageConfig: { aspectRatio: "1:1" } }
    });
    const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    return part?.inlineData?.data;
  } catch (e) {
    return undefined;
  }
};

const fetchImageToBase64 = async (url: string): Promise<string> => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch image");
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        resolve(base64.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error("Error fetching image for consistency:", e);
    throw e;
  }
};

export const generateAvatarPortrait = async (description: string, pose: string = "standing", referenceImage?: string): Promise<string | undefined> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const parts: any[] = [];
    
    if (referenceImage) {
      let base64Data = "";
      let mimeType = "image/png";

      if (referenceImage.startsWith('data:image')) {
        const match = referenceImage.match(/^data:(image\/\w+);base64,(.+)$/);
        if (match) {
          mimeType = match[1];
          base64Data = match[2];
        }
      } else if (referenceImage.startsWith('http')) {
        // If it's a URL, we must fetch it and convert to base64
        base64Data = await fetchImageToBase64(referenceImage);
      } else {
        // Assume raw base64
        base64Data = referenceImage;
      }

      const referencePart = `
        CRITICAL: This is a variant of the PROVIDED REFERENCE IMAGE. 
        You MUST maintain PERFECT visual consistency with the hair color, eye color, and EXACT CLOTHING (color, design, textures) of the character in the reference image.
        The only thing that changes is the pose (${pose === "standing" ? "Primary Neutral" : pose}).
      `;
      
      parts.push({
        inlineData: {
          mimeType,
          data: base64Data
        }
      });
      parts.push({ text: referencePart });
    }

    const prompt = `
      High-quality character portrait in a MODERN CEL-SHADED ANIME style. 
      Vibrant colors, thick clean black outlines, professional digital 2D art.
      WAIST-UP framing, facing the camera, looking directly at the viewer.
      
      CRITICAL: BOTH ARMS AND HANDS MUST BE FULLY VISIBLE in the composition.
      STRICTLY ISOLATED on a FLAT, PURE BLACK BACKGROUND with NO GRADIENTS, NO SHADOWS, and NO TEXTURES.
      Character details: ${description}.
      Pose: ${pose === "standing" ? "Primary Neutral (clasping hands/wrists in front)" : pose}.
      Style details: Sharp highlights, bold shadows.
      No text, no background elements, no scenery.
    `;
    
    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts }
    });
    
    const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    return part?.inlineData?.data;
  } catch (e) {
    console.error("Avatar generation error:", e);
    return undefined;
  }
};

export const agentContextResponse = async (userMessage: string, currentContext: StudyResult, history: any[]): Promise<{ message: string, actions?: { type: 'update_lesson' | 'create_lesson', payload: any, label: string }[] }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const contents = history.map(h => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.content }] }));
  const lessonSummary = currentContext.fullSummary.map(s => s.text).join('\n');
  const systemContext = `
    Jsi Gymni Guardian, inteligentní studijní asistent. 
    Aktuální téma: ${currentContext.title}. 
    Obsah lekce: ${lessonSummary}

    Tvým úkolem je pomáhat studentovi pochopit látku. 
    Pokud student vyjádří, že něčemu nerozumí (např. "nechápu racionální čísla"), můžeš navrhnout akci:
    1. "update_lesson": Pokud chce student přidat informace do stávajícího rozboru. Payload by měl obsahovat instrukci pro úpravu (např. "Přidej sekci o racionálních číslech").
    2. "create_lesson": Pokud je téma příliš obsáhlé a zaslouží si vlastní lekci. Payload by měl být název nového tématu.

    Vrať VŽDY JSON ve formátu:
    {
      "message": "Tvá odpověď studentovi v Markdownu",
      "actions": [
        { "type": "update_lesson" | "create_lesson", "payload": "string", "label": "Text na tlačítku" }
      ]
    }
    Pole "actions" je volitelné.
  `;
  contents.push({ role: 'user', parts: [{ text: userMessage }] });
  const response = await ai.models.generateContent({ 
    model: "gemini-3-flash-preview", 
    contents, 
    config: { 
      systemInstruction: systemContext,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          message: { type: Type.STRING },
          actions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, enum: ['update_lesson', 'create_lesson'] },
                payload: { type: Type.STRING },
                label: { type: Type.STRING }
              },
              required: ['type', 'payload', 'label']
            }
          }
        },
        required: ['message']
      }
    } 
  });
  return JSON.parse(response.text);
};

export const evaluateUserAnswer = async (
  topic: string,
  paragraph: string,
  question: string,
  userAnswer: string,
  difficulty: 'easy' | 'medium' | 'hard'
): Promise<{ isCorrect: boolean, feedback: string, correctAnswer: string }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const systemInstruction = `
    Jsi přísný ale spravedlivý učitel. Hodnotíš odpověď studenta na otázku k textu.
    Téma: ${topic}
    Text: ${paragraph}
    Otázka: ${question}
    Obtížnost: ${difficulty} (easy = stačí jednoduché pochopení nebo přepsání vlastními slovy, medium = vyžaduje příklad, hard = vyžaduje souvislosti)
    
    U obtížnosti 'easy' buď velmi mírný. Pokud student vystihl hlavní myšlenku nebo jen přepsal text vlastními slovy, uznej to jako správné.

    Vrať JSON:
    {
      "isCorrect": boolean,
      "feedback": "Stručné vysvětlení, co bylo dobře/špatně a proč (v Markdownu)",
      "correctAnswer": "Jak by vypadala ideální odpověď"
    }
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ parts: [{ text: `Odpověď studenta: ${userAnswer}` }] }],
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          isCorrect: { type: Type.BOOLEAN },
          feedback: { type: Type.STRING },
          correctAnswer: { type: Type.STRING }
        },
        required: ['isCorrect', 'feedback', 'correctAnswer']
      }
    }
  });

  return JSON.parse(response.text);
};

export const teacherChatResponse = async (msg: string, hist: any[], subj: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [...hist.map(h => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.content }] })), { role: 'user', parts: [{ text: msg }] }],
    config: { systemInstruction: `Jsi lektor pro předmět ${subj}.` }
  });
  return response.text;
};

export const preAnalyzeSource = async (type: string, data: any) => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let parts: any[] = [];
  
  if (type === 'youtube') parts.push({ text: `Analyzuj video: ${data}.` });
  else if (type === 'web') parts.push({ text: `Analyzuj web: ${data}.` });
  else if (type === 'file') {
    const isSupported = 
      data.mimeType.startsWith('image/') || 
      data.mimeType.startsWith('audio/') || 
      data.mimeType.startsWith('video/') || 
      data.mimeType === 'application/pdf' ||
      data.mimeType.startsWith('text/');

    if (!isSupported) {
      return { title: data.name, context: `Soubor ${data.name} (typ ${data.mimeType}) byl úspěšně nahrán. Tento typ souboru zatím nepodporuje přímou AI analýzu obsahu, ale je bezpečně uložen ve tvém archivu.` };
    }
    parts.push({ inlineData: { mimeType: data.mimeType, data: data.data }, text: "Analyzuj tento soubor." });
  }

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: { parts },
    config: { 
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: { title: { type: Type.STRING }, context: { type: Type.STRING } },
        required: ["context"]
      }
    }
  });
  return JSON.parse(response.text);
};

export const generateCurriculumTest = async (plan: CurriculumPlan, level: string): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const prompt = `Vytvoř test pro ${plan.grade}. ročník z předmětu ${plan.subject}. 10 otázek. Mix mcq a truefalse. Vrať JSON.`;
  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: [{ text: prompt }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                type: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                correctIndex: { type: Type.NUMBER },
                topicTag: { type: Type.STRING },
                explanation: { type: Type.STRING }
              },
              required: ["question", "type", "options", "correctIndex", "topicTag", "explanation"]
            }
          }
        },
        required: ["questions"]
      }
    }
  });
  return JSON.parse(response.text);
};

export const generateTopicQuiz = async (topic: string, context: string): Promise<QuizSet> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const prompt = `
    Vytvoř krátký test (3-5 otázek) pro procvičení tohoto bodu: "${topic}".
    Kontext: ${context}
    Vrať JSON ve formátu QuizSet:
    {
      "id": "string",
      "title": "string",
      "questions": [
        {
          "question": "string",
          "options": ["string", "string", "string", "string"],
          "correctIndex": number,
          "topicTag": "string",
          "explanation": "string"
        }
      ]
    }
    Vše v češtině.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ text: prompt }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          title: { type: Type.STRING },
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                correctIndex: { type: Type.NUMBER },
                topicTag: { type: Type.STRING },
                explanation: { type: Type.STRING }
              },
              required: ["question", "options", "correctIndex", "topicTag", "explanation"]
            }
          }
        },
        required: ["id", "title", "questions"]
      }
    }
  });

  return JSON.parse(response.text);
};

export const verifyTopic = async (text: string, images: string[], files: StudyFile[]): Promise<VerifiedInfo> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const contents = await getBaseContents(text, images, files);
  const prompt = `
    Analyzuj zadání uživatele a najdi ověřené informace.
    Vrať JSON s těmito poli:
    - whatToLearn: Co se chce uživatel přesně naučit.
    - bestWayToLearn: Jaký je nejlepší způsob se to naučit (metodika).
    - difficulty: Obtížnost tématu (easy, medium, hard).
    - formulationAdvice: Jak by mělo být shrnutí formulováno, aby mu uživatel (student) porozuměl bez příliš složitých slov.
    - summary: Stručné shrnutí faktů v češtině.
    - facts: Seznam nejdůležitějších faktů (max 5) jako pole stringů.
    - sources: Seznam nalezených zdrojů (uri, title).
  `;
  contents.push({ text: prompt });

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: { parts: contents },
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          whatToLearn: { type: Type.STRING },
          bestWayToLearn: { type: Type.STRING },
          difficulty: { type: Type.STRING, enum: ['easy', 'medium', 'hard'] },
          formulationAdvice: { type: Type.STRING },
          summary: { type: Type.STRING },
          facts: { type: Type.ARRAY, items: { type: Type.STRING } },
          sources: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                uri: { type: Type.STRING },
                title: { type: Type.STRING }
              },
              required: ["uri", "title"]
            }
          }
        },
        required: ["whatToLearn", "bestWayToLearn", "difficulty", "formulationAdvice", "summary", "facts", "sources"]
      }
    }
  });

  const parsed = JSON.parse(response.text);
  const searchSources = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => ({
    uri: chunk.web?.uri,
    title: chunk.web?.title
  })).filter((s: any) => s.uri) || [];

  return {
    ...parsed,
    sources: [...(parsed.sources || []), ...searchSources].filter((v, i, a) => a.findIndex(t => t.uri === v.uri) === i)
  };
};

export const searchAdditionalSources = async (query: string): Promise<{uri: string, title: string}[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ text: `Najdi relevantní a ověřené webové zdroje pro téma: ${query}. Vrať pouze seznam zdrojů.` }],
    config: {
      tools: [{ googleSearch: {} }],
    }
  });

  const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => ({
    uri: chunk.web?.uri,
    title: chunk.web?.title
  })).filter((s: any) => s.uri) || [];

  return sources;
};

export const chatWithVerifiedInfo = async (query: string, verifiedSummary: string, history: {role: 'user'|'model', text: string}[]): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const chat = ai.chats.create({
    model: "gemini-3-flash-preview",
    config: {
      systemInstruction: `Jsi studijní asistent. Odpovídej na otázky uživatele na základě tohoto shrnutí ověřených informací: ${verifiedSummary}. Buď stručný a věcný.`
    },
    history: history.map(h => ({
      role: h.role === 'model' ? 'model' : 'user',
      parts: [{ text: h.text }]
    }))
  });

  const response = await chat.sendMessage({ message: query });
  return response.text;
};

export const organizeAvatarPoses = async (images: string[]): Promise<{ [poseName: string]: string }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const contents: any[] = [];
  
  const poses = [
    'WAITING', 'SPEAKING', 'THINKING', 'HAPPY', 'LAUGHING', 'INTENSE', 
    'SHOCKED', 'FRIENDLY', 'CASUAL', 'TAKING_NOTES', 'HAPPY_TO_STUDY', 
    'TIRED_OF_STUDYING', 'WORKING_OUT', 'WITH_FRIEND', 'BORED'
  ];

  for (const imgData of images) {
    contents.push({
      inlineData: {
        mimeType: "image/png",
        data: imgData.replace(/^data:image\/\w+;base64,/, "")
      }
    });
  }

  const prompt = `
    Dostal jsi několik obrázků (avatarů) stejného charakteru v různých pózách a výrazech.
    Tvé úkoly:
    1. Každý obrázek (v pořadí 1 až ${images.length}) přiřaď k jedné z těchto kategorií: ${poses.join(', ')}.
    2. Pokud obrázek přesně nesedí, vyber tu nejbližší.
    3. Pokud je obrázků více pro jednu kategorii, vyber ten nejlepší/nejreprezentativnější.
    
    Vrať JSON, kde klíče jsou názvy kategorií (POSE) a hodnoty jsou INDEXY obrázků (0 až ${images.length - 1}).
    Příklad: { "HAPPY": 0, "SPEAKING": 3, ... }
  `;

  contents.push({ text: prompt });

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: { parts: contents },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: poses.reduce((acc: any, pose) => {
          acc[pose] = { type: Type.INTEGER };
          return acc;
        }, {}),
        description: "Map of pose names to image indices"
      }
    }
  });

  const mapping = JSON.parse(response.text);
  const result: { [poseName: string]: string } = {};
  
  for (const pose in mapping) {
    const index = mapping[pose];
    if (index >= 0 && index < images.length) {
      result[pose] = images[index];
    }
  }

  return result;
};

export const refineCurriculumPlan = async (currentPlan: CurriculumPlan, instruction: string): Promise<CurriculumPlan> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: [{ text: `Mám studijní plán: ${JSON.stringify(currentPlan)}. Uprav jeho strukturu podle tohoto pokynu: "${instruction}". Zachovej formát JSON a všechna pole.` }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          subject: { type: Type.STRING },
          grade: { type: Type.NUMBER },
          topics: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                title: { type: Type.STRING },
                summary: {
                  type: Type.OBJECT,
                  properties: {
                    what: { type: Type.STRING },
                    how: { type: Type.STRING },
                    why: { type: Type.STRING }
                  },
                  required: ["what", "how", "why"]
                },
                mustKnow: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["id", "title", "summary", "mustKnow"]
            }
          }
        },
        required: ["subject", "grade", "topics"]
      }
    }
  });
  return JSON.parse(response.text);
};

export const analyzeArchiveUpload = async (text: string, images: string[], files: StudyFile[], availableSubjects: string[]): Promise<{ title: string, subject: string }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const contents = await getBaseContents(text, images, files);
  
  const prompt = `
    Právě mi byly nahrány studijní materiály (viz výše).
    Tvým úkolem je:
    1. Analyzovat obsah a navrhnout UNIKÁTNÍ, vtipný a motivující název pro tuto archívní položku (např. "Chemie: Tajemství periodické tabulky", "Dějepis: Cesta do středověku").
    2. Zařadit tyto materiály do jednoho z existujících předmětů uživatele, nebo zvolit nejvhodnější název předmětu.
    
    POVOLENÉ PŘEDMĚTY (pokud se žádný nehodí, navrhni nový): ${availableSubjects.join(', ')}
    
    Vrať JSON: { "title": "string", "subject": "string" }
  `;
  
  contents.push({ text: prompt });

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: { parts: contents },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          subject: { type: Type.STRING }
        },
        required: ["title", "subject"]
      }
    }
  });
  
  return JSON.parse(response.text);
};

export const refineStudy = async (currentResult: StudyResult, instruction: string): Promise<StudyResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: `Mám data: ${JSON.stringify(currentResult)}. Uprav je: "${instruction}". Vrať JSON.`,
    config: { responseMimeType: "application/json" }
  });
  return JSON.parse(response.text);
};

export const classifyAndExplainTopic = async (topic: string, currentSubjects: string[]): Promise<{
  subjectName: string;
  what: string;
  why: string;
}> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const prompt = `
    Dostal jsem téma ke studiu: "${topic}".
    Dostupné předměty uživatele: ${currentSubjects.join(', ')}.
    
    Tvé úkoly:
    1. Urči, do kterého z předmětů téma nejlépe zapadá. Pokud do žádného, navrhni nejvhodnější název nového předmětu (např. "Filozofie", "Psychologie").
    2. Stručně vysvětli (max 2 věty), co toto téma obnáší.
    3. Stručně vysvětli (max 2 věty), proč je toto téma dobré umět a jaké má praktické využití.
    
    Vrať JSON v češtině. Použij tón, který motivuje studenta.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ text: prompt }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          subjectName: { type: Type.STRING },
          what: { type: Type.STRING },
          why: { type: Type.STRING }
        },
        required: ["subjectName", "what", "why"]
      },
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
    }
  });

  return JSON.parse(response.text);
};
