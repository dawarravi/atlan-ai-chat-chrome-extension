// Popup script for Atlan AI Search Chrome Extension

(function() {
  'use strict';

  // DOM Elements
  const questionInput = document.getElementById('question-input');
  const sendButton = document.getElementById('send-button');
  const chatContainer = document.getElementById('chat-container');
  const clearChatLink = document.getElementById('clear-chat');
  const clearChatButton = document.getElementById('clear-chat-button');
  const resizeButton = document.getElementById('resize-button');
  const resizeMenu = document.getElementById('resize-menu');

  // Chat history
  let chatHistory = [];
  
  // Streaming connection
  let progressPort = null;
  let currentStreamId = null;
  
  // Joke rotation
  let jokeInterval = null;
  let currentJokes = [];
  let showingJokes = false;
  let jokeStartTime = null;
  let minJokeDisplayTime = 4000; // Minimum 4 seconds - ample time to read

  /**
   * Add a message to the chat
   */
  function addMessage(role, content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${role}`;
    
    const label = document.createElement('div');
    label.className = 'message-label';
    label.textContent = role === 'user' ? 'You' : 'Atlan AI';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    // Convert markdown-like formatting to HTML
    const formattedContent = formatMessage(content);
    contentDiv.innerHTML = formattedContent;
    
    messageDiv.appendChild(label);
    messageDiv.appendChild(contentDiv);
    chatContainer.appendChild(messageDiv);
    
    // Scroll to bottom
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    return messageDiv;
  }

  /**
   * Format message content (enhanced markdown support)
   */
  function formatMessage(text) {
    // First, extract and preserve code blocks
    const codeBlocks = [];
    let formatted = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
      const placeholder = `___CODE_BLOCK_${codeBlocks.length}___`;
      codeBlocks.push({ lang, code });
      return placeholder;
    });
    
    // Extract and preserve inline code
    const inlineCodes = [];
    formatted = formatted.replace(/`([^`]+)`/g, (match, code) => {
      const placeholder = `___INLINE_CODE_${inlineCodes.length}___`;
      inlineCodes.push(code);
      return placeholder;
    });
    
    // Escape HTML
    formatted = escapeHtml(formatted);
    
    // Convert **bold** to <strong>
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Convert *italic* to <em>
    formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    
    // Convert headers (## Header)
    formatted = formatted.replace(/^### (.*?)$/gm, '<h4>$1</h4>');
    formatted = formatted.replace(/^## (.*?)$/gm, '<h3>$1</h3>');
    formatted = formatted.replace(/^# (.*?)$/gm, '<h2>$1</h2>');
    
    // Convert bullet lists (must match multiple lines)
    const listItems = [];
    formatted = formatted.replace(/^[•\-\*]\s+(.+)$/gm, (match, content) => {
      listItems.push(content);
      return `__LIST_ITEM_${listItems.length - 1}__`;
    });
    
    // Group consecutive list items into ul
    if (listItems.length > 0) {
      let listHtml = '<ul>';
      listItems.forEach((item, i) => {
        listHtml += `<li>${item}</li>`;
      });
      listHtml += '</ul>';
      
      // Replace all list item placeholders with the complete list
      let currentList = '';
      formatted = formatted.split('\n').map(line => {
        if (line.includes('__LIST_ITEM_')) {
          if (!currentList) {
            currentList = '<ul>';
          }
          const idx = parseInt(line.match(/__LIST_ITEM_(\d+)__/)[1]);
          currentList += `<li>${listItems[idx]}</li>`;
          return '__IN_LIST__';
        } else {
          if (currentList) {
            currentList += '</ul>';
            const result = currentList;
            currentList = '';
            return result + '\n' + line;
          }
          return line;
        }
      }).filter(line => line !== '__IN_LIST__').join('\n');
      
      if (currentList) {
        currentList += '</ul>';
        formatted += '\n' + currentList;
      }
    }
    
    // Convert numbered lists
    const numberedItems = [];
    formatted = formatted.replace(/^\d+\.\s+(.+)$/gm, (match, content) => {
      numberedItems.push(content);
      return `__NUMBERED_ITEM_${numberedItems.length - 1}__`;
    });
    
    if (numberedItems.length > 0) {
      let currentList = '';
      formatted = formatted.split('\n').map(line => {
        if (line.includes('__NUMBERED_ITEM_')) {
          if (!currentList) {
            currentList = '<ol>';
          }
          const idx = parseInt(line.match(/__NUMBERED_ITEM_(\d+)__/)[1]);
          currentList += `<li>${numberedItems[idx]}</li>`;
          return '__IN_NUMBERED_LIST__';
        } else {
          if (currentList) {
            currentList += '</ol>';
            const result = currentList;
            currentList = '';
            return result + '\n' + line;
          }
          return line;
        }
      }).filter(line => line !== '__IN_NUMBERED_LIST__').join('\n');
      
      if (currentList) {
        currentList += '</ol>';
        formatted += '\n' + currentList;
      }
    }
    
    // Convert URLs to clickable links (before restoring code)
    formatted = formatted.replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" target="_blank" class="external-link">$1</a>'
    );
    
    // Detect and format Atlan asset links and table names
    // Format qualified names (e.g., database/schema/table)
    if (typeof CONFIG !== 'undefined' && CONFIG.atlan && CONFIG.atlan.tenantUrl) {
      formatted = formatted.replace(
        /(\w+)\/(\w+)\/([a-zA-Z0-9_-]+)/g,
        (match, type, category, id) => {
          const atlasUrl = `${CONFIG.atlan.tenantUrl}/assets/${id}`;
          return `<a href="${atlasUrl}" target="_blank" class="atlan-asset-link" title="Open in Atlan">${match}</a>`;
        }
      );
    }
    
    // Format table/asset names that look like identifiers (uppercase with underscores)
    formatted = formatted.replace(
      /\b([A-Z][A-Z0-9_]{2,})\b/g,
      '<span class="asset-name">$1</span>'
    );
    
    // Restore inline code
    inlineCodes.forEach((code, i) => {
      formatted = formatted.replace(
        `___INLINE_CODE_${i}___`,
        `<code class="inline-code">${code}</code>`
      );
    });
    
    // Restore code blocks
    codeBlocks.forEach((block, i) => {
      const langClass = block.lang ? ` language-${block.lang}` : '';
      const codeHtml = `<pre class="code-block"><code class="${langClass}">${block.code}</code></pre>`;
      formatted = formatted.replace(`___CODE_BLOCK_${i}___`, codeHtml);
    });
    
    // Convert line breaks (after all other processing)
    formatted = formatted.replace(/\n\n/g, '<br><br>');
    formatted = formatted.replace(/\n/g, '<br>');
    
    // Clean up extra breaks around block elements
    formatted = formatted.replace(/<br><br>(<[uh][1-4l]>)/g, '$1');
    formatted = formatted.replace(/(<\/[uh][1-4l]>)<br><br>/g, '$1');
    
    return formatted;
  }

  /**
   * Show loading indicator
   */
  function showLoading(text = 'Thinking...') {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message message-assistant';
    loadingDiv.id = 'loading-indicator';
    
    const label = document.createElement('div');
    label.className = 'message-label';
    label.textContent = 'Atlan AI';
    
    const loadingContent = document.createElement('div');
    loadingContent.className = 'message-loading';
    loadingContent.innerHTML = `
      <div class="loading-dots">
        <div class="loading-dot"></div>
        <div class="loading-dot"></div>
        <div class="loading-dot"></div>
      </div>
      <span class="loading-text" id="loading-text">${text}</span>
    `;
    
    loadingDiv.appendChild(label);
    loadingDiv.appendChild(loadingContent);
    chatContainer.appendChild(loadingDiv);
    
    // Scroll to bottom
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    return loadingDiv;
  }

  /**
   * Update loading indicator text
   */
  function updateLoadingText(text) {
    const loadingText = document.getElementById('loading-text');
    if (loadingText) {
      loadingText.textContent = text;
    }
  }
  
  /**
   * Fetch a joke from background
   */
  async function fetchJoke() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'get_joke' });
      return response.joke || 'Searching for your data... 🔍';
    } catch (error) {
      console.error('Error fetching joke:', error);
      return 'Searching for your data... 🔍';
    }
  }
  
  /**
   * Start rotating jokes while loading
   */
  async function startJokeRotation() {
    console.log('🎭 Starting joke rotation...');
    
    // Clear any existing interval
    if (jokeInterval) {
      clearInterval(jokeInterval);
    }
    
    showingJokes = true;
    jokeStartTime = Date.now(); // Track when jokes started
    
    // Show a fallback joke IMMEDIATELY (no waiting!)
    const fallbackJokes = [
      "Why do data engineers prefer dark mode? Because light attracts bugs! 🐛",
      "A SQL query walks into a bar, walks up to two tables and asks... 'Can I JOIN you?' 🍺",
      "There are 10 types of people: those who understand binary and those who don't. 😄",
      "Why did the database administrator leave his wife? She had one-to-many relationships! 💔",
      "What's a data scientist's favorite type of tree? A decision tree! 🌳",
      "What do you call a data catalog that tells jokes? A laugh-alog! 😂",
      "How do you comfort a JavaScript bug? You console it! 🐞",
      "Why did the data pipeline break up? Too many dependencies! 💥"
    ];
    const quickJoke = fallbackJokes[Math.floor(Math.random() * fallbackJokes.length)];
    updateLoadingText('😄 ' + quickJoke);
    console.log('🎭 Showing quick joke:', quickJoke);
    
    // Pre-fetch 3 jokes in background (for rotation)
    currentJokes = [quickJoke];
    const jokePromises = [fetchJoke(), fetchJoke()];
    
    // Wait for jokes to load, but don't block
    Promise.all(jokePromises).then(newJokes => {
      if (showingJokes) {
        currentJokes.push(...newJokes);
        console.log('🎭 Loaded', currentJokes.length, 'total jokes');
      }
    });
    
    let jokeIndex = 0;
    
    // Rotate jokes every 3.5 seconds
    jokeInterval = setInterval(async () => {
      if (!showingJokes) {
        clearInterval(jokeInterval);
        return;
      }
      
      if (currentJokes.length > 1) {
        jokeIndex = (jokeIndex + 1) % currentJokes.length;
        const joke = currentJokes[jokeIndex];
        updateLoadingText('😄 ' + joke);
        console.log('🎭 Rotating to joke', jokeIndex + 1, ':', joke);
        
        // Fetch a new joke to keep fresh content
        if (jokeIndex === 0 && currentJokes.length < 5) {
          fetchJoke().then(newJoke => {
            if (showingJokes) {
              currentJokes.push(newJoke);
            }
          });
        }
      }
    }, 3500);
  }
  
  /**
   * Stop rotating jokes
   */
  function stopJokeRotation() {
    console.log('🎭 Stopping joke rotation');
    showingJokes = false;
    jokeStartTime = null;
    if (jokeInterval) {
      clearInterval(jokeInterval);
      jokeInterval = null;
    }
    currentJokes = [];
  }

  /**
   * Remove loading indicator
   */
  function removeLoading() {
    stopJokeRotation(); // Stop joke rotation
    const loadingDiv = document.getElementById('loading-indicator');
    if (loadingDiv) {
      loadingDiv.remove();
    }
  }
  
  /**
   * Create or update streaming message
   */
  function updateStreamingMessage(content, isComplete = false) {
    let streamingDiv = document.getElementById('streaming-message');
    
    if (!streamingDiv) {
      // Create new streaming message
      streamingDiv = document.createElement('div');
      streamingDiv.className = 'message message-assistant';
      streamingDiv.id = 'streaming-message';
      
      const label = document.createElement('div');
      label.className = 'message-label';
      label.textContent = 'Atlan AI';
      
      const contentDiv = document.createElement('div');
      contentDiv.className = 'message-content';
      contentDiv.id = 'streaming-content';
      
      streamingDiv.appendChild(label);
      streamingDiv.appendChild(contentDiv);
      chatContainer.appendChild(streamingDiv);
    }
    
    // Update content
    const contentDiv = document.getElementById('streaming-content');
    if (contentDiv) {
      contentDiv.innerHTML = formatMessage(content);
    }
    
    // Scroll to bottom
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    // If complete, remove the ID so it becomes a permanent message
    if (isComplete) {
      streamingDiv.id = '';
      const contentDiv = streamingDiv.querySelector('.message-content');
      if (contentDiv) {
        contentDiv.id = '';
      }
    }
  }

  /**
   * Show error message
   */
  function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `
      <div class="error-title">⚠️ Error</div>
      <div>${escapeHtml(message)}</div>
    `;
    chatContainer.appendChild(errorDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  /**
   * Setup streaming connection
   */
  function setupStreamingConnection() {
    return new Promise((resolve) => {
      if (progressPort && currentStreamId) {
        resolve(currentStreamId);
        return;
      }
      
      progressPort = chrome.runtime.connect({ name: 'progress-stream' });
      
    progressPort.onMessage.addListener((msg) => {
      if (msg.type === 'stream_ready') {
        currentStreamId = msg.streamId;
        resolve(currentStreamId);
      } else if (msg.type === 'progress') {
        // Stop jokes when real progress starts (but ensure minimum display time)
        console.log('📡 Progress update:', msg.status);
        if (showingJokes) {
          const elapsedTime = Date.now() - jokeStartTime;
          const timeRemaining = minJokeDisplayTime - elapsedTime;
          
          if (timeRemaining > 0) {
            console.log(`🎭 Delaying progress update by ${timeRemaining}ms to show joke`);
            // Delay the progress update to ensure joke is visible
            setTimeout(() => {
              if (showingJokes) {
                stopJokeRotation();
                updateLoadingText(msg.status);
              }
            }, timeRemaining);
          } else {
            console.log('🎭 Stopping jokes due to progress update');
            stopJokeRotation();
            updateLoadingText(msg.status);
          }
        } else {
          updateLoadingText(msg.status);
        }
      } else if (msg.type === 'content') {
        // Ensure jokes are visible for minimum time before showing content
        if (showingJokes && jokeStartTime) {
          const elapsedTime = Date.now() - jokeStartTime;
          const timeRemaining = minJokeDisplayTime - elapsedTime;
          
          if (timeRemaining > 0) {
            console.log(`🎭 Delaying content by ${timeRemaining}ms to show joke`);
            setTimeout(() => {
              removeLoading();
              updateStreamingMessage(msg.text, msg.isComplete);
              
              if (msg.isComplete) {
                chatHistory.push({ role: 'assistant', content: msg.text });
                saveChatHistory();
              }
            }, timeRemaining);
            return;
          }
        }
        
        // Remove loading indicator when streaming starts
        removeLoading();
        // Update the message with streaming content
        updateStreamingMessage(msg.text, msg.isComplete);
        
        // If complete, save to history
        if (msg.isComplete) {
          chatHistory.push({ role: 'assistant', content: msg.text });
          saveChatHistory();
        }
      }
    });
      
      progressPort.onDisconnect.addListener(() => {
        progressPort = null;
        currentStreamId = null;
      });
    });
  }

  /**
   * Send question to background script with streaming
   */
  async function sendQuestion(question) {
    if (!question || question.trim().length === 0) {
      return;
    }

    const trimmedQuestion = question.trim();
    
    // Add user message to chat
    addMessage('user', trimmedQuestion);
    chatHistory.push({ role: 'user', content: trimmedQuestion });
    
    // Clear input
    questionInput.value = '';
    questionInput.style.height = 'auto';
    
    // Disable input while processing
    questionInput.disabled = true;
    sendButton.disabled = true;
    
    // Show loading with a joke immediately
    const quickJokes = [
      "Why do data engineers prefer dark mode? Because light attracts bugs! 🐛",
      "A SQL query walks into a bar, walks up to two tables and asks... 'Can I JOIN you?' 🍺",
      "There are 10 types of people: those who understand binary and those who don't. 😄"
    ];
    const randomJoke = quickJokes[Math.floor(Math.random() * quickJokes.length)];
    showLoading('😄 ' + randomJoke);
    
    // Start rotating jokes to keep user entertained
    startJokeRotation();
    
    try {
      // Setup streaming connection and wait for stream ID
      const streamId = await setupStreamingConnection();
      
      // Send to background script with stream ID
      const response = await chrome.runtime.sendMessage({
        type: 'ask_question',
        question: trimmedQuestion,
        history: chatHistory.slice(0, -1), // Send history without current question
        streamId: streamId
      });
      
      // Remove loading (in case it's still showing)
      removeLoading();
      
      if (response.type === 'answer') {
        // Check if we already added this to history via streaming
        const lastMessage = chatHistory[chatHistory.length - 1];
        if (!lastMessage || lastMessage.role !== 'assistant' || lastMessage.content !== response.answer) {
          // Add to history if not already there
          chatHistory.push({ role: 'assistant', content: response.answer });
        }
        
        // Save chat history
        saveChatHistory();
      } else if (response.type === 'error') {
        showError(response.error || 'An error occurred');
      }
    } catch (error) {
      stopJokeRotation();
      removeLoading();
      console.error('Error sending question:', error);
      showError('Failed to communicate with the extension. Please try again.');
    } finally {
      // Re-enable input
      questionInput.disabled = false;
      sendButton.disabled = false;
      questionInput.focus();
    }
  }

  /**
   * Save chat history to storage
   */
  function saveChatHistory() {
    chrome.storage.local.set({
      chatHistory: chatHistory,
      lastUpdated: Date.now()
    });
  }

  /**
   * Load chat history from storage
   */
  function loadChatHistory() {
    chrome.storage.local.get(['chatHistory'], (result) => {
      if (result.chatHistory && result.chatHistory.length > 0) {
        // Remove welcome message
        const welcomeMsg = chatContainer.querySelector('.welcome-message');
        if (welcomeMsg) {
          welcomeMsg.remove();
        }
        
        // Restore chat history
        chatHistory = result.chatHistory;
        chatHistory.forEach(msg => {
          addMessage(msg.role, msg.content);
        });
      }
    });
  }

  /**
   * Clear chat history
   */
  function clearChat() {
    if (confirm('Are you sure you want to clear the chat history?')) {
      chatHistory = [];
      chatContainer.innerHTML = `
        <div class="welcome-message">
          <p>👋 <strong>Welcome to Atlan AI!</strong></p>
          <p>I'm your intelligent data catalog assistant. I can help you:</p>
          <ul>
            <li>🔍 Find tables, columns, and datasets instantly</li>
            <li>📚 Search glossary terms and business definitions</li>
            <li>🏷️ Discover assets by tags, owners, or classifications</li>
          </ul>
          <p class="tip-text">💡 Try: "Show me customer tables owned by ravi" or "Find verified tables for sales analysis"</p>
        </div>
      `;
      saveChatHistory();
    }
  }

  /**
   * Toggle resize menu
   */
  function toggleResizeMenu() {
    const isVisible = resizeMenu.style.display !== 'none';
    resizeMenu.style.display = isVisible ? 'none' : 'block';
  }

  /**
   * Get current window size
   */
  function getCurrentSize() {
    const width = document.body.offsetWidth;
    const height = document.body.offsetHeight;
    
    if (width === 400 && height === 500) return 'small';
    if (width === 450 && height === 600) return 'medium';
    if (width === 550 && height === 700) return 'large';
    if (width === 650 && height === 800) return 'xlarge';
    return 'medium'; // default
  }

  /**
   * Update active size indicator
   */
  function updateActiveSizeIndicator() {
    const currentSize = getCurrentSize();
    const options = document.querySelectorAll('.resize-option');
    options.forEach(option => {
      if (option.dataset.size === currentSize) {
        option.classList.add('active');
      } else {
        option.classList.remove('active');
      }
    });
  }

  /**
   * Resize window
   */
  function resizeWindow(size) {
    const sizes = {
      small: { width: 400, height: 500 },
      medium: { width: 450, height: 600 },
      large: { width: 550, height: 700 },
      xlarge: { width: 650, height: 800 }
    };

    const dimensions = sizes[size];
    if (dimensions) {
      document.body.style.width = dimensions.width + 'px';
      document.body.style.height = dimensions.height + 'px';
      
      // Save preference
      chrome.storage.local.set({ windowSize: size });
      
      // Update indicator
      setTimeout(updateActiveSizeIndicator, 100);
    }

    // Close menu
    resizeMenu.style.display = 'none';
  }

  /**
   * Load saved window size
   */
  function loadSavedSize() {
    chrome.storage.local.get(['windowSize'], (result) => {
      if (result.windowSize) {
        resizeWindow(result.windowSize);
      } else {
        // Set default to medium
        updateActiveSizeIndicator();
      }
    });
  }

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Auto-resize textarea
   */
  function autoResizeTextarea() {
    questionInput.style.height = 'auto';
    questionInput.style.height = Math.min(questionInput.scrollHeight, 100) + 'px';
  }

  /**
   * Initialize event listeners
   */
  function init() {
    // Send button click
    sendButton.addEventListener('click', () => {
      const question = questionInput.value;
      sendQuestion(question);
    });

    // Enter key in textarea (Shift+Enter for new line)
    questionInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        const question = questionInput.value;
        sendQuestion(question);
      }
    });

    // Auto-resize textarea
    questionInput.addEventListener('input', autoResizeTextarea);

    // Clear chat link (footer)
    clearChatLink.addEventListener('click', (event) => {
      event.preventDefault();
      clearChat();
    });

    // Clear chat button (header)
    clearChatButton.addEventListener('click', () => {
      clearChat();
    });

    // Resize button
    resizeButton.addEventListener('click', () => {
      toggleResizeMenu();
    });

    // Resize options
    const resizeOptions = document.querySelectorAll('.resize-option');
    resizeOptions.forEach(option => {
      option.addEventListener('click', () => {
        const size = option.dataset.size;
        resizeWindow(size);
      });
    });

    // Close resize menu when clicking outside
    document.addEventListener('click', (event) => {
      if (!resizeButton.contains(event.target) && !resizeMenu.contains(event.target)) {
        resizeMenu.style.display = 'none';
      }
    });

    // Focus input on load
    questionInput.focus();

    // Load previous chat history
    loadChatHistory();

    // Load saved window size
    loadSavedSize();
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
