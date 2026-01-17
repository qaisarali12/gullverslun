const express = require("express");
const axios = require("axios");
const cors = require("cors");
const https = require("https"); 
const crypto = require("crypto"); // Added for security constants
const app = express();

app.use(cors());
app.use(express.json());

// =========================================================
// CONFIGURATION
// =========================================================
const COMPANY_KEY = "aa7a9325f1a0";
const API_KEY = "api-g2ndsPMuQvFmMcB0VRAkDQhdYYrT"; 
const FLOW_KEY = "ad62cb968983"; 
const TAKTIKAL_BASE_URL = "https://api.taktikal.is"; 

// =========================================================
// START LOGIN ROUTE (Fixed for Node 18+ OpenSSL 3)
// =========================================================
app.post("/api/goldMarket-login-ver", async (req, res) => {
  try {
    const { phone } = req.body;
    console.log("Incoming Login Request:", phone);

    if (!phone) return res.status(400).json({ error: "Phone missing" });

    // 1. Format phone number
    let cleanPhone = phone.toString().replace(/\D/g, "");
    if (cleanPhone.length === 7) cleanPhone = `+354${cleanPhone}`;
    else if (!cleanPhone.startsWith("354")) cleanPhone = `+${cleanPhone}`;
    else cleanPhone = `+${cleanPhone}`;

    console.log("Sending to Taktikal (Prod):", cleanPhone);

    // 2. CREATE LEGACY AGENT
    // This solves the 'EPROTO' / 'SSL routines' error on Node 18+
    const agent = new https.Agent({
      rejectUnauthorized: true,
      family: 4,                  // Force IPv4
      minVersion: "TLSv1.2",      // Force TLS 1.2 (Prevent 1.3 handshake issues)
      maxVersion: "TLSv1.2",      // Lock it to 1.2
      ciphers: "DEFAULT@SECLEVEL=0" // Allow legacy ciphers (The critical fix)
    });

    // 3. SEND REQUEST
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
             // Standard User Agent
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
      console.error("Response Status:", error.response.status);
      console.error("Response Data:", error.response.data);
      return res.status(error.response.status).json(error.response.data);
    }
    // Print deep error details if available
    if (error.cause) console.error("Cause:", error.cause);
    
    res.status(500).json({ error: "Server Error: " + error.message });
  }
});

// =========================================================
// 3. CHECK STATUS ROUTE
// =========================================================
app.post("/api/check-auth-status", async (req, res) => {
  try {
    const { authRequestId } = req.body;
    const response = await axios.get(
      `${TAKTIKAL_BASE_URL}/api/auth/status/${authRequestId}`,
      { auth: { username: COMPANY_KEY, password: API_KEY } }
    );
    res.json(response.data);
  } catch (error) {
    console.error("❌ Polling Error:", error.message);
    res.status(500).json({ error: "Polling Failed" });
  }
});

// Glitch uses process.env.PORT automatically
const listener = app.listen(process.env.PORT, () => {
  console.log('Your app is listening on port ' + listener.address().port);
});
