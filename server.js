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

// Payout / Redeem API
app.post('/api/payout', async (req, res) => {
  const { userId, type, method, details, amount } = req.body;
  const numAmount = parseFloat(amount);

  try {
    const user = await User.findOne({ userId });
    if (!user || user.balance < numAmount) {
      return res.status(400).json({ success: false, message: 'Insufficient balance!' });
    }

    user.balance -= numAmount;
    await user.save();

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

// Secret Admin Panel: Saari payout requests dekhne ke liye
app.get('/admin/payouts', async (req, res) => {
  try {
    const payouts = await Payout.find().sort({ createdAt: -1 });
    let rows = payouts.map(p => `
      <tr>
        <td style="padding:10px; border:1px solid #334155;">${p.userId}</td>
        <td style="padding:10px; border:1px solid #334155; text-transform:uppercase; font-weight:bold; color:#38bdf8;">${p.type} (${p.method})</td>
        <td style="padding:10px; border:1px solid #334155; color:#a3e635;">${p.details}</td>
        <td style="padding:10px; border:1px solid #334155; font-weight:bold;">$${Number(p.amount).toFixed(2)}</td>
        <td style="padding:10px; border:1px solid #334155;">${new Date(p.createdAt).toLocaleString()}</td>
      </tr>
    `).join('');

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Admin Payouts Manager</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="background:#0f172a; color:#f8fafc; font-family:sans-serif; padding:20px;">
        <h2>Pending & Processed Payout Requests</h2>
        <p style="color:#94a3b8; font-size:14px; margin-bottom:16px;">Yeh sirf aapke dekhne ke liye hai.</p>
        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; background:#1e293b; text-align:left; font-size:14px;">
            <thead>
              <tr style="background:#334155; color:#f8fafc;">
                <th style="padding:10px; border:1px solid #334155;">User</th>
                <th style="padding:10px; border:1px solid #334155;">Method</th>
                <th style="padding:10px; border:1px solid #334155;">Payment Address / ID</th>
                <th style="padding:10px; border:1px solid #334155;">Amount</th>
                <th style="padding:10px; border:1px solid #334155;">Date & Time</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="5" style="padding:15px; text-align:center; color:#94a3b8;">Koi payout request nahi mili.</td></tr>'}
            </tbody>
          </table>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send('Error loading admin panel');
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
