import { ReadableStream } from "web-streams-polyfill/ponyfill";

import type {
  OpenAIStreamingParams,
  OpenAIChatMessage,
  FetchRequestOptions,
  OpenAIChatRole,
  OpenAIChatCompletionChunk,
} from './types';

// Converts the OpenAI API params + chat messages list + an optional AbortSignal into a shape that
// the fetch interface expects.
export const getOpenAiRequestOptions = (
  { apiKey, model, ...restOfApiParams }: OpenAIStreamingParams,
  messages: OpenAIChatMessage[],
  signal?: AbortSignal
): FetchRequestOptions => ({
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  },
  method: 'POST',
  body: JSON.stringify({
    model,
    // Includes all settings related to how the user wants the OpenAI API to execute their request.
    ...restOfApiParams,
    messages,
    stream: true,
  }),
  signal,
});

const CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';

const textDecoder = new TextDecoder('utf-8');

// Takes a set of fetch request options and calls the onIncomingChunk and onCloseStream functions
// as chunks of a chat completion's data are returned to the client, in real-time.
export const openAiStreamingDataHandler = async (
  requestOpts: FetchRequestOptions,
  onIncomingChunk: (contentChunk: string, roleChunk: OpenAIChatRole) => void,
  onCloseStream: (beforeTimestamp: number) => void
) => {
  // Record the timestamp before the request starts.
  const beforeTimestamp = Date.now();

  // Initiate the completion request
  const response = await fetch(CHAT_COMPLETIONS_URL, requestOpts);

  // If the response isn't OK (non-2XX HTTP code) report the HTTP status and description.
  if (!response.ok) {
    throw new Error(
      `Network response was not ok: ${response.status} - ${response.statusText}`
    );
  }

  // A response body should always exist, if there isn't one something has gone wrong.
  if (!response.body) {
    throw new Error('No body included in POST response object');
  }

  let content = '';
  let role = '';

  const reader = response.body.getReader();
  const stream = new ReadableStream({
    start(controller) {
      return pump();
      async function pump(): Promise<void> {
        return reader.read().then(({ done, value }) => {
          if (done) {
            controller.close();
            return;
          }
          controller.enqueue(value);
          return pump();
        });
      }
    },
  });

  for await (const newData of stream) {
    // Decode the data
    const decodedData = textDecoder.decode(newData as Buffer);
    // Split the data into lines to process
    const lines = decodedData.split(/(\n){2}/);
    // Parse the lines into chat completion chunks
    const chunks: OpenAIChatCompletionChunk[] = lines
      // Remove 'data:' prefix off each line
      .map((line) => line.replace(/(\n)?^data:\s*/, '').trim())
      // Remove empty lines and "[DONE]"
      .filter((line) => line !== '' && line !== '[DONE]')
      // Parse JSON string
      .map((line) => JSON.parse(line));

    // Process each chunk and send an update to the registered handler.
    for (const chunk of chunks) {
      // Avoid empty line after single backtick
      const contentChunk: string = (
        chunk.choices[0].delta.content ?? ''
      ).replace(/^`\s*/, '`');
      // Most times the chunk won't contain a role, in those cases set the role to ""
      const roleChunk: OpenAIChatRole = chunk.choices[0].delta.role ?? '';

      // Assign the new data to the rest of the data already received.
      content = `${content}${contentChunk}`;
      role = `${role}${roleChunk}`;

      onIncomingChunk(contentChunk, roleChunk);
    }
  }

  onCloseStream(beforeTimestamp);

  // Return the fully-assembled chat completion.
  return { content, role } as OpenAIChatMessage;
};

export default openAiStreamingDataHandler;
