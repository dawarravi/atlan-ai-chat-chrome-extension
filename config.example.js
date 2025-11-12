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
        model: 'claude-3-haiku-20240307', // Using cheapest model for testing
        maxTokens: 1024
    }
};

// Export for use in background.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}

