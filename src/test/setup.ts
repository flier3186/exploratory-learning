import { vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

// Mock localStorage
const store: Record<string, string> = {}
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value }),
  removeItem: vi.fn((key: string) => { delete store[key] }),
  clear: vi.fn(() => { for (const key of Object.keys(store)) delete store[key] }),
  get length() { return Object.keys(store).length },
  key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
}
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Mock crypto.randomUUID
Object.defineProperty(globalThis, 'crypto', {
  value: {
    randomUUID: vi.fn(() => 'test-uuid-' + Math.random().toString(36).slice(2)),
    random: new Uint8Array(16),
  },
})

// Mock speechSynthesis
Object.defineProperty(window, 'speechSynthesis', {
  value: {
    speak: vi.fn(),
    cancel: vi.fn(),
    getVoices: vi.fn(() => []),
  },
})

// Mock fetch
globalThis.fetch = vi.fn()
