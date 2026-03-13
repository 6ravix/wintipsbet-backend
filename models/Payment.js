const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
  userId:             { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  email:              { type: String, required: true },
  phone:              { type: String, required: true },

  // Plan details
  plan:               { type: String, enum: ['daily','weekly','monthly'], required: true },
  amount:             { type: Number, required: true },  // KES

  // Daraja fields
  checkoutRequestId:  { type: String, index: true },
  merchantRequestId:  { type: String },
  mpesaReceiptNumber: { type: String, default: null },
  mpesaPhone:         { type: String, default: null },

  // Status lifecycle
  status:             {
    type:    String,
    enum:    ['pending','completed','failed','cancelled','timeout'],
    default: 'pending',
    index:   true,
  },

  // Access window granted
  accessFrom:         { type: Date, default: null },
  accessUntil:        { type: Date, default: null },  // always midnight

  rawCallback:        { type: mongoose.Schema.Types.Mixed, default: null },
  initiatedAt:        { type: Date, default: Date.now },
  completedAt:        { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Payment', PaymentSchema);
