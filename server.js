// server.js (FINAL SSL FIX)
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const https = require('https'); // Import HTTPS
const app = express();

app.use(cors());
app.use(express.json());

// =========================================================
// 1. CONFIGURATION
// =========================================================
const COMPANY_KEY = 'aa7a9325f1a0'; 
const API_KEY = 'api-g2ndsPMuQvFmMcB0VRAkDQhdYYrT'; 
const TAKTIKAL_BASE_URL = 'https://api.taktikal.is'; 

// =========================================================
// 2. SSL FIX (LEGACY MODE)
// =========================================================
// This tells Node.js to lower its security standards to match Taktikal
const sslAgent = new https.Agent({
    minVersion: 'TLSv1', // Allow older TLS versions
    ciphers: 'DEFAULT:@SECLEVEL=0' // Allow legacy ciphers
});

// =========================================================
// 3. ROUTE: START LOGIN
// =========================================================
app.post('/api/goldMarket-login-ver', async (req, res) => {
    try {
        const { phone } = req.body;
        console.log("------------------------------------------------");
        console.log("Incoming Login Request for:", phone);

        if (!phone) return res.status(400).json({ error: "Phone missing" });

        // Format Phone
        let cleanPhone = phone.toString().replace(/\D/g, ''); 
        if (cleanPhone.length === 7) {
            cleanPhone = `+354${cleanPhone}`;
        } else if (!cleanPhone.startsWith('354')) {
             cleanPhone = `+${cleanPhone}`;
        } else {
             cleanPhone = `+${cleanPhone}`;
        }

        console.log("Sending to Taktikal:", cleanPhone);

        // Call Taktikal
        const response = await axios.post(`${TAKTIKAL_BASE_URL}/api/auth/start`, {
            phoneNumber: cleanPhone,
            type: "sim", 
            message: "Log in to Gold Market"
        }, {
            auth: { username: COMPANY_KEY, password: API_KEY },
            headers: { 
                'Content-Type': 'application/json',
                'User-Agent': 'GoldMarket-Shopify/1.0'
            },
            httpsAgent: sslAgent // <--- USING THE FIX
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
        if (error.code) console.error("Error Code:", error.code);
        return res.status(500).json({ error: "Server Error" });
    }
});

// =========================================================
// 4. ROUTE: CHECK STATUS
// =========================================================
app.post('/api/check-auth-status', async (req, res) => {
    try {
        const { authRequestId } = req.body;
        
        const response = await axios.get(`${TAKTIKAL_BASE_URL}/api/auth/status/${authRequestId}`, {
            auth: { username: COMPANY_KEY, password: API_KEY },
            httpsAgent: sslAgent
        });

        res.json(response.data); 

    } catch (error) {
        console.error("Polling Error:", error.message);
        res.status(500).json({ error: "Polling Failed" });
    }
});

// START SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log("🔒 SSL Legacy Fix Applied (@SECLEVEL=0)"); 
}); 