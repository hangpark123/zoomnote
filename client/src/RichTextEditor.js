import React, { useEffect, useMemo, useRef } from "react";
import Quill from "quill";
import "quill/dist/quill.snow.css";
import BlotFormatter from "quill-blot-formatter";

// Register BlotFormatter (Image Resize & Align)
Quill.register("modules/blotFormatter", BlotFormatter);

let registerPromise = null;

function ensureQuillRegistered() {
  if (registerPromise) return registerPromise;

  registerPromise = (async () => {
    try {
      const SizeStyle = Quill.import("attributors/style/size");
      SizeStyle.whitelist = ["8px", "10px", "12px", "14px", "16px", "18px", "20px", "22px", "24px", "28px", "32px", "36px", "48px"];
      Quill.register(SizeStyle, true);

      const AlignStyle = Quill.import("attributors/style/align");
      Quill.register(AlignStyle, true);

      // BlotFormatter is already registered synchronously above
    } catch (e) {
      // ignore
    }

    if (typeof window !== "undefined") {
      window.Quill = Quill;
    }

    return { imageResizeAvailable: true };
  })();

  return registerPromise;
}

function tryApplyMarkdownShortcut(quill) {
  const range = quill.getSelection(true);
  if (!range || range.length > 0) return false;

  const [line, offset] = quill.getLine(range.index);
  if (!line) return false;

  const lineStart = range.index - offset;
  const lineText = quill.getText(lineStart, offset);
  if (!lineText) return false;

  const applyLineFormat = (tokenLength, formatName, formatValue) => {
    quill.deleteText(lineStart, tokenLength, "api");
    quill.formatLine(lineStart, 1, formatName, formatValue, "api");
    quill.setSelection(Math.max(lineStart, 0), 0, "silent");
    return true;
  };

  const headingMatch = lineText.match(/^(#{1,6})\s$/);
  if (headingMatch) {
    return applyLineFormat(headingMatch[0].length, "header", headingMatch[1].length);
  }

  if (/^[-*+]\s$/.test(lineText)) {
    return applyLineFormat(lineText.length, "list", "bullet");
  }

  if (/^\d+[.)]\s$/.test(lineText)) {
    return applyLineFormat(lineText.length, "list", "ordered");
  }

  if (/^>\s$/.test(lineText)) {
    return applyLineFormat(lineText.length, "blockquote", true);
  }

  if (/^```$/.test(lineText)) {
    return applyLineFormat(lineText.length, "code-block", true);
  }

  return false;
}

function tryApplyInlineMarkdownShortcut(quill) {
  const range = quill.getSelection(true);
  if (!range || range.length > 0) return false;

  const scanStart = Math.max(0, range.index - 300);
  const textBeforeCursor = quill.getText(scanStart, range.index - scanStart);
  if (!textBeforeCursor) return false;

  const applyInline = (match, openLen, closeLen, formatName, formatValue = true) => {
    if (!match) return false;
    const prefix = match[1] || "";
    const inner = match[2] || "";
    if (!inner) return false;

    const markerStart = scanStart + match.index + prefix.length;
    const closeStart = markerStart + openLen + inner.length;

    quill.deleteText(closeStart, closeLen, "api");
    quill.deleteText(markerStart, openLen, "api");
    quill.formatText(markerStart, inner.length, formatName, formatValue, "api");
    quill.setSelection(markerStart + inner.length, 0, "silent");
    return true;
  };

  const codeMatch = textBeforeCursor.match(/(^|[\s([{"'])`([^`\n]+)`$/);
  if (applyInline(codeMatch, 1, 1, "code")) return true;

  const boldMatch = textBeforeCursor.match(/(^|[\s([{"'])\*\*([^*\n]+)\*\*$/);
  if (applyInline(boldMatch, 2, 2, "bold")) return true;

  const italicMatch = textBeforeCursor.match(/(^|[\s([{"'])\*([^*\n]+)\*$/);
  if (applyInline(italicMatch, 1, 1, "italic")) return true;

  return false;
}

export default function RichTextEditor({ value, onChange, placeholder, compact = false }) {
  const mountRef = useRef(null);
  const quillRef = useRef(null);
  const fileInputRef = useRef(null);
  const isSettingValueRef = useRef(false);
  const isApplyingShortcutRef = useRef(false);
  const lastHtmlRef = useRef("");

  const toolbarOptions = useMemo(
    () => [
      [{ size: ["8px", "10px", false, "14px", "16px", "18px", "20px", "22px", "24px", "28px", "32px", "36px", "48px"] }],
      ["bold", "italic", "underline", "strike"],
      [{ color: [] }, { background: [] }],
      [{ align: [] }],
      [{ list: "ordered" }, { list: "bullet" }],
      ["code-block"],
      ["link", "image"],
      ["clean"],
    ],
    []
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureQuillRegistered();
      if (cancelled) return;
      if (!mountRef.current || quillRef.current) return;

      const modules = {
        toolbar: {
          container: toolbarOptions,
          handlers: {
            image: () => fileInputRef.current?.click(),
          },
        },
        blotFormatter: {} // Enable BlotFormatter
      };

      const quill = new Quill(mountRef.current, {
        theme: "snow",
        placeholder: placeholder || "",
        modules,
      });

      quillRef.current = quill;

      const initialHtml = value || "";
      if (initialHtml) {
        isSettingValueRef.current = true;
        quill.clipboard.dangerouslyPasteHTML(initialHtml);
        isSettingValueRef.current = false;
      }
      lastHtmlRef.current = quill.root.innerHTML;

      const handleTextChange = (...args) => {
        const [delta, , source] = args;
        if (isSettingValueRef.current) return;
        if (source === "user" && !isApplyingShortcutRef.current) {
          const insertedText = (delta?.ops || [])
            .filter((op) => typeof op.insert === "string")
            .map((op) => op.insert)
            .join("");
          if (
            insertedText.includes(" ") ||
            insertedText.includes("\n") ||
            insertedText.includes("`") ||
            insertedText.includes("*")
          ) {
            isApplyingShortcutRef.current = true;
            try {
              const lineApplied = tryApplyMarkdownShortcut(quill);
              if (!lineApplied) {
                tryApplyInlineMarkdownShortcut(quill);
              }
            } finally {
              isApplyingShortcutRef.current = false;
            }
          }
        }
        const html = quill.root.innerHTML;
        lastHtmlRef.current = html;
        onChange?.(html);
      };

      quill.on("text-change", handleTextChange);

      quillRef.current.__cleanup = () => {
        quill.off("text-change", handleTextChange);
      };
    })();

    return () => {
      cancelled = true;
      try {
        if (quillRef.current?.__cleanup) quillRef.current.__cleanup();
      } catch (e) {
        // ignore
      }
      quillRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const quill = quillRef.current;
    if (!quill) return;

    const nextHtml = value || "";
    if (nextHtml === lastHtmlRef.current) return;

    const selection = quill.getSelection();
    isSettingValueRef.current = true;
    quill.clipboard.dangerouslyPasteHTML(nextHtml);
    isSettingValueRef.current = false;
    lastHtmlRef.current = quill.root.innerHTML;

    if (selection) {
      try {
        quill.setSelection(selection);
      } catch (e) {
        // ignore
      }
    }
  }, [value]);

  const handleImagePick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type?.startsWith("image/")) {
      alert("이미지 파일만 첨부할 수 있습니다.");
      e.target.value = "";
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      alert("이미지는 50MB 이하로 첨부해주세요.");
      e.target.value = "";
      return;
    }

    const quill = quillRef.current;
    if (!quill) {
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const range = quill.getSelection(true) || { index: quill.getLength(), length: 0 };
      quill.insertEmbed(range.index, "image", dataUrl, "user");
      quill.setSelection(range.index + 1, 0);
      e.target.value = "";
    };
    reader.onerror = () => {
      alert("이미지 로딩에 실패했습니다.");
      e.target.value = "";
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className={`rte-root${compact ? " rte-compact" : ""}`}>
      <div ref={mountRef} />
      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={handleImagePick}
      />
    </div>
  );
}
