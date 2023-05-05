import React from 'react';
import ReactDOM from 'react-dom/client';
import './example.css';
import { useChatCompletion } from '../src';

const formatDate = (date: Date) =>
  date.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    timeZoneName: 'short',
  });

const ExampleComponent = () => {
  const [promptText, setPromptText] = React.useState('');
  const { messages, submitPrompt } = useChatCompletion({
    model: 'gpt-3.5-turbo',
    apiKey: import.meta.env.VITE_OPENAI_API_KEY,
    temperature: 0.9,
  });

  const onSend = () => {
    submitPrompt([{ content: promptText, role: 'user' }]);
    setPromptText('');
  };

  // When content is added to the chat window, make sure we scroll to the bottom so the most
  // recent content is visible to the user.
  React.useEffect(() => {
    window.scrollTo(0, document.body.scrollHeight);
  }, [messages]);

  return (
    <>
      <div className="chat-wrapper">
        {messages.length < 1 ? (
          <div className="empty">No messages</div>
        ) : (
          messages.map((msg, i) => (
            <div className="message-wrapper" key={i}>
              <div className="role">Role: {msg.role}</div>
              <pre className="chat-message">{msg.content}</pre>
              {!msg.meta.loading && (
                <div className="tag-wrapper">
                  <span className="tag">
                    Timestamp: {formatDate(new Date(msg.timestamp))}
                  </span>
                  {msg.role === 'assistant' && (
                    <>
                      <span className="tag">
                        Tokens: {msg.meta.chunks.length}
                      </span>
                      <span className="tag">
                        Response time: {msg.meta.responseTime}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
      <div className="prompt-wrapper">
        <div>
          <textarea
            value={promptText}
            placeholder="Write a prompt"
            onChange={(event) => {
              setPromptText(event.target.value);
            }}
            disabled={
              messages.length > 0 && messages[messages.length - 1].meta.loading
            }
          />
          <button onClick={onSend}>Send</button>
        </div>
      </div>
    </>
  );
};

export default ExampleComponent;

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ExampleComponent />
  </React.StrictMode>
);
