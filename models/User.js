const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  firstName:   { type: String, required: true, trim: true },
  lastName:    { type: String, required: true, trim: true },
  email:       { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:    { type: String, required: true, minlength: 8 },
  phone:       { type: String, default: null },

  // Active subscription snapshot (denormalised for fast reads)
  plan:        { type: String, enum: ['none','daily','weekly','monthly'], default: 'none' },
  planExpiry:  { type: Date,   default: null },

  isVerified:  { type: Boolean, default: false },
  createdAt:   { type: Date,    default: Date.now },
}, { timestamps: true });

// Hash password before save
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password
UserSchema.methods.matchPassword = async function (plain) {
  return bcrypt.compare(plain, this.password);
};

// Virtual: is plan currently active?
UserSchema.virtual('isPremium').get(function () {
  return this.plan !== 'none' && this.planExpiry && new Date() < this.planExpiry;
});

module.exports = mongoose.model('User', UserSchema);
