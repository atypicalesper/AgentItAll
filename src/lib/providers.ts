import { createAnthropic } from "@ai-sdk/anthropic";
import { createGroq } from "@ai-sdk/groq";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export type ProviderKey = "anthropic" | "groq" | "google" | "openai";

export interface ProviderMeta {
  label: string;
  free: boolean;
  models: string[];
  keyPlaceholder: string;
  keyLabel: string;
}

export const PROVIDERS: Record<ProviderKey, ProviderMeta> = {
  anthropic: {
    label: "Anthropic (Claude)",
    free: false,
    models: ["claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-6"],
    keyPlaceholder: "sk-ant-...",
    keyLabel: "Anthropic API Key",
  },
  groq: {
    label: "Groq — Free",
    free: true,
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768", "gemma2-9b-it"],
    keyPlaceholder: "gsk_...",
    keyLabel: "Groq API Key (free at console.groq.com)",
  },
  google: {
    label: "Google Gemini — Free tier",
    free: true,
    models: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
    keyPlaceholder: "AIza...",
    keyLabel: "Gemini API Key (free at aistudio.google.com)",
  },
  openai: {
    label: "OpenAI",
    free: false,
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
    keyPlaceholder: "sk-...",
    keyLabel: "OpenAI API Key",
  },
};

export function getModel(provider: ProviderKey, model: string, apiKey: string): LanguageModel {
  switch (provider) {
    case "anthropic":
      return createAnthropic({ apiKey })(model);
    case "groq":
      return createGroq({ apiKey })(model);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(model);
    case "openai":
      return createOpenAI({ apiKey })(model);
  }
}
