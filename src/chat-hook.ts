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
  OpenAIChatRole,
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
  timestamp: restOfParams.timestamp ?? Date.now(),
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
  const [messages, _setMessages] = React.useState<ChatMessage[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [controller, setController] = React.useState<AbortController | null>(
    null
  );

  // Abort an in-progress streaming response
  const abortResponse = () => {
    if (controller) {
      controller.abort();
      setController(null);
    }
  };

  // Reset the messages list as long as a response isn't being loaded.
  const resetMessages = () => {
    if (!loading) {
      _setMessages([]);
    }
  };

  // Overwrites all existing messages with the list of messages passed to it.
  const setMessages = (newMessages: ChatMessageParams[]) => {
    if (!loading) {
      _setMessages(newMessages.map(createChatMessage));
    }
  };

  // When new data comes in, add the incremental chunk of data to the last message.
  const handleNewData = (chunkContent: string, chunkRole: OpenAIChatRole) => {
    _setMessages(
      updateLastItem((msg) => ({
        content: `${msg.content}${chunkContent}`,
        role: `${msg.role}${chunkRole}` as OpenAIChatRole,
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

  // Handles what happens when the stream of a given completion is finished.
  const closeStream = (beforeTimestamp: number) => {
    // Determine the final timestamp, and calculate the number of seconds the full request took.
    const afterTimestamp = Date.now();
    const diffInSeconds =
      (afterTimestamp - beforeTimestamp) / MILLISECONDS_PER_SECOND;
    const formattedDiff = diffInSeconds.toFixed(2) + ' sec.';

    // Update the messages list, specifically update the last message entry with the final
    // details of the full request/response.
    _setMessages(
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

  const submitPrompt = React.useCallback(
    async (newMessages?: ChatMessageParams[]) => {
      // Don't let two streaming calls occur at the same time. If the last message in the list has
      // a `loading` state set to true, we know there is a request in progress.
      if (messages[messages.length - 1]?.meta?.loading) return;

      // If the array is empty or there are no new messages submited, do not make a request.
      if (!newMessages || newMessages.length < 1) {
        return;
      }

      setLoading(true);

      // Update the messages list with the new message as well as a placeholder for the next message
      // that will be returned from the API.
      const updatedMessages: ChatMessage[] = [
        ...messages,
        ...newMessages.map(createChatMessage),
        createChatMessage({
          content: '',
          role: '',
          timestamp: 0,
          meta: { loading: true },
        }),
      ];

      // Set the updated message list.
      _setMessages(updatedMessages);

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
        await openAiStreamingDataHandler(
          requestOpts,
          // The handleNewData function will be called as new data is received.
          handleNewData,
          // The closeStream function be called when the message stream has been completed.
          closeStream
        );
      } catch (err) {
        if (signal.aborted) {
          console.error(`Request aborted`, err);
        } else {
          console.error(`Error during chat response streaming`, err);
        }
      } finally {
        // Remove the AbortController now the response has completed.
        setController(null);
        // Set the loading state to false
        setLoading(false);
      }
    },
    [messages]
  );

  return {
    messages,
    loading,
    submitPrompt,
    abortResponse,
    resetMessages,
    setMessages,
  };
};
