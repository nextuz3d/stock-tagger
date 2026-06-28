import { ImageItem } from "./types";

/**
 * Compresses an image file in the browser using HTML5 Canvas.
 * Resizes the image so that its maximum dimension does not exceed `maxDimension`.
 * Returns the base64 string, the compressed mimeType, and the estimated compressed size.
 */
export function compressImage(
  file: File,
  maxDimension: number = 1024
): Promise<{ base64: string; mimeType: string; compressedSizeKb: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions keeping the aspect ratio
        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas contextni olishda xatolik yuz berdi."));
          return;
        }

        // Draw and compress
        ctx.drawImage(img, 0, 0, width, height);

        // Export as JPEG with 0.85 quality
        const mimeType = "image/jpeg";
        const base64 = canvas.toDataURL(mimeType, 0.85);

        // Calculate size in KB
        // base64 format: data:image/jpeg;base64,xxxxxx...
        const base64Data = base64.split(",")[1];
        const stringLength = base64Data.length;
        const sizeInBytes = Math.floor(stringLength * (3 / 4));
        const compressedSizeKb = Math.round((sizeInBytes / 1024) * 10) / 10;

        resolve({
          base64,
          mimeType,
          compressedSizeKb,
        });
      };
      img.onerror = () => reject(new Error("Rasm yuklashda xatolik yuz berdi."));
      img.src = event.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Faylni o'qishda xatolik yuz berdi."));
    reader.readAsDataURL(file);
  });
}

/**
 * Escapes a single field value for a standard CSV.
 * Standard CSV escaping rules:
 * - If the value contains commas, double quotes, or newlines, wrap it in double quotes.
 * - If it contains double quotes, double them (e.g. " becomes "").
 */
function escapeCSVField(val: string | number): string {
  const str = String(val === undefined || val === null ? "" : val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates an Adobe Stock compatible CSV content and downloads it.
 * Columns: Filename, Title, Keywords, Category
 * Filename: original filename (e.g., photo.jpg)
 * Title: title text (escaped)
 * Keywords: comma-separated list of tags (escaped as a single string)
 * Category: category ID number (or empty if not defined)
 */
export function exportAdobeStockCSV(items: ImageItem[]): void {
  // Adobe Stock CSV headers
  const headers = ["Filename", "Title", "Keywords", "Category", "Releases"];

  const rows = items.map((item) => {
     const filename = item.name;
     const title = item.metadata?.title || "";

     // Join keywords with a comma and space, then escape as a single CSV field
     const keywords = (item.metadata?.keywords || []).join(", ");
     const category = item.metadata?.category || "";
     const releases = item.metadata?.releases || "";

     return [
       escapeCSVField(filename),
       escapeCSVField(title),
       escapeCSVField(keywords),
       category, // numeric ID or empty
       escapeCSVField(releases),
     ];
  });

  // Combine into CSV string (using standard comma separator and DOS/Windows style CRLF line breaks)
  const csvContent = [headers, ...rows]
    .map((row) => row.join(","))
    .join("\r\n");

  // Create a Blob and trigger a download
  const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  // Use current date in file name
  const dateStr = new Date().toISOString().slice(0, 10);
  link.setAttribute("href", url);
  link.setAttribute("download", `adobe_stock_metadata_${dateStr}.csv`);
  link.style.visibility = "hidden";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
