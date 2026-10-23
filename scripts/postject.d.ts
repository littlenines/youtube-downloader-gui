declare module 'postject' {
  interface InjectOptions {
    sentinelFuse?: string
    machoSegmentName?: string
    overwrite?: boolean
  }

  const postject: {
    inject(filename: string, resourceName: string, resourceData: Buffer, options?: InjectOptions): Promise<void>
  }

  export default postject
}
