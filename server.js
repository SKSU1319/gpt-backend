const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/earnhub');

const User = mongoose.model('User', new mongoose.Schema({
    userId: String,
    balance: { type: Number, default: 0 }
}));

const Transaction = mongoose.model('Transaction', new mongoose.Schema({
    transactionId: { type: String, unique: true },
    userId: String,
    amount: Number
}));

// 1. User Balance check karne ka API
app.get('/api/user/:id', async (req, res) => {
    let user = await User.findOne({ userId: req.params.id });
    if (!user) user = await User.create({ userId: req.params.id, balance: 0 });
    res.json(user);
});

// 2. Postback Endpoint (Offerwall network isko call karega)
app.get('/api/postback', async (req, res) => {
    const { user_id, amount, secret, transaction_id } = req.query;

    // Security: Secret key check karein
    if (secret !== "YOUR_OFFERWALL_SECRET_KEY") {
        return res.status(403).send("Unauthorized");
    }

    try {
        // Prevent double credit: Check agar transaction pehle se record hai
        const exists = await Transaction.findOne({ transactionId: transaction_id });
        if (exists) return res.send("OK");

        // 50% commission cut karein (jaise network ne $1 diya toh user ko $0.50 milega)
        const userReward = parseFloat(amount) * 0.50;

        // Database update karein
        await Transaction.create({ transactionId: transaction_id, userId: user_id, amount: userReward });
        await User.updateOne({ userId: user_id }, { $inc: { balance: userReward } });

        // Network ko OK send karein taaki signal dubara na aaye
        res.send("OK");
    } catch (err) {
        res.status(500).send("Error");
    }
});

app.listen(5000, () => console.log('Server running on port 5000'));
