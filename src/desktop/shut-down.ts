import type { Server } from 'node:http'
import { ignoreFailure } from '@server/lib/ignore-failure.js'
import type { Services } from '@server/server.js'

export const stopServing = async (server: Server, { queue }: Services): Promise<void> => {
  server.close()
  await queue.pauseForShutdown().catch(ignoreFailure)
}
