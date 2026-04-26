const { ChatAuditLog } = require('./db');

/**
 * Log chat-related actions for audit trail
 * @param {Object} params - Audit log parameters
 * @param {string} params.action - Action performed (sent, deleted, edited, etc.)
 * @param {string} params.messageId - Message ID (if applicable)
 * @param {string} params.conversationId - Conversation ID
 * @param {string} params.senderId - Original sender ID
 * @param {string} params.senderName - Original sender name
 * @param {string} params.senderRole - Original sender role
 * @param {string} params.messageText - Message content (for deleted messages)
 * @param {string} params.performedBy - User who performed the action
 * @param {string} params.performedByRole - Role of user who performed action
 * @param {string} params.ipAddress - IP address
 * @param {string} params.userAgent - User agent
 * @param {Object} params.metadata - Additional metadata
 */
async function logChatAction(params) {
  try {
    await ChatAuditLog.create({
      messageId: params.messageId || null,
      conversationId: params.conversationId,
      senderId: params.senderId,
      senderName: params.senderName,
      senderRole: params.senderRole,
      action: params.action,
      messageText: params.messageText || '',
      performedBy: params.performedBy,
      performedByRole: params.performedByRole,
      ipAddress: params.ipAddress || '',
      userAgent: params.userAgent || '',
      metadata: params.metadata || {}
    });
  } catch (error) {
    console.error('Failed to log chat action:', error);
    // Don't throw - audit logging should not break main functionality
  }
}

/**
 * Get client IP address from request
 */
function getClientIP(req) {
  return req.ip || 
         req.connection?.remoteAddress || 
         req.socket?.remoteAddress || 
         (req.connection?.socket ? req.connection.socket.remoteAddress : null) ||
         'unknown';
}

module.exports = {
  logChatAction,
  getClientIP
};