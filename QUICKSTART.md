# Quick Start Guide - Atlan AI Search

Get up and running with conversational AI search for your Atlan data catalog in 5 minutes!

## Step 1: Get Your API Keys

### Atlan API Key:
1. Log into https://home.atlan.com
2. Go to **Admin Settings**
3. Click **API Keys / Tokens**
4. Click **"Create API Key"**
5. Copy the key (**Important**: Make sure Remote MCP is enabled for your tenant)

### Claude API Key:
1. Go to https://console.anthropic.com/
2. Sign in or create an account
3. Navigate to **API Keys**
4. Click **"Create Key"**
5. Copy the key

## Step 2: Configure the Extension

1. **Open terminal** and navigate to the extension:
   ```bash
   cd atlan-chrome-extension
   ```

2. **Copy the config file**:
   ```bash
   cp config.example.js config.js
   ```

3. **Edit `config.js`** and add your keys:
   ```javascript
   const CONFIG = {
     atlan: {
       apiKey: 'your-atlan-api-key-here'  // ← Paste your Atlan key
     },
     claude: {
       apiKey: 'your-claude-api-key-here'  // ← Paste your Claude key
     }
   };
   ```

4. **Save the file**

## Step 3: Load in Chrome

1. Open Chrome and go to: **`chrome://extensions/`**
2. Toggle **"Developer mode"** ON (top-right)
3. Click **"Load unpacked"**
4. Select the **`atlan-chrome-extension`** folder
5. Done! 🎉

## Step 4: Start Searching

1. **Click the extension icon** in your Chrome toolbar (look for the Atlan icon)
2. **Type a question** like:
   - "Show me all customer tables"
   - "Find datasets with PII data"
   - "What glossary terms are related to revenue?"
3. **Press Enter** and watch Claude search Atlan for you!
4. **Ask follow-up questions** to refine your search

## 💡 Tips

- **Be specific**: "Find tables in the sales database" works better than "find tables"
- **Ask follow-ups**: The AI remembers context within a conversation
- **Use natural language**: No need for technical queries, just ask normally
- **Clear chat**: Click "Clear Chat" at the bottom to start fresh

## 🐛 Troubleshooting

### Not working?
1. **Reload the extension**: Go to `chrome://extensions/` → click reload icon
2. **Check your keys**: Make sure both API keys are correctly pasted in `config.js`
3. **Check console**: In extensions page, click "service worker" to see logs

### "Invalid API key" error?
- Double-check your API keys in `config.js`
- Ensure no extra spaces or quotes
- Verify your Atlan tenant has Remote MCP enabled

### No response?
- Check your Claude API credits at console.anthropic.com
- Verify network access to both APIs
- Look for errors in the service worker console

## 📖 Next Steps

- Read the full [README.md](README.md) for detailed documentation
- Learn about [Claude's tool use pattern](https://docs.anthropic.com/en/docs/tool-use)
- Explore [Atlan MCP capabilities](https://docs.atlan.com/product/capabilities/atlan-ai/)

## Need Help?

- **Atlan Issues**: Contact Atlan Support
- **Claude Issues**: Check console.anthropic.com
- **Extension Issues**: Check the service worker console

---

Happy searching! 🚀
