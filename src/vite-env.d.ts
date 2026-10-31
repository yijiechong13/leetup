/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LLM_API_KEY?: string
  readonly VITE_LLM_API_URL?: string
  readonly VITE_LLM_MODEL?: string
  /** 'true' turns on the LLM provider; anything else keeps the scripted one. */
  readonly VITE_USE_LLM?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
