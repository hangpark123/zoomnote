import React, { useEffect, useMemo, useRef } from "react";
import Quill from "quill";
import "quill/dist/quill.snow.css";

let registerPromise = null;
let imageResizeAvailable = false;

function ensureQuillRegistered() {
  if (registerPromise) return registerPromise;

  registerPromise = (async () => {
    try {
      const SizeStyle = Quill.import("attributors/style/size");
      SizeStyle.whitelist = ["8px", "10px", "12px", "14px", "16px", "18px", "20px", "22px", "24px", "28px", "32px", "36px", "48px"];
      Quill.register(SizeStyle, true);

      const AlignStyle = Quill.import("attributors/style/align");
      Quill.register(AlignStyle, true);
    } catch (e) {
      // ignore (hot-reload / duplicate register)
    }

    imageResizeAvailable = false;
    try {
      if (typeof window !== "undefined") {
        window.Quill = Quill;
        if (!window.Quill.imports) window.Quill.imports = {};
        if (!window.Quill.imports.parchment) {
          try {
            window.Quill.imports.parchment = Quill.import("parchment");
          } catch (e) {
            // ignore
          }
        }
        if (!window.Quill.find && typeof Quill.find === "function") {
          window.Quill.find = Quill.find.bind(Quill);
        }
      }

      const mod = await import("quill-image-resize-module");
      const ImageResize = mod?.default || mod?.ImageResize || mod;
      if (ImageResize) {
        Quill.register("modules/imageResize", ImageResize);
        imageResizeAvailable = true;
      }
    } catch (e) {
      imageResizeAvailable = false;
    }

    return { imageResizeAvailable };
  })();

  return registerPromise;
}

export default function RichTextEditor({ value, onChange, placeholder }) {
  const mountRef = useRef(null);
  const quillRef = useRef(null);
  const fileInputRef = useRef(null);
  const isSettingValueRef = useRef(false);
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
      const { imageResizeAvailable: canResize } = await ensureQuillRegistered();
      if (cancelled) return;
      if (!mountRef.current || quillRef.current) return;

      const modules = {
        toolbar: {
          container: toolbarOptions,
          handlers: {
            image: () => fileInputRef.current?.click(),
          },
        },
      };
      if (canResize) {
        modules.imageResize = {
          parchment: Quill.import("parchment"),
        };
      }

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

      const handleTextChange = () => {
        if (isSettingValueRef.current) return;
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
    <div className="rte-root">
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