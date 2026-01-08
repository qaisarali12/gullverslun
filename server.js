// server.js (PRODUCTION READY)
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// =========================================================
// 1. PRODUCTION CONFIGURATION
// =========================================================
const COMPANY_KEY = 'aa7a9325f1a0'; 
const API_KEY = 'api-g2ndsPMuQvFmMcB0VRAkDQhdYYrT'; 

// LIVE URL: Using the real production API
const TAKTIKAL_BASE_URL = 'https://api.taktikal.is';

// =========================================================
// 2. ROUTE: START LOGIN
// =========================================================
app.post('/api/goldMarket-login-ver', async (req, res) => {
    try {
        const { phone } = req.body; 
        console.log("------------------------------------------------");
        console.log("Incoming Login Request for:", phone);

        if (!phone) return res.status(400).json({ error: "Phone missing" });

        // 1. Format Phone Number (Must be +354 for Iceland)
        // Removes spaces and ensures it starts with +354 if user typed "1234567"
        let cleanPhone = phone.toString().replace(/\D/g, ''); // Remove non-numbers
           
        // Safety check: Icelandic numbers are 7 digits.
        if (cleanPhone.length === 7) {
            cleanPhone = `+354${cleanPhone}`;
        } else if (!cleanPhone.startsWith('354')) {
             // If they typed 3541234567, just add +, otherwise assume local
             cleanPhone = `+${cleanPhone}`;
        } else {
             cleanPhone = `+${cleanPhone}`;
        }

        console.log("Sending to Taktikal:", cleanPhone);

        // 2. Call Taktikal API
        const response = await axios.post(`${TAKTIKAL_BASE_URL}/api/auth/start`, {
            phoneNumber: cleanPhone,
            type: "sim", // Triggers the phone SIM card prompt
            message: "Log in to Gold Market"
        }, {
            auth: {
                username: COMPANY_KEY,
                password: API_KEY
            },
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'GoldMarket-Shopify/1.0'
            }
        });

        console.log("✅ Taktikal Success:", response.data);

        // 3. Send Request ID to Frontend
        res.json({ 
            message: "Auth Started", 
            authRequestId: response.data.authRequestId 
        });

    } catch (error) {
        console.error("❌ Taktikal Error:", error.message);
        if (error.response) {
            console.error("Details:", error.response.data);
            return res.status(error.response.status).json(error.response.data);
        }
        return res.status(500).json({ error: "Server Error" });
    }
});

// =========================================================
// 3. ROUTE: CHECK STATUS (POLLING)
// =========================================================
app.post('/api/check-auth-status', async (req, res) => {
    try {
        const { authRequestId } = req.body;
        
        const response = await axios.get(`${TAKTIKAL_BASE_URL}/api/auth/status/${authRequestId}`, {
            auth: { username: COMPANY_KEY, password: API_KEY }
        });

        // Pass the full status back to frontend (PENDING, SUCCESS, FAILED)
        res.json(response.data); 

    } catch (error) {
        console.error("Polling Error:", error.message);
        res.status(500).json({ error: "Polling Failed" });
    }
});

// Start Server
app.listen(3000, () => console.log('REAL Taktikal Server running on port 3000'));