import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getOpenAiRequestOptions,
  openAiStreamingDataHandler,
} from '../src/chat-stream-handler';
import type { OpenAIChatMessage } from '../src/types';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const SAMPLE_MESSAGES: OpenAIChatMessage[] = [
  { content: 'Write a funny story about a fluffy bunny', role: 'user' },
];

describe('Generating request options', () => {
  it('generates an options object from all required params', () => {
    expect(
      getOpenAiRequestOptions(
        { apiKey: '1234', model: 'gpt-3.5-turbo' },
        SAMPLE_MESSAGES
      )
    ).toEqual({
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer 1234',
      },
      method: 'POST',
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: SAMPLE_MESSAGES,
        stream: true,
      }),
      signal: undefined,
    });
  });

  it('generates an options object from all required and optional params', () => {
    const newController = new AbortController();
    const signal = newController.signal;
    expect(
      getOpenAiRequestOptions(
        { apiKey: '1234', model: 'gpt-3.5-turbo', max_tokens: 300, top_p: 1 },
        SAMPLE_MESSAGES,
        signal
      )
    ).toEqual({
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer 1234',
      },
      method: 'POST',
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        max_tokens: 300,
        top_p: 1,
        messages: SAMPLE_MESSAGES,
        stream: true,
      }),
      signal,
    });
  });
});

describe('Handling streaming responses from the OpenAI chat API', () => {
  const options = getOpenAiRequestOptions(
    { apiKey: '1234', model: 'gpt-3.5-turbo' },
    SAMPLE_MESSAGES
  );

  let onIncomingChunk;
  let onCloseStream;

  beforeEach(() => {
    mockFetch.mockReset();
    onIncomingChunk = vi.fn();
    onCloseStream = vi.fn();
  });

  describe('Receiving and handling chunks', () => {
    const contentChunk = 'This is a response';
    const roleChunk = 'user';

    const createStream = (chunks: string[]) => {
      const stream = new ReadableStream({
        start(controller) {
          chunks.forEach((chunk) => {
            controller.enqueue(Buffer.from(chunk));
          });
          controller.close();
        },
      });

      mockFetch.mockResolvedValueOnce({ body: stream, ok: true });
    };

    it('calls onIncomingChunk function for each chunk received', async () => {
      createStream([
        `data: {"id": "123", "choices": [{"text": "${roleChunk}", "delta": {"role": "${roleChunk}"}}]}\n\n`,
        `data: {"id": "456", "choices": [{"text": "${contentChunk}", "delta": {"content": "${contentChunk}"}}]}\n\n`,
        'data: [DONE]\n\n',
      ]);

      await openAiStreamingDataHandler(options, onIncomingChunk, onCloseStream);

      expect(onIncomingChunk).nthCalledWith(1, '', roleChunk);
      expect(onIncomingChunk).nthCalledWith(2, contentChunk, '');
    });

    it('calls onCloseStream function after the stream has closed', async () => {
      createStream([
        `data: {"id": "123", "choices": [{"text": "${roleChunk}", "delta": {"role": "${roleChunk}"}}]}\n\n`,
        `data: {"id": "456", "choices": [{"text": "${contentChunk}", "delta": {"content": "${contentChunk}"}}]}\n\n`,
        'data: [DONE]\n\n',
      ]);

      await openAiStreamingDataHandler(options, onIncomingChunk, onCloseStream);

      expect(onCloseStream).toHaveBeenCalled();
    });

    it('calls onCloseStream function with a timestamp from before the request was made', async () => {
      createStream([
        `data: {"id": "123", "choices": [{"text": "${roleChunk}", "delta": {"role": "${roleChunk}"}}]}\n\n`,
        `data: {"id": "456", "choices": [{"text": "${contentChunk}", "delta": {"content": "${contentChunk}"}}]}\n\n`,
        'data: [DONE]\n\n',
      ]);

      await openAiStreamingDataHandler(options, onIncomingChunk, onCloseStream);

      expect(onCloseStream.mock.calls[0][0]).toBeTypeOf('number');
    });

    it('returns the full completion from the original function call when the response stream has finished', async () => {
      createStream([
        `data: {"id": "123", "choices": [{"text": "${roleChunk}", "delta": {"role": "${roleChunk}"}}]}\n\n`,
        `data: {"id": "456", "choices": [{"text": "${contentChunk}", "delta": {"content": "${contentChunk}"}}]}\n\n`,
        'data: [DONE]\n\n',
      ]);

      const message = await openAiStreamingDataHandler(
        options,
        onIncomingChunk,
        onCloseStream
      );

      expect(message.content).toEqual(contentChunk);
      expect(message.role).toEqual(roleChunk);
    });

    it('can handle multiple chunks of data in the same stream response body', async () => {
      createStream([
        `data: {"id": "123", "choices": [{"text": "${contentChunk}", "delta": {"role": "${roleChunk}"}}]}\n\ndata: {"id": "456", "choices": [{"text": "${contentChunk}", "delta": {"content": "${contentChunk}"}}]}\n\n`,
        'data: [DONE]\n\n',
      ]);

      await openAiStreamingDataHandler(options, onIncomingChunk, onCloseStream);

      expect(onIncomingChunk).nthCalledWith(1, '', roleChunk);
      expect(onIncomingChunk).nthCalledWith(2, contentChunk, '');
    });
  });

  it('throws an error when no body is included in POST response object', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    await expect(
      openAiStreamingDataHandler(options, onIncomingChunk, onCloseStream)
    ).rejects.toThrow('No body included in POST response object');
  });

  it('throws an error when the response is a non-2XX HTTP code', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: '401',
      statusText: 'Unauthorized',
    });

    await expect(
      openAiStreamingDataHandler(options, onIncomingChunk, onCloseStream)
    ).rejects.toThrow('Network response was not ok: 401 - Unauthorized');
  });
});
