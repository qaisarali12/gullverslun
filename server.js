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

// ✅ OFFICIAL PRODUCTION BASE URL
const TAKTIKAL_BASE_URL = "https://onboarding.taktikal.is";

// ✅ SHOPIFY CONFIGURATION (Added)
const SHOPIFY_DOMAIN = "gullmarkadurinn.myshopify.com";
const SHOPIFY_ACCESS_TOKEN = "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"; // Admin API Token

// =========================================================
// 1.1 SHARED SSL AGENT (FIXES SSL ERROR 80)
// =========================================================
const taktikalAgent = new https.Agent({
  rejectUnauthorized: true,
  family: 4, // Force IPv4
  servername: "onboarding.taktikal.is", // SNI
  minVersion: "TLSv1.2",
  ciphers: "DEFAULT@SECLEVEL=0"
});

// =========================================================
// 2. START LOGIN ROUTE
// =========================================================
app.post("/api/goldMarket-login-ver", async (req, res) => {
  try {
    const { phone } = req.body;
    console.log("Incoming Login Request:", phone);

    if (!phone) return res.status(400).json({ error: "Phone missing" });

    // Format Icelandic phone number
    let cleanPhone = phone.toString().replace(/\D/g, "");
    if (cleanPhone.length === 7) cleanPhone = `+354${cleanPhone}`;
    else if (!cleanPhone.startsWith("354")) cleanPhone = `+${cleanPhone}`;
    else cleanPhone = `+${cleanPhone}`;

    console.log("Sending to Taktikal:", cleanPhone);

    const response = await axios.post(
      `${TAKTIKAL_BASE_URL}/api/auth/start`,
      {
        PhoneNumber: cleanPhone,
        FlowKey: FLOW_KEY,
        AuthenticationContextType: "Sim",
        IncludeVerificationCode: true
      },
      {
        httpsAgent: taktikalAgent,
        auth: { username: COMPANY_KEY, password: API_KEY },
        headers: { "Content-Type": "application/json" }
      }
    );

    console.log("✅ Taktikal Start Success:", response.data);

    res.json({
      message: "Auth Started",
      authRequestId: response.data.authRequestId
    });

  } catch (error) {
    console.error("❌ Taktikal Start Error:", error.message);
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    res.status(500).json({ error: "Server Error: " + error.message });
  }
});

// =========================================================
// 3. CHECK STATUS (POLL) ROUTE
// =========================================================
app.post("/api/check-auth-status", async (req, res) => {
  try {
    const { authRequestId } = req.body;

    const response = await axios.post(
      `${TAKTIKAL_BASE_URL}/api/auth/poll`,
      {
        authRequestId: authRequestId,
        flowKey: FLOW_KEY,
        lookupType: "PhoneNumber"
      },
      {
        httpsAgent: taktikalAgent,
        auth: { username: COMPANY_KEY, password: API_KEY }
      }
    );

    console.log("📡 Taktikal Poll Response:", JSON.stringify(response.data, null, 2));
    res.json(response.data);

  } catch (error) {
    console.error("❌ Polling Error:", error.message);
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    res.status(500).json({ error: "Polling Failed" });
  }
});

// =========================================================
// 4. SHOPIFY CUSTOMER SYNC (NEW ROUTE)
// =========================================================
// Call this AFTER Taktikal returns "Success"
app.post("/api/createCustomer", async (req, res) => {
  try {
    const { phone } = req.body;
    console.log("🔄 Syncing Shopify Customer for:", phone);

    if (!phone) return res.status(400).json({ error: "Phone number required" });

    // 1. Format Phone for Shopify (E.164 Strict)
    let cleanPhone = phone.toString().replace(/[^0-9]/g, "");
    
    // Default to Iceland (+354) if missing country code, otherwise ensure + is present
    if (cleanPhone.length === 7) {
        cleanPhone = `354${cleanPhone}`;
    }
    
    const formattedPhone = `+${cleanPhone.replace(/^\+/, '')}`; // Ensure single + at start
    const dummyEmail = `${cleanPhone}@auth.gullmarkadurinn.is`; // Consistent Dummy Email
    const tempPassword = crypto.randomBytes(10).toString("hex") + "!Aa1"; // Secure Random Password

    // Common Headers for Shopify Admin API
    const shopifyConfig = {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json"
      }
    };

    // 2. Search if customer exists
    const searchUrl = `https://${SHOPIFY_DOMAIN}/admin/api/2025-10/customers/search.json?query=email:${dummyEmail}`;
    const searchRes = await axios.get(searchUrl, shopifyConfig);

    let customerId;

    if (searchRes.data.customers.length === 0) {
      // --- CREATE NEW CUSTOMER ---
      console.log("Creating new Shopify customer...");
      const createUrl = `https://${SHOPIFY_DOMAIN}/admin/api/2025-10/customers.json`;
      
      const createRes = await axios.post(createUrl, {
        customer: {
          first_name: "First",
          last_name: "Second Name",
          email: dummyEmail,
          phone: formattedPhone,
          verified_email: true,
          password: tempPassword,
          password_confirmation: tempPassword
        }
      }, shopifyConfig);
      
      customerId = createRes.data.customer.id;
    } else {
      // --- UPDATE EXISTING CUSTOMER ---
      console.log("Updating existing Shopify customer...");
      customerId = searchRes.data.customers[0].id;
      const updateUrl = `https://${SHOPIFY_DOMAIN}/admin/api/2025-10/customers/${customerId}.json`;

      await axios.put(updateUrl, {
        customer: {
          id: customerId,
          password: tempPassword,
          password_confirmation: tempPassword
        }
      }, shopifyConfig);
    }

    // 3. Return Credentials to Frontend
    console.log("✅ Shopify Sync Success for:", formattedPhone);
    res.json({
      success: true,
      dummy_email: dummyEmail,
      temp_password: tempPassword
    });

  } catch (error) {
    console.error("❌ Shopify Sync Error:", error.response?.data || error.message);
    res.status(500).json({ 
      error: "Shopify Sync Failed", 
      details: error.response?.data 
    });
  }
});

// =========================================================
// 4. START SERVER
// =========================================================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
