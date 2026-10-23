const REQUEST_TIMEOUT_MILLISECONDS = 30_000

export const downloadText = async (url: string): Promise<string> => {
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS) })

  if (!response.ok) {
    throw new Error(`Downloading ${url} failed (HTTP ${response.status}). Check the internet connection.`)
  }

  return response.text()
}

export const releaseTagFromLocation = (location: string | null): string | null => {
  const tag = /\/releases\/tag\/([^/?#]+)$/.exec(location ?? '')?.[1]

  return tag ? decodeURIComponent(tag) : null
}

export const latestReleaseTag = async (repository: string): Promise<string> => {
  const response = await fetch(`https://github.com/${repository}/releases/latest`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
  })
  const tag = releaseTagFromLocation(response.headers.get('location'))

  if (!tag) throw new Error(`Could not find the latest ${repository} release. Check the internet connection.`)

  return tag
}

export const releaseDownloadUrl = (repository: string, tag: string): string =>
  `https://github.com/${repository}/releases/download/${tag}`
