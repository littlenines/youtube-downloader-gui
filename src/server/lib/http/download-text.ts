export const REQUEST_TIMEOUT_MILLISECONDS = 30_000

export const downloadText = async (url: string): Promise<string> => {
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS) })

  if (!response.ok) {
    throw new Error(`Downloading ${url} failed (HTTP ${response.status}). Check the internet connection.`)
  }

  return response.text()
}
