"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { messagesEn } from "@/lib/i18n/messages.en";
import { messagesKo } from "@/lib/i18n/messages.ko";

type Lang = "ko" | "en";

type I18nContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (path: string) => string;
};

const MESSAGES = {
  ko: messagesKo,
  en: messagesEn,
} as const;

const STORAGE_KEY = "ui_lang";

const I18nContext = createContext<I18nContextValue | null>(null);

function getByPath(source: unknown, path: string) {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in acc) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, source);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("ko");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "ko" || stored === "en") {
      setLang(stored);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, lang);
  }, [lang]);

  const t = useMemo(() => {
    const messages = MESSAGES[lang];
    return (path: string) => {
      const value = getByPath(messages, path);
      return typeof value === "string" ? value : path;
    };
  }, [lang]);

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return context;
}

