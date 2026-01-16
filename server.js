const express = require("express");
const axios = require("axios");
const cors = require("cors");
const app = express();

app.use(cors());
app.use(express.json());

// =========================================================
// 1. CONFIGURATION (Production)
// =========================================================
const COMPANY_KEY = "aa7a9325f1a0";
const API_KEY = "api-g2ndsPMuQvFmMcB0VRAkDQhdYYrT"; 

// ✅ NEW: The Client's Real Flow Key
const FLOW_KEY = "ad62cb968983"; 

// ✅ PRODUCTION URL (For Real Login)
// If this gives a 404, switch to 'https://onboarding.taktikal.is'
const TAKTIKAL_BASE_URL = "https://api.taktikal.is"; 

// =========================================================
// 2. START LOGIN ROUTE
// =========================================================
app.post("/api/goldMarket-login-ver", async (req, res) => {
  try {
    const { phone } = req.body;
    console.log("----------------------------------------");
    console.log("Incoming Login Request:", phone);

    if (!phone) return res.status(400).json({ error: "Phone missing" });

    // Format phone number
    let cleanPhone = phone.toString().replace(/\D/g, "");
    if (cleanPhone.length === 7) cleanPhone = `+354${cleanPhone}`;
    else if (!cleanPhone.startsWith("354")) cleanPhone = `+${cleanPhone}`;
    else cleanPhone = `+${cleanPhone}`;

    console.log("Sending to Taktikal (Prod):", cleanPhone);

    const response = await axios.post(
      `${TAKTIKAL_BASE_URL}/api/auth/start`,
      {
        "PhoneNumber": cleanPhone,
        "FlowKey": FLOW_KEY, // ✅ Using the real key now
        "AuthenticationContextType": "Sim", 
        "IncludeVerificationCode": true
      },
      {
        auth: {
          username: COMPANY_KEY,
          password: API_KEY
        },
        headers: { "Content-Type": "application/json" }
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
    res.status(500).json({ error: "Server Error" });
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

const listener = app.listen(process.env.PORT, () => {
  console.log('Your app is listening on port ' + listener.address().port);
});