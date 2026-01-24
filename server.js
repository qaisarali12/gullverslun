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
    const { phone, name, ssn } = req.body;
    console.log("🔄 Processing Login for:", phone);

    if (!phone) return res.status(400).json({ error: "Phone number required" });

    // 1. CLEAN & FORMAT PHONE (Handles spaces like "+354 857 9293")
    let cleanPhone = phone.toString().replace(/[^0-9]/g, ""); // Removes + and spaces
    
    // Default to Iceland if user typed "8579293" (7 digits)
    if (cleanPhone.length === 7) cleanPhone = `354${cleanPhone}`;
    
    const formattedPhone = `+${cleanPhone.replace(/^\+/, '')}`; // Ensure +354...
    
    // Generate Credentials
    const defaultDummyEmail = `${cleanPhone}@auth.gullmarkadurinn.is`; 
    const tempPassword = crypto.randomBytes(10).toString("hex") + "!Aa1"; 

    const shopifyConfig = {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json"
      }
    };

    // 2. SEARCH (With URL Encoding Fix)
    const query = `phone:${encodeURIComponent(formattedPhone)}`;
    const searchUrl = `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/customers/search.json?query=${query}`;
    
    const searchRes = await axios.get(searchUrl, shopifyConfig);

    let finalEmailToUse = defaultDummyEmail;
    let customerId;

    if (searchRes.data.customers.length === 0) {
      // === CASE A: NEW USER ===
      console.log("Creating new account...");
      const createRes = await axios.post(`https://${SHOPIFY_DOMAIN}/admin/api/2024-01/customers.json`, {
        customer: {
          first_name: name,
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

    } else {
      // === CASE B: EXISTING USER ===
      console.log("User found! Updating credentials...");
      const existingUser = searchRes.data.customers[0];
      customerId = existingUser.id;

      // FIX FOR SCREENSHOT ISSUE:
      // If user has NO email (null), we must assign the dummy email now.
      // Otherwise, keep their existing email.
      if (existingUser.email) {
          finalEmailToUse = existingUser.email;
      } else {
          finalEmailToUse = defaultDummyEmail; 
          console.log("⚠️ User had no email. Assigning dummy email for login.");
      }

      await axios.put(`https://${SHOPIFY_DOMAIN}/admin/api/2024-01/customers/${customerId}.json`, {
        customer: {
          id: customerId,
          password: tempPassword,
          password_confirmation: tempPassword,
          email: finalEmailToUse // Ensure the account has an email
        }
      }, shopifyConfig);
    }

    // 3. RETURN SUCCESS
    res.json({
      success: true,
      dummy_email: finalEmailToUse,
      temp_password: tempPassword
    });

  } catch (error) {
    console.error("❌ Login Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Login Failed", details: error.response?.data });
  }
});

// =========================================================
// 6. UPDATE EMAIL ROUTE (For Account Page Popup)
// =========================================================
app.post("/api/updateEmail", async (req, res) => {
  try {
    const { shopifyCustomerId, newEmail, termsAccepted } = req.body;
    console.log(`📧 Updating email for ID: ${shopifyCustomerId} to ${newEmail}`);

    if (!shopifyCustomerId || !newEmail || termsAccepted !== true) {
      return res.status(400).json({ success: false, error: "Invalid data" });
    }

    // 1. GENERATE NEW PASSWORD (Required to re-login)
    const newPassword = crypto.randomBytes(10).toString("hex") + "!Aa1";

    const shopifyConfig = {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json"
      }
    };

    // 2. UPDATE SHOPIFY (Email + Password)
    const updateUrl = `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/customers/${shopifyCustomerId}.json`;

    await axios.put(updateUrl, {
      customer: {
        id: shopifyCustomerId,
        email: newEmail,
        password: newPassword, // <--- UPDATE PASSWORD TOO
        password_confirmation: newPassword,
        verified_email: true 
      }
    }, shopifyConfig);

    console.log("✅ Email & Password updated.");

    // 3. RETURN NEW CREDENTIALS TO FRONTEND
    return res.json({
      success: true,
      new_email: newEmail,
      new_password: newPassword // <--- Send this back
    });

  } catch (error) {
    console.error("❌ Update Failed:", error.response?.data || error.message);
    // Handle "Email taken" specifically
    if (error.response?.data?.errors?.email) {
        return res.json({ success: false, error: "This email is already in use." });
    }
    return res.status(500).json({ success: false, error: "Update failed." });
  }
});

// =========================================================
// 4. START SERVER
// =========================================================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
