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

// ✅ FIX 1: USE THE CORRECT PRODUCTION URL
const TAKTIKAL_BASE_URL = "https://onboarding.taktikal.is"; 

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

    // ✅ FIX 2: Legacy SSL Agent (Kept safe for Node 18+)
    const agent = new https.Agent({
      rejectUnauthorized: true,
      family: 4,                  // Force IPv4
      minVersion: "TLSv1.2",      // Force TLS 1.2
      ciphers: "DEFAULT@SECLEVEL=0" // Allow legacy ciphers
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
        httpsAgent: agent,
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
});

// =========================================================
// 3. CHECK STATUS ROUTE
// =========================================================
// =========================================================
// 3. CHECK STATUS ROUTE (UPDATED)
// =========================================================
app.post("/api/check-auth-status", async (req, res) => {
  try {
    const { authRequestId } = req.body;
    
    // 1. RE-USE THE LEGACY SSL AGENT
    // We need this here too, otherwise the status check might fail with the same SSL error later.
    const agent = new https.Agent({
      rejectUnauthorized: true,
      family: 4,                  // Force IPv4
      minVersion: "TLSv1.2",      // Force TLS 1.2
      ciphers: "DEFAULT@SECLEVEL=0" // Allow legacy ciphers
    });

    // 2. SEND REQUEST TO THE CORRECT URL
    // Ensure TAKTIKAL_BASE_URL is "https://onboarding.taktikal.is" at the top of your file
    const response = await axios.get(
      `${TAKTIKAL_BASE_URL}/api/auth/status/${authRequestId}`,
      { 
        httpsAgent: agent, // <--- Apply the SSL fix here too
        auth: { username: COMPANY_KEY, password: API_KEY },
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      }
    );
    
    // Log the successful check so you can see the status change
    console.log(`📡 Status Check (${authRequestId}):`, response.data.status);
    
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
