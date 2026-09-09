import { describe, expect, it } from 'vitest'
import { authenticatedLoopbackUrl, validProjectRoot } from '../src/harness.ts'

describe('AgentMux Electron Harness bridge', () => {
  it('accepts only one authenticated loopback URL on the desktop port', () => {
    expect(authenticatedLoopbackUrl('http://127.0.0.1:3080/?token=abc_DEF-123'))
      .toBe('http://127.0.0.1:3080/?token=abc_DEF-123')
    expect(authenticatedLoopbackUrl('https://127.0.0.1:3080/?token=abc')).toBeUndefined()
    expect(authenticatedLoopbackUrl('http://localhost:3080/?token=abc')).toBeUndefined()
    expect(authenticatedLoopbackUrl('http://127.0.0.1:3081/?token=abc')).toBeUndefined()
    expect(authenticatedLoopbackUrl('http://127.0.0.1:3080/?token=abc&token=def')).toBeUndefined()
  })

  it('recognizes the built AgentMux repository as a Harness runtime root', () => {
    expect(validProjectRoot(process.cwd())).toBe(true)
  })
})
