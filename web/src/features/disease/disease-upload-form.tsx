"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DISEASE_IMAGE_ACCEPT,
  formatFileSize,
  MAX_DISEASE_IMAGE_BYTES,
  validateDiseaseImageFiles,
} from "./disease-validation";

export function DiseaseUploadForm({
  disabled,
  onSubmit,
  pending,
  resetKey,
}: {
  disabled: boolean;
  onSubmit: (file: File) => void;
  pending: boolean;
  resetKey?: string | null;
}) {
  const fileInputId = useId();
  const errorId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => revokePreviewUrl();
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setFile(null);
      setError(null);
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
      setPreviewUrl(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [resetKey]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.currentTarget.files ?? []);
    const result = validateDiseaseImageFiles(selected);
    setFile(result.file);
    setError(result.error);
    replacePreviewUrl(result.file);
  }

  function removeFile() {
    clearSelection();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateDiseaseImageFiles(file ? [file] : []);
    setError(result.error);
    if (result.file) {
      onSubmit(result.file);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <div className="grid gap-2">
        <label className="text-sm font-medium" htmlFor={fileInputId}>
          Tomato leaf image
        </label>
        <input
          accept={DISEASE_IMAGE_ACCEPT}
          aria-describedby={error ? errorId : undefined}
          className="min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
          disabled={disabled || pending}
          id={fileInputId}
          ref={inputRef}
          name="disease_image"
          onChange={handleFileChange}
          type="file"
        />
        <p className="text-sm text-[var(--color-muted)]">
          JPEG, PNG, or WebP. Maximum {formatFileSize(MAX_DISEASE_IMAGE_BYTES)}.
        </p>
        {error ? (
          <p className="text-sm font-medium text-[var(--color-danger)]" id={errorId}>
            {error}
          </p>
        ) : null}
      </div>

      {file ? (
        <div className="grid gap-3 rounded-md border border-[var(--color-border)] p-3">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0 break-words text-sm">
              <span className="font-medium">{file.name}</span>{" "}
              <span className="text-[var(--color-muted)]">
                {formatFileSize(file.size)}
              </span>
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={removeFile}
              disabled={pending}
            >
              Remove image
            </Button>
          </div>
          {previewUrl ? (
            <Image
              alt={`Preview of ${file.name}`}
              className="max-h-72 w-full rounded-md object-contain"
              height={288}
              src={previewUrl}
              unoptimized
              width={512}
            />
          ) : null}
        </div>
      ) : null}

      <Button type="submit" disabled={disabled || pending || !file}>
        {pending ? "Submitting disease evidence" : "Submit disease evidence"}
      </Button>
    </form>
  );

  function replacePreviewUrl(nextFile: File | null) {
    revokePreviewUrl();
    if (!nextFile) {
      setPreviewUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(nextFile);
    previewUrlRef.current = nextUrl;
    setPreviewUrl(nextUrl);
  }

  function revokePreviewUrl() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }

  function clearSelection() {
    setFile(null);
    setError(null);
    replacePreviewUrl(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }
}
