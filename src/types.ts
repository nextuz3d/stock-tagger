export interface ImageMetadata {
  title: string;
  keywords: string[];
  category: number;
  categoryName: string;
  releases?: string;
}

export type ProcessingStatus = "pending" | "compressing" | "analyzing" | "completed" | "failed";

export interface ImageItem {
  id: string;
  file: File;
  name: string;
  previewUrl: string; // Blob URL or base64 URL of the compressed preview image
  compressedBase64: string; // Base64 data of the compressed image used to send to Gemini
  originalSizeMb: number;
  compressedSizeKb: number;
  status: ProcessingStatus;
  progress: number; // 0 to 100 for visual loading bar
  error?: string;
  metadata?: ImageMetadata;
  analysisDurationMs?: number;
  analysisModel?: string;
}

export interface AppSettings {
  customApiKey: string;
  customApiKeys?: string[]; // Array of keys for rotation/distribution
  customModelId: string;
  maxDimension: number; // Max width or height for AI preview compression (default: 1024)
  customPrompt?: string; // Custom instruction for AI analysis
}

export const ADOBE_STOCK_CATEGORIES: { id: number; nameUz: string; nameEn: string }[] = [
  { id: 1, nameUz: "Hayvonlar", nameEn: "Animals" },
  { id: 2, nameUz: "Binolar va Arxitektura", nameEn: "Buildings and Architecture" },
  { id: 3, nameUz: "Biznes", nameEn: "Business" },
  { id: 4, nameUz: "Ichimliklar", nameEn: "Drinks" },
  { id: 5, nameUz: "Atrof-muhit", nameEn: "The Environment" },
  { id: 6, nameUz: "Ruhiy holatlar / Tuyg'ular", nameEn: "States of Mind" },
  { id: 7, nameUz: "Oziq-ovqat / Taomlar", nameEn: "Food" },
  { id: 8, nameUz: "Grafik resurslar / Fonlar", nameEn: "Graphic Resources" },
  { id: 9, nameUz: "Dinlar", nameEn: "Religions" },
  { id: 10, nameUz: "Sanoat", nameEn: "Industry" },
  { id: 11, nameUz: "Tabiat manzaralari", nameEn: "Landscapes" },
  { id: 12, nameUz: "Turmush tarzi", nameEn: "Lifestyle" },
  { id: 13, nameUz: "Odamlar", nameEn: "People" },
  { id: 14, nameUz: "O'simliklar va Gullar", nameEn: "Plants and Flowers" },
  { id: 15, nameUz: "Madaniyat va San'at", nameEn: "Culture and Religion" },
  { id: 16, nameUz: "Ilm-fan", nameEn: "Science" },
  { id: 17, nameUz: "Ijtimoiy muammolar", nameEn: "Social Issues" },
  { id: 18, nameUz: "Sport", nameEn: "Sports" },
  { id: 19, nameUz: "Texnologiya", nameEn: "Technology" },
  { id: 20, nameUz: "Transportlar", nameEn: "Transport" },
  { id: 21, nameUz: "Sayohat", nameEn: "Travel" },
];
