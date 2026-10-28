import type { Server } from 'node:http'

const PORTS_FETCH_REFUSES = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103, 104, 109, 110,
  111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532,
  540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061,
  6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080,
])

const listenOnAnyPort = (server: Server): Promise<number> =>
  new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()

      resolve(typeof address === 'object' && address ? address.port : 0)
    }),
  )

export const listenForFetch = async (server: Server): Promise<string> => {
  let port = await listenOnAnyPort(server)

  while (PORTS_FETCH_REFUSES.has(port)) {
    await new Promise((resolve) => server.close(resolve))
    port = await listenOnAnyPort(server)
  }

  return `http://127.0.0.1:${port}`
}
