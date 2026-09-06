import { describe, expect, it } from 'vitest'
import { parseBailianAnswer, textTask } from '../src/index.ts'

describe('Qwen Bailian provider helpers', () => {
  it('preserves a text-only delegated brief', () => {
    expect(textTask([{ type: 'text', text: '请复核' }, { type: 'text', text: '这个结论' }])).toBe('请复核这个结论')
  })

  it('extracts the assistant content from Bailian JSON output', () => {
    expect(parseBailianAnswer(JSON.stringify({
      choices: [{ message: { content: '千问完成复核' } }],
    }))).toBe('千问完成复核')
  })

  it('rejects malformed or empty CLI output', () => {
    expect(() => parseBailianAnswer('not-json')).toThrow('invalid JSON')
    expect(() => parseBailianAnswer('{"choices":[]}')).toThrow('no assistant text')
  })
})
