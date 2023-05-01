# OpenAI Streaming Hooks

> Talk directly to [OpenAI Completion APIs](https://platform.openai.com/docs/api-reference/chat) and stream the response back in real-time in the browser--no server required.

Provides [custom React Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) capable of calling OpenAI Completions APIs with [streaming support](https://github.com/openai/openai-cookbook/blob/main/examples/How_to_stream_completions.ipynb) enabled by [ReadableStreams](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream).

The library then decorates every Completion response with metadata about the transaction such as:

- The number of tokens used in the response
- The time it took to complete the request
- Each chunk of the stream
- The timestamp each chunk was received
- The timestamp from when the Completion was finished

## Example

![Usage example](https://github.com/jonrhall/openai-streaming-hooks/blob/main/example/example.gif)

[Example code here](https://github.com/jonrhall/openai-streaming-hooks/blob/main/example/example.tsx)

See section on [running the example](#running-the-example) for more information.

## Use

1. Install the OpenAI Streaming Hooks library via a package manager like `npm` or `yarn`:

```bash
npm install --save openai-streaming-hooks
```

2. Import the hook and use it:

```tsx
import { useChatCompletion, GPT35 } from 'openai-streaming-hooks';

const Component = () => {
  const [messages, submitQuery] = useChatCompletion({
    model: 'gpt-3.5-turbo',
    apiKey: 'your-api-key',
    temperature: 0.9,
  });
  ...
};
```

> [All API parameters supported by the OpenAI Chat API](https://platform.openai.com/docs/api-reference/chat) are also supported here.
>
> For example, it is OK to include optional params like `temperature`, `max_tokens`, etc. when instantiating the chat hook in the above code block.

## Types of Completions

**Currently, this package only supports Chat Completions. Adding Text Completions support to this package is a future roadmap item (pull requests accepted).**

There are two main types of completions available from OpenAI:

1. [Chat Completions](https://platform.openai.com/docs/guides/chat), which includes models like `gpt-4` and `gpt-3.5-turbo`.
2. [Text Completions](https://platform.openai.com/docs/guides/completion), which includes models like `text-davinci-003`.

There are some pretty big fundamental differences in the way these models are supported on the API side. Chat Completions consider the context of previous messages when making the next completion. Text Completions only consider the context passed into the explicit message it is currently answering.

For more information on chat vs. text completion models, see [LangChain's excellent blog post on the topic](https://blog.langchain.dev/chat-models/).

### Chat Completions

An individual message in a Chat Completion's `messages` list looks like:

```ts
interface ChatMessage {
  content: string; // The content of the completion
  role: string; // The role of the person/AI in the message
  timestamp: number; // The timestamp of when the completion finished
  meta: {
    loading: boolean; // If the completion is still being executed
    responseTime: string; // The total elapsed time the completion took
    chunks: ChatMessageToken[]; // The chunks returned as a part of streaming the execution of the completion
  };
}
```

Each chunk corresponds to a token streamed back to the client in the completion. A `ChatMessageToken` is the base incremental shape that content in the stream returned from the OpenAI API looks like:

```ts
interface ChatMessageToken {
  content: string; // The partial content, if any, received in the chunk
  role: string; // The role, if any, received in the chunk
  timestamp: number; // The time the chunk was received
}
```

## Submitting a Query

Call the `submitQuery` function to spawn a request whose response will be streamed back to the client from the OpenAI Chat Completions API. A query takes a list of new messages to append to the existing `messages` list and submit to OpenAI.

A sample message list might look like:

```ts
const newMessages = [
  {
    role: 'system',
    content: 'You are a short story bot, you write short stories for kids',
  },
  {
    role: 'user',
    content: 'Write a story about a lonely bunny',
  },
];
```

When the query is submitted, a blank message is appended to the end of the `messages` list with its `meta.loading` state set to `true`. This message will be where the content that is streamed back to the client is collected in real-time.

New chunks of the message will appear in the `meta.chunks` list and your React component will be updated every time a new chunk appears automatically.

> 💡 **Chunks correspond directly to tokens.**
>
> By counting the number of chunks, you can count the number of tokens that a response used.

If the `submitQuery` function is called without any parameters or with an empty list, no request will be sent and instead the `messages` list will be set back to empty.

## Running the Example

1. Clone this package locally and navigate to it:

```bash
git clone https://github.com/jonrhall/openai-streaming-hooks.git
cd openai-streaming-hooks
```

2. Export your [OpenAI API Key](https://platform.openai.com/account/api-keys) as environment variable `VITE_OPENAI_API_KEY`:

```bash
export VITE_OPENAI_API_KEY=your-key-here
```

3. Run the example dev server:

```bash
npm run example
```

4. Navigate to `https://localhost:5179` to see the live example.

## Contributors

<div style="display: flex;">
  <a href="https://github.com/jonrhall" style="display: flex; flex-direction: column; align-items: center; padding: 0 10px 0 0;">
    <img src="https://github.com/jonrhall.png" alt="Jon Hall" title="Jon Hall" width="100" height="100"/>
    <span>Jon Hall</span>
  </a>
  <a href="https://github.com/MatchuPitchu" style="display: flex; flex-direction: column; align-items: center; padding: 0 10px 0 0;">
    <img src="https://github.com/MatchuPitchu.png" alt="Michael Flohr" title="Michael Flohr" width="100" height="100"/>
    <span>Michael Flohr</span>
  </a>
</div>

### Future Contributions

- This package accepts contributions in the form of Pull Requests against the `main` branch.
- Please follow the coding format as put forth in the ESLint and Prettier definitions used in the package.
- Passing unit tests for all new code/functionality also is greatly appreciated, if not mandatory for PR acceptance in most cases.
- Before contributing, please see our developer [Code of Conduct](https://github.com/jonrhall/openai-streaming-hooks/blob/main/CODE_OF_CONDUCT.md).
