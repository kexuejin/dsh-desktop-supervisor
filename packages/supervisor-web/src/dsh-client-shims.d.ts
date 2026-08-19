declare module '@deepseek-ai/dsh-client-locale/client' {}

declare module '@deepseek-ai/dsh-client-ui-settings/client' {}

declare module '@deepseek-ai/dsh-client-runtime/client' {
  export interface ClientContext {
    effect(effect: () => (() => void) | void, label?: string): void
    locale: {
      register(namespace: string, dictionaries: { zh: Record<string, string>; en: Record<string, string> }): () => void
      bind(namespace: string): (key: string) => string
    }
    slots: {
      inject(name: string, effect: () => unknown): unknown
      register(options: unknown, component: unknown): unknown
    }
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  export interface LocaleNamespaceMap {}
  export type PropsRuntime<Name extends string> = { readonly slotName?: Name }
  export type PropsLocale<Namespace extends string> = { readonly localeNamespace?: Namespace; readonly t: (key: string) => string }
  export type InjectFace<Injected> = Injected
}
