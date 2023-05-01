import React from 'react';
import {
  getOpenAiRequestOptions,
  openAiStreamingDataHandler,
} from './chat-stream-handler';
import type {
  ChatMessage,
  OpenAIChatMessage,
  ChatMessageParams,
  OpenAIStreamingParams,
  ChatRole,
} from './types';

const MILLISECONDS_PER_SECOND = 1000;

// Utility method for transforming a chat message decorated with metadata to a more limited shape
// that the OpenAI API expects.
const officialOpenAIParams = ({
  content,
  role,
}: ChatMessage): OpenAIChatMessage => ({ content, role });

// Utility method for transforming a chat message that may or may not be decorated with metadata
// to a fully-fledged chat message with metadata.
const createChatMessage = ({
  content,
  role,
  ...restOfParams
}: ChatMessageParams): ChatMessage => ({
  content,
  role,
  timestamp: restOfParams.timestamp || Date.now(),
  meta: {
    loading: false,
    responseTime: '',
    chunks: [],
    ...restOfParams.meta,
  },
});

// Utility method for updating the last item in a list.
const updateLastItem =
  <T>(msgFn: (message: T) => T) =>
  (currentMessages: T[]) =>
    currentMessages.map((msg, i) => {
      if (currentMessages.length - 1 === i) {
        return msgFn(msg);
      }
      return msg;
    });

export const useChatCompletion = (apiParams: OpenAIStreamingParams) => {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [controller, setController] = React.useState<AbortController | null>(
    null
  );

  // When new data comes in, add the incremental chunk of data to the last message.
  const handleNewData = (chunkContent: string, chunkRole: ChatRole) => {
    setMessages(
      updateLastItem((msg) => ({
        content: `${msg.content}${chunkContent}`,
        role: `${msg.role}${chunkRole}` as ChatRole,
        timestamp: 0,
        meta: {
          ...msg.meta,
          chunks: [
            ...msg.meta.chunks,
            {
              content: chunkContent,
              role: chunkRole,
              timestamp: Date.now(),
            },
          ],
        },
      }))
    );
  };

  const closeStream = (beforeTimestamp: number) => {
    // Determine the final timestamp, and calculate the number of seconds the full request took.
    const afterTimestamp = Date.now();
    const diffInSeconds =
      (afterTimestamp - beforeTimestamp) / MILLISECONDS_PER_SECOND;
    const formattedDiff = diffInSeconds.toFixed(2) + ' sec.';

    // Update the messages list, specifically update the last message entry with the final
    // details of the full request/response.
    setMessages(
      updateLastItem((msg) => ({
        ...msg,
        timestamp: afterTimestamp,
        meta: {
          ...msg.meta,
          loading: false,
          responseTime: formattedDiff,
        },
      }))
    );
  };

  const submitQuery = React.useCallback(
    async (newMessages?: ChatMessageParams[]) => {
      // Don't let two streaming calls occur at the same time. If the last message in the list has
      // a `loading` state set to true, we know there is a request in progress.
      if (messages[messages.length - 1]?.meta?.loading) return;

      // If the array is empty or there are no new messages submited, that is a special request to
      // clear the `messages` queue and prepare to start over, do not make a request.
      if (!newMessages || newMessages.length < 1) {
        setMessages([]);
        return;
      }

      // Update the messages list with the new message as well as a placeholder for the next message
      // that will be returned from the API.
      const updatedMessages: ChatMessage[] = [
        ...messages,
        ...newMessages.map(createChatMessage),
        createChatMessage({ content: '', role: '', meta: { loading: true } }),
      ];

      // Set the updated message list.
      setMessages(updatedMessages);

      // Create a controller that can abort the entire request.
      const newController = new AbortController();
      const signal = newController.signal;
      setController(newController);

      // Define options that will be a part of the HTTP request.
      const requestOpts = getOpenAiRequestOptions(
        apiParams,
        updatedMessages
          // Filter out the last message, since technically that is the message that the server will
          // return from this request, we're just storing a placeholder for it ahead of time to signal
          // to the UI something is happening.
          .filter((m, i) => updatedMessages.length - 1 !== i)
          // Map the updated message structure to only what the OpenAI API expects.
          .map(officialOpenAIParams),
        signal
      );

      try {
        // Wait for all the results to be streamed back to the client before proceeding.
        // Register data and stream close event handlers to act when a new chunk comes
        // in and when the stream is completed.
        await openAiStreamingDataHandler(
          requestOpts,
          handleNewData,
          closeStream
        );
      } catch (err) {
        if (signal.aborted) {
          console.error(`Request aborted`, err);
        } else {
          console.error(`Error during chat response streaming`, err);
        }
      } finally {
        setController(null); // reset AbortController
      }
    },
    [messages, setMessages]
  );

  return [messages, submitQuery] as [ChatMessage[], typeof submitQuery];
};
