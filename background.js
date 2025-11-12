// Background service worker for Atlan AI Search Chrome Extension
// Implements Claude's tool use pattern to orchestrate Atlan MCP calls

// Import configuration
importScripts('config.js');

// Cache for recent results
const responseCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Cache for discovered MCP tools
let discoveredTools = null;

/**
 * Discover available tools from Atlan Remote MCP
 */
async function discoverAtlanTools() {
    console.log('Discovering tools from Atlan Remote MCP...');

    try {
        const response = await fetch(CONFIG.atlan.apiKeyEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream',
                'Authorization': `Bearer ${CONFIG.atlan.apiKey}`
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'tools/list',
                params: {},
                id: Date.now()
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Failed to discover tools:', response.status, errorText);
            return null;
        }

        // Parse SSE response
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('text/event-stream')) {
            const text = await response.text();
            const lines = text.split('\n');
            let dataLines = [];

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    dataLines.push(line.substring(6));
                }
            }

            const jsonData = dataLines.join('');
            if (jsonData) {
                const data = JSON.parse(jsonData);
                console.log('Discovered tools:', data);

                if (data.result && data.result.tools) {
                    return data.result.tools;
                }
            }
        }

        return null;
    } catch (error) {
        console.error('Error discovering tools:', error);
        return null;
    }
}

/**
 * Get Atlan MCP tools for Claude (with discovery)
 */
async function getAtlanTools() {
    // Return cached tools if available
    if (discoveredTools) {
        return discoveredTools;
    }

    // Discover tools from Atlan MCP
    const tools = await discoverAtlanTools();

    if (tools && tools.length > 0) {
        console.log('Using discovered tools:', tools);
        // Convert MCP tool format to Claude tool format
        discoveredTools = tools.map(tool => ({
            name: tool.name,
            description: tool.description || `Atlan MCP tool: ${tool.name}`,
            input_schema: tool.inputSchema || {
                type: 'object',
                properties: {},
                required: []
            }
        }));
        return discoveredTools;
    }

    // Fallback to default tool definitions if discovery fails
    console.warn('Tool discovery failed, using fallback definitions');
    discoveredTools = [
        {
            name: 'search_assets',
            description: 'Search for assets in Atlan data catalog. Use this to find tables, columns, dashboards, glossary terms, and other data assets based on user queries. Returns metadata about matching assets.',
            input_schema: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'The search query to find assets in Atlan. Can be keywords, asset names, descriptions, or natural language queries.'
                    },
                    limit: {
                        type: 'number',
                        description: 'Maximum number of results to return (default: 10)',
                        default: 10
                    }
                },
                required: ['query']
            }
        }
    ];

    return discoveredTools;
}

/**
 * Call Atlan MCP API directly to execute a tool
 */
async function callAtlanMCP(toolName, toolInput) {
    console.log('Calling Atlan MCP tool:', toolName, 'with input:', toolInput);

    try {
        const response = await fetch(CONFIG.atlan.apiKeyEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream',
                'Authorization': `Bearer ${CONFIG.atlan.apiKey}`
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'tools/call',
                params: {
                    name: toolName, // Use the actual tool name from discovery
                    arguments: toolInput
                },
                id: Date.now()
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Atlan MCP API error:', response.status, errorText);
            return {
                error: true,
                message: `Atlan API error: ${response.status}`
            };
        }

        // Parse SSE response
        const contentType = response.headers.get('content-type');
        console.log('Atlan response content-type:', contentType);

        if (contentType && contentType.includes('text/event-stream')) {
            const text = await response.text();
            console.log('Atlan SSE response:', text);

            // Parse SSE format
            const lines = text.split('\n');
            let dataLines = [];

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    dataLines.push(line.substring(6));
                }
            }

            const jsonData = dataLines.join('');
            if (!jsonData) {
                return { error: true, message: 'No data received from Atlan' };
            }

            const data = JSON.parse(jsonData);
            console.log('Parsed Atlan response:', data);

            // Check for errors
            if (data.error) {
                return { error: true, message: data.error.message || 'Atlan MCP error' };
            }

            if (data.result && data.result.isError) {
                const errorMsg = data.result.content && data.result.content[0] && data.result.content[0].text;
                return { error: true, message: errorMsg || 'Atlan returned an error' };
            }

            // Extract results
            if (data.result && data.result.content && Array.isArray(data.result.content)) {
                const results = data.result.content
                    .filter(item => item.type === 'text')
                    .map(item => item.text)
                    .join('\n');
                return { success: true, data: results };
            }

            return { success: true, data: JSON.stringify(data.result) };
        } else {
            const data = await response.json();
            console.log('Atlan JSON response:', data);

            if (data.error) {
                return { error: true, message: data.error.message };
            }

            if (data.result && data.result.content) {
                const results = data.result.content
                    .filter(item => item.type === 'text')
                    .map(item => item.text)
                    .join('\n');
                return { success: true, data: results };
            }

            return { success: true, data: JSON.stringify(data.result) };
        }
    } catch (error) {
        console.error('Error calling Atlan MCP:', error);
        return { error: true, message: error.message };
    }
}

/**
 * Send message to Claude with tool use capability
 */
async function askClaude(messages, tools) {
    console.log('Asking Claude with tools:', tools);
    console.log('Messages:', messages);

    try {
        // Add system message if this is the first message in conversation
        const requestBody = {
            model: CONFIG.claude.model,
            max_tokens: CONFIG.claude.maxTokens,
            messages: messages,
            tools: tools
        };

        // Add system prompt for rich, detailed formatting
        if (messages.length <= 2) {
            requestBody.system = `You are an AI assistant helping users search and understand their Atlan data catalog.

When presenting search results for assets (tables, columns, etc.), ALWAYS include ALL available details in a rich, structured format:

For each asset, include:
1. **Display Name** (technical_name)
2. **Location**: Connection > Database > Schema hierarchy
3. **Description**: Full description if available
4. **Owner/Stewards**: Primary owner and any co-owners
5. **Statistics**: Row count, column count if available
6. **Status**: Verification status (✓ Verified, Draft, etc.)
7. **Classifications**: Tags, labels, governance classifications
8. **Terms**: Related glossary terms
9. **Any other relevant metadata** from the search results

Formatting guidelines:
- Use **bold** for asset names and important terms
- Use clear section headings (##) when listing multiple items
- Format technical names in \`inline code\`
- Use bullet points (•) for metadata lists
- Show verification status with ✓ symbol
- Organize information hierarchically for readability
- Include counts, dates, and metrics when available
- Present tags and terms clearly

Example format for a table:
## Table Name (technical_name)
**Location**: Snowflake > Database > Schema
**Description**: [Full description]
**Owner**: [owner name]
**Co-owners**: [if any]
**Rows**: X | **Columns**: Y
**Status**: ✓ Verified
**Tags**: tag1, tag2, tag3
**Terms**: term1, term2

Extract and present ALL metadata from the tool results - don't summarize or omit details. Users want comprehensive information about their data assets.`;
        }

        const response = await fetch(CONFIG.claude.apiEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': CONFIG.claude.apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Claude API error:', response.status, errorText);
            throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Claude response:', data);

        return data;
    } catch (error) {
        console.error('Error calling Claude:', error);
        throw error;
    }
}

/**
 * Agentic loop: Handle Claude's tool use requests
 */
async function processConversation(userQuestion, history = []) {
    console.log('Processing conversation for:', userQuestion);

    // Discover available tools from Atlan MCP
    const tools = await getAtlanTools();
    console.log('Using tools for conversation:', tools);

    if (!tools || tools.length === 0) {
        return {
            success: false,
            error: 'Unable to discover tools from Atlan MCP. Please check your API key and connection.'
        };
    }

    // Build messages array
    const messages = [
        ...history,
        {
            role: 'user',
            content: userQuestion
        }
    ];

    // Keep track of conversation for this request
    let conversationMessages = [...messages];
    let maxIterations = 5; // Prevent infinite loops
    let iteration = 0;

    while (iteration < maxIterations) {
        iteration++;
        console.log(`Iteration ${iteration}`);

        // Ask Claude with discovered tools
        const claudeResponse = await askClaude(conversationMessages, tools);

        // Check stop reason
        if (claudeResponse.stop_reason === 'end_turn') {
            // Claude has finished - extract the final answer
            const finalContent = claudeResponse.content
                .filter(block => block.type === 'text')
                .map(block => block.text)
                .join('\n');

            return {
                success: true,
                answer: finalContent
            };
        } else if (claudeResponse.stop_reason === 'tool_use') {
            // Claude wants to use a tool
            console.log('Claude requested tool use');

            // Add Claude's response to conversation
            conversationMessages.push({
                role: 'assistant',
                content: claudeResponse.content
            });

            // Process each tool use request
            const toolResults = [];

            for (const contentBlock of claudeResponse.content) {
                if (contentBlock.type === 'tool_use') {
                    const toolName = contentBlock.name;
                    const toolInput = contentBlock.input;
                    const toolUseId = contentBlock.id;

                    console.log(`Executing tool: ${toolName}`, toolInput);

                    // Execute the tool (call Atlan MCP)
                    const result = await callAtlanMCP(toolName, toolInput);

                    // Format tool result for Claude
                    if (result.error) {
                        toolResults.push({
                            type: 'tool_result',
                            tool_use_id: toolUseId,
                            content: `Error: ${result.message}`,
                            is_error: true
                        });
                    } else {
                        toolResults.push({
                            type: 'tool_result',
                            tool_use_id: toolUseId,
                            content: result.data
                        });
                    }
                }
            }

            // Add tool results to conversation
            conversationMessages.push({
                role: 'user',
                content: toolResults
            });

            // Continue the loop - Claude will process tool results
            continue;
        } else {
            // Some other stop reason
            console.log('Claude stopped with reason:', claudeResponse.stop_reason);

            const finalContent = claudeResponse.content
                .filter(block => block.type === 'text')
                .map(block => block.text)
                .join('\n');

            return {
                success: true,
                answer: finalContent || 'I apologize, but I was unable to complete your request.'
            };
        }
    }

    // Max iterations reached
    return {
        success: false,
        error: 'Maximum iterations reached. Please try a simpler question.'
    };
}

// Active ports for streaming updates
const activeStreams = new Map();

/**
 * Send progress update to popup
 */
function sendProgressUpdate(streamId, type, data) {
    const port = activeStreams.get(streamId);
    if (port) {
        try {
            port.postMessage({ type, ...data });
        } catch (error) {
            console.error('Error sending progress update:', error);
        }
    }
}

/**
 * Message listener
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Background received message:', message);

    if (message.type === 'ask_question') {
        const question = message.question;
        const history = message.history || [];
        const streamId = message.streamId || Date.now();

        if (!question || question.trim().length === 0) {
            sendResponse({
                type: 'error',
                error: 'No question provided'
            });
            return true;
        }

        // Process the conversation asynchronously with progress updates
        processConversationWithUpdates(question, history, streamId)
            .then(result => {
                if (result.success) {
                    sendResponse({
                        type: 'answer',
                        answer: result.answer
                    });
                } else {
                    sendResponse({
                        type: 'error',
                        error: result.error
                    });
                }
            })
            .catch(error => {
                console.error('Error processing conversation:', error);
                sendResponse({
                    type: 'error',
                    error: error.message || 'An error occurred'
                });
            });

        // Return true to indicate we'll respond asynchronously
        return true;
    }

    if (message.type === 'ping') {
        sendResponse({ type: 'pong' });
        return true;
    }

    return false;
});

/**
 * Handle long-lived connections for streaming
 */
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'progress-stream') {
        const streamId = Date.now();
        activeStreams.set(streamId, port);

        port.onDisconnect.addListener(() => {
            activeStreams.delete(streamId);
        });

        // Send the stream ID back
        port.postMessage({ type: 'stream_ready', streamId });
    }
});

/**
 * Process conversation with progress updates
 */
async function processConversationWithUpdates(userQuestion, history, streamId) {
    sendProgressUpdate(streamId, 'progress', { status: 'Analyzing your question...' });

    // Discover available tools
    const tools = await getAtlanTools();
    if (!tools || tools.length === 0) {
        return {
            success: false,
            error: 'Unable to discover tools from Atlan MCP.'
        };
    }

    const messages = [
        ...history,
        {
            role: 'user',
            content: userQuestion
        }
    ];

    let conversationMessages = [...messages];
    let maxIterations = 5;
    let iteration = 0;
    let accumulatedText = '';

    while (iteration < maxIterations) {
        iteration++;
        console.log(`Iteration ${iteration}`);

        sendProgressUpdate(streamId, 'progress', { status: 'Thinking...' });

        // Ask Claude with discovered tools
        const claudeResponse = await askClaude(conversationMessages, tools);

        // Check stop reason
        if (claudeResponse.stop_reason === 'end_turn') {
            const finalContent = claudeResponse.content
                .filter(block => block.type === 'text')
                .map(block => block.text)
                .join('\n');

            accumulatedText += finalContent;
            sendProgressUpdate(streamId, 'content', { text: accumulatedText, isComplete: true });

            return {
                success: true,
                answer: accumulatedText
            };
        } else if (claudeResponse.stop_reason === 'tool_use') {
            console.log('Claude requested tool use');

            // Extract any text content before tool use
            const textContent = claudeResponse.content
                .filter(block => block.type === 'text')
                .map(block => block.text)
                .join('\n');

            if (textContent) {
                accumulatedText += textContent + '\n';
                sendProgressUpdate(streamId, 'content', { text: accumulatedText });
            }

            // Add Claude's response to conversation
            conversationMessages.push({
                role: 'assistant',
                content: claudeResponse.content
            });

            // Process each tool use request
            const toolResults = [];

            for (const contentBlock of claudeResponse.content) {
                if (contentBlock.type === 'tool_use') {
                    const toolName = contentBlock.name;
                    const toolInput = contentBlock.input;
                    const toolUseId = contentBlock.id;

                    console.log(`Executing tool: ${toolName}`, toolInput);
                    sendProgressUpdate(streamId, 'progress', {
                        status: `Searching Atlan: ${toolInput.query || 'processing...'}`
                    });

                    // Execute the tool
                    const result = await callAtlanMCP(toolName, toolInput);

                    if (result.error) {
                        toolResults.push({
                            type: 'tool_result',
                            tool_use_id: toolUseId,
                            content: `Error: ${result.message}`,
                            is_error: true
                        });
                    } else {
                        toolResults.push({
                            type: 'tool_result',
                            tool_use_id: toolUseId,
                            content: result.data
                        });
                    }
                }
            }

            // Add tool results to conversation
            conversationMessages.push({
                role: 'user',
                content: toolResults
            });

            sendProgressUpdate(streamId, 'progress', { status: 'Analyzing results...' });

            // Continue the loop
            continue;
        } else {
            console.log('Claude stopped with reason:', claudeResponse.stop_reason);

            const finalContent = claudeResponse.content
                .filter(block => block.type === 'text')
                .map(block => block.text)
                .join('\n');

            accumulatedText += finalContent;
            sendProgressUpdate(streamId, 'content', { text: accumulatedText, isComplete: true });

            return {
                success: true,
                answer: accumulatedText || 'I apologize, but I was unable to complete your request.'
            };
        }
    }

    return {
        success: false,
        error: 'Maximum iterations reached. Please try a simpler question.'
    };
}

// Service worker startup
console.log('Atlan AI Search background service worker started');

chrome.runtime.onInstalled.addListener((details) => {
    console.log('Extension installed/updated:', details.reason);
});
