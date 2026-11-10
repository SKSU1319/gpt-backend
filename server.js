const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// Frontend dashboard serve karne ke liye
app.use(express.static(path.join(__dirname)));

const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('DB error:', err));

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

const User = mongoose.model('User', userSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);

// Home route: seedha index.html dikhayega
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Balance check API
app.get('/api/user/:userId', async (req, res) => {
  try {
    let user = await User.findOne({ userId: req.params.userId });
    if (!user) {
      user = await User.create({ userId: req.params.userId, balance: 0 });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Postback API
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

    const netAmount = parseFloat(amount) * 0.50;

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
