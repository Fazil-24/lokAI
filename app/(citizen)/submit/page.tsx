"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { compressImage } from "@/lib/compressImage";
import { KNOWN_BLOCK_NAMES } from "@/lib/locations";

const LANGUAGES = ["Auto-detect", "English", "Kannada", "Hindi", "Telugu", "Tamil", "Other"];

type MediaState = {
  url: string;
  mimeType: string;
  kind: "photo" | "voice";
  name: string;
} | null;

interface IngestResponse {
  trackingId: string;
  theme: { id: string; created: boolean; locationName: string };
  extraction: {
    issueTheme: string;
    sector: string;
    location: string;
    summary: string;
    translatedText: string;
    languageDetected: string;
  };
  provider: string;
}

export default function SubmitPage() {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const [language, setLanguage] = useState("Auto-detect");
  const [locationHint, setLocationHint] = useState("");
  const [media, setMedia] = useState<MediaState>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IngestResponse | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    const isImage = file.type.startsWith("image/");
    const isAudio = file.type.startsWith("audio/");
    if (!isImage && !isAudio) {
      setError("Please attach a photo or an audio recording.");
      return;
    }

    setUploading(true);
    try {
      const toUpload = isImage ? await compressImage(file) : file;
      const formData = new FormData();
      formData.append("file", toUpload);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setMedia({
        url: data.url,
        mimeType: data.mimeType,
        kind: isImage ? "photo" : "voice",
        name: file.name,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!message.trim() && !media) {
      setError("Please describe the issue or attach a photo/audio recording.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText: message,
          submitterName: name,
          submitterContact: contact,
          constituencyNumber: "Chikballapur",
          language: language === "Auto-detect" ? undefined : language,
          locationHint,
          mediaUrl: media?.url,
          mediaKind: media?.kind,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submission failed");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setName("");
    setContact("");
    setMessage("");
    setLanguage("Auto-detect");
    setLocationHint("");
    setMedia(null);
    setResult(null);
    setError(null);
  };

  if (result) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-6 px-6 py-16">
        <div className="w-full rounded-2xl bg-bg-elevated p-8 text-center shadow-[var(--shadow-elevated)]">
          <p className="text-sm font-medium uppercase tracking-widest text-accent">
            Submitted
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-text-primary">
            Thank you.
          </h1>
          <p className="mt-3 text-text-secondary">
            Your tracking ID is
          </p>
          <p className="mt-1 select-all rounded-lg bg-bg-secondary px-4 py-2 font-mono text-lg text-text-primary">
            {result.trackingId}
          </p>
          <div className="mt-6 space-y-2 rounded-lg border border-[var(--border)] p-4 text-left text-sm text-text-secondary">
            <p>
              <span className="text-text-primary">Issue:</span> {result.extraction.issueTheme}
            </p>
            <p>
              <span className="text-text-primary">Sector:</span> {result.extraction.sector}
            </p>
            <p>
              <span className="text-text-primary">Area:</span> {result.theme.locationName}
            </p>
            <p>
              <span className="text-text-primary">Summary:</span> {result.extraction.summary}
            </p>
          </div>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={resetForm}
              className="w-full rounded-full bg-accent px-6 py-2.5 font-medium text-accent-foreground transition-opacity hover:opacity-90 sm:w-auto"
            >
              Submit another
            </button>
            <Link
              href="/"
              className="w-full rounded-full border border-[var(--border)] px-6 py-2.5 font-medium text-text-primary transition-colors hover:bg-bg-secondary sm:w-auto"
            >
              Back to home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-6 py-16">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-text-primary">
          Report a civic need
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Tell us what needs attention in your area — in any language, by text, photo, or voice.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-2xl bg-bg-elevated p-6 shadow-[var(--shadow-elevated)] sm:p-8"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm text-text-secondary" htmlFor="name">
              Full name <span className="text-text-secondary/60">(optional)</span>
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-bg-primary px-3 py-2 text-text-primary outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-sm text-text-secondary" htmlFor="contact">
              Phone or email <span className="text-text-secondary/60">(optional)</span>
            </label>
            <input
              id="contact"
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-bg-primary px-3 py-2 text-text-primary outline-none focus:border-accent"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm text-text-secondary" htmlFor="constituency">
              Constituency
            </label>
            <select
              id="constituency"
              value="Chikballapur"
              disabled
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-bg-secondary px-3 py-2 text-text-primary"
            >
              <option>Chikballapur</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-text-secondary" htmlFor="location">
              Area <span className="text-text-secondary/60">(optional)</span>
            </label>
            <select
              id="location"
              value={locationHint}
              onChange={(e) => setLocationHint(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-bg-primary px-3 py-2 text-text-primary outline-none focus:border-accent"
            >
              <option value="">Not sure — let us figure it out</option>
              {KNOWN_BLOCK_NAMES.map((block) => (
                <option key={block} value={block}>
                  {block}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm text-text-secondary" htmlFor="message">
            Describe the issue
          </label>
          <textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder="e.g. The drain near the market has been overflowing every monsoon for two years..."
            className="mt-1 w-full resize-none rounded-lg border border-[var(--border)] bg-bg-primary px-3 py-2 text-text-primary outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="block text-sm text-text-secondary" htmlFor="language">
            Language <span className="text-text-secondary/60">(optional)</span>
          </label>
          <select
            id="language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-bg-primary px-3 py-2 text-text-primary outline-none focus:border-accent"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="block text-sm text-text-secondary">
            Attach a photo or voice recording <span className="text-text-secondary/60">(optional)</span>
          </span>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`mt-1 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm transition-colors ${
              dragActive
                ? "border-accent bg-bg-secondary"
                : "border-[var(--border)] text-text-secondary hover:bg-bg-secondary"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,audio/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            {uploading ? (
              <span>Uploading…</span>
            ) : media ? (
              <div className="flex w-full flex-col items-center gap-2">
                {media.kind === "photo" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={media.url}
                    alt="Attached preview"
                    className="max-h-40 rounded-md object-contain"
                  />
                ) : (
                  <audio controls src={media.url} className="w-full" />
                )}
                <span className="text-xs">{media.name}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMedia(null);
                  }}
                  className="text-xs text-accent underline"
                >
                  Remove
                </button>
              </div>
            ) : (
              <>
                <span>Drag & drop a photo or audio file, or click to browse</span>
                <span className="text-xs text-text-secondary/70">Max 3MB</span>
              </>
            )}
          </div>
        </div>

        {error && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting || uploading}
          className="w-full rounded-full bg-accent px-6 py-3 font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit"}
        </button>
      </form>
    </main>
  );
}
