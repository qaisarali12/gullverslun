const express = require("express");
const axios = require("axios");
const cors = require("cors");
const https = require("https");
const crypto = require("crypto"); // Added for password generation
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
    console.log("🔄 Processing Login for:", phone);

    if (!phone) return res.status(400).json({ error: "Phone number required" });

    // 1. Format Phone (E.164 Strict)
    let cleanPhone = phone.toString().replace(/[^0-9]/g, "");
    // Default to Iceland (+354) if missing country code
    if (cleanPhone.length === 7) cleanPhone = `354${cleanPhone}`;
    const formattedPhone = `+${cleanPhone.replace(/^\+/, '')}`; 
    
    // Generate Credentials
    const defaultDummyEmail = `${cleanPhone}@auth.gullmarkadurinn.is`; 
    const tempPassword = crypto.randomBytes(10).toString("hex") + "!Aa1"; 

    const shopifyConfig = {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json"
      }
    };

    // ---------------------------------------------------------
    // 2. SEARCH BY PHONE (The Fix)
    // ---------------------------------------------------------
    const searchUrl = `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/customers/search.json?query=phone:${formattedPhone}`;
    const searchRes = await axios.get(searchUrl, shopifyConfig);

    let finalEmailToUse = defaultDummyEmail;
    let customerId;
    console.log("searchRes.data: ", searchRes.data);
    if (searchRes.data.customers.length === 0) {
      // === CASE A: NEW USER (CREATE) ===
      console.log("User not found. Creating new account...");
      const createRes = await axios.post(`https://${SHOPIFY_DOMAIN}/admin/api/2024-01/customers.json`, {
        customer: {
          first_name: "Mobile",
          last_name: "User",
          email: defaultDummyEmail,
          phone: formattedPhone,
          verified_email: true,
          password: tempPassword,
          password_confirmation: tempPassword,
          send_email_welcome: false
        }
      }, shopifyConfig);
      
      customerId = createRes.data.customer.id;
      finalEmailToUse = createRes.data.customer.email;

    } else {
      // === CASE B: EXISTING USER (UPDATE) ===
      console.log("User found! Updating password...");
      const existingUser = searchRes.data.customers[0];
      customerId = existingUser.id;
      
      // CRITICAL: Use the email currently on file (User might have updated it)
      finalEmailToUse = existingUser.email; 

      await axios.put(`https://${SHOPIFY_DOMAIN}/admin/api/2024-01/customers/${customerId}.json`, {
        customer: {
          id: customerId,
          password: tempPassword,
          password_confirmation: tempPassword
        }
      }, shopifyConfig);
    }

    // 3. RETURN CREDENTIALS (Success)
    // The frontend doesn't need to know if they are new or old.
    // It just takes these credentials and logs them in.
    res.json({
      success: true,
      dummy_email: finalEmailToUse,
      temp_password: tempPassword
    });

  } catch (error) {
    console.error("❌ Login Error:", error.response?.data || error.message);
    res.status(500).json({ 
      error: "Login Failed", 
      details: error.response?.data 
    });
  }
});

// =========================================================
// 6. UPDATE EMAIL ROUTE (For Account Page Popup)
// =========================================================
app.post("/api/updateEmail", async (req, res) => {
  try {
    const { shopifyCustomerId, newEmail, termsAccepted } = req.body;
    console.log("shopifyCustomerId, newEmail, termsAccepted :", shopifyCustomerId, newEmail, termsAccepted );
    console.log(`📧 Request to update email for ID: ${shopifyCustomerId} to ${newEmail}`);

    // 1. VALIDATION
    if (!shopifyCustomerId) {
      return res.status(400).json({ success: false, error: "Customer ID is required" });
    }
    if (!newEmail || !newEmail.includes("@")) {
      return res.status(400).json({ success: false, error: "Invalid email address" });
    }
    if (termsAccepted !== true) {
      return res.status(400).json({ success: false, error: "You must accept the Terms & Conditions." });
    }

    // 2. CONFIGURATION
    const shopifyConfig = {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN, // Uses your existing constant
        "Content-Type": "application/json"
      }
    };

    // 3. CALL SHOPIFY ADMIN API (PUT Request)
    // We update the customer resource with the new email
    const updateUrl = `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/customers/${shopifyCustomerId}.json`;

    await axios.put(updateUrl, {
      customer: {
        id: shopifyCustomerId,
        email: newEmail,
        // Optional: Mark email as verified immediately since they are logged in
        verified_email: true 
      }
    }, shopifyConfig);

    console.log("✅ Email updated successfully.");

    return res.json({
      success: true,
      message: "Email updated successfully"
    });

  } catch (error) {
    console.error("❌ Email Update Failed:", error.response?.data || error.message);

    // Handle "Email already taken" error specifically
    if (error.response?.data?.errors?.email) {
      return res.status(400).json({ 
        success: false, 
        error: "This email address is already associated with another account." 
      });
    }

    return res.status(500).json({ 
      success: false,
      error: "Failed to update email. Please try again." 
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
