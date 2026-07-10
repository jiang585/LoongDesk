import type { Persistence } from '../../domain/ports'
import { isTauri } from '../platform'
import { SqlitePersistence } from './sqlitePersistence'
import { WebPersistence } from './webPersistence'

let instance: Persistence | null = null

export async function getPersistence(): Promise<Persistence> {
  if (instance) return instance
  instance = isTauri() ? new SqlitePersistence() : new WebPersistence()
  await instance.init()
  return instance
}

