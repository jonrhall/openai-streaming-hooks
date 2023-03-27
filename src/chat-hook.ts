import React from 'react';
import { SSE } from 'sse';

export enum GPT35 {
  TURBO = 'gpt-3.5-turbo',
  TURBO_0301 = 'gpt-3.5-turbo-0301',
}

export enum GPT4 {
  BASE = 'gpt-4',
  BASE_0314 = 'gpt-4-0314',
  BASE_32K = 'gpt-4-32k',
  BASE_32K_0314 = 'gpt-4-32k-0314',
}

export enum ChatRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}

interface ChatMessageIncomingChunk {
  content?: string;
  role?: string;
}

export interface ChatMessageToken {
  content: string;
  role: string;
  timestamp: number;
}

export interface ChatMessage {
  content: string;
  role: string;
  timestamp: number;
  meta: {
    loading: boolean;
    responseTime: string;
    chunks: ChatMessageToken[];
  };
}

export interface openAIStreamingProps {
  apiKey: string;
  model: GPT35 | GPT4;
}

const CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';

const officialOpenAIParams = ({ content, role }: ChatMessage) => ({ content, role });

export const useChatCompletion = ({ model, apiKey }: openAIStreamingProps) => {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);

  const submitMessage = React.useCallback((promptText: string, role: ChatRole = ChatRole.USER) => {
    // Don't let two streaming calls occur at the same time.
    // Don't let an empty message be submitted, it won't work.
    if (messages[messages.length-1]?.meta?.loading || promptText === '') return;

    // Record the timestamp before the request starts.
    const beforeTimestamp = Date.now();

    // Update the messages list with the new message as well as a placeholder for the next message
    // that will be returned from the API.
    const updatedMessages: ChatMessage[] = [
      ...messages,
      {
        content: promptText,
        role: role,
        timestamp: Date.now(),
        meta: {
          loading: false,
          responseTime: '',
          chunks: [],
        },
      },
      {
        content: '',
        role: '',
        timestamp: 0,
        meta: {
          loading: true,
          responseTime: '',
          chunks: [],
        },
      }
    ];

    // Set the updated message list.
    setMessages(updatedMessages);

    // The payload of the SSE request itself.
    const payload = JSON.stringify({
      model,
      // Filter out the last message, since technically that is the message that the server will
      // return from this request, we're just storing a placeholder for it ahead of time to signal
      // to the UI something is happening.
      // Map the updated message structure to only what the OpenAI API expects.
      messages: updatedMessages
        .filter((m, i) => updatedMessages.length-1 !== i )
        .map(officialOpenAIParams),
      stream: true,
    });

    // Define the headers for the request.
    const CHAT_HEADERS = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };

    // Create the SSE request to the OpenAI chat completion API endpoint
    const source = new SSE(CHAT_COMPLETIONS_URL, {
      headers: CHAT_HEADERS,
      method: 'POST',
      payload,
    });

    // For each chunk received, process it and store it in the latest message.
    source.addEventListener('message', (e) => {
      // If a DONE token is found, the stream has been terminated.
      if (e?.data !== '[DONE]') {
        // Parse the data from the update.
        const payload = JSON.parse(e?.data || '{}');
        const chunk: ChatMessageIncomingChunk = payload?.choices?.[0]?.delta;

        // Update the messages list, specifically update the last message entry with the most
        // recently received chunk.
        setMessages((msgs) => msgs.map((message, i) => {
          if (updatedMessages.length-1 === i) {
            return {
              content: message.content + (chunk?.content || ''),
              role: message.role + (chunk?.role || ''),
              timestamp: 0,
              meta: {
                ...message.meta,
                chunks: [
                  ...message.meta.chunks,
                  {
                    content: chunk?.content || '',
                    role: chunk?.role || '',
                    timestamp: Date.now(),
                  },
                ],
              },
            };
          }

          return message;
        }));
      } else {
        source.close();
      }
    });

    // Add an event listener for when the connection closes.
    source.addEventListener('readystatechange', (e) => {
      // readyState: 0 - connecting, 1 - open, 2 - closed
      if (e.readyState && e.readyState > 1) {
        // Determine the final timestamp, and calculate the number of seconds the full request took.
        const afterTimestamp = Date.now();
        const diffInSeconds = (afterTimestamp - beforeTimestamp) / 1000;
        const formattedDiff = diffInSeconds.toFixed(2) + ' sec.';

        // Update the messages list, specifically update the last message entry with the final
        // details of the full request/response.
        setMessages((msgs) => msgs.map((message, i) => {
          if (updatedMessages.length-1 === i) {
            return {
              ...message,
              timestamp: afterTimestamp,
              meta: {
                ...message.meta,
                loading: false,
                responseTime: formattedDiff,
              },
            };
          }

          return message;
        }));
      }
    });

    source.stream();
  }, [messages, setMessages]);

  return [messages, submitMessage] as [ChatMessage[], typeof submitMessage];
};
