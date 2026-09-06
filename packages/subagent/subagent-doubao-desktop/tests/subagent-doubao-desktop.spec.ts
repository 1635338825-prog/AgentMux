import { describe, expect, it } from 'vitest'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import {
  fillPromptExpression,
  inputReadyExpression,
  lastMessageExpression,
  selectDoubaoTarget,
} from '../src/cdp.ts'
import { textTask } from '../src/index.ts'

describe('subagent-doubao-desktop', () => {
  it('selects only a live Doubao chat renderer', () => {
    const selected = selectDoubaoTarget([
      { id: 'other', type: 'page', url: 'https://example.com', webSocketDebuggerUrl: 'ws://other' },
      { id: 'web', type: 'page', url: 'https://www.doubao.com/chat/123', webSocketDebuggerUrl: 'ws://web' },
      { id: 'desktop', type: 'page', url: 'doubao://doubao-chat/chat', webSocketDebuggerUrl: 'ws://desktop' },
    ])
    expect(selected.id).toBe('desktop')
    expect(() => selectDoubaoTarget([
      { id: 'other', type: 'page', url: 'https://example.com', webSocketDebuggerUrl: 'ws://other' },
    ])).toThrow('no chat page')
  })

  it('keeps prompts JSON-quoted in the page expression', () => {
    const prompt = 'line one\n`quoted` ${notCode}'
    const expression = fillPromptExpression(prompt)
    expect(expression).toContain(JSON.stringify(prompt))
    expect(expression).toContain('InputEvent')
    expect(inputReadyExpression()).toContain('contenteditable')
    expect(lastMessageExpression()).toContain('receive_message')
    expect(lastMessageExpression()).toContain('data-streaming')
    expect(lastMessageExpression()).toContain('.v_list_row')
  })

  it('accepts only non-empty text tasks', () => {
    expect(textTask([{ type: 'text', text: 'review' }])).toBe('review')
    expect(() => textTask([])).toThrow('only text blocks')
    expect(() => textTask([{ type: 'text', text: '   ' }])).toThrow('must not be empty')
    expect(() => textTask([{ type: 'image', mimeType: 'image/png', data: 'AA==' } as unknown as ContentBlock]))
      .toThrow('only text blocks')
  })
})
