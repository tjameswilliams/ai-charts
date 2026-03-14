import { useState } from "react";
import { jsPDF } from "jspdf";
import { useStore } from "../../store";
import { api } from "../../api/client";

interface Props {
  onClose: () => void;
}

type ExportFormat = "mermaid" | "markdown" | "png" | "svg" | "pdf" | "zip";

export function ExportDialog({ onClose }: Props) {
  const activeChart = useStore((s) => s.activeChart);
  const canvasExportFn = useStore((s) => s.canvasExportFn);
  const [format, setFormat] = useState<ExportFormat>("mermaid");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cropToContent, setCropToContent] = useState(true);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  const isImage = format === "png" || format === "svg" || format === "pdf";
  const isZip = format === "zip";
  const exportChart = useStore((s) => s.exportChart);

  const handleExport = async () => {
    if (!activeChart) return;
    setLoading(true);
    setContent("");
    setImageUrl("");
    try {
      if (format === "zip") {
        await exportChart(activeChart.id);
        setContent("__zip__");
        setLoading(false);
        return;
      } else if (format === "mermaid") {
        const res = await api.exports.mermaid(activeChart.id);
        setContent(res.content);
      } else if (format === "markdown") {
        const res = await api.exports.markdown(activeChart.id);
        setContent(res.content);
      } else if (format === "pdf" && canvasExportFn) {
        const dataUrl = await canvasExportFn("png", cropToContent, theme);
        // Load image to get dimensions
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = reject;
          img.src = dataUrl;
        });
        const imgW = img.naturalWidth;
        const imgH = img.naturalHeight;
        // Fit to page with margins (in mm)
        const margin = 10;
        const isLandscape = imgW > imgH;
        const pageW = isLandscape ? 297 : 210; // A4
        const pageH = isLandscape ? 210 : 297;
        const maxW = pageW - margin * 2;
        const maxH = pageH - margin * 2;
        const scale = Math.min(maxW / imgW, maxH / imgH, 1);
        const w = imgW * scale;
        const h = imgH * scale;
        const x = (pageW - w) / 2;
        const y = (pageH - h) / 2;
        const pdf = new jsPDF({ orientation: isLandscape ? "landscape" : "portrait", unit: "mm", format: "a4" });
        pdf.addImage(dataUrl, "PNG", x, y, w, h);
        const pdfBlob = pdf.output("blob");
        const pdfUrl = URL.createObjectURL(pdfBlob);
        setImageUrl(pdfUrl);
        // Also show the PNG preview
        setContent("__pdf__");
      } else if (canvasExportFn) {
        const dataUrl = await canvasExportFn(format as "png" | "svg", cropToContent, theme);
        setImageUrl(dataUrl);
      } else {
        setContent("Error: Canvas not available for image export");
      }
    } catch (e) {
      setContent(`Error: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (imageUrl && format === "png") {
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
    } else if (imageUrl && format === "svg") {
      // SVG data URLs contain the SVG markup
      const svgText = decodeURIComponent(imageUrl.split(",")[1] || "");
      await navigator.clipboard.writeText(svgText);
    } else {
      await navigator.clipboard.writeText(content);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (imageUrl) {
      const a = document.createElement("a");
      a.href = imageUrl;
      a.download = `${activeChart?.title || "chart"}.${format === "pdf" ? "pdf" : format}`;
      a.click();
      return;
    }
    const ext = format === "mermaid" ? "mmd" : "md";
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeChart?.title || "chart"}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isPdf = format === "pdf";
  const hasOutput = (content && content !== "__pdf__" && content !== "__zip__") || imageUrl;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-[600px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-bold text-zinc-200 mb-4">Export Chart</h2>

        <div className="flex gap-2 mb-4 flex-wrap">
          {(["mermaid", "markdown", "png", "svg", "pdf", "zip"] as const).map((f) => (
            <button
              key={f}
              onClick={() => { setFormat(f); setContent(""); setImageUrl(""); }}
              className={`px-3 py-1.5 text-xs rounded transition-colors ${
                format === f
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              {f === "zip" ? "ZIP (Full)" : f.toUpperCase()}
            </button>
          ))}
        </div>

        {isImage && (
          <div className="flex items-center gap-5 mb-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={cropToContent}
                onChange={(e) => setCropToContent(e.target.checked)}
                className="accent-blue-500 w-3.5 h-3.5"
              />
              <span className="text-xs text-zinc-400">Crop to content</span>
            </label>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-zinc-500">Theme:</span>
              <button
                onClick={() => { setTheme("dark"); setImageUrl(""); }}
                className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                  theme === "dark"
                    ? "bg-zinc-700 text-zinc-200"
                    : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Dark
              </button>
              <button
                onClick={() => { setTheme("light"); setImageUrl(""); }}
                className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                  theme === "light"
                    ? "bg-zinc-300 text-zinc-800"
                    : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Light
              </button>
            </div>
          </div>
        )}

        {isZip && !loading && content !== "__zip__" && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-400">
              Export this chart as a portable ZIP archive including all data, images, and history. Can be imported into any instance.
            </p>
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-500 transition-colors"
            >
              Download ZIP
            </button>
          </div>
        )}

        {isZip && content === "__zip__" && (
          <div className="bg-zinc-800 rounded-lg p-3 mb-4 text-zinc-400 text-sm">
            ZIP downloaded successfully.
          </div>
        )}

        {!isZip && !hasOutput && !loading && (
          <button
            onClick={handleExport}
            disabled={isImage && !canvasExportFn}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-500 transition-colors disabled:opacity-50"
          >
            {isPdf ? "Generate PDF" : isImage ? "Capture Image" : "Generate Export"}
          </button>
        )}

        {loading && <p className="text-zinc-500 text-sm">Generating...</p>}

        {content && content !== "__pdf__" && (
          <pre className="flex-1 overflow-auto bg-zinc-800 rounded-lg p-3 text-xs text-zinc-300 whitespace-pre-wrap font-mono mb-4">
            {content}
          </pre>
        )}

        {imageUrl && !isPdf && (
          <div className="flex-1 overflow-auto bg-zinc-800 rounded-lg p-3 mb-4 flex items-center justify-center">
            <img
              src={imageUrl}
              alt="Chart export"
              className="max-w-full max-h-[50vh] object-contain rounded"
            />
          </div>
        )}

        {imageUrl && isPdf && (
          <div className="flex-1 overflow-auto bg-zinc-800 rounded-lg p-3 mb-4 flex items-center justify-center text-zinc-400 text-sm">
            PDF ready to download
          </div>
        )}

        {hasOutput && (
          <div className="flex justify-end gap-2">
            {!isPdf && (
              <button
                onClick={handleCopy}
                className="px-3 py-1.5 text-xs bg-zinc-800 text-zinc-400 rounded hover:bg-zinc-700 transition-colors"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            )}
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 text-xs bg-zinc-800 text-zinc-400 rounded hover:bg-zinc-700 transition-colors"
            >
              Download
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-zinc-400 bg-zinc-800 rounded hover:bg-zinc-700 transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
