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
  let hookObj;

  // Before each test, create a new hook and reset the chat stream handler mocks
  beforeEach(() => {
    const hook = renderHook(() =>
      useChatCompletion({
        model: 'gpt-3.5-turbo',
        apiKey: '12345',
      })
    );
    hookObj = hook.result;
    mocks.getOpenAiRequestOptions.mockClear();
    mocks.openAiStreamingDataHandler.mockClear();
  });

  it('should have 0 messages when first initialized', () => {
    const { messages } = hookObj.current;
    expect(messages).toHaveLength(0);
  });

  describe('Submitting a new prompt', () => {
    it('adds 2 messages to the messages list when 1 message is submitted in the initial prompt', () => {
      const { submitPrompt } = hookObj.current;
      act(() => {
        submitPrompt([
          { content: 'What is the meaning of life?', role: 'user' },
        ]);
      });
      const { messages } = hookObj.current;
      expect(messages).toHaveLength(2);
    });

    it('adds N+1 messages to the messages list when N messages are submitted in the initial prompt', () => {
      const { submitPrompt } = hookObj.current;
      act(() => {
        submitPrompt([
          {
            content:
              'What is the meaning of life, the universe, and everything?',
            role: 'user',
          },
          { content: 'How does gravity work?', role: 'user' },
          { content: 'Explain dark matter to me', role: 'user' },
        ]);
      });
      const { messages } = hookObj.current;
      expect(messages).toHaveLength(4);
    });

    it('sets the content of the last message to empty before loading hookObjs', () => {
      const { submitPrompt } = hookObj.current;
      act(() => {
        submitPrompt([
          { content: 'What is the meaning of life?', role: 'user' },
        ]);
      });
      const { messages } = hookObj.current;
      expect(messages[1].content).toEqual('');
    });

    it('sets the role of the last message to empty before loading hookObjs', () => {
      const { submitPrompt } = hookObj.current;
      act(() => {
        submitPrompt([
          { content: 'What is the meaning of life?', role: 'user' },
        ]);
      });
      const { messages } = hookObj.current;
      expect(messages[1].role).toEqual('');
    });

    it('sets the timestamp of the last message to 0 before loading hookObjs', () => {
      const { submitPrompt } = hookObj.current;
      act(() => {
        submitPrompt([
          { content: 'What is the meaning of life?', role: 'user' },
        ]);
      });
      const { messages } = hookObj.current;
      expect(messages[1].timestamp).toEqual(0);
    });

    it('sets the loading state of the last message to true before loading hookObjs', () => {
      const { submitPrompt } = hookObj.current;
      act(() => {
        submitPrompt([
          { content: 'What is the meaning of life?', role: 'user' },
        ]);
      });
      const { messages } = hookObj.current;
      expect(messages[1].meta.loading).toEqual(true);
    });

    it("doesn't submit a new prompt if an existing one is already in progress", () => {
      const { submitPrompt: submitPrompt1 } = hookObj.current;
      act(() => {
        submitPrompt1([
          {
            content:
              'What is the meaning of life, the universe, and everything?',
            role: 'user',
          },
          { content: 'How does gravity work?', role: 'user' },
          { content: 'Explain dark matter to me', role: 'user' },
        ]);
      });
      const { submitPrompt: submitPrompt2 } = hookObj.current;
      act(() => {
        submitPrompt2([
          { content: 'Tell me a story about funny bunnies', role: 'user' },
        ]);
      });
      const { messages } = hookObj.current;
      expect(messages).toHaveLength(4); // No change
    });
  });

  describe('Resetting the messages list', () => {
    it('resets the list when not loading', () => {
      const { setMessages } = hookObj.current;
      act(() => {
        setMessages([
          { content: 'Tell me a story about funny bunnies', role: 'user' },
        ]);
      });
      const { resetMessages } = hookObj.current;
      act(() => {
        resetMessages();
      });
      const { messages } = hookObj.current;
      expect(messages).toHaveLength(0);
    });

    it("doesn't reset the list when a response is loading", () => {
      const { submitPrompt } = hookObj.current;
      act(() => {
        submitPrompt([
          { content: 'What is the meaning of life?', role: 'user' },
        ]);
      });
      const { resetMessages } = hookObj.current;
      act(() => {
        resetMessages();
      });
      const { messages } = hookObj.current;
      expect(messages).toHaveLength(2);
    });
  });

  describe('Setting the messages list', () => {
    const message = {
      content: 'Tell me a story about funny bunnies',
      role: 'user',
    };

    beforeEach(() => {
      const { setMessages } = hookObj.current;
      act(() => {
        setMessages([message]);
      });
    });

    it('sets the messages list when not loading', () => {
      const { messages } = hookObj.current;
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toEqual(message.content);
      expect(messages[0].role).toEqual(message.role);
    });

    it("doesn't set the messages list when a response is loading", () => {
      const { submitPrompt } = hookObj.current;
      act(() => {
        submitPrompt([
          { content: 'You are a helpful writing assistant', role: 'system' },
        ]);
      });
      const { setMessages } = hookObj.current;
      act(() => {
        setMessages([
          { content: 'How may I help you today?', role: 'assistant' },
        ]);
      });
      const { messages } = hookObj.current;
      expect(messages).toHaveLength(3);
    });

    it('overwrites any existing messages that exist in the list', () => {
      const { setMessages } = hookObj.current;
      act(() => {
        setMessages([
          { content: 'How may I help you today?', role: 'assistant' },
          { content: 'Tell me a story about funny bunnies', role: 'user' },
        ]);
      });
      const { messages } = hookObj.current;
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toEqual('How may I help you today?');
      expect(messages[0].role).toEqual('assistant');
      expect(messages[1].content).toEqual(
        'Tell me a story about funny bunnies'
      );
      expect(messages[1].role).toEqual('user');
    });

    it('converts any message without full ChatMessage properties into an object with all ChatMessage properties', () => {
      const { messages } = hookObj.current;
      expect(messages).toHaveLength(1);
      expect(messages[0].timestamp).toBeTypeOf('number');
      expect(messages[0].meta.loading).toEqual(false);
      expect(messages[0].meta.responseTime).toEqual('');
      expect(messages[0].meta.chunks).toEqual([]);
    });
  });

  describe('Aborting a streaming response', () => {
    const message = {
      content: 'Tell me a story about funny bunnies',
      role: 'user',
    };

    it('aborts the stream', () => {
      const { submitPrompt } = hookObj.current;
      act(() => {
        submitPrompt([message]);
      });
      const { abortResponse } = hookObj.current;
      act(() => {
        abortResponse();
      });
      const { messages } = hookObj.current;
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toEqual(message.content);
      expect(messages[0].role).toEqual(message.role);
    });
  });

  describe('Handling stream events', () => {
    const response = 'This is a response';
    const role = 'user';
    let handleNewData;
    let closeStream;

    beforeEach(() => {
      const { submitPrompt } = hookObj.current;
      act(() => {
        submitPrompt([
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
      const { messages } = hookObj.current;
      expect(messages[1].content).toEqual(response);
    });

    it('handles roles in chunks of data', () => {
      act(() => {
        handleNewData(response, role);
      });
      const { messages } = hookObj.current;
      expect(messages[1].role).toEqual(role);
    });

    it('sets the timestamp for the message when the stream closes', () => {
      act(() => {
        closeStream(1683182283592);
      });
      const { messages } = hookObj.current;
      expect(messages[1].timestamp).toBeGreaterThan(0);
    });

    it('sets the loading flag to false for the message when the stream closes', () => {
      act(() => {
        closeStream(1683182283592);
      });
      const { messages } = hookObj.current;
      expect(messages[1].meta.loading).toEqual(false);
    });
  });
});
