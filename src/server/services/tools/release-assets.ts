export type FfmpegTool = 'ffmpeg' | 'ffprobe'

export const FFMPEG_RELEASE_URL = 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1'

const FFMPEG_SHA256_BY_ASSET: Record<string, string> = {
  'ffmpeg-win32-x64': '8883a3dffbd0a16cf4ef95206ea05283f78908dbfb118f73c83f4951dcc06d77',
  'ffprobe-win32-x64': 'f309e6223ad89d2fe54bccd420a7709b66fd27540674e92309578ed491a43c8d',
  'ffmpeg-linux-x64': 'bfe8a8fc511530457b528c48d77b5737527b504a3797a9bc4866aeca69c2dffa',
  'ffprobe-linux-x64': '25d9b6ccb05e3d9de9e04e31e2506d8dd7f9f0418981965ac6df12e8d3afd067',
  'ffmpeg-linux-arm64': '754a678672298bc68156adff58aa7385a592c2b30b1d0ae8750c45c915c4bac0',
  'ffprobe-linux-arm64': '2ab6aba60ee84412dff9188720703376cb4e7aaf7e0b5e43aa8249f2acae5bf8',
  'ffmpeg-darwin-x64': '929b375c1182d956c51f7ac25e0b2b0411fb01f6f407aa15c9758efeb4242106',
  'ffprobe-darwin-x64': 'd4da574d6e2e197bd259b47d69cf262df9e312af24ad960444f6d806d3d4c186',
  'ffmpeg-darwin-arm64': '8923876afa8db5585022d7860ec7e589af192f441c56793971276d450ed3bbfa',
  'ffprobe-darwin-arm64': 'd986a8ec7b030899fe66a8a288ed809a3543338705a3ce178cfb85869c5d80be',
}

export const ytdlpReleaseAsset = (): string => {
  const { platform, arch } = process

  if (platform === 'win32') {
    if (arch === 'arm64') return 'yt-dlp_win_arm64.zip'

    return arch === 'ia32' ? 'yt-dlp_win_x86.zip' : 'yt-dlp_win.zip'
  }

  if (platform === 'darwin') return 'yt-dlp_macos.zip'

  if (platform === 'linux') {
    if (arch === 'arm64') return 'yt-dlp_linux_aarch64.zip'

    return arch === 'arm' ? 'yt-dlp_linux_armv7l.zip' : 'yt-dlp_linux.zip'
  }

  throw new Error(`No yt-dlp build for ${platform}.`)
}

export const ffmpegReleaseAsset = (tool: FfmpegTool): { assetName: string; sha256: string } => {
  const assetKey = `${tool}-${process.platform}-${process.arch}`
  const sha256 = FFMPEG_SHA256_BY_ASSET[assetKey]

  if (!sha256) throw new Error(`No ffmpeg build for ${process.platform}/${process.arch}.`)

  return { assetName: `${assetKey}.gz`, sha256 }
}

export const denoReleaseAsset = (): string => {
  const processor = process.arch === 'arm64' ? 'aarch64' : 'x86_64'

  if (process.platform === 'win32') return `deno-${processor}-pc-windows-msvc.zip`
  if (process.platform === 'darwin') return `deno-${processor}-apple-darwin.zip`

  return `deno-${processor}-unknown-linux-gnu.zip`
}
