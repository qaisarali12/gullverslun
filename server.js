const express = require("express");
const axios = require("axios");
const cors = require("cors");
const https = require("https");
const app = express();

app.use(cors());
app.use(express.json());

// ========================================================= 
// 1. CONFIGURATION (Production)
// =========================================================
const COMPANY_KEY = "aa7a9325f1a0"; 
const API_KEY = "api-g2ndsPMuQvFmMcB0VRAkDQhdYYrT"; 
const FLOW_KEY = "ad62cb968983"; 

// ✅ CORRECT PRODUCTION URL
const TAKTIKAL_BASE_URL = "https://api.taktikal.is";

// =========================================================
// 2. START LOGIN ROUTE
// =========================================================
// =========================================================
// 2. START LOGIN ROUTE
// =========================================================
app.post("/api/goldMarket-login-ver", async (req, res) => {
  try {
    const { phone } = req.body;
    console.log("Incoming Login Request:", phone);

    if (!phone) return res.status(400).json({ error: "Phone missing" });

    // Format phone number
    let cleanPhone = phone.toString().replace(/\D/g, "");
    if (cleanPhone.length === 7) cleanPhone = `+354${cleanPhone}`;
    else if (!cleanPhone.startsWith("354")) cleanPhone = `+${cleanPhone}`;
    else cleanPhone = `+${cleanPhone}`;

    console.log("Sending to Taktikal (Prod):", cleanPhone);

    // ✅ THE MASTER FIX FOR SSL ERROR 80
    // We combine IPv4 + Legacy Ciphers + SNI (Server Name)
    const agent = new https.Agent({
      rejectUnauthorized: true,
      family: 4,                        // 1. Force IPv4
      servername: 'api.taktikal.is',    // 2. Force SNI (Critical for Prod)
      minVersion: "TLSv1.2",            // 3. Force TLS 1.2
      ciphers: "DEFAULT@SECLEVEL=0"     // 4. Allow Legacy Ciphers
    });

    const response = await axios.post(
      `${TAKTIKAL_BASE_URL}/api/auth/start`,
      {
        "PhoneNumber": cleanPhone,
        "FlowKey": FLOW_KEY,
        "AuthenticationContextType": "Sim", 
        "IncludeVerificationCode": true
      },
      {
        httpsAgent: agent, // <--- Apply the Master Fix
        auth: { username: COMPANY_KEY, password: API_KEY },
        headers: { 
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      } 
    );

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
    res.status(500).json({ error: "Server Error: " + error.message });
  }
});// =========================================================
// 3. CHECK STATUS ROUTE
// =========================================================
app.post("/api/check-auth-status", async (req, res) => {
  try {
    const { authRequestId } = req.body;
    
    // 1. RE-USE THE LEGACY SSL AGENT
    const agent = new https.Agent({
      rejectUnauthorized: true,
      family: 4,                  // Force IPv4
      minVersion: "TLSv1.2",      // Force TLS 1.2
      ciphers: "DEFAULT@SECLEVEL=0" // Allow legacy ciphers
    });

    // 2. SEND REQUEST TO THE CORRECT URL
    const response = await axios.get(
      `${TAKTIKAL_BASE_URL}/api/auth/status/${authRequestId}`,
      { 
        httpsAgent: agent, 
        auth: { username: COMPANY_KEY, password: API_KEY },
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      }
    );
    
    console.log("📡 FULL TAKTIKAL RESPONSE:", JSON.stringify(response.data, null, 2));
    
    res.json(response.data);

  } catch (error) {
    console.error("❌ Polling Error:", error.message);
    if (error.response) {
        console.error("Status:", error.response.status);
        console.error("Data:", error.response.data);
        return res.status(error.response.status).json(error.response.data);
    }
    res.status(500).json({ error: "Polling Failed" });
  }
});

// =========================================================
// 4. START THE SERVER (THIS WAS MISSING)
// =========================================================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
