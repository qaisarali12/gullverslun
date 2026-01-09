// server.js (CORRECT URL + NODE 16)
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// =========================================================
// 1. CONFIGURATION
// =========================================================
const COMPANY_KEY = 'aa7a9325f1a0'; 
const API_KEY = 'api-g2ndsPMuQvFmMcB0VRAkDQhdYYrT'; 

// ✅ FIX: Use the documented Production URL
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

        // Format Phone
        let cleanPhone = phone.toString().replace(/\D/g, ''); 
        if (cleanPhone.length === 7) cleanPhone = `+354${cleanPhone}`;
        else if (!cleanPhone.startsWith('354')) cleanPhone = `+${cleanPhone}`;
        else cleanPhone = `+${cleanPhone}`;

        console.log("Sending to Taktikal:", cleanPhone);

        // Call Taktikal (Correct URL)
        const response = await axios.post(`${TAKTIKAL_BASE_URL}/api/auth/start`, {
            phoneNumber: cleanPhone,
            type: "sim", 
            message: "Log in to Gold Market"
        }, {
            auth: { username: COMPANY_KEY, password: API_KEY },
            headers: { 
                'Content-Type': 'application/json',
                // Keep the browser masquerade just in case
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        console.log("✅ Taktikal Success:", response.data);

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
// 3. ROUTE: CHECK STATUS
// =========================================================
app.post('/api/check-auth-status', async (req, res) => {
    try {
        const { authRequestId } = req.body;
        
        const response = await axios.get(`${TAKTIKAL_BASE_URL}/api/auth/status/${authRequestId}`, {
            auth: { username: COMPANY_KEY, password: API_KEY },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        res.json(response.data); 

    } catch (error) {
        console.error("Polling Error:", error.message);
        res.status(500).json({ error: "Polling Failed" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));