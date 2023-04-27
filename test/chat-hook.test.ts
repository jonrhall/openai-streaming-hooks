import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let addEventListener;
let streamClose;

// Must be put first in order to ensure the mock is imported by the next set of dependencies
vi.doMock('sse', () => {
  const SSE = vi.fn();
  SSE.prototype.addEventListener = addEventListener = vi.fn();
  SSE.prototype.stream = vi.fn();
  SSE.prototype.close = streamClose = vi.fn();

  return { SSE };
});

// Has to be imported after the SSE mock is defined
import { useChatCompletion, GPT35, GPT4, ChatRole } from '../src';

describe('useChatCompletion Hook', () => {
  let result;

  // Before each test, create a new hook and reset the internal state of the SSE mocks
  beforeEach(() => {
    const hookObj = renderHook(() =>
      useChatCompletion({
        model: GPT35.TURBO,
        apiKey: '12345',
      })
    );
    result = hookObj.result;
    addEventListener.mockClear();
    streamClose.mockClear();
  });

  it('should have 0 messages when first initialized', () => {
    const [messages] = result.current;
    expect(messages).toHaveLength(0);
  });

  it('adds 2 messages to the messages list when 1 message is submitted in the initial query', () => {
    const [, submitQuery] = result.current;
    act(() => {
      submitQuery([
        { content: 'What is the meaning of life?', role: ChatRole.USER },
      ]);
    });
    const [messages] = result.current;
    expect(messages).toHaveLength(2);
  });

  it('adds N+1 messages to the messages list when N messages are submitted in the initial query', () => {
    const [, submitQuery] = result.current;
    act(() => {
      submitQuery([
        {
          content: 'What is the meaning of life, the universe, and everything?',
          role: ChatRole.USER,
        },
        { content: 'How does gravity work?', role: ChatRole.USER },
        { content: 'Explain dark matter to me', role: ChatRole.USER },
      ]);
    });
    const [messages] = result.current;
    expect(messages).toHaveLength(4);
  });

  it("doesn't submit a new query if an existing one is already in progress", () => {
    const [, submitQuery1] = result.current;
    act(() => {
      submitQuery1([
        {
          content: 'What is the meaning of life, the universe, and everything?',
          role: ChatRole.USER,
        },
        { content: 'How does gravity work?', role: ChatRole.USER },
        { content: 'Explain dark matter to me', role: ChatRole.USER },
      ]);
    });
    const [messages1] = result.current;
    expect(messages1).toHaveLength(4);
    const [, submitQuery2] = result.current;
    act(() => {
      submitQuery2([
        { content: 'Tell me a story about funny bunnies', role: ChatRole.USER },
      ]);
    });
    const [messages2] = result.current;
    expect(messages2).toHaveLength(4); // No change
  });

  it('works with GPT4 too', () => {
    const hookObj = renderHook(() =>
      useChatCompletion({
        model: GPT4.BASE,
        apiKey: '12345',
      })
    );
    const [messages] = hookObj.result.current;
    expect(messages).toHaveLength(0);
  });

  describe('Resetting the Messages List', () => {
    // Before each test, populate the messages queue with a completed query so that it can be
    // erased by the test.
    beforeEach(() => {
      const [, submitQuery] = result.current;
      act(() => {
        submitQuery([
          { content: 'What is the meaning of life?', role: ChatRole.USER },
        ]);
      });
      const handleStateChangeFn = addEventListener.mock.calls[1][1];
      act(() => {
        handleStateChangeFn({ readyState: 2 });
      });
    });

    it('sets the messages to empty when submitQuery is invoked with no params', () => {
      const [messages1, submitQuery] = result.current;
      expect(messages1).toHaveLength(2);
      act(() => {
        submitQuery();
      });
      const [messages2] = result.current;
      expect(messages2).toHaveLength(0);
    });

    it('sets the messages to empty when submitQuery is invoked with an empty list', () => {
      const [messages1, submitQuery] = result.current;
      expect(messages1).toHaveLength(2);
      act(() => {
        submitQuery([]);
      });
      const [messages2] = result.current;
      expect(messages2).toHaveLength(0);
    });
  });

  describe('Event Handlers', () => {
    describe('Handling Incoming Messages', () => {
      let handleMessageFn;

      beforeEach(() => {
        const [, submitQuery] = result.current;
        act(() => {
          submitQuery([
            { content: 'What is the meaning of life?', role: ChatRole.USER },
          ]);
        });
        handleMessageFn = addEventListener.mock.calls[0][1];
      });

      it('can handle when the role chunk comes in', () => {
        act(() => {
          handleMessageFn({
            data: JSON.stringify({
              choices: [
                {
                  delta: {
                    content: '',
                    role: ChatRole.ASSISTANT,
                  },
                },
              ],
            }),
          });
        });
        const [messages] = result.current;
        expect(messages[1].role).toEqual(ChatRole.ASSISTANT);
      });

      it('can handle when a content chunk comes in', () => {
        act(() => {
          handleMessageFn({
            data: JSON.stringify({
              choices: [
                {
                  delta: {
                    content: 'The',
                    role: '',
                  },
                },
              ],
            }),
          });
        });
        const [messages] = result.current;
        expect(messages[1].content).toEqual('The');
      });

      it('can handle a chunk with no data', () => {
        act(() => {
          handleMessageFn({});
        });
        const [messages] = result.current;
        expect(messages[1].content).toEqual('');
        expect(messages[1].role).toEqual('');
      });

      it('can handle a chunk with badly encoded data', () => {
        act(() => {
          handleMessageFn({ data: '{ foo ' });
        });
        const [messages] = result.current;
        expect(messages[1].content).toEqual('');
        expect(messages[1].role).toEqual('');
      });

      it('can handle when the stream is marked DONE', () => {
        act(() => {
          handleMessageFn({ data: '[DONE]' });
        });
        expect(streamClose).toBeCalledTimes(1);
      });
    });

    describe('Handling Stream State Changes', () => {
      let handleStateChangeFn;

      beforeEach(() => {
        const [, submitQuery] = result.current;
        act(() => {
          submitQuery([
            { content: 'What is the meaning of life?', role: ChatRole.USER },
          ]);
        });
        handleStateChangeFn = addEventListener.mock.calls[1][1];
      });

      it('sets the loading state on the last message to false when the stream has finished', () => {
        const [messages1] = result.current;
        expect(messages1[1].meta.loading).toEqual(true);
        act(() => {
          handleStateChangeFn({ readyState: 2 });
        });
        const [messages2] = result.current;
        expect(messages2[1].meta.loading).toEqual(false);
      });

      it('adds a total response time to the last message when the stream has finished', () => {
        const [messages1] = result.current;
        expect(messages1[1].meta.responseTime === '').toEqual(true);
        act(() => {
          handleStateChangeFn({ readyState: 2 });
        });
        const [messages2] = result.current;
        expect(messages2[1].meta.responseTime === '').toEqual(false);
      });

      it("ignores state changes that aren't related to the stream finishing", () => {
        const [messages1] = result.current;
        expect(messages1[1].meta.loading).toEqual(true);
        act(() => {
          handleStateChangeFn({ readyState: 1 });
        });
        const [messages2] = result.current;
        expect(messages2[1].meta.loading).toEqual(true);
      });
    });
  });
});
