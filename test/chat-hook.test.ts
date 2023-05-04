import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatCompletion } from '../src/chat-hook';

// This has to be hoisted because the mock for the chat stream handler is automatically, and we
// need somewhere outside of the mock to store state.
const mocks = vi.hoisted(() => ({
  getOpenAiRequestOptions: vi.fn(),
  openAiStreamingDataHandler: vi
    .fn()
    .mockImplementation(() => new Promise(vi.fn())),
}));

vi.mock('../src/chat-stream-handler', () => ({
  getOpenAiRequestOptions: mocks.getOpenAiRequestOptions,
  openAiStreamingDataHandler: mocks.openAiStreamingDataHandler,
}));

describe('useChatCompletion Hook', () => {
  let result;

  // Before each test, create a new hook and reset the chat stream handler mocks
  beforeEach(() => {
    const hookObj = renderHook(() =>
      useChatCompletion({
        model: 'gpt-3.5-turbo',
        apiKey: '12345',
      })
    );
    result = hookObj.result;
    mocks.getOpenAiRequestOptions.mockClear();
    mocks.openAiStreamingDataHandler.mockClear();
  });

  it('should have 0 messages when first initialized', () => {
    const [messages] = result.current;
    expect(messages).toHaveLength(0);
  });

  it('adds 2 messages to the messages list when 1 message is submitted in the initial query', () => {
    const [, submitQuery] = result.current;
    act(() => {
      submitQuery([{ content: 'What is the meaning of life?', role: 'user' }]);
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
          role: 'user',
        },
        { content: 'How does gravity work?', role: 'user' },
        { content: 'Explain dark matter to me', role: 'user' },
      ]);
    });
    const [messages] = result.current;
    expect(messages).toHaveLength(4);
  });

  it('sets the content of the last message to empty before loading results', () => {
    const [, submitQuery] = result.current;
    act(() => {
      submitQuery([{ content: 'What is the meaning of life?', role: 'user' }]);
    });
    const [messages] = result.current;
    expect(messages[1].content).toEqual('');
  });

  it('sets the role of the last message to empty before loading results', () => {
    const [, submitQuery] = result.current;
    act(() => {
      submitQuery([{ content: 'What is the meaning of life?', role: 'user' }]);
    });
    const [messages] = result.current;
    expect(messages[1].role).toEqual('');
  });

  it('sets the timestamp of the last message to 0 before loading results', () => {
    const [, submitQuery] = result.current;
    act(() => {
      submitQuery([{ content: 'What is the meaning of life?', role: 'user' }]);
    });
    const [messages] = result.current;
    expect(messages[1].timestamp).toEqual(0);
  });

  it('sets the loading state of the last message to true before loading results', () => {
    const [, submitQuery] = result.current;
    act(() => {
      submitQuery([{ content: 'What is the meaning of life?', role: 'user' }]);
    });
    const [messages] = result.current;
    expect(messages[1].meta.loading).toEqual(true);
  });

  it("doesn't submit a new query if an existing one is already in progress", () => {
    const [, submitQuery1] = result.current;
    act(() => {
      submitQuery1([
        {
          content: 'What is the meaning of life, the universe, and everything?',
          role: 'user',
        },
        { content: 'How does gravity work?', role: 'user' },
        { content: 'Explain dark matter to me', role: 'user' },
      ]);
    });
    const [messages1] = result.current;
    expect(messages1).toHaveLength(4);
    const [, submitQuery2] = result.current;
    act(() => {
      submitQuery2([
        { content: 'Tell me a story about funny bunnies', role: 'user' },
      ]);
    });
    const [messages2] = result.current;
    expect(messages2).toHaveLength(4); // No change
  });

  it('resets the messages list if submitQuery is invoked with an empty list', () => {
    const [, submitQuery] = result.current;
    act(() => {
      submitQuery([{ content: 'What is the meaning of life?', role: 'user' }]);
      const closeStream = mocks.openAiStreamingDataHandler.mock.calls[0][2];
      closeStream(1683182283592);
      submitQuery([]);
    });
    const [messages] = result.current;
    expect(messages).toHaveLength(0);
  });

  it('works with GPT4 too', () => {
    const hookObj = renderHook(() =>
      useChatCompletion({
        model: 'gpt-4',
        apiKey: '12345',
      })
    );
    const [messages] = hookObj.result.current;
    expect(messages).toHaveLength(0);
  });

  describe('Handling stream events', () => {
    const response = 'This is a response';
    const role = 'user';
    let handleNewData;
    let closeStream;

    beforeEach(() => {
      const [, submitQuery] = result.current;
      act(() => {
        submitQuery([
          { content: 'What is the meaning of life?', role: 'user' },
        ]);
      });
      handleNewData = mocks.openAiStreamingDataHandler.mock.calls[0][1];
      closeStream = mocks.openAiStreamingDataHandler.mock.calls[0][2];
    });

    it('handles text content in chunks of data', () => {
      act(() => {
        handleNewData(response, role);
      });
      const [messages] = result.current;
      expect(messages[1].content).toEqual(response);
    });

    it('handles roles in chunks of data', () => {
      act(() => {
        handleNewData(response, role);
      });
      const [messages] = result.current;
      expect(messages[1].role).toEqual(role);
    });

    it('sets the timestamp for the message when the stream closes', () => {
      act(() => {
        closeStream(1683182283592);
      });
      const [messages2] = result.current;
      expect(messages2[1].timestamp).toBeGreaterThan(0);
    });

    it('sets the loading flag to false for the message when the stream closes', () => {
      act(() => {
        closeStream(1683182283592);
      });
      const [messages2] = result.current;
      expect(messages2[1].meta.loading).toEqual(false);
    });
  });
});
