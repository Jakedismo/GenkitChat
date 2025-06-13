# Conversation History Management

This document describes the conversation history management system in Genkit Studio, which preserves context across chat interactions while preventing token limit overflow.

## Overview

The conversation history system automatically:

- ✅ Preserves conversation context between messages
- ✅ Prevents token limit overflow with smart trimming
- ✅ Supports both basic chat and RAG modes
- ✅ Provides model-specific token management
- ✅ Offers debugging and monitoring tools

## How It Works

### Message Flow

1. **User sends message** → System captures existing conversation history
2. **Frontend conversion** → `ChatMessage[]` converted to API-compatible format
3. **Token management** → History trimmed if necessary to fit model limits
4. **API request** → Current message + processed history sent to AI
5. **AI response** → Model receives full conversation context

### Token Management Strategy

#### Model-Specific Limits

The system uses conservative token limits for each model:

```typescript
// Gemini Models
'googleAI/gemini-pro': 30,000 tokens
'googleAI/gemini-1.5-pro': 128,000 tokens
'googleAI/gemini-1.5-flash': 128,000 tokens

// OpenAI Models  
'openai/gpt-4': 7,000 tokens
'openai/gpt-4-turbo': 126,000 tokens
'openai/gpt-4o': 126,000 tokens
'openai/gpt-3.5-turbo': 15,000 tokens
```

#### Trimming Algorithm

- **Token Allocation**: 60% of context window reserved for history
- **Message Limit**: Maximum 50 messages in history
- **Sliding Window**: Most recent messages preserved when trimming
- **Token Estimation**: ~4 characters per token approximation

## Configuration

### Constants (in `src/utils/messageHistory.ts`)

```typescript
const HISTORY_TOKEN_RATIO = 0.6;        // 60% of context for history
const MAX_HISTORY_MESSAGES = 50;        // Maximum message count
const ENABLE_HISTORY_TRIMMING = true;   // Enable automatic trimming
```

### Customization

To modify the behavior, update these constants:

```typescript
// Use more conservative token allocation
const HISTORY_TOKEN_RATIO = 0.4;  // 40% instead of 60%

// Reduce message count limit  
const MAX_HISTORY_MESSAGES = 20;  // 20 instead of 50

// Disable trimming (not recommended)
const ENABLE_HISTORY_TRIMMING = false;
```

## Monitoring & Debugging

### History Token Stats Button

In the chat interface, click **"History Tokens"** to see:

- Current message count
- Estimated token usage
- Token limit for selected model
- Whether trimming occurred

### Console Logging

The system logs when trimming occurs:

```
[messageHistory] Trimmed conversation history from 45 to 32 messages (18,450/20,000 tokens)
```

### Token Statistics API

```typescript
import { getHistoryTokenStats } from '@/utils/messageHistory';

const stats = getHistoryTokenStats(messages, modelId);
console.log(stats);
// Output:
// {
//   totalMessages: 45,
//   processedMessages: 32,
//   estimatedTokens: 18450,
//   tokenLimit: 20000,
//   withinLimit: true,
//   trimmingEnabled: true,
//   messageLimit: 50
// }
```

## API Integration

### Frontend Usage

```typescript
import { convertChatMessagesToHistory } from '@/utils/messageHistory';

// Convert with model-aware trimming
const history = convertChatMessagesToHistory(messages, modelId);

// Include in API request
const requestBody = {
  userMessage: "Follow-up question",
  modelId: "googleAI/gemini-pro",
  history: history,  // <- Conversation context
  // ... other fields
};
```

### Backend Processing

The history is automatically processed in:

- **Basic Chat API** (`/api/basic-chat`)
- **RAG Chat API** (`/api/rag-chat`)  
- **RAG Flow** (`documentQaStreamFlow`)

## Best Practices

### For Developers

1. **Monitor Token Usage**: Use the debugging tools to understand token consumption
2. **Model Selection**: Choose models with appropriate context windows for your use case
3. **Message Design**: Keep messages concise to maximize history retention
4. **Testing**: Test with long conversations to verify trimming behavior

### For Users

1. **Context Awareness**: The AI remembers previous conversation within token limits
2. **Natural Flow**: Ask follow-up questions that reference earlier discussion
3. **Model Choice**: Use models with larger context windows for longer conversations
4. **Session Management**: Start new sessions for unrelated topics

## Troubleshooting

### Common Issues

#### "History not working"

- Check that the model supports the current token usage
- Verify the **History Tokens** button shows reasonable numbers
- Ensure messages are being added to the conversation state

#### "Conversation gets cut off"

- Use a model with a larger context window
- Reduce `HISTORY_TOKEN_RATIO` to be more conservative  
- Check console logs for trimming messages

#### "Token limit exceeded errors"

- The system should prevent this, but if it occurs:
  - Reduce `HISTORY_TOKEN_RATIO` further
  - Lower `MAX_HISTORY_MESSAGES`
  - Check token estimation accuracy

### Debug Steps

1. Click **"History Tokens"** to see current stats
2. Check browser console for trimming logs
3. Verify model selection matches expectations
4. Test with a fresh conversation to isolate issues

## Technical Details

### Message Format Conversion

```typescript
// Frontend ChatMessage
{
  id: "msg-123",
  sender: "user" | "bot", 
  text: "Hello, world!"
}

// Converted to API MessageHistoryItem
{
  role: "user" | "model",
  content: [{ text: "Hello, world!" }]
}

// Backend Genkit MessageData  
{
  role: "user" | "model",
  content: [{ text: "Hello, world!" }]
}
```

### Token Estimation

The system uses a simple but effective estimation:

- **4 characters ≈ 1 token** (rough average across models)
- Whitespace normalized before counting
- Conservative estimates to prevent overflow

## Future Enhancements

Potential improvements:

- [ ] Conversation summarization for very long chats
- [ ] Model-specific token counting (vs. estimation)
- [ ] User-configurable token ratios in UI
- [ ] Semantic importance-based message retention
- [ ] Export/import conversation history
- [ ] Advanced trimming strategies (importance-based, topic-based)

## Related Files

- `src/utils/messageHistory.ts` - Core history management logic
- `src/hooks/useChatManager.ts` - Frontend history integration  
- `src/lib/chat-utils.ts` - Backend history processing
- `src/ai/flows/ragFlow.ts` - RAG-specific history handling
- `src/app/api/basic-chat/route.ts` - Basic chat API
- `src/app/api/rag-chat/route.ts` - RAG chat API
