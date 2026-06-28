import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Upload,
  Settings as SettingsIcon,
  Download,
  Image as ImageIcon,
  Trash2,
  Play,
  CheckCircle,
  Loader2,
  Edit2,
  Plus,
  Check,
  Grid,
  AlertCircle,
  X,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Globe,
  RefreshCw,
  FileSpreadsheet,
  Info,
  Layers,
  HelpCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  ImageItem,
  AppSettings,
  ADOBE_STOCK_CATEGORIES,
} from "./types";
import { compressImage, exportAdobeStockCSV } from "./utils";
import { translations } from "./translations";

const LOCAL_STORAGE_SETTINGS_KEY = "adobe_stock_generator_settings";
const LOCAL_STORAGE_LANG_KEY = "adobe_stock_generator_lang";

export default function App() {
  // 1. Language State
  const [lang, setLang] = useState<"uz" | "en">(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_LANG_KEY);
    return saved === "uz" ? "uz" : "en";
  });

  // 2. Settings State
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (!parsed.maxDimension) parsed.maxDimension = 512;
        if (!parsed.customApiKeys) parsed.customApiKeys = [];
        return parsed;
      } catch (e) {
        // use default
      }
    }
    return {
      customApiKey: "",
      customApiKeys: [],
      customModelId: "gemini-3.5-flash",
      maxDimension: 512,
    };
  });

  const [showSettings, setShowSettings] = useState(false);
  const [tempApiKey, setTempApiKey] = useState(settings.customApiKey);
  const [tempApiKeysText, setTempApiKeysText] = useState(() => (settings.customApiKeys || []).join("\n"));
  const [tempModelId, setTempModelId] = useState(settings.customModelId);
  const [tempMaxDimension, setTempMaxDimension] = useState(settings.maxDimension);
  const [tempCustomPrompt, setTempCustomPrompt] = useState(settings.customPrompt || "");
  const [currentPage, setCurrentPage] = useState(1);

  const [isTestingKey, setIsTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Reset test result when settings panel closes
  useEffect(() => {
    if (!showSettings) {
      setTestResult(null);
    }
  }, [showSettings]);

  // 3. Application State
  const [mode, setMode] = useState<"single" | "batch">("batch");
  const [images, setImages] = useState<ImageItem[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [isAnalyzingAll, setIsAnalyzingAll] = useState(false);
  const [cancelBatch, setCancelBatch] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);
  const [activeAnalysisId, setActiveAnalysisId] = useState<string | null>(null);

  // Notifications
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Local helper ref for file input click
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelBatchRef = useRef(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // Keyword input state for editor
  const [newKeywordInput, setNewKeywordInput] = useState("");

  const t = translations[lang];

  // Save language
  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_LANG_KEY, lang);
  }, [lang]);

  // Request browser Notification permission on load
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const sendBrowserNotification = (title: string, body: string) => {
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification(title, { body });
      } catch (err) {
        console.error("Could not send native notification", err);
      }
    }
  };

  // Handle auto dismiss notification
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Sync settings temp values
  useEffect(() => {
    setTempApiKey(settings.customApiKey);
    setTempApiKeysText((settings.customApiKeys || []).join("\n"));
    setTempModelId(settings.customModelId);
    setTempMaxDimension(settings.maxDimension);
  }, [settings]);

  // Trigger notification
  const showToast = (type: "success" | "error", message: string) => {
    setNotification({ type, message });
  };

  // Save Settings
  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedKeys = tempApiKeysText
      .split("\n")
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    const updated: AppSettings = {
      customApiKey: tempApiKey.trim(),
      customApiKeys: parsedKeys,
      customModelId: tempModelId.trim() || "gemini-3.5-flash",
      maxDimension: Number(tempMaxDimension) || 1024,
      customPrompt: tempCustomPrompt.trim(),
    };
    setSettings(updated);
    localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(updated));
    showToast("success", t.settingsSaved);
    setShowSettings(false);
  };

  // Test Gemini API Key Directly from Browser (Netlify support)
  const handleTestApiKey = async () => {
    if (!tempApiKey.trim()) {
      setTestResult({
        success: false,
        message: lang === "uz" ? "Iltimos, avval API kalitni kiriting." : "Please enter an API key first.",
      });
      return;
    }

    setIsTestingKey(true);
    setTestResult(null);

    try {
      const activeModel = tempModelId || "gemini-3.5-flash";
      const testUrl = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${tempApiKey.trim()}`;

      const response = await fetch(testUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: {
            parts: [{ text: "Hello" }],
          },
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMsg = errData?.error?.message || `HTTP ${response.status}`;
        throw new Error(errMsg);
      }

      const resData = await response.json();
      const text = resData?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (text) {
        setTestResult({
          success: true,
          message: t.apiKeyValid,
        });
      } else {
        throw new Error("Empty response / Bo'sh javob");
      }
    } catch (err: any) {
      console.error("API key test failed", err);
      setTestResult({
        success: false,
        message: t.apiKeyInvalid + (err.message || err.toString()),
      });
    } finally {
      setIsTestingKey(false);
    }
  };

  // Test All Gemini API Keys in the Batch list
  const handleTestAllApiKeys = async () => {
    const keys = tempApiKeysText
      .split("\n")
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    if (keys.length === 0) {
      setTestResult({
        success: false,
        message: lang === "uz" ? "Iltimos, avval bir nechta API kalitlarini kiriting." : "Please enter multiple API keys first.",
      });
      return;
    }

    setIsTestingKey(true);
    setTestResult(null);

    const activeModel = tempModelId || "gemini-3.5-flash";
    const results: string[] = [];
    let allValid = true;

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const masked = key.substring(0, 6) + "..." + (key.length > 10 ? key.substring(key.length - 4) : "");
      try {
        const testUrl = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${key}`;
        const response = await fetch(testUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: { parts: [{ text: "Hello" }] } }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          const errMsg = errData?.error?.message || `HTTP ${response.status}`;
          throw new Error(errMsg);
        }

        const resData = await response.json();
        const text = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
          throw new Error("Empty response");
        }
        results.push(`Key ${i + 1} (${masked}): ✅ OK`);
      } catch (err: any) {
        allValid = false;
        results.push(`Key ${i + 1} (${masked}): ❌ ERR - ${err.message || err.toString()}`);
      }
    }

    setTestResult({
      success: allValid,
      message: results.join("\n"),
    });
    setIsTestingKey(false);
  };

  // 4. File upload and local compression
  const processFiles = async (files: FileList) => {
    if (files.length === 0) return;

    // In single mode, if user drops multiple files, we'll process all but switch to batch or just show them in list.
    // For best UX, we append all images to the queue and set the first new one as selected.
    const newItems: ImageItem[] = [];

    showToast("success", `${files.length} ta rasm yuklanmoqda...`);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const id = Math.random().toString(36).substring(2, 9);
      const originalSizeMb = Math.round((file.size / (1024 * 1024)) * 100) / 100;

      const itemPlaceholder: ImageItem = {
        id,
        file,
        name: file.name,
        previewUrl: "",
        compressedBase64: "",
        originalSizeMb,
        compressedSizeKb: 0,
        status: "compressing",
        progress: 10,
      };

      newItems.push(itemPlaceholder);
    }

    // Append placeholders first to show visual "compressing" loading state
    setImages((prev) => {
      const updated = [...prev, ...newItems];
      if (!selectedImageId && updated.length > 0) {
        setSelectedImageId(updated[0].id);
      }
      return updated;
    });

    // Compress sequentially in background
    for (const item of newItems) {
      try {
        const result = await compressImage(item.file, settings.maxDimension);
        setImages((prev) =>
          prev.map((img) =>
            img.id === item.id
              ? {
                  ...img,
                  previewUrl: result.base64,
                  compressedBase64: result.base64,
                  compressedSizeKb: result.compressedSizeKb,
                  status: "pending",
                  progress: 100,
                }
              : img
          )
        );
      } catch (err: any) {
        console.error("Compression error for file: " + item.name, err);
        setImages((prev) =>
          prev.map((img) =>
            img.id === item.id
              ? {
                  ...img,
                  status: "failed",
                  error: "Rasm siqishda xatolik: " + err.message,
                  progress: 0,
                }
              : img
          )
        );
      }
    }
  };

  // Drag and Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(e.target.files);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  // 5. API Call for a single image item
  const analyzeSingleImage = async (itemId: string, overrideApiKey?: string): Promise<boolean> => {
    // Find item
    const item = images.find((img) => img.id === itemId);
    if (!item || !item.compressedBase64) return false;

    // Mark as analyzing
    setImages((prev) =>
      prev.map((img) =>
        img.id === itemId ? { ...img, status: "analyzing", progress: 50, error: undefined } : img
      )
    );
    setActiveAnalysisId(itemId);

    const startTime = Date.now();
    const activeModel = settings.customModelId || "gemini-3.5-flash";
    const activeApiKey = overrideApiKey || settings.customApiKey || (settings.customApiKeys && settings.customApiKeys.length > 0 ? settings.customApiKeys[0] : "");

    try {
      let metadata;
      
      // If a custom API key is present, execute direct client-side call (supports Netlify, Vercel, static hosting)
      if (activeApiKey) {
        const cleanBase64 = item.compressedBase64.replace(/^data:image\/\w+;base64,/, "");
        
        const userPromptSnippet = settings.customPrompt && settings.customPrompt.trim()
          ? `\n\nADDITIONAL USER INSTRUCTIONS (CRITICAL): ${settings.customPrompt.trim()}`
          : "";

        const promptText = `Analyze this image and provide metadata optimized for Adobe Stock marketplace.
The output MUST be in English because Adobe Stock is a global marketplace and recommends metadata in English to maximize sales.

Guidelines:
1. Title: Create a high-quality, descriptive, commercially appealing title. Length should be 5-75 characters. Avoid search-spamming or repeating keywords. It should describe the main subject, setting, and style (e.g., 'Minimalist ceramic mug on wooden table in morning sunlight').
2. Keywords: Generate between 20 to 45 highly relevant, descriptive, commercial keywords. Lowercase only, single words or short natural phrases. DO NOT use generic spam keywords. Order them by relevance (most important keywords must come first, as Adobe Stock ranking prioritizes the first keywords).
3. Category: Choose the most accurate Adobe Stock category number (1 to 21) based on the following precise definitions:
   1 (Animals): Pets, wild animals, birds, insects, fish, marine life, and any scene where animals are the primary focus.
   2 (Buildings and Architecture): Interior or exterior of buildings, houses, skyscrapers, historical monuments, bridges, structures, or architectural details.
   3 (Business): Office environments, business people working, computers, financial charts, documents, corporate concepts, desks, currency/money, or professional meetings.
   4 (Drinks): Beverages, cups, mugs, bottles, pouring liquids, tea, coffee, wine, beer, cocktails, juices, or any drinks-focused visual.
   5 (The Environment): Ecological concepts, recycling, clean energy (solar panels, wind turbines), pollution, environmental preservation, climate change, or weather.
   6 (States of Mind): Abstract or conceptual graphics representing emotions, feelings, thoughts, love, happiness, stress, mental health, ideas, or dreams.
   7 (Food): Meals, dishes, ingredients, vegetables, fruits, baking, cooking, restaurants, culinary arts, or closeups of food plates.
   8 (Graphic Resources): Abstract backgrounds, textures, patterns, wallpapers, icons, isolated 3D graphics, frames, vectors, or mockups where the focus is the graphical element itself.
   9 (Religions): Religious objects, shrines, sacred texts, or scenes focusing purely on faith (if not covered by general Culture).
   10 (Industry): Factories, construction sites, heavy machinery, hand tools, manufacturing lines, warehouse operations, workers with safety gear, or engineering.
   11 (Landscapes): Mountain ranges, oceans, beaches, forests, sunsets, sunrises, wilderness, deserts, rivers, or scenery without any prominent human activity or city focus.
   12 (Lifestyle): Everyday life, family activities, friends hanging out, domestic scenes, hobbies, casual portraits showing people doing things in their daily environment.
   13 (People): Portraits, closeups of faces, hands, bodies, diverse individuals or groups where the main focus is the human subject itself, not their specific lifestyle activity.
   14 (Plants and Flowers): Macro shots of flowers, leaves, trees, gardens, houseplants, botanical details, or flora.
   15 (Culture and Religion): Art galleries, painting tools, musical instruments, traditional costumes, folk dances, historical artifacts, libraries, books, theaters, or cultural festivals.
   16 (Science): Laboratories, medical research, doctors, healthcare gear, microscopes, space, planets, DNA models, molecules, or scientific tests.
   17 (Social Issues): Poverty, protests, politics, human rights, social conflicts, accessibility, discrimination, or community issues.
   18 (Sports): Athletics, gyms, exercises, fitness, running, games (football, basketball, tennis), yoga, sports equipment, or sports venues.
   19 (Technology): Modern devices (smartphones, VR headsets, microchips), AI, programming, virtual screens, cloud computing, cyber security, robots, or futuristic concepts.
   20 (Transport): Cars, airplanes, trains, boats, bicycles, roads, public transit, engines, tires, or vehicle-focused closeups.
   21 (Travel): Landmarks (Eiffel Tower, pyramids, etc.), suitcases, passport, maps, tourists exploring, scenic vacation spots, or travel-specific experiences.

Return the response in valid JSON according to the specified schema.${userPromptSnippet}`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${activeApiKey}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType: "image/jpeg",
                    data: cleanBase64,
                  },
                },
                {
                  text: promptText,
                },
              ],
            },
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: {
                type: "OBJECT",
                properties: {
                  title: {
                    type: "STRING",
                    description: "A descriptive, high-quality, commercial title in English. Max 75 characters.",
                  },
                  keywords: {
                    type: "ARRAY",
                    items: {
                      type: "STRING",
                    },
                    description: "List of 20 to 45 highly relevant lowercase keywords, sorted by relevance.",
                  },
                  category: {
                    type: "INTEGER",
                    description: "The selected category number (1-21) according to Adobe Stock guidelines.",
                  },
                  categoryName: {
                    type: "STRING",
                    description: "English name of the selected category.",
                  },
                },
                required: ["title", "keywords", "category", "categoryName"],
              },
            },
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          const errMsg = errData?.error?.message || `HTTP ${response.status}`;
          throw new Error(lang === "uz" ? `Gemini API xatoligi: ${errMsg}` : `Gemini API Error: ${errMsg}`);
        }

        const resData = await response.json();
        const textResponse = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!textResponse) throw new Error("Gemini API returned an empty response.");

        const cleanedJson = textResponse
          .trim()
          .replace(/^```json/i, "")
          .replace(/^```/, "")
          .replace(/```$/, "")
          .trim();

        metadata = JSON.parse(cleanedJson);
      } else {
        // Fallback to Express backend if no custom API key is supplied
        const response = await fetch("/api/analyze-image", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            imageBase64: item.compressedBase64,
            mimeType: "image/jpeg",
            customApiKey: activeApiKey,
            customModelId: settings.customModelId,
            customPrompt: settings.customPrompt,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Server xatosi: ${response.status}`);
        }

        metadata = await response.json();
      }

      const durationMs = Date.now() - startTime;

      setImages((prev) =>
        prev.map((img) =>
          img.id === itemId
            ? {
                ...img,
                status: "completed",
                progress: 100,
                analysisDurationMs: durationMs,
                analysisModel: activeModel,
                metadata: {
                  title: metadata.title || "",
                  keywords: metadata.keywords || [],
                  category: Number(metadata.category) || 1,
                  categoryName: metadata.categoryName || "Unknown",
                  releases: img.metadata?.releases || "",
                },
              }
            : img
        )
      );
      return true;
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      console.error("Analysis failed for image " + itemId, err);
      setImages((prev) =>
        prev.map((img) =>
          img.id === itemId
            ? {
                ...img,
                status: "failed",
                progress: 0,
                analysisDurationMs: durationMs,
                analysisModel: activeModel,
                error: err.message || "Tahlil qilishda kutilmagan xatolik yuz berdi.",
              }
            : img
        )
      );
      return false;
    } finally {
      setActiveAnalysisId((curr) => (curr === itemId ? null : curr));
    }
  };

  // Analyze all pending or failed images
  const startBatchAnalysis = async () => {
    const queue = images.filter((img) => img.status === "pending" || img.status === "failed");
    if (queue.length === 0) {
      showToast("error", lang === "uz" ? "Navbatda yangi yoki xatoli rasmlar mavjud emas." : "No pending or failed images in queue.");
      return;
    }

    setIsAnalyzingAll(true);
    setCancelBatch(false);
    cancelBatchRef.current = false;
    let successCount = 0;
    let index = 0;

    for (const item of queue) {
      if (cancelBatchRef.current) {
        showToast("error", t.batchCanceled);
        break;
      }

      // If not the first item, respect rate limits with adaptive cooldown based on number of keys
      if (index > 0) {
        const keyCount = settings.customApiKeys && settings.customApiKeys.length > 0 ? settings.customApiKeys.length : 1;
        let waitTimeMs = 4500;
        if (keyCount > 1) {
          // Reduce cooldown proportional to the number of keys, but keep at least 1 second of breather
          waitTimeMs = Math.max(1000, Math.ceil(4500 / keyCount));
        }
        let secondsRemaining = Math.ceil(waitTimeMs / 1000);
        setCooldownRemaining(secondsRemaining);

        while (waitTimeMs > 0) {
          if (cancelBatchRef.current) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
          waitTimeMs -= 100;
          const currentSecs = Math.ceil(waitTimeMs / 1000);
          if (currentSecs !== secondsRemaining) {
            secondsRemaining = currentSecs;
            setCooldownRemaining(secondsRemaining);
          }
        }

        setCooldownRemaining(0);

        if (cancelBatchRef.current) {
          showToast("error", t.batchCanceled);
          break;
        }
      }

      // Select active rotated key
      let activeRotatedKey = undefined;
      if (settings.customApiKeys && settings.customApiKeys.length > 0) {
        const keyIdx = index % settings.customApiKeys.length;
        activeRotatedKey = settings.customApiKeys[keyIdx];
      }

      const success = await analyzeSingleImage(item.id, activeRotatedKey);
      if (success) {
        successCount++;
      }
      index++;
    }

    setIsAnalyzingAll(false);
    setCooldownRemaining(0);
    
    if (!cancelBatchRef.current) {
      const msg = lang === "uz" 
        ? `Batch tahlil tugadi. ${successCount} ta rasm muvaffaqiyatli analiz qilindi.` 
        : `Batch analysis completed. ${successCount} images successfully analyzed.`;
      showToast("success", msg);
      sendBrowserNotification("Adobe Stock Tag Generator", msg);
    }
  };

  // Stop/cancel the active batch analysis
  const handleStopBatchAnalysis = () => {
    cancelBatchRef.current = true;
    setCancelBatch(true);
    setIsAnalyzingAll(false);
    setCooldownRemaining(0);
    showToast("error", t.batchCanceled);
  };

  // Remove a single image from list
  const removeImage = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setImages((prev) => {
      const filtered = prev.filter((img) => img.id !== id);
      if (selectedImageId === id) {
        setSelectedImageId(filtered.length > 0 ? filtered[0].id : null);
      }
      return filtered;
    });
  };

  // Clear all images
  const clearAllImages = () => {
    if (window.confirm("Barcha rasmlarni ro'yxatdan o'chirmoqchimisiz?")) {
      setImages([]);
      setSelectedImageId(null);
      setCurrentPage(1);
      showToast("success", "Ro'yxat tozalandi.");
    }
  };

  // Get selected image details
  const selectedImage = images.find((img) => img.id === selectedImageId);

  // Metadata editor handlers
  const handleUpdateTitle = (newTitle: string) => {
    if (!selectedImageId) return;
    setImages((prev) =>
      prev.map((img) =>
        img.id === selectedImageId && img.metadata
          ? { ...img, metadata: { ...img.metadata, title: newTitle } }
          : img
      )
    );
  };

  const handleUpdateCategory = (catId: number) => {
    if (!selectedImageId) return;
    const catName = ADOBE_STOCK_CATEGORIES.find((c) => c.id === catId)?.nameEn || "Unknown";
    setImages((prev) =>
      prev.map((img) =>
        img.id === selectedImageId && img.metadata
          ? { ...img, metadata: { ...img.metadata, category: catId, categoryName: catName } }
          : img
      )
    );
  };

  const handleUpdateReleases = (newReleases: string) => {
    if (!selectedImageId) return;
    setImages((prev) =>
      prev.map((img) =>
        img.id === selectedImageId && img.metadata
          ? { ...img, metadata: { ...img.metadata, releases: newReleases } }
          : img
      )
    );
  };

  const handleRemoveKeyword = (keywordToRemove: string) => {
    if (!selectedImageId) return;
    setImages((prev) =>
      prev.map((img) =>
        img.id === selectedImageId && img.metadata
          ? {
              ...img,
              metadata: {
                ...img.metadata,
                keywords: img.metadata.keywords.filter((kw) => kw !== keywordToRemove),
              },
            }
          : img
      )
    );
  };

  const handleAddKeyword = () => {
    if (!selectedImageId || !newKeywordInput.trim()) return;

    // Support comma separated pasting
    const tagsToAdd = newKeywordInput
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);

    setImages((prev) =>
      prev.map((img) => {
        if (img.id === selectedImageId && img.metadata) {
          const existingKeywords = img.metadata.keywords;
          // Filter out duplicates
          const uniqueNewTags = tagsToAdd.filter((t) => !existingKeywords.includes(t));
          return {
            ...img,
            metadata: {
              ...img.metadata,
              keywords: [...existingKeywords, ...uniqueNewTags],
            },
          };
        }
        return img;
      })
    );
    setNewKeywordInput("");
  };

  const handleKeywordsPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData("text");
    const tagsToAdd = pastedText
      .split(/[,;\n\r]+/)
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);

    if (tagsToAdd.length > 0 && selectedImageId) {
      setImages((prev) =>
        prev.map((img) => {
          if (img.id === selectedImageId && img.metadata) {
            const existingKeywords = img.metadata.keywords;
            const uniqueNewTags = tagsToAdd.filter((t) => !existingKeywords.includes(t));
            return {
              ...img,
              metadata: {
                ...img.metadata,
                keywords: [...existingKeywords, ...uniqueNewTags],
              },
            };
          }
          return img;
        })
      );
    }
  };

  // CSV Export
  const handleExportCSV = () => {
    const completedImages = images.filter((img) => img.status === "completed" && img.metadata);
    if (completedImages.length === 0) {
      showToast("error", "Yuklab olish uchun hech bo'lmaganda bitta analiz qilingan rasm bo'lishi kerak.");
      return;
    }
    exportAdobeStockCSV(completedImages);
    showToast("success", "Adobe Stock CSV hujjati muvaffaqiyatli yuklab olindi!");
  };

  // Compute statistics
  const totalCount = images.length;
  const completedCount = images.filter((img) => img.status === "completed").length;
  const analyzingCount = images.filter((img) => img.status === "analyzing").length;
  const pendingCount = images.filter((img) => img.status === "pending").length;

  const totalOriginalSizeMb = images.reduce((acc, img) => acc + img.originalSizeMb, 0);
  const totalCompressedSizeMb = images.reduce((acc, img) => acc + (img.compressedSizeKb / 1024), 0);
  const sizeSavingsPercent = totalOriginalSizeMb > 0
    ? Math.round(((totalOriginalSizeMb - totalCompressedSizeMb) / totalOriginalSizeMb) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1B] font-sans selection:bg-black selection:text-white flex flex-col">
      {/* 1. TOP HEADER NAVIGATION */}
      <header className="h-16 border-b border-gray-200 bg-white flex items-center justify-between px-6 md:px-8 shrink-0 sticky top-0 z-40">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-black rounded flex items-center justify-center shrink-0">
            <div className="w-4 h-4 border-2 border-white rotate-45"></div>
          </div>
          <div>
            <h1 className="font-display text-base md:text-lg font-bold tracking-tight text-black uppercase flex items-center gap-1.5 md:gap-2">
              <span>STOCK.AI</span>
              <span className="text-gray-400 font-normal">/ {t.appTitle.toUpperCase()}</span>
            </h1>
          </div>
        </div>

        <div className="flex items-center space-x-3 md:space-x-4">
          {/* Language Toggle */}
          <button
            onClick={() => setLang(lang === "uz" ? "en" : "uz")}
            className="text-xs font-medium text-gray-600 flex items-center gap-1.5 hover:text-black transition"
            title="Tilni o'zgartirish / Toggle Language"
          >
            <Globe className="w-3.5 h-3.5 text-gray-400" />
            <span className="font-medium uppercase">{lang}</span>
          </button>

          <div className="h-4 w-px bg-gray-200"></div>

          {/* Settings Button */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`text-xs font-medium flex items-center gap-1.5 transition ${
              showSettings
                ? "text-black font-semibold"
                : "text-gray-600 hover:text-black"
            }`}
          >
            <SettingsIcon className={`w-3.5 h-3.5 ${showSettings ? "animate-spin" : ""}`} />
            <span className="hidden md:inline">{t.settings}</span>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full flex-1">
        {/* Toast Notification */}
        <AnimatePresence>
          {notification && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="fixed top-20 right-4 md:right-8 z-50 pointer-events-none"
            >
              <div
                className={`flex items-center space-x-2.5 px-4 py-3 rounded-xl border shadow-xl backdrop-blur-md pointer-events-auto ${
                  notification.type === "success"
                    ? "bg-white border-green-200 text-green-800 shadow-green-100/40"
                    : "bg-white border-red-200 text-red-800 shadow-red-100/40"
                }`}
              >
                {notification.type === "success" ? (
                  <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <span className="text-xs font-medium">{notification.message}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 2. SETTINGS PANEL (EXPANDABLE) */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden mb-6"
            >
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                <div className="flex items-start justify-between mb-4 border-b border-gray-100 pb-3">
                  <div>
                    <h3 className="font-display text-base font-bold text-black flex items-center gap-2">
                      <SettingsIcon className="w-4 h-4 text-gray-500" />
                      <span>{t.settings}</span>
                    </h3>
                    <p className="text-xs text-gray-400 mt-1">{t.settingsDesc}</p>
                  </div>
                  <button
                    onClick={() => setShowSettings(false)}
                    className="p-1 text-gray-400 hover:text-black rounded hover:bg-gray-100 transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleSaveSettings} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* API Key */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        {t.apiKeyLabel}
                      </label>
                      <div className="flex space-x-2">
                        <input
                          type="password"
                          value={tempApiKey}
                          onChange={(e) => {
                            setTempApiKey(e.target.value);
                            setTestResult(null);
                          }}
                          placeholder={t.apiKeyPlaceholder}
                          className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:border-black transition font-mono"
                        />
                        <button
                          type="button"
                          onClick={handleTestApiKey}
                          disabled={isTestingKey}
                          className="bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 text-gray-800 disabled:text-gray-400 border border-gray-200 font-bold px-3 py-2 rounded-lg text-xs tracking-wider transition shrink-0 flex items-center justify-center space-x-1 uppercase"
                        >
                          {isTestingKey && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
                          <span>{isTestingKey ? t.testingApiKey : t.testApiKey}</span>
                        </button>
                      </div>
                      
                      <span className="text-[10px] text-gray-400 mt-1 block">
                        {t.apiNotice}
                      </span>
                    </div>

                    {/* Model ID */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        {t.modelLabel}
                      </label>
                      <div className="flex space-x-2">
                        <select
                          value={tempModelId}
                          onChange={(e) => setTempModelId(e.target.value)}
                          className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:border-black transition"
                        >
                          <option value="gemini-3.5-flash">gemini-3.5-flash (Standard & Fast)</option>
                          <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Ultra Fast)</option>
                          <option value="gemini-3.1-pro-preview">gemini-3.1-pro-preview (Paid & Powerful)</option>
                        </select>
                      </div>
                      <span className="text-[10px] text-gray-400 mt-1 block">
                        {t.modelDesc}
                      </span>
                    </div>

                    {/* Batch API Keys (One per line) */}
                    <div className="md:col-span-2 border-t border-gray-150 pt-3 mt-1">
                      <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center justify-between">
                        <span>{t.batchApiKeysLabel}</span>
                        <span className="bg-amber-50 text-amber-800 text-[9px] font-bold px-2 py-0.5 rounded border border-amber-100">
                          {t.rotatingKeysNotice}
                        </span>
                      </label>
                      <div className="flex flex-col space-y-2">
                        <textarea
                          rows={3}
                          value={tempApiKeysText}
                          onChange={(e) => {
                            setTempApiKeysText(e.target.value);
                            setTestResult(null);
                          }}
                          placeholder="AIzaSyA...&#10;AIzaSyB...&#10;AIzaSyC..."
                          className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:border-black transition font-mono whitespace-pre resize-y placeholder:text-gray-300"
                        />
                        <div className="flex justify-between items-start gap-4">
                          <p className="text-[10px] text-gray-400 leading-relaxed max-w-md">
                            {t.batchApiKeysDesc}
                          </p>
                          <button
                            type="button"
                            onClick={handleTestAllApiKeys}
                            disabled={isTestingKey}
                            className="bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 text-gray-800 disabled:text-gray-400 border border-gray-200 font-bold px-3 py-1.5 rounded-lg text-[10px] tracking-wider transition shrink-0 flex items-center justify-center space-x-1 uppercase"
                          >
                            {isTestingKey && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                            <span>{isTestingKey ? t.testingApiKey : t.testAllKeys}</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Unified Test Results Display */}
                    {testResult && (
                      <div className="md:col-span-2">
                        <div className={`text-[11px] font-mono leading-relaxed mt-1 p-2.5 rounded-lg border whitespace-pre-wrap ${
                          testResult.success 
                            ? "bg-green-50 text-green-800 border-green-150" 
                            : "bg-red-50 text-red-800 border-red-150"
                        }`}>
                          {testResult.message}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-150">
                    {/* Custom Prompt (Text area) */}
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        {t.customPromptLabel}
                      </label>
                      <textarea
                        rows={3}
                        value={tempCustomPrompt}
                        onChange={(e) => setTempCustomPrompt(e.target.value)}
                        placeholder={lang === "uz" ? "Masalan: Sarlavha juda qisqa bo'lsin va rasmning hissiy holatiga ko'proq urg'u berilsin..." : "E.g., Keep titles short and put more emphasis on the emotional vibe of the image..."}
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:border-black transition resize-y"
                      />
                      <span className="text-[10px] text-gray-400 mt-1 block">
                        {t.customPromptDesc}
                      </span>
                    </div>

                    {/* Compression Max Width */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        AI tahlil uchun preview max o'lchami (px)
                      </label>
                      <input
                        type="number"
                        min="512"
                        max="2048"
                        step="128"
                        value={tempMaxDimension}
                        onChange={(e) => setTempMaxDimension(Number(e.target.value))}
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:border-black transition"
                      />
                      <span className="text-[10px] text-gray-400 mt-1 block">
                        Kattaroq o'lcham aniqlikni oshiradi lekin analiz vaqtini uzaytiradi. Standart: 1024px.
                      </span>
                    </div>

                    <div className="flex items-end justify-end space-x-3">
                      <button
                        type="button"
                        onClick={() => {
                          setTempApiKey("");
                          setTempApiKeysText("");
                          setTempModelId("gemini-3.5-flash");
                          setTempMaxDimension(512);
                          setTempCustomPrompt("");
                          setTestResult(null);
                        }}
                        className="px-3 py-2 text-gray-500 hover:text-black text-xs font-medium transition"
                      >
                        Reset
                      </button>
                      <button
                        type="submit"
                        className="bg-black hover:bg-gray-900 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-sm transition flex items-center space-x-1.5 uppercase tracking-wider"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{t.saveSettings}</span>
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 3. HERO SUBTITLE & HOW IT WORKS (COLLAPSIBLE / INFOPANEL) */}
        <div className="mb-6">
          <div className="bg-white border border-gray-200 rounded-2xl p-5 md:p-6 shadow-sm">
            <h2 className="font-display text-xl md:text-2xl font-bold tracking-tight text-black mb-2 leading-tight">
              {t.appTitle} ✨
            </h2>
            <p className="text-sm text-gray-650 max-w-4xl leading-relaxed">
              {t.appSubTitle}
            </p>

            {/* How it works pipeline */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-100">
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 rounded-md bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-700 shrink-0 mt-0.5">1</div>
                <div>
                  <h4 className="text-xs font-bold text-black uppercase tracking-wider">{t.step1}</h4>
                  <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">{t.step1Desc}</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 rounded-md bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-700 shrink-0 mt-0.5">2</div>
                <div>
                  <h4 className="text-xs font-bold text-black uppercase tracking-wider">{t.step2}</h4>
                  <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">{t.step2Desc}</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 rounded-md bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-700 shrink-0 mt-0.5">3</div>
                <div>
                  <h4 className="text-xs font-bold text-black uppercase tracking-wider">{t.step3}</h4>
                  <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">{t.step3Desc}</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 rounded-md bg-black flex items-center justify-center text-xs font-bold text-white shrink-0 mt-0.5">4</div>
                <div>
                  <h4 className="text-xs font-bold text-black uppercase tracking-wider">{t.step4}</h4>
                  <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">{t.step4Desc}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4. STATISTICS DASHBOARD CARD */}
        {images.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Jami rasmlar</span>
                <p className="font-display text-2xl font-extrabold text-black mt-1 font-mono">{totalCount}</p>
              </div>
              <div className="p-2.5 bg-gray-50 rounded-lg text-gray-400 border border-gray-100">
                <ImageIcon className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Tahlil qilindi</span>
                <p className="font-display text-2xl font-extrabold text-emerald-600 mt-1 font-mono">
                  {completedCount} <span className="text-xs font-normal text-gray-400">/ {totalCount}</span>
                </p>
              </div>
              <div className="p-2.5 bg-green-50 rounded-lg text-green-600 border border-green-100">
                <CheckCircle className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Kutilmoqda / Qolganlar</span>
                <p className="font-display text-2xl font-extrabold text-amber-600 mt-1 font-mono">
                  {pendingCount}
                </p>
              </div>
              <div className="p-2.5 bg-amber-50 rounded-lg text-amber-600 border border-amber-100">
                <ClockIcon className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">{t.savedRatio}</span>
                <p className="font-display text-2xl font-extrabold text-black mt-1 font-mono">
                  {sizeSavingsPercent}%
                </p>
                <span className="text-[10px] text-gray-400 block font-mono">
                  {Math.round(totalOriginalSizeMb * 10) / 10}MB vs {Math.round(totalCompressedSizeMb * 10) / 10}MB
                </span>
              </div>
              <div className="p-2.5 bg-gray-50 rounded-lg text-gray-400 border border-gray-100">
                <RefreshCw className={`w-5 h-5 ${analyzingCount > 0 ? "animate-spin" : ""}`} />
              </div>
            </div>
          </div>
        )}

        {/* 5. MAIN CONTENT DIVISION: LEFT AREA (UPLOADER, ACTIONS, GRID) / RIGHT AREA (EDITOR) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT AREA: Uploader & Image List (Takes 2 columns of 3) */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* DRAG & DROP ZONE */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={triggerFileInput}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition duration-200 relative group overflow-hidden ${
                isDragOver
                  ? "border-black bg-gray-50 shadow-inner"
                  : "border-gray-200 bg-white hover:border-gray-400 hover:bg-gray-50/50"
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                multiple
                accept="image/*"
                className="hidden"
              />

              <div className="flex flex-col items-center justify-center space-y-3 relative z-10">
                <div className={`w-16 h-16 bg-white shadow-sm border border-gray-100 rounded-full flex items-center justify-center mb-1 transition duration-200 ${
                  isDragOver 
                    ? "scale-110 border-gray-300 text-black" 
                    : "text-gray-400 group-hover:scale-105 group-hover:text-black"
                }`}>
                  <Upload className="w-7 h-7" />
                </div>
                <p className="text-sm font-semibold text-gray-900">{t.dragPrompt}</p>
                <p className="text-xs text-gray-400 max-w-md mx-auto leading-relaxed">
                  {t.dragSub}
                </p>
                <div className="flex items-center space-x-2 text-[10px] font-mono text-gray-400 bg-gray-50 px-3 py-1 rounded-full border border-gray-200">
                  <span className="uppercase font-bold tracking-widest">RAW, JPG, PNG, WEBP</span>
                  <span>•</span>
                  <span>MAX FILE SIZE: UNLIMITED</span>
                </div>
              </div>
            </div>

            {/* ACTION CONTROLS */}
            {images.length > 0 && (
              <div className="space-y-4">
                {cooldownRemaining > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between shadow-sm animate-pulse">
                    <div className="flex items-center space-x-2">
                      <ClockIcon className="w-4 h-4 text-amber-600 animate-spin" />
                      <span className="text-xs font-bold text-amber-800">
                        {t.rateLimitNotice}: {t.cooldownText} {cooldownRemaining}s...
                      </span>
                    </div>
                    <div className="text-[10px] text-amber-600 font-mono font-bold uppercase tracking-wider">
                      15 req / min
                    </div>
                  </div>
                )}

                <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
                  <div className="flex items-center space-x-2 w-full sm:w-auto">
                    {/* Select Mode Switcher */}
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                      <button
                        onClick={() => setMode("batch")}
                        className={`px-4 py-1.5 rounded-md text-xs font-medium transition flex items-center space-x-1 ${
                          mode === "batch"
                            ? "bg-white text-black shadow-sm"
                            : "text-gray-500 hover:text-black"
                        }`}
                      >
                        <Grid className="w-3.5 h-3.5" />
                        <span>{t.modeBatch}</span>
                      </button>
                      <button
                        onClick={() => {
                          setMode("single");
                          if (images.length > 0 && !selectedImageId) {
                            setSelectedImageId(images[0].id);
                          }
                        }}
                        className={`px-4 py-1.5 rounded-md text-xs font-medium transition flex items-center space-x-1 ${
                          mode === "single"
                            ? "bg-white text-black shadow-sm"
                            : "text-gray-500 hover:text-black"
                        }`}
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>{t.modeSingle}</span>
                      </button>
                    </div>

                    <button
                      onClick={clearAllImages}
                      className="p-2 text-gray-400 hover:text-rose-650 hover:bg-gray-50 rounded-lg border border-gray-200 transition"
                      title={t.btnClear}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
                    {/* Start/Stop Batch Analysis */}
                    {isAnalyzingAll ? (
                      <button
                        onClick={handleStopBatchAnalysis}
                        className="w-full sm:w-auto bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-3 px-5 rounded-xl shadow-sm transition-all active:scale-[0.98] uppercase tracking-wider flex items-center justify-center space-x-2"
                      >
                        <X className="w-3.5 h-3.5 text-white" />
                        <span>{t.btnCancel}</span>
                      </button>
                    ) : (
                      <button
                        onClick={startBatchAnalysis}
                        disabled={images.every(img => img.status === "completed")}
                        className="w-full sm:w-auto bg-black hover:bg-gray-900 text-white font-bold text-xs py-3 px-5 rounded-xl shadow-sm transition-all active:scale-[0.98] disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed uppercase tracking-wider flex items-center justify-center space-x-2"
                      >
                        <Play className="w-3.5 h-3.5 text-white fill-current" />
                        <span>{t.btnStart}</span>
                      </button>
                    )}

                    {/* Export CSV */}
                    <button
                      onClick={handleExportCSV}
                      disabled={images.filter((img) => img.status === "completed").length === 0}
                      className="w-full sm:w-auto bg-white border border-gray-200 hover:bg-gray-50 text-black font-bold text-xs py-3 px-5 rounded-xl shadow-sm transition duration-150 disabled:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed uppercase tracking-wider flex items-center justify-center space-x-2"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-gray-650" />
                      <span>CSV Eksport</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* IMAGES DISPLAY COMPONENT */}
            {images.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center text-gray-400 shadow-sm">
                <ImageIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-sm font-medium text-gray-950 font-display">{t.noImages}</p>
                <button
                  onClick={triggerFileInput}
                  className="mt-4 text-xs font-semibold text-black hover:underline transition underline-offset-4"
                >
                  Fayllarni tanlash
                </button>
              </div>
            ) : mode === "batch" ? (
              /* BATCH MODE: GRID OF THUMBNAILS */
              (() => {
                const ITEMS_PER_PAGE = 100;
                const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
                const endIndex = startIndex + ITEMS_PER_PAGE;
                const paginatedImages = images.slice(startIndex, endIndex);
                const totalPages = Math.ceil(images.length / ITEMS_PER_PAGE);

                return (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
                      <AnimatePresence>
                        {paginatedImages.map((img) => {
                          const isSelected = selectedImageId === img.id;
                          const isCompleted = img.status === "completed";
                          const isFailed = img.status === "failed";
                          const isAnalyzing = img.status === "analyzing";

                          return (
                            <motion.div
                              key={img.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              onClick={() => setSelectedImageId(img.id)}
                              className={`border rounded-xl overflow-hidden cursor-pointer transition-all duration-200 aspect-square w-full relative flex flex-col justify-end group ${
                                isSelected
                                  ? "border-black ring-2 ring-black/10 bg-white shadow-md scale-[0.98]"
                                  : "border-gray-200 bg-white hover:border-gray-400 hover:shadow-sm"
                              }`}
                            >
                              {/* The Image (Background, object-cover) */}
                              <div className="absolute inset-0 bg-gray-50 flex items-center justify-center overflow-hidden">
                                {img.previewUrl ? (
                                  <img
                                    src={img.previewUrl}
                                    alt={img.name}
                                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                  />
                                ) : (
                                  <div className="flex flex-col items-center justify-center space-y-1">
                                    <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                                    <span className="text-[9px] text-gray-400 font-medium">Compressing...</span>
                                  </div>
                                )}
                              </div>

                              {/* Status badge in absolute top right */}
                              <div className="absolute top-2 right-2 z-15 flex flex-col gap-1 items-end">
                                {isCompleted && (
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[9px] font-extrabold flex items-center gap-0.5 shadow-sm">
                                    ✓ OK
                                  </span>
                                )}
                                {isFailed && (
                                  <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[9px] font-extrabold flex items-center gap-0.5 shadow-sm">
                                    ✕ ERR
                                  </span>
                                )}
                                {isAnalyzing && (
                                  <span className="px-2 py-0.5 rounded-full bg-black text-white text-[9px] font-extrabold flex items-center gap-1 shadow-sm">
                                    <Loader2 className="w-2.5 h-2.5 text-white animate-spin" />
                                    AI...
                                  </span>
                                )}
                                {img.status === "pending" && (
                                  <span className="px-2 py-0.5 rounded-full bg-white text-gray-700 text-[9px] font-extrabold border border-gray-100 shadow-sm">
                                    Kutish
                                  </span>
                                )}
                              </div>

                              {/* Bottom Info Overlay with dynamic gradient */}
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/55 to-transparent p-2.5 pt-7 z-10 text-white flex flex-col justify-end">
                                <p className="text-[10px] font-bold truncate break-all w-full" title={img.name}>
                                  {img.name}
                                </p>

                                {/* Metadata Summary if completed */}
                                {img.status === "completed" && img.metadata && (
                                  <p className="text-[9px] text-gray-300 line-clamp-1 mt-0.5 font-medium opacity-90">
                                    {img.metadata.title}
                                  </p>
                                )}

                                {/* Size & details */}
                                <div className="flex items-center justify-between mt-1 text-[9px] text-gray-300 font-mono">
                                  <div className="flex items-center space-x-1">
                                    <span>{img.originalSizeMb}MB</span>
                                    <span>→</span>
                                    <span className="text-emerald-400 font-semibold">{img.compressedSizeKb}K</span>
                                  </div>

                                  <div className="flex items-center space-x-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                    {img.status === "pending" && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          analyzeSingleImage(img.id);
                                        }}
                                        className="p-1 rounded bg-white hover:bg-gray-100 text-black shadow-sm transition flex items-center justify-center"
                                        title="Analiz"
                                      >
                                        <Play className="w-2.5 h-2.5 fill-current" />
                                      </button>
                                    )}

                                    {(img.status === "completed" || img.status === "failed") && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          analyzeSingleImage(img.id);
                                        }}
                                        className="text-white hover:text-emerald-300 p-0.5 transition"
                                        title={t.btnRegenerate}
                                      >
                                        <RefreshCw className="w-2.5 h-2.5" />
                                      </button>
                                    )}

                                    <button
                                      onClick={(e) => removeImage(img.id, e)}
                                      className="text-white hover:text-rose-400 p-0.5 transition"
                                      title={t.btnClear}
                                    >
                                      <Trash2 className="w-2.5 h-2.5" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </div>

                    {/* PAGINATION CONTROLS */}
                    {images.length > ITEMS_PER_PAGE && (
                      <div className="flex items-center justify-between border-t border-gray-150 pt-4 mt-6">
                        <p className="text-xs text-gray-500 font-mono">
                          {lang === "uz" ? "Ko'rsatilmoqda" : "Showing"} <span className="font-semibold text-black">{startIndex + 1}</span> - <span className="font-semibold text-black">{Math.min(endIndex, images.length)}</span> jami <span className="font-semibold text-black">{images.length}</span> tadan
                        </p>
                        <div className="flex items-center space-x-2">
                          <button
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                            className="px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed text-xs font-bold uppercase transition flex items-center space-x-1"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                            <span>{lang === "uz" ? "Avvalgi" : "Prev"}</span>
                          </button>
                          <span className="text-xs font-bold font-mono px-3 text-black">
                            {currentPage} / {totalPages}
                          </span>
                          <button
                            disabled={currentPage >= totalPages}
                            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                            className="px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed text-xs font-bold uppercase transition flex items-center space-x-1"
                          >
                            <span>{lang === "uz" ? "Keyingi" : "Next"}</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              /* SINGLE RECONSTRUCTED LAYOUT */
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden p-6 shadow-sm">
                {selectedImage ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Visual Preview Left side */}
                    <div className="space-y-4">
                      <div className="relative rounded-xl overflow-hidden bg-gray-50 border border-gray-200 aspect-[4/3] flex items-center justify-center">
                        {selectedImage.previewUrl ? (
                          <img
                            src={selectedImage.previewUrl}
                            alt={selectedImage.name}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <Loader2 className="w-8 h-8 text-black animate-spin" />
                        )}

                        <div className="absolute top-3 right-3">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold backdrop-blur-sm border ${
                            selectedImage.status === "completed"
                              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                              : selectedImage.status === "failed"
                              ? "bg-rose-50 border-rose-200 text-rose-700"
                              : selectedImage.status === "analyzing"
                              ? "bg-black border-black text-white"
                              : "bg-white border-gray-200 text-gray-600"
                          }`}>
                            {selectedImage.status === "completed" && t.statusCompleted}
                            {selectedImage.status === "failed" && t.statusFailed}
                            {selectedImage.status === "analyzing" && "Analiz qilinmoqda..."}
                            {selectedImage.status === "pending" && t.statusPending}
                            {selectedImage.status === "compressing" && t.statusCompressing}
                          </span>
                        </div>
                      </div>

                      {/* File Details */}
                      <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-2">
                        <div className="flex justify-between text-xs border-b border-gray-200 pb-2">
                          <span className="text-gray-400">Fayl nomi:</span>
                          <span className="font-semibold text-black break-all text-right ml-4">{selectedImage.name}</span>
                        </div>
                        <div className="flex justify-between text-xs border-b border-gray-200 pb-2">
                          <span className="text-gray-400">Asl o'lcham:</span>
                          <span className="font-semibold text-black">{selectedImage.originalSizeMb} MB</span>
                        </div>
                        <div className="flex justify-between text-xs border-b border-gray-200 pb-2">
                          <span className="text-gray-400">Analiz o'lchami:</span>
                          <span className="font-semibold text-black">{selectedImage.compressedSizeKb} KB</span>
                        </div>
                        <div className="flex justify-between text-xs border-b border-gray-200 pb-2">
                          <span className="text-gray-400">Tejalgan trafik:</span>
                          <span className="font-bold text-emerald-700">
                            -{Math.round((1 - (selectedImage.compressedSizeKb / 1024) / selectedImage.originalSizeMb) * 100)}%
                          </span>
                        </div>
                        {selectedImage.analysisDurationMs && (
                          <div className="flex justify-between text-xs border-b border-gray-200 pb-2">
                            <span className="text-gray-400">{t.analysisTime}:</span>
                            <span className="font-semibold text-black">{(selectedImage.analysisDurationMs / 1000).toFixed(1)}s</span>
                          </div>
                        )}
                        {selectedImage.analysisModel && (
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-400">{t.analysisModel}:</span>
                            <span className="font-semibold text-black">{selectedImage.analysisModel}</span>
                          </div>
                        )}
                      </div>

                      {/* Analysis button */}
                      {selectedImage.status === "pending" && (
                        <button
                          onClick={() => analyzeSingleImage(selectedImage.id)}
                          className="w-full py-3 bg-black hover:bg-gray-900 text-white font-bold text-xs uppercase tracking-wider rounded-xl flex items-center justify-center space-x-2 shadow transition"
                        >
                          <Play className="w-3.5 h-3.5 text-white fill-current" />
                          <span>AI Analizni boshlash</span>
                        </button>
                      )}

                      {(selectedImage.status === "completed" || selectedImage.status === "failed") && (
                        <button
                          onClick={() => analyzeSingleImage(selectedImage.id)}
                          className="w-full py-3 bg-white border border-gray-200 hover:bg-gray-50 text-black font-bold text-xs uppercase tracking-wider rounded-xl flex items-center justify-center space-x-2 shadow-sm transition"
                        >
                          <RefreshCw className="w-3.5 h-3.5 text-gray-700 animate-none" />
                          <span>{t.btnRegenerate}</span>
                        </button>
                      )}
                    </div>

                    {/* Metadata details panel directly in view on the right */}
                    <div>
                      {selectedImage.status === "completed" && selectedImage.metadata ? (
                        <div className="space-y-4">
                          <h3 className="text-sm font-bold text-black border-b border-gray-150 pb-2 flex items-center space-x-1.5 uppercase tracking-wider">
                            <Sparkles className="w-4 h-4 text-gray-500" />
                            <span>Tahlil natijalari (Ingliz tilida)</span>
                          </h3>

                          {/* Title */}
                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">{t.titleLabel}</label>
                            <input
                              type="text"
                              value={selectedImage.metadata.title}
                              onChange={(e) => handleUpdateTitle(e.target.value)}
                              maxLength={120}
                              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:border-black transition"
                            />
                            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                              <span>Sotilish darajasi yuqori sarlavha.</span>
                              <span>{selectedImage.metadata.title.length}/75 belgi</span>
                            </div>
                          </div>

                          {/* Category */}
                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">{t.categoryLabel}</label>
                            <select
                              value={selectedImage.metadata.category}
                              onChange={(e) => handleUpdateCategory(Number(e.target.value))}
                              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:border-black transition"
                            >
                              {ADOBE_STOCK_CATEGORIES.map((cat) => (
                                <option key={cat.id} value={cat.id}>
                                  {cat.id}: {lang === "uz" ? cat.nameUz : cat.nameEn}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Releases */}
                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">{t.releasesLabel}</label>
                            <input
                              type="text"
                              value={selectedImage.metadata.releases || ""}
                              onChange={(e) => handleUpdateReleases(e.target.value)}
                              placeholder={t.releasesPlaceholder}
                              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:border-black transition"
                            />
                            <div className="text-[10px] text-gray-400 mt-1">
                              {lang === "uz" 
                                ? "Model yoki mulk relizi nomlarini kiritishingiz mumkin (masalan, \"John Doe, Jane Doe\")." 
                                : "You can specify model or property release names (e.g., \"John Doe, Jane Doe\")."}
                            </div>
                          </div>

                          {/* Keywords */}
                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">
                              {t.keywordsLabel} ({selectedImage.metadata.keywords.length})
                            </label>

                            {/* Tags input */}
                            <div className="flex space-x-2 mb-3">
                              <input
                                type="text"
                                value={newKeywordInput}
                                onChange={(e) => setNewKeywordInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleAddKeyword();
                                  }
                                }}
                                onPaste={handleKeywordsPaste}
                                placeholder={t.keywordsPlaceholder}
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-black focus:outline-none focus:border-black transition"
                              />
                              <button
                                onClick={handleAddKeyword}
                                className="bg-white hover:bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg text-xs font-bold text-black flex items-center space-x-1 transition uppercase tracking-wider"
                              >
                                <Plus className="w-3.5 h-3.5 text-gray-500" />
                                <span>{t.addKeywordBtn}</span>
                              </button>
                            </div>

                            {/* Tags bubble list */}
                            <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-1.5 bg-gray-50 rounded-xl border border-gray-200">
                              {selectedImage.metadata.keywords.map((kw, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center space-x-1 bg-white hover:bg-gray-50 text-gray-750 text-[11px] pl-2.5 pr-1.5 py-1 rounded-lg border border-gray-200 transition font-mono"
                                >
                                  <span>{kw}</span>
                                  <button
                                    onClick={() => handleRemoveKeyword(kw)}
                                    className="p-0.5 text-gray-400 hover:text-rose-600 rounded-md transition"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </span>
                              ))}
                            </div>
                            <span className="text-[10px] text-gray-400 mt-1.5 block">
                              {t.keywordWarning}
                            </span>
                          </div>
                        </div>
                      ) : selectedImage.status === "analyzing" ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                          <Loader2 className="w-8 h-8 text-black animate-spin" />
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-gray-900">Sun'iy intellekt tahlil qilmoqda...</p>
                            <p className="text-xs text-gray-450 leading-relaxed">Gemini rasm tafsilotlarini o'rganmoqda va taglarni ingliz tilida shakllantirmoqda.</p>
                          </div>
                        </div>
                      ) : selectedImage.status === "failed" ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center space-y-3 bg-rose-50 border border-rose-100 rounded-xl p-6">
                          <AlertCircle className="w-8 h-8 text-rose-600" />
                          <h4 className="text-sm font-bold text-gray-900">Analiz qilishda xatolik yuz berdi</h4>
                          <p className="text-xs text-rose-700 leading-relaxed">{selectedImage.error}</p>
                          <button
                            onClick={() => analyzeSingleImage(selectedImage.id)}
                            className="mt-2 text-xs font-bold bg-white border border-rose-200 text-rose-700 px-3 py-1.5 rounded-lg hover:bg-rose-50 transition uppercase tracking-wider"
                          >
                            Qayta urinish
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-24 text-center text-gray-400">
                          <Sparkles className="w-8 h-8 text-gray-300 mb-3" />
                          <p className="text-xs">Ushbu rasm hali analiz qilinmagan. Yuqoridagi "AI Analizni boshlash" tugmasini bosing.</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-20 text-gray-400">
                    <p className="text-sm">Rasm tahlilini ko'rish uchun avval chap tomondan rasm yuklang.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT AREA: METADATA DETAILS EDITOR (Takes 1 column of 3) - Sticky in batch mode */}
          <div className="lg:col-span-1">
            {mode === "batch" && (
              <div className="bg-white border border-gray-200 rounded-2xl p-5 sticky top-20 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <h3 className="text-sm font-bold text-black flex items-center space-x-1.5 uppercase tracking-wider">
                    <Edit2 className="w-4 h-4 text-gray-550" />
                    <span>{t.detailsTitle}</span>
                  </h3>
                  {selectedImage && (
                    <span className="text-[10px] bg-gray-50 border border-gray-200 text-gray-500 px-2 py-0.5 rounded font-mono font-bold">
                      {images.indexOf(selectedImage) + 1} - rasm
                    </span>
                  )}
                </div>

                {selectedImage ? (
                  <div>
                    {/* Tiny visual card preview */}
                    <div className="flex items-center space-x-3 mb-4 bg-gray-50 p-2.5 rounded-xl border border-gray-200">
                      {selectedImage.previewUrl ? (
                        <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-white border border-gray-200">
                          <img
                            src={selectedImage.previewUrl}
                            alt={selectedImage.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-white border border-gray-200 flex items-center justify-center">
                          <Loader2 className="w-4 h-4 text-black animate-spin" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-900 truncate break-all leading-snug" title={selectedImage.name}>
                          {selectedImage.name}
                        </p>
                        <p className="text-[10px] text-gray-400 font-mono">
                          {selectedImage.originalSizeMb}MB • {selectedImage.compressedSizeKb}KB
                        </p>
                      </div>
                    </div>

                    {selectedImage.status === "completed" && selectedImage.metadata ? (
                      <div className="space-y-4">
                        {/* Title Input */}
                        <div>
                          <label className="block text-[11px] font-bold text-gray-700 mb-1 uppercase tracking-wider">{t.titleLabel}</label>
                          <textarea
                            value={selectedImage.metadata.title}
                            onChange={(e) => handleUpdateTitle(e.target.value)}
                            maxLength={120}
                            rows={2}
                            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-black focus:outline-none focus:border-black transition resize-none leading-relaxed"
                          />
                          <div className="flex justify-between text-[9px] text-gray-400 mt-1">
                            <span>Sarlavha ingliz tilida.</span>
                            <span className={selectedImage.metadata.title.length > 75 ? "text-amber-600 font-semibold" : "text-gray-400"}>
                              {selectedImage.metadata.title.length}/75 belgi
                            </span>
                          </div>
                        </div>

                        {/* Category Select */}
                        <div>
                          <label className="block text-[11px] font-bold text-gray-700 mb-1 uppercase tracking-wider">{t.categoryLabel}</label>
                          <select
                            value={selectedImage.metadata.category}
                            onChange={(e) => handleUpdateCategory(Number(e.target.value))}
                            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-2 text-xs text-black focus:outline-none focus:border-black transition"
                          >
                            {ADOBE_STOCK_CATEGORIES.map((cat) => (
                              <option key={cat.id} value={cat.id}>
                                {cat.id}: {lang === "uz" ? cat.nameUz : cat.nameEn}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Releases Input */}
                        <div>
                          <label className="block text-[11px] font-bold text-gray-700 mb-1 uppercase tracking-wider">{t.releasesLabel}</label>
                          <input
                            type="text"
                            value={selectedImage.metadata.releases || ""}
                            onChange={(e) => handleUpdateReleases(e.target.value)}
                            placeholder={t.releasesPlaceholder}
                            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-2 text-xs text-black focus:outline-none focus:border-black transition"
                          />
                          <div className="text-[9px] text-gray-400 mt-1">
                            {lang === "uz" 
                              ? "Model yoki mulk relizi nomlari (masalan: John Doe, Jane Doe)." 
                              : "Model or property release names (e.g. John Doe, Jane Doe)."}
                          </div>
                        </div>

                        {/* Keywords Tag Manager */}
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider">
                              {t.keywordsLabel} ({selectedImage.metadata.keywords.length})
                            </label>
                            {selectedImage.metadata.keywords.length < 5 && (
                              <span className="text-[9px] text-amber-600 font-bold font-mono">Kamida 5 ta kerak!</span>
                            )}
                          </div>

                          <div className="flex space-x-2 mb-2">
                            <input
                              type="text"
                              value={newKeywordInput}
                              onChange={(e) => setNewKeywordInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleAddKeyword();
                                }
                              }}
                              onPaste={handleKeywordsPaste}
                              placeholder={t.keywordsPlaceholder}
                              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-black focus:outline-none focus:border-black transition font-mono"
                            />
                            <button
                              onClick={handleAddKeyword}
                              className="bg-black hover:bg-gray-900 px-2.5 py-1.5 rounded-lg text-xs font-bold text-white transition shrink-0"
                            >
                              +
                            </button>
                          </div>

                          {/* Tag Bubbles list wrapper */}
                          <div className="flex flex-wrap gap-1 max-h-52 overflow-y-auto p-2 bg-gray-50 rounded-lg border border-gray-200">
                            {selectedImage.metadata.keywords.map((kw, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center space-x-1 bg-white hover:bg-gray-100 text-gray-750 text-[10px] pl-2 pr-1 py-0.5 rounded border border-gray-200 transition font-mono"
                              >
                                <span>{kw}</span>
                                <button
                                  onClick={() => handleRemoveKeyword(kw)}
                                  className="text-gray-400 hover:text-rose-600 rounded-md transition"
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </span>
                            ))}
                          </div>
                          <span className="text-[9px] text-gray-400 mt-1 block">
                            {t.keywordWarning}
                          </span>
                        </div>
                      </div>
                    ) : selectedImage.status === "analyzing" ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                        <Loader2 className="w-6 h-6 text-black animate-spin" />
                        <div className="space-y-0.5">
                          <p className="text-xs font-bold text-gray-900">AI analiz qilmoqda...</p>
                          <p className="text-[10px] text-gray-400">Iltimos, kuting.</p>
                        </div>
                      </div>
                    ) : selectedImage.status === "failed" ? (
                      <div className="text-center py-12 space-y-3 bg-rose-55 border border-rose-100 rounded-xl p-4">
                        <AlertCircle className="w-6 h-6 text-rose-600 mx-auto" />
                        <p className="text-xs font-bold text-gray-900">Analiz muvaffaqiyatsiz tugadi</p>
                        <p className="text-[10px] text-rose-700 line-clamp-3">{selectedImage.error}</p>
                        <button
                          onClick={() => analyzeSingleImage(selectedImage.id)}
                          className="bg-white border border-rose-200 hover:bg-rose-50 text-rose-700 text-[10px] px-3 py-1.5 rounded transition uppercase tracking-wider font-bold"
                        >
                          Qayta urinish
                        </button>
                      </div>
                    ) : (
                      <div className="text-center py-16 space-y-2 border border-dashed border-gray-200 rounded-xl">
                        <Sparkles className="w-6 h-6 text-gray-300 mx-auto" />
                        <p className="text-xs text-gray-450">Rasm hali analiz qilinmadi</p>
                        <button
                          onClick={() => analyzeSingleImage(selectedImage.id)}
                          className="text-xs text-black hover:underline font-semibold"
                        >
                          Hozir tahlil qilish
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-20 text-gray-400">
                    <Info className="w-6 h-6 text-gray-350 mx-auto mb-2" />
                    <p className="text-xs leading-relaxed">{t.selectImageToEdit}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer credits and information */}
      <footer className="border-t border-gray-250 bg-white py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-gray-400">
          <div className="flex items-center space-x-2">
            <span className="text-black font-bold">Adobe Stock Metadata Generator</span>
            <span>•</span>
            <span>Created with Gemini 3.5 AI</span>
          </div>
          <div>
            <p>O'zbekistonlik ijodkorlar va sotuvchilar uchun maxsus tayyorlandi. © 2026</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Minimal inline icons or duplicates for safety
function ClockIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
