"use client";

import { useCallback, useRef, useState } from "react";
import {
  type ChatImage,
  type ChatTextFile,
  fileToChatImage,
  fileToChatTextFile,
  isTextFile,
  IMAGES_UNSUPPORTED_NOTE,
  MAX_IMAGES_PER_MESSAGE,
  MAX_TEXT_FILES_PER_MESSAGE,
} from "@/lib/messages/vision";

export const TEXT_FILE_ACCEPT =
  "text/*,.md,.markdown,.csv,.tsv,.json,.yaml,.yml,.xml,.html,.css,.js,.jsx,.ts,.tsx,.py,.go,.rs,.java,.c,.h,.cpp,.hpp,.cs,.rb,.php,.sh,.sql,.ini,.toml,.env,.log";

export function useImageAttachments(onError: (message: string) => void, allowed: boolean) {
  const [images, setImages] = useState<ChatImage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const countRef = useRef(0);
  countRef.current = images.length;

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (list.length === 0) return;
      if (!allowed) {
        onError(IMAGES_UNSUPPORTED_NOTE);
        return;
      }
      setIsProcessing(true);
      let count = countRef.current;
      for (const file of list) {
        if (count >= MAX_IMAGES_PER_MESSAGE) {
          onError(`You can attach up to ${MAX_IMAGES_PER_MESSAGE} images per message.`);
          break;
        }
        try {
          const image = await fileToChatImage(file);
          count += 1;
          setImages((prev) => (prev.length >= MAX_IMAGES_PER_MESSAGE ? prev : [...prev, image]));
        } catch (error) {
          onError(error instanceof Error ? error.message : "Failed to attach image");
        }
      }
      setIsProcessing(false);
    },
    [onError, allowed],
  );

  const removeImage = useCallback((index: number) => setImages((prev) => prev.filter((_, i) => i !== index)), []);
  const clearImages = useCallback(() => setImages([]), []);

  return { images, isProcessing, addFiles, removeImage, clearImages };
}

export function useTextFileAttachments(onError: (message: string) => void) {
  const [files, setFiles] = useState<ChatTextFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const countRef = useRef(0);
  countRef.current = files.length;

  const addFiles = useCallback(
    async (input: FileList | File[]) => {
      const list = Array.from(input).filter((f) => !f.type.startsWith("image/") && isTextFile(f));
      if (list.length === 0) return;
      setIsProcessing(true);
      let count = countRef.current;
      for (const file of list) {
        if (count >= MAX_TEXT_FILES_PER_MESSAGE) {
          onError(`You can attach up to ${MAX_TEXT_FILES_PER_MESSAGE} files per message.`);
          break;
        }
        try {
          const chatFile = await fileToChatTextFile(file);
          count += 1;
          setFiles((prev) => (prev.length >= MAX_TEXT_FILES_PER_MESSAGE ? prev : [...prev, chatFile]));
        } catch (error) {
          onError(error instanceof Error ? error.message : "Failed to attach file");
        }
      }
      setIsProcessing(false);
    },
    [onError],
  );

  const removeFile = useCallback((index: number) => setFiles((prev) => prev.filter((_, i) => i !== index)), []);
  const clearFiles = useCallback(() => setFiles([]), []);

  return { files, isProcessing, addFiles, removeFile, clearFiles };
}

export function useFileDrop(onFiles: (files: FileList | File[]) => void) {
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);
  const isFileDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

  const onDragEnter = useCallback((e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  }, []);
  const onDragOver = useCallback((e: React.DragEvent) => {
    if (isFileDrag(e)) e.preventDefault();
  }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragging(false);
  }, []);
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) onFiles(e.dataTransfer.files);
    },
    [onFiles],
  );

  return { isDragging, dropHandlers: { onDragEnter, onDragOver, onDragLeave, onDrop } };
}
