# Atlan AI Search Chrome Extension

A Chrome extension that enables **conversational search** of your Atlan data catalog using Claude AI and Atlan's Remote MCP server. Ask natural language questions about your data, and Claude will intelligently search Atlan to provide helpful answers.

## ✨ Features

- 🤖 **AI-Powered Conversations**: Ask questions in plain English about your data catalog
- 🔍 **Intelligent Search**: Claude autonomously searches Atlan using MCP tools
- 💬 **Chat Interface**: Conversational UI with message history
- 🎯 **Context-Aware**: Maintains conversation context for follow-up questions
- ⚡ **Fast & Secure**: Direct API calls, keys stored locally

## 🏗️ Architecture

This extension uses an **agentic pattern** where Claude orchestrates tool use:

```
User Question
    ↓
Chrome Extension
    ↓
Claude API (with tool definitions)
    ↓
Claude decides to use "search_atlan_assets" tool
    ↓
Extension executes tool (calls Atlan MCP)
    ↓
Results sent back to Claude
    ↓
Claude formulates natural language answer
    ↓
Answer displayed to user
```

### Key Components:

1. **popup.html/js/css**: Conversational chat interface
2. **background.js**: Implements Claude's tool use pattern and Atlan MCP integration
3. **config.js**: API credentials (Atlan + Claude)

### How It Works:

1. User asks a question in natural language
2. Question sent to Claude API with tool definitions
3. Claude analyzes the question and decides if it needs data from Atlan
4. If yes, Claude requests the `search_atlan_assets` tool
5. Extension intercepts tool request and calls Atlan MCP API
6. Search results sent back to Claude
7. Claude synthesizes the results into a natural language answer
8. Answer displayed in chat interface

This is Claude's **function calling/tool use** pattern, where Claude orchestrates external tools to answer questions.

## 📋 Prerequisites

1. **Atlan Tenant** with Remote MCP enabled: `https://home.atlan.com`
2. **Atlan API Key**: From Admin Settings → API Keys / Tokens
3. **Claude API Key**: From [Anthropic Console](https://console.anthropic.com/)

## 🚀 Installation

### Step 1: Configure API Keys

1. Navigate to the extension directory:
   ```bash
   cd atlan-chrome-extension
   ```

2. Copy the example config:
   ```bash
   cp config.example.js config.js
   ```

3. Edit `config.js` and add your API keys:
   ```javascript
   const CONFIG = {
     atlan: {
       tenantUrl: 'https://home.atlan.com',
       apiKeyEndpoint: 'https://home.atlan.com/mcp/api-key',
       apiKey: 'your-atlan-api-key-here'
     },
     claude: {
       apiKey: 'your-claude-api-key-here',
       apiEndpoint: 'https://api.anthropic.com/v1/messages',
       model: 'claude-3-haiku-20240307',
       maxTokens: 4096
     }
   };
   ```

4. Save the file (**Never commit config.js!**)

### Step 2: Load in Chrome

1. Open Chrome: `chrome://extensions/`
2. Enable **Developer mode** (toggle top-right)
3. Click **"Load unpacked"**
4. Select the `atlan-chrome-extension` folder
5. Extension ready! Look for the icon in your toolbar

## 💡 Usage

### Starting a Conversation

1. **Click the extension icon** in your Chrome toolbar
2. **Type your question** in natural language
3. **Press Enter** or click the send button (➤)
4. **Watch Claude think** and search Atlan
5. **Get your answer** with relevant context

### Example Questions

- "Show me all tables related to customers"
- "Find datasets with PII information"
- "What are the glossary terms for revenue metrics?"
- "Search for tables updated in the last week"
- "Find all dashboards created by John"

### Follow-up Questions

The extension maintains conversation context, so you can ask follow-up questions:

1. **You**: "Find customer tables"
2. **AI**: *Returns list of customer tables*
3. **You**: "Which of those have email columns?"
4. **AI**: *Searches specifically in the mentioned tables*

### Clear Chat History

Click **"Clear Chat"** in the footer to start a new conversation.

## 🔧 Configuration

### Claude Model Selection

Choose between different Claude models in `config.js`:

```javascript
claude: {
  model: 'claude-3-haiku-20240307',    // Fast & cost-effective (default)
  // model: 'claude-3-5-sonnet-20241022', // Balanced (recommended)
  // model: 'claude-3-opus-20240229',    // Most capable
  maxTokens: 4096
}
```

### Atlan Tenant

For different Atlan tenants:

```javascript
atlan: {
  tenantUrl: 'https://your-tenant.atlan.com',
  apiKeyEndpoint: 'https://your-tenant.atlan.com/mcp/api-key',
  // ... API key
}
```

## 🐛 Troubleshooting

### Extension Not Working

1. **Reload the extension**: Go to `chrome://extensions/` and click reload
2. **Check API keys**: Verify both Atlan and Claude API keys in `config.js`
3. **Check console**: Click "service worker" link in extensions page to see logs
4. **Verify permissions**: Ensure your Atlan API key has MCP access

### "Invalid API key" Error

- **Atlan key**: Regenerate from Admin Settings → API Keys
- **Claude key**: Verify it's active at console.anthropic.com
- **Check expiration**: API keys may have expiration dates

### No Response from Claude

1. Check service worker console for errors
2. Verify Claude API key is valid
3. Ensure network access to api.anthropic.com
4. Check if you have Claude API credits

### Atlan MCP Not Responding

1. Verify your tenant has Remote MCP enabled (contact Atlan support)
2. Check API key has proper permissions
3. Try the curl test below

### Testing Atlan MCP Manually

```bash
curl -X POST https://home.atlan.com/mcp/api-key \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer YOUR_ATLAN_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "search_assets",
      "arguments": {"query": "test", "limit": 5}
    },
    "id": 1
  }'
```

## 📁 Project Structure

```
atlan-chrome-extension/
├── manifest.json          # Extension metadata (v3)
├── config.js             # API keys (gitignored)
├── config.example.js     # Config template
├── background.js         # Claude tool use + Atlan MCP client
├── popup.html            # Chat interface UI
├── popup.js              # Chat functionality
├── popup.css             # Chat styling
├── icons/                # Extension icons
├── .gitignore            # Excludes config.js
├── README.md             # This file
└── QUICKSTART.md         # 5-minute setup guide
```

## 🔐 Security

- **Local Storage**: API keys stored locally in `config.js`
- **Not Committed**: `config.js` is gitignored
- **HTTPS Only**: All API calls use HTTPS
- **Input Validation**: User input is sanitized
- **CORS Header**: Required for Claude browser access

## 🎯 Technical Details

### Claude Tool Use Pattern

The extension implements Anthropic's tool use (function calling) pattern:

```javascript
// 1. Define tools for Claude
const ATLAN_TOOLS = [{
  name: 'search_atlan_assets',
  description: 'Search Atlan data catalog...',
  input_schema: { /* parameters */ }
}];

// 2. Send to Claude with tools
const response = await claude.messages.create({
  model: 'claude-3-haiku-20240307',
  messages: [...],
  tools: ATLAN_TOOLS
});

// 3. Handle tool use request
if (response.stop_reason === 'tool_use') {
  // Execute tool (call Atlan MCP)
  const result = await callAtlanMCP(toolName, toolInput);
  
  // Send result back to Claude
  const finalResponse = await claude.messages.create({
    messages: [..., {role: 'user', content: toolResult}]
  });
}
```

### Atlan MCP Integration

Direct calls to Atlan's Remote MCP server using JSON-RPC 2.0:

```javascript
POST https://home.atlan.com/mcp/api-key

Headers:
  Authorization: Bearer <atlan-api-key>
  Content-Type: application/json
  Accept: application/json, text/event-stream

Body:
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "search_assets",
    "arguments": {"query": "...", "limit": 10}
  },
  "id": <timestamp>
}
```

Response is in Server-Sent Events (SSE) format, which we parse and return to Claude.

## 📚 Resources

- [Atlan MCP Documentation](https://docs.atlan.com/product/capabilities/atlan-ai/how-tos/remote-mcp-overview)
- [Claude API Documentation](https://docs.anthropic.com/)
- [Claude Tool Use Guide](https://docs.anthropic.com/en/docs/tool-use)
- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)

## 🚧 Limitations

- Chrome/Chromium browsers only (Manifest V3)
- Requires internet connection
- API rate limits apply (based on your plans)
- Claude Haiku model has 4K max token output
- Conversation history stored locally (not synced)

## 🔮 Future Enhancements

- [ ] Support for more Atlan MCP tools (lineage, glossary, etc.)
- [ ] Conversation export (JSON, CSV)
- [ ] Multi-tab conversation sync
- [ ] Custom tool definitions
- [ ] Streaming responses
- [ ] Voice input
- [ ] Dark mode
- [ ] Keyboard shortcuts

## 📝 Version History

### Version 2.0.0 (Current)
- Complete redesign: Conversational AI search
- Implemented Claude tool use pattern
- Removed double-click lookup
- Added chat interface
- Claude orchestrates Atlan MCP calls
- Agentic loop implementation

### Version 1.0.0 (Deprecated)
- Initial release with double-click lookup
- Direct Atlan MCP calls (incorrect approach)
- Basic popup interface

## 🤝 Support

For issues related to:
- **Atlan MCP**: Contact [Atlan Support](https://atlan.com/support)
- **Claude API**: Contact [Anthropic Support](https://support.anthropic.com)
- **Extension**: Open an issue in this repository

---

**Built with ❤️ for the Atlan community**
