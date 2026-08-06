"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DISEASE_IMAGE_ACCEPT, diseaseFileSignature, formatFileSize, validateDiseaseFiles } from "./disease-files";

export function DiseaseImageInput({ disabled, onSelectionChange }: { disabled?: boolean; onSelectionChange: (selection: { file: File; signature: string } | null) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>();
  const [error, setError] = useState<string>();
  const previewRef = useRef<string | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);

  function select(files: readonly File[]) {
    const result = validateDiseaseFiles(files);
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = undefined;
    setPreview(undefined);
    setFile(result.file);
    setError(result.error ?? undefined);
    if (result.file) {
      const url = URL.createObjectURL(result.file);
      previewRef.current = url;
      setPreview(url);
      onSelectionChange({ file: result.file, signature: diseaseFileSignature(result.file) });
    } else onSelectionChange(null);
  }

  function clear() {
    select([]);
    setError(undefined);
    if (inputRef.current) inputRef.current.value = "";
  }

  return <div className="grid gap-3">
    <div className="rounded-xl border-2 border-dashed border-[var(--border-strong)] bg-[var(--surface-subtle)] p-5 text-center" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (!disabled) select(Array.from(event.dataTransfer.files)); }}>
      <ImagePlus className="mx-auto size-7 text-[var(--evidence-strong)]" aria-hidden="true" />
      <label htmlFor="disease-image" className="mt-2 inline-block cursor-pointer text-sm font-semibold text-[var(--evidence-strong)]">Choose one tomato leaf image</label>
      <input ref={inputRef} id="disease-image" name="disease_image" className="sr-only" type="file" accept={DISEASE_IMAGE_ACCEPT} multiple onChange={(event) => select(Array.from(event.currentTarget.files ?? []))} disabled={disabled} />
      <p className="mt-1 text-xs text-[var(--text-muted)]">Click or drop one JPEG, PNG, or WebP file. Maximum 10 MiB.</p>
    </div>
    {error ? <p role="alert" className="text-sm font-semibold text-[var(--state-destructive-strong)]">{error}</p> : null}
    {file ? <div className="grid gap-3 rounded-xl border border-[var(--border-subtle)] p-3 sm:grid-cols-[7rem_1fr_auto] sm:items-center">
      {preview ? <Image src={preview} alt={`Preview of ${file.name}`} width={112} height={96} unoptimized className="h-24 w-28 rounded-lg object-cover" /> : null}
      <div className="min-w-0 text-sm"><p className="break-all font-semibold">{file.name}</p><p className="text-[var(--text-muted)]">{file.type} · {formatFileSize(file.size)}</p><p className="mt-1 text-xs text-[var(--text-muted)]">Selected locally; not submitted yet.</p></div>
      <Button type="button" variant="secondary" size="sm" onClick={clear} disabled={disabled}><X className="size-4" aria-hidden="true" />Remove</Button>
    </div> : null}
  </div>;
}
