import type {
  OpenAIStreamingParams,
  OpenAIChatMessage,
  FetchRequestOptions,
  ChatRole,
  ChatCompletionChunk,
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
  onIncomingChunk: (contentChunk: string, roleChunk: ChatRole) => void,
  onCloseStream: (beforeTimestamp: number) => void
) => {
  // Record the timestamp before the request starts.
  const beforeTimestamp = Date.now();

  // Initiate the completion request
  const response = await fetch(CHAT_COMPLETIONS_URL, requestOpts);

  // A response body should always exist, if there isn't one something has gone wrong.
  if (!response.body) {
    throw new Error('No body included in POST response object');
  }

  for await (const newData of response.body as unknown as NodeJS.ReadableStream) {
    // Decode the data
    const decodedData = textDecoder.decode(newData as Buffer);
    // Split the data into lines to process
    const lines = decodedData.split(/(\n){2}/);
    // Parse the lines into chat completion chunks
    const chunks: ChatCompletionChunk[] = lines
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
      const roleChunk: ChatRole = chunk.choices[0].delta.role ?? '';

      onIncomingChunk(contentChunk, roleChunk);
    }
  }

  onCloseStream(beforeTimestamp);
};

export default openAiStreamingDataHandler;
