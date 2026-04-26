const { Groq } = require('groq-sdk');

let groq = null;
let groqAvailable = false;

// Initialize Groq with better error handling
function initializeGroq() {
  const apiKey = process.env.GROQ_API_KEY;
  
  if (!apiKey || apiKey === 'your_groq_api_key_here') {
    console.log('ℹ️  Groq API key not configured - AI chat support disabled');
    return false;
  }

  try {
    groq = new Groq({ apiKey });
    groqAvailable = true;
    console.log('✅ Groq AI initialized successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize Groq AI:', error.message);
    groq = null;
    groqAvailable = false;
    return false;
  }
}

// Initialize on module load
initializeGroq();

const SYSTEM_PROMPT = `You are a helpful and specialized AI assistant for the GST (Goods and Services Tax) Compliance System.
Your target audience is exclusively "Accountants" using this software.

YOUR PRIMARY RESPONSIBILITIES:
1. Answer GST-related questions (e.g., about GSTR-1, GSTR-3B, TDS, HSN codes, reconciliation).
2. Guide users in using the GST system correctly.
3. Help with system navigation (e.g., where to find Sales Invoices, Purchases, Compliance Calendar, etc.).

STRICT RESTRICTIONS:
- You DO NOT have permission to perform any actions directly. You cannot create, edit, or delete invoices, parties, returns, or any data. You must guide the user to do it themselves.
- You CANNOT access or provide guidance on Admin features (since the user is an Accountant).
- If the user asks about a business being unassigned or why they cannot access data because of no business, YOU MUST suggest that they "contact the system admin to get a business assigned".
- Never invent URLs. Only refer to sections logically (e.g., "Go to the Invoices tab").
- Keep your instructions concise and professional. Use formatting (bullet points, bold text) where appropriate for readability.
- If you are asked something completely unrelated to the GST system or accounting, politely remind the user that you are specialized in GST Compliance and cannot help with outside topics.`;

// Fallback responses for common GST queries when AI is unavailable
const FALLBACK_RESPONSES = {
  'invoice': 'To manage invoices, go to the "Sales Invoices" tab. You can create, edit, and confirm invoices there. 📄',
  'return': 'GST returns (GSTR-1, GSTR-3B) are under the "GST Returns" tab. 📊',
  'gstr': 'GST returns (GSTR-1, GSTR-3B) are under the "GST Returns" tab. 📊',
  'hsn': 'Search HSN/SAC codes using the "HSN Lookup" tool in the sidebar. 🔍',
  'sac': 'Search HSN/SAC codes using the "HSN Lookup" tool in the sidebar. 🔍',
  'compliance': 'Open the "Compliance" tab to see all upcoming and overdue GST deadlines. 📅',
  'purchase': 'Track all purchases under the "Purchases" section. 🧾',
  'tds': 'Manage TDS entries from the "TDS" module in the sidebar. 💰',
  'export': 'Use the Export feature to download reports as PDF or Excel. 📥',
  'party': 'Manage all parties under the "Parties" section. 👥',
  'reconcil': 'Reconcile purchase data with GSTR-2A/2B under the "Reconciliation" tab. ✔',
  'hello': 'Hello! I am the GST Support Bot 🤖. I can help with invoices, returns, HSN codes, compliance, and more.',
  'hi': 'Hello! I am the GST Support Bot 🤖. I can help with invoices, returns, HSN codes, compliance, and more.',
  'thank': "You're welcome! Anything else I can help with? 😊"
};

function getFallbackResponse(userMessage) {
  const msg = (userMessage || '').toLowerCase();
  
  for (const [keyword, response] of Object.entries(FALLBACK_RESPONSES)) {
    if (msg.includes(keyword)) {
      return {
        resolved: true,
        message: response
      };
    }
  }
  
  return {
    resolved: false,
    message: "I couldn't understand your query. Please describe it differently, or contact support for assistance. You can also try asking about invoices, returns, HSN codes, compliance, or other GST topics."
  };
}

/**
 * Generate a response using Groq AI or fallback to rule-based responses
 * @param {string} userMessage - the new user message
 * @param {Array} chatHistory - previous messages in the chat {role: 'user'|'admin', content: '...'}
 * @returns {Promise<{message: string, resolved: boolean}>}
 */
async function generateGstResponse(userMessage, chatHistory = []) {
  // If Groq is not available, use fallback responses
  if (!groqAvailable || !groq) {
    return getFallbackResponse(userMessage);
  }

  try {
    // Convert history into Groq format, we assume history is sorted oldest to newest
    const messages = chatHistory.map(msg => ({
      role: msg.role === 'admin' ? 'assistant' : 'user', // "admin" role from DB is the "assistant" from LLM's perspective
      content: msg.message
    }));

    messages.push({ role: 'user', content: userMessage });

    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages
      ],
      model: 'llama3-8b-8192',
      temperature: 0.3,
      max_tokens: 500,
      timeout: 10000 // 10 second timeout
    });

    const replyText = completion.choices[0]?.message?.content || "I am sorry, I was unable to generate a response.";
    return {
      resolved: true,
      message: replyText.trim()
    };
  } catch (error) {
    console.error('Groq AI Error:', error.message);
    
    // If API fails, fall back to rule-based responses
    console.log('Falling back to rule-based responses...');
    return getFallbackResponse(userMessage);
  }
}

/**
 * Check if Groq AI is available
 * @returns {boolean}
 */
function isGroqAvailable() {
  return groqAvailable;
}

/**
 * Get Groq configuration status
 * @returns {object}
 */
function getGroqStatus() {
  return {
    available: groqAvailable,
    configured: !!process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'your_groq_api_key_here',
    apiKey: process.env.GROQ_API_KEY ? `${process.env.GROQ_API_KEY.substring(0, 8)}...` : 'Not set'
  };
}

module.exports = { 
  generateGstResponse, 
  isGroqAvailable, 
  getGroqStatus,
  initializeGroq 
};
