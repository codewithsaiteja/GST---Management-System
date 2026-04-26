const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'GST Compliance System API',
      version: '2.0.0',
      description: 'Full-featured GST Compliance & Transaction Management API',
    },
    servers: [{ url: '/api', description: 'API Base' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
      }
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Authentication & user management' },
      { name: 'Businesses', description: 'Business/GSTIN management' },
      { name: 'Invoices', description: 'Sales invoice operations' },
      { name: 'Purchases', description: 'Purchase invoice operations' },
      { name: 'Payments', description: 'Payment tracking & P&L' },
      { name: 'Returns', description: 'GST return filing' },
      { name: 'Compliance', description: 'Compliance calendar' },
      { name: 'Parties', description: 'Customer & vendor management' },
      { name: 'Analytics', description: 'Dashboard & reports' },
      { name: 'HSN', description: 'HSN/SAC code lookup' },
      { name: 'TDS', description: 'TDS/TCS entries' },
      { name: 'Tickets', description: 'Support tickets' },
      { name: 'Audit', description: 'Audit trail' },
      { name: 'Users', description: 'User management (admin)' },
    ],
  },
  apis: ['./backend/routes/*.js'],
};

module.exports = swaggerJsdoc(options);
