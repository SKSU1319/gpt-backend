const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Frontend static serve
app.use(express.static(path.join(__dirname)));

const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB!'))
  .catch(err => console.error('DB error:', err));

// Schemas
const userSchema = new mongoose.Schema({
  userId: { type: String, unique: true },
  balance: { type: Number, default: 0 }
});

const transactionSchema = new mongoose.Schema({
  transactionId: { type: String, unique: true },
  userId: String,
  amount: Number,
  createdAt: { type: Date, default: Date.now }
});

const payoutSchema = new mongoose.Schema({
  userId: String,
  type: String, // 'withdraw' ya 'redeem'
  method: String, // 'upi', 'paypal', 'playstore', etc.
  details: String, // UPI ID / Email
  amount: Number,
  status: { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const Payout = mongoose.model('Payout', payoutSchema);

// Home route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Balance check API
app.get('/api/user/:userId', async (req, res) => {
  try {
    let user = await User.findOne({ userId: req.params.userId });
    if (!user) {
      user = await User.create({ userId: req.params.userId, balance: 1.00 });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Server error!' });
  }
});

// Payout / Redeem API (Redeem aur Withdraw popup ke liye)
app.post('/api/payout', async (req, res) => {
  const { userId, type, method, details, amount } = req.body;
  const numAmount = parseFloat(amount);

  try {
    const user = await User.findOne({ userId });
    if (!user || user.balance < numAmount) {
      return res.status(400).json({ success: false, message: 'Insufficient balance!' });
    }

    // Balance deduct
    user.balance -= numAmount;
    await user.save();

    // Payout record save
    const newPayout = await Payout.create({
      userId,
      type,
      method,
      details,
      amount: numAmount
    });

    res.json({ success: true, newBalance: user.balance, payoutId: newPayout._id });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Payout processing error' });
  }
});

// Postback API (CPALead / Ad Network webhook)
app.get('/api/postback', async (req, res) => {
  const { user_id, amount, transaction_id, secret } = req.query;

  if (secret !== 'MY_SECRET_KEY_123') {
    return res.status(403).send('Invalid secret');
  }

  try {
    const exists = await Transaction.findOne({ transactionId: transaction_id });
    if (exists) {
      return res.status(200).send('Duplicate transaction');
    }

    const netAmount = parseFloat(amount) * 0.50; // 50% user ko credit

    await Transaction.create({
      transactionId: transaction_id,
      userId: user_id,
      amount: netAmount
    });

    await User.findOneAndUpdate(
      { userId: user_id },
      { $inc: { balance: netAmount } },
      { upsert: true, new: true }
    );

    res.status(200).send('OK');
  } catch (err) {
    res.status(500).send('Database error');
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
