const express = require("express");
const axios = require("axios");
const cors = require("cors");
const https = require("https"); // <--- IMPORTANT: Ensure this is imported
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
// START LOGIN ROUTE (FIXED FOR SSL/EPROTO ERRORS)
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

    // 2. CREATE CUSTOM AGENT TO FIX SSL HANDSHAKE
    const agent = new https.Agent({
      rejectUnauthorized: true,
      family: 4, // Forces IPv4 (Fixes EPROTO on Render)
      servername: 'api.taktikal.is' // Explicitly sets SNI
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
        httpsAgent: agent, // <--- Apply the fix here
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
      console.error("Response Data:", error.response.data);
      return res.status(error.response.status).json(error.response.data);
    }
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
