// Configuration file for API credentials
// IMPORTANT: Copy this file to config.js and add your actual API keys

const CONFIG = {
    // Atlan Configuration
    atlan: {
        tenantUrl: 'https://home.atlan.com',
        apiKeyEndpoint: 'https://home.atlan.com/mcp/api-key',
        apiKey: 'YOUR_ATLAN_API_KEY_HERE' // Replace with your actual Atlan API key
    },

    // Claude API Configuration
    claude: {
        apiKey: 'YOUR_CLAUDE_API_KEY_HERE', // Replace with your actual Claude API key
        apiEndpoint: 'https://api.anthropic.com/v1/messages',
        model: 'claude-sonnet-4-5-20250929', // Latest Claude Sonnet 4.5 model
        maxTokens: 4096 // Increased for detailed responses
    }
};

// Export for use in background.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}

