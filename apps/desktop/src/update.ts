/** Pure update-policy helpers shared by the desktop launcher and its tests. */

/** Only HTTPS and loopback HTTP are valid update transports. */
export function supportedUpdateUrl(url: URL): boolean {
  return url.protocol === 'https:'
    || (url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost'))
}

/** Resolve one same-origin artifact URL under the manifest's transport policy. */
export function resolveUpdateArtifact(manifestUrl: string, artifact: string): URL | undefined {
  const manifest = new URL(manifestUrl)
  const candidate = new URL(artifact, manifest)
  return supportedUpdateUrl(candidate) && candidate.origin === manifest.origin ? candidate : undefined
}

/** Strict stable-semver comparison used by the unsigned launcher manifest. */
export function newerVersion(candidate: string, current: string): boolean {
  const parse = (value: string): number[] | undefined => {
    const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(value)
    return match === null ? undefined : match.slice(1).map(Number)
  }
  const left = parse(candidate)
  const right = parse(current)
  if (left === undefined || right === undefined) return false
  for (let index = 0; index < left.length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference !== 0) return difference > 0
  }
  return false
}
