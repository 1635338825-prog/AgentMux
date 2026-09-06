import { describe, expect, it } from 'vitest'
import { newerVersion, resolveUpdateArtifact, supportedUpdateUrl } from '../src/update.ts'

describe('desktop update policy', () => {
  it('compares strict stable semantic versions', () => {
    expect(newerVersion('0.1.3', '0.1.2')).toBe(true)
    expect(newerVersion('0.2.0', '0.1.9')).toBe(true)
    expect(newerVersion('1.0.0', '0.9.9')).toBe(true)
    expect(newerVersion('0.1.2', '0.1.2')).toBe(false)
    expect(newerVersion('0.1.1', '0.1.2')).toBe(false)
    expect(newerVersion('0.1.3-rc.1', '0.1.2')).toBe(false)
  })

  it('accepts HTTPS and loopback HTTP only', () => {
    expect(supportedUpdateUrl(new URL('https://updates.example.com/latest.json'))).toBe(true)
    expect(supportedUpdateUrl(new URL('http://127.0.0.1:8080/latest.json'))).toBe(true)
    expect(supportedUpdateUrl(new URL('http://localhost:8080/latest.json'))).toBe(true)
    expect(supportedUpdateUrl(new URL('http://updates.example.com/latest.json'))).toBe(false)
    expect(supportedUpdateUrl(new URL('file:///tmp/latest.json'))).toBe(false)
  })

  it('keeps update artifacts on the manifest origin', () => {
    expect(resolveUpdateArtifact('https://updates.example.com/releases/latest.json', 'AgentMux-Setup.exe')?.href)
      .toBe('https://updates.example.com/releases/AgentMux-Setup.exe')
    expect(resolveUpdateArtifact('https://updates.example.com/latest.json', 'https://other.example.com/setup.exe'))
      .toBeUndefined()
  })
})
