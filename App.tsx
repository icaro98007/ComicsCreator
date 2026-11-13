
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useRef } from 'react';
import { GoogleGenAI } from "./genaiProxy";
import jsPDF from 'jspdf';
import { MAX_STORY_PAGES, BACK_COVER_PAGE, TOTAL_PAGES, INITIAL_PAGES, BATCH_SIZE, DECISION_PAGES, GENRES, TONES, LANGUAGES, ComicFace, Beat, Persona, UploadedStory } from './types';
import { Setup } from './Setup';
import { Book } from './Book';
import { useApiKey } from './useApiKey';
import { ApiKeyDialog } from './ApiKeyDialog';
import { playPageTurnSound } from './soundFX';

// --- Constants ---
const MODEL_IMAGE_GEN_NAME = "gemini-3-pro-image-preview";
const MODEL_IMAGE_FALLBACK_NAME = "gemini-3.1-flash-lite-image";
const MODEL_TEXT_NAME = "gemini-4-hydrogen";

const App: React.FC = () => {
  // --- API Key Hook ---
  const { validateApiKey, setShowApiKeyDialog, showApiKeyDialog, handleApiKeyDialogContinue } = useApiKey();

  const [hero, setHeroState] = useState<Persona | null>(null);
  const [friend, setFriendState] = useState<Persona | null>(null);
  const [uploadedStory, setUploadedStoryState] = useState<UploadedStory | null>(null);
  const [isReadingStory, setIsReadingStory] = useState(false);
  const [selectedGenre, setSelectedGenre] = useState(GENRES[0]);
  const [selectedLanguage, setSelectedLanguage] = useState(LANGUAGES[0].code);
  const [customPremise, setCustomPremise] = useState("");
  const [storyTone, setStoryTone] = useState(TONES[0]);
  const [richMode, setRichMode] = useState(true);
  
  const heroRef = useRef<Persona | null>(null);
  const friendRef = useRef<Persona | null>(null);
  const uploadedStoryRef = useRef<UploadedStory | null>(null);

  const setHero = (p: Persona | null) => { setHeroState(p); heroRef.current = p; };
  const setFriend = (p: Persona | null) => { setFriendState(p); friendRef.current = p; };
  const setUploadedStory = (s: UploadedStory | null) => { setUploadedStoryState(s); uploadedStoryRef.current = s; };
  
  const [comicFaces, setComicFaces] = useState<ComicFace[]>([]);
  const [currentSheetIndex, setCurrentSheetIndex] = useState(0);
  const [isStarted, setIsStarted] = useState(false);
  
  // --- Transition States ---
  const [showSetup, setShowSetup] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const generatingPages = useRef(new Set<number>());
  const historyRef = useRef<ComicFace[]>([]);
  const imageQuotaExhaustedRef = useRef(false);

  // --- AI Helpers ---
  // Helper to always get a fresh instance with the selected key
  const getAI = () => {
    return new GoogleGenAI({ apiKey: "server-side" });
  };

  const handleAPIError = (e: any) => {
    const msg = String(e);
    console.error("API Error:", msg);
    if (
      msg.includes('Requested entity was not found') || 
      msg.includes('API_KEY_INVALID') || 
      msg.toLowerCase().includes('permission denied')
    ) {
      setShowApiKeyDialog(true);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const extractPdfStoryText = async (base64: string): Promise<string> => {
    const ai = getAI();
    const res = await ai.models.generateContent({
      model: MODEL_TEXT_NAME,
      contents: [
        { inlineData: { mimeType: 'application/pdf', data: base64 } },
        { text: 'Extract the complete story text from this PDF accurately and verbatim in its original language. Output only the story text without commentary.' }
      ]
    });
    return (res.text || '').trim();
  };

  const generateBeat = async (history: ComicFace[], isRightPage: boolean, pageNum: number, isDecisionPage: boolean): Promise<Beat> => {
    if (!heroRef.current) throw new Error("No Hero");

    const isFinalPage = pageNum === MAX_STORY_PAGES;
    const langName = LANGUAGES.find(l => l.code === selectedLanguage)?.name || "English";

    // Get relevant history and last focus to prevent repetition
    const relevantHistory = history
        .filter(p => p.type === 'story' && p.narrative && (p.pageIndex || 0) < pageNum)
        .sort((a, b) => (a.pageIndex || 0) - (b.pageIndex || 0));

    const lastBeat = relevantHistory[relevantHistory.length - 1]?.narrative;
    const lastFocus = lastBeat?.focus_char || 'none';

    const historyText = relevantHistory.map(p => 
      `[Page ${p.pageIndex}] [Focus: ${p.narrative?.focus_char}] (Caption: "${p.narrative?.caption || ''}") (Dialogue: "${p.narrative?.dialogue || ''}") (Scene: ${p.narrative?.scene}) ${p.resolvedChoice ? `-> USER CHOICE: "${p.resolvedChoice}"` : ''}`
    ).join('\n');

    // Aggressive Co-Star Injection Logic
    let friendInstruction = "Not yet introduced.";
    if (friendRef.current) {
        friendInstruction = "ACTIVE and PRESENT (User Provided).";
        // If the last panel wasn't the friend, strongly suggest switching to them to maintain balance.
        if (lastFocus !== 'friend' && Math.random() > 0.4) {
             friendInstruction += " MANDATORY: FOCUS ON THE CO-STAR FOR THIS PANEL.";
        } else {
             friendInstruction += " Ensure they are woven into the scene even if not the main focus.";
        }
    }

    // Extract PDF text on demand if user uploaded a PDF before unlocking API key
    if (uploadedStoryRef.current && !uploadedStoryRef.current.text && uploadedStoryRef.current.pdfBase64) {
        try {
            const extracted = await extractPdfStoryText(uploadedStoryRef.current.pdfBase64);
            if (extracted) {
                setUploadedStory({ ...uploadedStoryRef.current, text: extracted });
            }
        } catch (e) {
            console.error("Failed to extract PDF story text", e);
        }
    }

    // Determine Core Story Driver (Uploaded Story vs Genre vs Custom Premise)
    let coreDriver = `GENRE: ${selectedGenre}. TONE: ${storyTone}.`;
    if (selectedGenre === 'Custom') {
        coreDriver = `STORY PREMISE: ${customPremise || "A totally unique, unpredictable adventure"}. (Follow this premise strictly over standard genre tropes).`;
    }
    const sourceStoryText = uploadedStoryRef.current?.text?.trim();
    if (sourceStoryText) {
        const truncatedStory = sourceStoryText.slice(0, 24000);
        coreDriver += `\n\nSOURCE STORY TO ADAPT (CRITICAL: Faithfully adapt the plot, characters, setting, and progression of this uploaded story across ${MAX_STORY_PAGES} pages. Map Page ${pageNum}/${MAX_STORY_PAGES} to the matching point in the narrative arc):\n"""\n${truncatedStory}\n"""`;
    }
    
    const isSliceOfLife = selectedGenre.includes("Comedy") || selectedGenre.includes("Teen") || selectedGenre.includes("Slice");

    // Guardrails to prevent everything becoming "Quantum Sci-Fi"
    const guardrails = sourceStoryText ? '' : `
    NEGATIVE CONSTRAINTS:
    1. UNLESS GENRE IS "Dark Sci-Fi" OR "Superhero Action" OR "Custom": DO NOT use technical jargon like "Quantum", "Timeline", "Portal", "Multiverse", or "Singularity".
    2. IF GENRE IS "Teen Drama" OR "Lighthearted Comedy": The "stakes" must be SOCIAL, EMOTIONAL, or PERSONAL (e.g., a rumor, a competition, a broken promise, being late, embarrassing oneself). Do NOT make it life-or-death. Keep it grounded.
    3. Avoid "The artifact" or "The device" unless established earlier.
    `;

    // BASE INSTRUCTION: Strictly enforce language for output text.
    let instruction = `Continue the story. ALL OUTPUT TEXT (Captions, Dialogue, Choices) MUST BE IN ${langName.toUpperCase()}. ${coreDriver} ${guardrails}`;
    if (richMode) {
        instruction += " RICH/NOVEL MODE ENABLED. Prioritize deeper character thoughts, descriptive captions, and meaningful dialogue exchanges over short punchlines.";
    }

    if (isFinalPage) {
        if (sourceStoryText) {
            instruction += " FINAL PAGE. Faithfully adapt the climax/ending or final cliffhanger of the uploaded source story. Text may end with 'TO BE CONTINUED...' (or localized equivalent) if appropriate.";
        } else {
            instruction += " FINAL PAGE. KARMIC CLIFFHANGER REQUIRED. You MUST explicitly reference the User's choice from PAGE 3 in the narrative and show how that specific philosophy led to this conclusion. Text must end with 'TO BE CONTINUED...' (or localized equivalent).";
        }
    } else if (isDecisionPage) {
        instruction += " End with a PSYCHOLOGICAL choice about VALUES, RELATIONSHIPS, or RISK. (e.g., Truth vs. Safety, Forgive vs. Avenge). The options must NOT be simple physical actions like 'Go Left'.";
    } else {
        // Neutralized Narrative Arc to avoid forcing "scary mystery" tones if the genre doesn't call for it.
        if (pageNum === 1) {
            instruction += " INCITING INCIDENT. An event disrupts the status quo. Establish the genre's intended mood. (If Slice of Life: A social snag/surprise. If Adventure: A call to action).";
        } else if (pageNum <= 4) {
            instruction += " RISING ACTION. The heroes engage with the new situation. Focus on dialogue, character dynamics, and initial challenges.";
        } else if (pageNum <= 8) {
            instruction += " COMPLICATION. A twist occurs! A secret is revealed, a misunderstanding deepens, or the path is blocked. (Keep intensity appropriate to Genre - e.g. Social awkwardness for Comedy, Danger for Horror).";
        } else {
            instruction += " CLIMAX. The confrontation with the main conflict. The truth comes out, the contest ends, or the battle is fought.";
        }
    }

    // Dynamic text limits based on richMode
    const capLimit = richMode ? "max 35 words. Detailed narration or internal monologue" : "max 15 words";
    const diaLimit = richMode ? "max 30 words. Rich, character-driven speech" : "max 12 words";

    const prompt = `
You are writing a comic book script. PAGE ${pageNum} of ${MAX_STORY_PAGES}.
TARGET LANGUAGE FOR TEXT: ${langName} (CRITICAL: CAPTIONS, DIALOGUE, CHOICES MUST BE IN THIS LANGUAGE).
${coreDriver}

CHARACTERS:
- HERO: Active.
- CO-STAR: ${friendInstruction}

PREVIOUS PANELS (READ CAREFULLY):
${historyText.length > 0 ? historyText : "Start the adventure."}

RULES:
1. NO REPETITION. Do not use the same captions or dialogue from previous pages.
2. IF CO-STAR IS ACTIVE, THEY MUST APPEAR FREQUENTLY.
3. VARIETY. If page ${pageNum-1} was an action shot, make this one a reaction or wide shot.
4. LANGUAGE: All user-facing text MUST be in ${langName}.
5. Avoid saying "CO-star" and "hero" in the text captions. Use names if established, or generic descriptors.
6. VISUAL SAFETY: Keep the "scene" visual description PG-13 comic-book stylized (use dramatic shadows, sparks, neon lighting, rain, and emotion; avoid graphic gore, open wounds, or explicit blood so the illustrator model never rejects the panel).

INSTRUCTION: ${instruction}

OUTPUT STRICT JSON ONLY (No markdown formatting):
{
  "caption": "Unique narrator text in ${langName}. (${capLimit}).",
  "dialogue": "Unique speech in ${langName}. (${diaLimit}). Optional.",
  "scene": "Vivid PG-13 visual description (ALWAYS IN ENGLISH for the artist model). MUST mention 'HERO' or 'CO-STAR' if they are present.",
  "focus_char": "hero" OR "friend" OR "other",
  "choices": ["Option A in ${langName}", "Option B in ${langName}"] (Only if decision page)
}
`;
    try {
        const ai = getAI();
        const res = await ai.models.generateContent({ model: MODEL_TEXT_NAME, contents: prompt, config: { responseMimeType: 'application/json' } });
        let rawText = res.text || "{}";
        rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        
        const parsed = JSON.parse(rawText);
        
        if (parsed.dialogue) parsed.dialogue = parsed.dialogue.replace(/^[\w\s\-]+:\s*/i, '').replace(/["']/g, '').trim();
        if (parsed.caption) parsed.caption = parsed.caption.replace(/^[\w\s\-]+:\s*/i, '').trim();
        if (!isDecisionPage) parsed.choices = [];
        if (isDecisionPage && !isFinalPage && (!parsed.choices || parsed.choices.length < 2)) parsed.choices = ["Option A", "Option B"];
        if (!['hero', 'friend', 'other'].includes(parsed.focus_char)) parsed.focus_char = 'hero';

        return parsed as Beat;
    } catch (e) {
        console.error("Beat generation failed", e);
        handleAPIError(e);
        return { 
            caption: pageNum === 1 ? "It began..." : "...", 
            scene: `Generic scene for page ${pageNum}.`, 
            focus_char: 'hero', 
            choices: [] 
        };
    }
  };

  const generatePersona = async (desc: string): Promise<Persona> => {
      const style = selectedGenre === 'Custom' ? "Modern American comic book art" : `${selectedGenre} comic`;
      try {
          const ai = getAI();
          const res = await ai.models.generateContent({
              model: MODEL_IMAGE_GEN_NAME,
              contents: { text: `STYLE: Masterpiece ${style} character sheet, detailed ink, neutral background. FULL BODY. Character: ${desc}` },
              config: { imageConfig: { aspectRatio: '1:1' } }
          });
          const part = res.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
          if (part?.inlineData?.data) return { base64: part.inlineData.data, desc };
          throw new Error("Failed");
      } catch (e) { 
        handleAPIError(e);
        throw e; 
      }
  };

  const sanitizeSceneForComicArt = (scene: string): string => {
      return scene
          .replace(/\b(bloodied|bloody|bleeding|blood|gore|gory|corpse|wounds?|injury|injuries|injured|bleed|slashed|stabbed|severed|mutilated|skull trauma|coughing blood)\b/gi, 'dramatic battle-worn shadows')
          .replace(/\b(die|dying|death|dead|kill|killed|murder)\b/gi, 'defeat')
          .trim();
  };

  const formatIllustratorError = (raw: string): string => {
      const lower = raw.toLowerCase();
      if (lower.includes('resource_exhausted') || lower.includes('quota') || lower.includes('429') || lower.includes('limit: 0')) {
          return 'Daily/minute quota exceeded on Free Tier. Select a billing-enabled Gemini API key in Settings > Secrets to generate full issues.';
      }
      if (lower.includes('safety') || lower.includes('prohibited')) {
          return 'Panel blocked by content filter. Click Retry Page to try an adjusted illustration.';
      }
      try {
          const parsed = JSON.parse(raw);
          const msg = parsed?.error?.message || parsed?.message;
          if (typeof msg === 'string' && msg.trim()) {
              return msg.split('\n')[0].slice(0, 140);
          }
      } catch {
          // Not JSON
      }
      return raw.split('\n')[0].slice(0, 140);
  };

  const parseRetryDelaySeconds = (raw: string): number | null => {
      const match = raw.match(/retry in\s+(?:(\d+)h)?(?:(\d+)m)?([\d.]+)s/i);
      if (!match) return null;
      const hours = Number(match[1] || 0);
      const mins = Number(match[2] || 0);
      const secs = Number(match[3] || 0);
      return hours * 3600 + mins * 60 + secs;
  };

  const generateImage = async (beat: Beat, type: ComicFace['type']): Promise<{ url: string; errorMessage?: string }> => {
    if (imageQuotaExhaustedRef.current) {
        return {
            url: '',
            errorMessage: 'Free Tier image quota reached — showing comic storyboard panel.',
        };
    }

    const buildContents = (useSanitizedScene: boolean) => {
        const parts: any[] = [];
        if (heroRef.current?.base64) {
            parts.push({ text: "REFERENCE 1 [HERO]:" });
            parts.push({ inlineData: { mimeType: heroRef.current.mimeType || 'image/jpeg', data: heroRef.current.base64 } });
        }
        if (friendRef.current?.base64) {
            parts.push({ text: "REFERENCE 2 [CO-STAR]:" });
            parts.push({ inlineData: { mimeType: friendRef.current.mimeType || 'image/jpeg', data: friendRef.current.base64 } });
        }

        const styleEra = selectedGenre === 'Custom' ? "Modern American" : selectedGenre;
        let promptText = `STYLE: ${styleEra} comic book art, detailed ink, vibrant colors, PG-13 graphic novel illustration. `;
        
        if (type === 'cover') {
            const langName = LANGUAGES.find(l => l.code === selectedLanguage)?.name || "English";
            promptText += `TYPE: Comic Book Cover. TITLE: "INFINITE HEROES" (OR LOCALIZED TRANSLATION IN ${langName.toUpperCase()}). Main visual: Dynamic action shot of [HERO] (Use REFERENCE 1).`;
        } else if (type === 'back_cover') {
            promptText += `TYPE: Comic Back Cover. FULL PAGE VERTICAL ART. Dramatic teaser. Text: "NEXT ISSUE SOON".`;
        } else {
            const sceneText = useSanitizedScene ? sanitizeSceneForComicArt(beat.scene) : beat.scene;
            promptText += `TYPE: Vertical comic panel. SCENE: ${sceneText}. `;
            promptText += `INSTRUCTIONS: Maintain strict character likeness. If scene mentions 'HERO', you MUST use REFERENCE 1. If scene mentions 'CO-STAR' or 'SIDEKICK', you MUST use REFERENCE 2.`;
            
            if (beat.caption) promptText += ` INCLUDE CAPTION BOX: "${beat.caption}"`;
            if (beat.dialogue) promptText += ` INCLUDE SPEECH BUBBLE: "${beat.dialogue}"`;
        }

        parts.push({ text: promptText });
        return parts;
    };

    const callModel = async (model: string, aspectRatio: string, sanitized: boolean) => {
        const ai = getAI();
        const res = await ai.models.generateContent({
            model,
            contents: buildContents(sanitized),
            config: { imageConfig: { aspectRatio } }
        });
        const candidate = res.candidates?.[0];
        const part = candidate?.content?.parts?.find((p: any) => p.inlineData?.data);
        if (part?.inlineData?.data) {
            return { url: `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}` };
        }
        const finishReason = candidate?.finishReason;
        const textRefusal = candidate?.content?.parts?.find((p: any) => p.text)?.text;
        return {
            url: '',
            rawError: finishReason
                ? `Illustrator stopped (${finishReason}).`
                : textRefusal
                ? String(textRefusal)
                : 'No image data in response.',
        };
    };

    let lastRawError = 'No image returned by the illustrator model.';

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const res = await callModel(MODEL_IMAGE_GEN_NAME, '2:3', attempt === 1);
            if (res.url) return { url: res.url };
            lastRawError = res.rawError || lastRawError;
            await new Promise(resolve => setTimeout(resolve, 2500));
        } catch (e: any) {
            const msg = e?.message || String(e);
            lastRawError = msg;
            if (msg.includes('Requested entity was not found') || msg.includes('API_KEY_INVALID') || msg.toLowerCase().includes('permission denied')) {
                handleAPIError(e);
                return { url: '', errorMessage: formatIllustratorError(msg) };
            }
            const isQuotaError = msg.toLowerCase().includes('resource_exhausted') || msg.toLowerCase().includes('quota') || msg.includes('429');
            if (isQuotaError) {
                const retrySecs = parseRetryDelaySeconds(msg);
                const isLimitZero = msg.includes('limit: 0');
                if (!isLimitZero && retrySecs !== null && retrySecs <= 45 && attempt === 0) {
                    await new Promise(resolve => setTimeout(resolve, Math.ceil(retrySecs * 1000) + 1000));
                    continue;
                }
                imageQuotaExhaustedRef.current = true;
                return { url: '', errorMessage: formatIllustratorError(msg) };
            }
            if (attempt === 0) {
                await new Promise(resolve => setTimeout(resolve, 2500));
            }
        }
    }

    // Try fallback model only if quota was not exhausted
    if (!imageQuotaExhaustedRef.current) {
        try {
            const res = await callModel(MODEL_IMAGE_FALLBACK_NAME, '3:4', true);
            if (res.url) return { url: res.url };
            lastRawError = res.rawError || lastRawError;
        } catch (e: any) {
            const msg = e?.message || String(e);
            if (!msg.includes('limit: 0')) {
                lastRawError = msg;
            }
        }
    }

    return { url: '', errorMessage: formatIllustratorError(lastRawError) };
  };

  const updateFaceState = (id: string, updates: Partial<ComicFace>) => {
      setComicFaces(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
      const idx = historyRef.current.findIndex(f => f.id === id);
      if (idx !== -1) historyRef.current[idx] = { ...historyRef.current[idx], ...updates };
  };

  const generateSinglePage = async (faceId: string, pageNum: number, type: ComicFace['type']) => {
      const isDecision = !uploadedStoryRef.current && DECISION_PAGES.includes(pageNum);
      let beat: Beat = { scene: "", choices: [], focus_char: 'other' };

      if (type === 'cover') {
           // Cover beat is handled in generateImage
      } else if (type === 'back_cover') {
           beat = { scene: "Thematic teaser image", choices: [], focus_char: 'other' };
      } else {
           beat = await generateBeat(historyRef.current, pageNum % 2 === 0, pageNum, isDecision);
      }

      if (beat.focus_char === 'friend' && !friendRef.current && type === 'story') {
          try {
              const newSidekick = await generatePersona(selectedGenre === 'Custom' ? "A fitting sidekick for this story" : `Sidekick for ${selectedGenre} story.`);
              setFriend(newSidekick);
          } catch (e) { beat.focus_char = 'other'; }
      }

      updateFaceState(faceId, { narrative: beat, choices: beat.choices, isDecisionPage: isDecision, errorMessage: undefined });
      const { url, errorMessage } = await generateImage(beat, type);
      updateFaceState(faceId, { imageUrl: url, isLoading: false, errorMessage });
  };

  const generateBatch = async (startPage: number, count: number) => {
      const pagesToGen: number[] = [];
      for (let i = 0; i < count; i++) {
          const p = startPage + i;
          if (p <= TOTAL_PAGES && !generatingPages.current.has(p)) {
              pagesToGen.push(p);
          }
      }
      
      if (pagesToGen.length === 0) return;
      pagesToGen.forEach(p => generatingPages.current.add(p));

      const newFaces: ComicFace[] = [];
      pagesToGen.forEach(pageNum => {
          const type = pageNum === BACK_COVER_PAGE ? 'back_cover' : 'story';
          newFaces.push({ id: `page-${pageNum}`, type, choices: [], isLoading: true, pageIndex: pageNum });
      });

      setComicFaces(prev => {
          const existing = new Set(prev.map(f => f.id));
          return [...prev, ...newFaces.filter(f => !existing.has(f.id))];
      });
      newFaces.forEach(f => { if (!historyRef.current.find(h => h.id === f.id)) historyRef.current.push(f); });

      try {
          for (let i = 0; i < pagesToGen.length; i++) {
               const pageNum = pagesToGen[i];
               await generateSinglePage(`page-${pageNum}`, pageNum, pageNum === BACK_COVER_PAGE ? 'back_cover' : 'story');
               generatingPages.current.delete(pageNum);
               if (i < pagesToGen.length - 1) {
                   await new Promise(resolve => setTimeout(resolve, 1000));
               }
          }
      } catch (e) {
          console.error("Batch generation error", e);
      } finally {
          pagesToGen.forEach(p => generatingPages.current.delete(p));
      }
  }

  const launchStory = async () => {
    // --- API KEY VALIDATION ---
    const hasKey = await validateApiKey();
    if (!hasKey) return; // Stop if cancelled or invalid
    
    if (!heroRef.current) return;
    if (selectedGenre === 'Custom' && !customPremise.trim() && !uploadedStoryRef.current) {
        alert("Please enter a custom story premise or upload a story file.");
        return;
    }
    setIsTransitioning(true);
    imageQuotaExhaustedRef.current = false;
    
    let availableTones = TONES;
    if (selectedGenre === "Teen Drama / Slice of Life" || selectedGenre === "Lighthearted Comedy") {
        availableTones = TONES.filter(t => t.includes("CASUAL") || t.includes("WHOLESOME") || t.includes("QUIPPY"));
    } else if (selectedGenre === "Classic Horror") {
        availableTones = TONES.filter(t => t.includes("INNER-MONOLOGUE") || t.includes("OPERATIC"));
    }
    
    setStoryTone(availableTones[Math.floor(Math.random() * availableTones.length)]);

    const coverFace: ComicFace = { id: 'cover', type: 'cover', choices: [], isLoading: true, pageIndex: 0 };
    setComicFaces([coverFace]);
    historyRef.current = [coverFace];
    generatingPages.current.add(0);

    generateSinglePage('cover', 0, 'cover').finally(() => generatingPages.current.delete(0));
    
    setTimeout(async () => {
        setIsStarted(true);
        setShowSetup(false);
        setIsTransitioning(false);
        await generateBatch(1, INITIAL_PAGES);
        if (uploadedStoryRef.current) {
            generateBatch(3, TOTAL_PAGES - 2);
        } else {
            generateBatch(3, 3);
        }
    }, 1100);
  };

  const handleChoice = async (pageIndex: number, choice: string) => {
      updateFaceState(`page-${pageIndex}`, { resolvedChoice: choice });
      const maxPage = Math.max(...historyRef.current.map(f => f.pageIndex || 0));
      if (maxPage + 1 <= TOTAL_PAGES) {
          generateBatch(maxPage + 1, BATCH_SIZE);
      }
  }

  const resetApp = () => {
      setIsStarted(false);
      setShowSetup(true);
      setComicFaces([]);
      setCurrentSheetIndex(0);
      historyRef.current = [];
      generatingPages.current.clear();
      imageQuotaExhaustedRef.current = false;
      setHero(null);
      setFriend(null);
      setUploadedStory(null);
  };

  const downloadPDF = () => {
    const PAGE_WIDTH = 480;
    const PAGE_HEIGHT = 720;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: [PAGE_WIDTH, PAGE_HEIGHT] });
    const pagesToPrint = comicFaces
      .filter(face => !face.isLoading && (face.imageUrl || face.narrative))
      .sort((a, b) => (a.pageIndex || 0) - (b.pageIndex || 0));

    pagesToPrint.forEach((face, index) => {
        if (index > 0) doc.addPage([PAGE_WIDTH, PAGE_HEIGHT], 'portrait');
        if (face.imageUrl) {
            doc.addImage(face.imageUrl, 'JPEG', 0, 0, PAGE_WIDTH, PAGE_HEIGHT);
        } else if (face.narrative) {
            doc.setFillColor(24, 24, 27);
            doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, 'F');
            doc.setTextColor(250, 204, 21);
            doc.setFontSize(22);
            doc.text(face.type === 'cover' ? 'INFINITE HEROES' : face.type === 'back_cover' ? 'TO BE CONTINUED...' : `PAGE ${face.pageIndex}`, 36, 56);
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(14);
            let y = 100;
            if (face.narrative.caption) {
                const capLines = doc.splitTextToSize(face.narrative.caption, PAGE_WIDTH - 72);
                doc.text(capLines, 36, y);
                y += capLines.length * 20 + 20;
            }
            if (face.narrative.scene) {
                doc.setTextColor(180, 190, 205);
                const sceneLines = doc.splitTextToSize(face.narrative.scene, PAGE_WIDTH - 72);
                doc.text(sceneLines, 36, y);
                y += sceneLines.length * 18 + 24;
            }
            if (face.narrative.dialogue) {
                doc.setTextColor(250, 204, 21);
                const diaLines = doc.splitTextToSize(`"${face.narrative.dialogue}"`, PAGE_WIDTH - 72);
                doc.text(diaLines, 36, y);
            }
        }
    });
    doc.save('Infinite-Heroes-Issue.pdf');
  };

  const handleHeroUpload = async (file: File) => {
       try { const base64 = await fileToBase64(file); setHero({ base64, desc: "The Main Hero", mimeType: file.type || 'image/jpeg' }); } catch (e) { alert("Hero upload failed"); }
  };
  const handleFriendUpload = async (file: File) => {
       try { const base64 = await fileToBase64(file); setFriend({ base64, desc: "The Sidekick/Rival", mimeType: file.type || 'image/jpeg' }); } catch (e) { alert("Friend upload failed"); }
  };
  const handleStoryUpload = async (file: File) => {
       try {
           const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
           if (isPdf) {
               const base64 = await fileToBase64(file);
               setUploadedStory({ fileName: file.name, pdfBase64: base64 });
               setIsReadingStory(true);
               try {
                   const text = await extractPdfStoryText(base64);
                   if (text) {
                       setUploadedStory({ fileName: file.name, pdfBase64: base64, text });
                   }
               } catch (e) {
                   console.warn("Deferred PDF text extraction until launch:", e);
               } finally {
                   setIsReadingStory(false);
               }
           } else {
               const text = (await file.text()).trim();
               if (!text) return;
               setUploadedStory({ fileName: file.name, text });
           }
       } catch (e) {
           setIsReadingStory(false);
           console.error("Story upload failed", e);
       }
  };
  const handleStoryClear = () => {
       setUploadedStory(null);
       setIsReadingStory(false);
  };

  const handleSheetClick = (index: number) => {
      if (!isStarted) return;
      if (index === 0 && currentSheetIndex === 0) return;
      if (index < currentSheetIndex) {
          playPageTurnSound('backward');
          setCurrentSheetIndex(index);
      } else if (index === currentSheetIndex) {
          const frontPageIndex = index === 0 ? 0 : index * 2;
          const frontFace = comicFaces.find(f => f.pageIndex === frontPageIndex);
          if (frontFace && !frontFace.isLoading && (frontFace.imageUrl || frontFace.narrative)) {
              playPageTurnSound('forward');
              setCurrentSheetIndex(prev => prev + 1);
          }
      }
  };

  const handleOpenBook = () => {
      playPageTurnSound('forward');
      setCurrentSheetIndex(1);
  };

  const handleGoToDecision = () => {
      if (currentSheetIndex !== 2) {
          playPageTurnSound(currentSheetIndex > 2 ? 'backward' : 'forward');
          setCurrentSheetIndex(2);
      }
  };

  const handleRetryPage = async (pageIndex: number) => {
      const faceId = pageIndex === 0 ? 'cover' : `page-${pageIndex}`;
      const existing = historyRef.current.find(f => f.id === faceId);
      if (!existing || generatingPages.current.has(pageIndex)) return;
      imageQuotaExhaustedRef.current = false;
      generatingPages.current.add(pageIndex);
      updateFaceState(faceId, { isLoading: true, errorMessage: undefined });
      try {
          if (existing.narrative?.scene || existing.type === 'cover') {
              const { url, errorMessage } = await generateImage(existing.narrative || { scene: '', choices: [], focus_char: 'other' }, existing.type);
              updateFaceState(faceId, { imageUrl: url, isLoading: false, errorMessage });
          } else {
              await generateSinglePage(faceId, pageIndex, existing.type);
          }
      } finally {
          generatingPages.current.delete(pageIndex);
      }
  };

  const heroImageUrl = hero ? `data:${hero.mimeType || 'image/jpeg'};base64,${hero.base64}` : undefined;
  const friendImageUrl = friend ? `data:${friend.mimeType || 'image/jpeg'};base64,${friend.base64}` : undefined;

  return (
    <div className="comic-scene">
      {showApiKeyDialog && <ApiKeyDialog onContinue={handleApiKeyDialogContinue} />}
      
      <Setup 
          show={showSetup}
          isTransitioning={isTransitioning}
          hero={hero}
          friend={friend}
          uploadedStory={uploadedStory}
          isReadingStory={isReadingStory}
          selectedGenre={selectedGenre}
          selectedLanguage={selectedLanguage}
          customPremise={customPremise}
          richMode={richMode}
          onHeroUpload={handleHeroUpload}
          onFriendUpload={handleFriendUpload}
          onStoryUpload={handleStoryUpload}
          onStoryClear={handleStoryClear}
          onGenreChange={setSelectedGenre}
          onLanguageChange={setSelectedLanguage}
          onPremiseChange={setCustomPremise}
          onRichModeChange={setRichMode}
          onLaunch={launchStory}
      />
      
      <Book 
          comicFaces={comicFaces}
          currentSheetIndex={currentSheetIndex}
          isStarted={isStarted}
          isSetupVisible={showSetup && !isTransitioning}
          heroImageUrl={heroImageUrl}
          friendImageUrl={friendImageUrl}
          onSheetClick={handleSheetClick}
          onChoice={handleChoice}
          onOpenBook={handleOpenBook}
          onDownload={downloadPDF}
          onReset={resetApp}
          onGoToDecision={handleGoToDecision}
          onRetryPage={handleRetryPage}
      />
    </div>
  );
};

export default App;
