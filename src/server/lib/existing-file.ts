import { existsSync, statSync } from 'node:fs'

export const isExistingFile = (path: string): boolean => existsSync(path) && statSync(path).isFile()
