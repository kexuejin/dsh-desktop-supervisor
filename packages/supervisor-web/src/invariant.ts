/** Package-owned invariant companion. @module @deepseek-ai/dsh-supervisor-web/invariant */

const PACKAGE_NAME = '@deepseek-ai/dsh-supervisor-web'

interface InvariantRegistry {
  register(name: string, install: InvariantInstaller): () => void
}

interface InvariantContext {
  invariants: InvariantRegistry
}

type InvariantInstaller = () => void

/** Cordis companion plugin name. */
export const name = 'dsh-supervisor-web-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** No runtime invariant: this package owns local installer routes and a Settings contribution. */
const install: InvariantInstaller = () => {}

/** Register this package's invariant companion. */
export const apply = (ctx: InvariantContext): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
