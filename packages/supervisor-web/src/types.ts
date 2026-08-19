/** Release manifest artifact for one platform package. */
export interface SupervisorArtifact {
  /** Node platform identifier for the artifact target. */
  platform: string
  /** Node architecture identifier for the artifact target. */
  arch: string
  /** Package kind, such as dmg, appimage, deb, rpm, msi, or exe. */
  kind: string
  /** File name inside the GitHub Release. */
  file: string
  /** Download URL for this artifact. */
  url: string
  /** Expected lowercase hex SHA-256 digest. */
  sha256: string
  /** Whether the artifact is code-signed. */
  signed: boolean
  /** Whether the artifact is notarized where the platform supports notarization. */
  notarized: boolean
  /** Human install flow identifier consumed by the Web UI. */
  installMode: string
}

/** GitHub Release manifest consumed by the Web companion. */
export interface SupervisorManifest {
  /** Manifest schema version. */
  schema: 1
  /** Stable application identifier. */
  app: 'dsh-desktop-supervisor'
  /** Desktop supervisor version represented by the release. */
  version: string
  /** Release channel label, such as developer. */
  channel: string
  /** Platform artifacts published by this release. */
  artifacts: SupervisorArtifact[]
}

/** Loopback descriptor written by the desktop supervisor. */
export interface SupervisorControlDescriptor {
  /** Descriptor schema version. */
  schema: 1
  /** Stable application identifier. */
  app: 'dsh-desktop-supervisor'
  /** Running desktop supervisor version. */
  version: string
  /** Operating-system process id for the supervisor. */
  pid: number
  /** Loopback base URL for supervisor control routes. */
  url: string
  /** Filesystem path containing the bearer token for mutating supervisor calls. */
  tokenPath: string
  /** Capability labels exposed by the running supervisor. */
  capabilities: string[]
}

/** Web companion download state. */
export type DownloadState =
  | 'idle'
  | 'fetchingManifest'
  | 'downloading'
  | 'verifying'
  | 'ready'
  | 'failed'

/** Current download and verification snapshot. */
export interface DownloadSnapshot {
  /** Current download phase. */
  state: DownloadState
  /** Manifest version associated with the download. */
  version: string | null
  /** Artifact file name associated with the download. */
  artifact: string | null
  /** Local path for the downloaded artifact. */
  path: string | null
  /** Expected SHA-256 for the downloaded artifact. */
  sha256: string | null
  /** Whether the local file digest matched the manifest. */
  verified: boolean
  /** Last download error, if any. */
  error: string | null
}

/** Complete status payload returned to the Settings tab. */
export interface SupervisorStatusSnapshot {
  /** Last fetched release manifest, when available. */
  manifest: SupervisorManifest | null
  /** Artifact selected for the current platform and architecture. */
  selected: SupervisorArtifact | null
  /** Current artifact download status. */
  download: DownloadSnapshot
  /** Local desktop supervisor descriptor, when present and valid. */
  control: SupervisorControlDescriptor | null
  /** Whether the descriptor's loopback health route answered successfully. */
  connected: boolean
  /** Reserved status-level error field for future supervisor probes. */
  error: string | null
}
