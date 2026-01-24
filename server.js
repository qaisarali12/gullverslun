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
    // 1. Accept SSN (Kennitala) from the request
    const { phone, ssn } = req.body; 
    console.log("🔄 Syncing Shopify Customer for:", phone, "SSN:", ssn);

    if (!phone) return res.status(400).json({ error: "Phone number required" });

    // 2. Format Phone (Strict E.164)
    let cleanPhone = phone.toString().replace(/[^0-9]/g, "");
    
    // Default to Iceland (+354) if missing country code
    if (cleanPhone.length === 7 || cleanPhone.length === 10) { 
       // Assuming 10 digit is local format without +, adjust logic as needed
       if(cleanPhone.length === 7) cleanPhone = `354${cleanPhone}`;
    }
    
    const formattedPhone = `+${cleanPhone.replace(/^\+/, '')}`; 
    const dummyEmail = `${cleanPhone}@auth.gullmarkadurinn.is`; 
    const tempPassword = crypto.randomBytes(10).toString("hex") + "!Aa1"; 

    const shopifyConfig = {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json"
      }
    };

    // ---------------------------------------------------------
    // 3. SEARCH STRATEGY: Find by PHONE, not Dummy Email
    // ---------------------------------------------------------
    // Why? If the user updates their email in Step 3, the "dummyEmail" search 
    // would fail next time. Searching by phone is safer.
    const searchUrl = `https://${SHOPIFY_DOMAIN}/admin/api/2025-10/customers/search.json?query=phone:${formattedPhone}`;
    const searchRes = await axios.get(searchUrl, shopifyConfig);

    let customerId;

    // Define Metafields for SSN
    const ssnMetafield = {
        "namespace": "custom",
        "key": "ssn", // or 'kennitala'
        "value": ssn || "",
        "type": "single_line_text_field"
    };

    if (searchRes.data.customers.length === 0) {
      // --- CREATE NEW CUSTOMER ---
      console.log("Creating new Shopify customer...");
      const createUrl = `https://${SHOPIFY_DOMAIN}/admin/api/2025-10/customers.json`;
      
      const createRes = await axios.post(createUrl, {
        customer: {
          first_name: "Mobile",
          last_name: "User",
          email: dummyEmail, // Initial Dummy Email
          phone: formattedPhone,
          verified_email: true,
          password: tempPassword,
          password_confirmation: tempPassword,
          metafields: [ssnMetafield] // <--- STORE SSN HERE
        }
      }, shopifyConfig);
      
      customerId = createRes.data.customer.id;
    } else {
      // --- UPDATE EXISTING CUSTOMER ---
      // User exists! We update their password so they can login.
      // We also verify/update the SSN if it was missing.
      console.log("Updating existing Shopify customer...");
      customerId = searchRes.data.customers[0].id;
      const updateUrl = `https://${SHOPIFY_DOMAIN}/admin/api/2025-10/customers/${customerId}.json`;

      await axios.put(updateUrl, {
        customer: {
          id: customerId,
          password: tempPassword,
          password_confirmation: tempPassword,
          metafields: [ssnMetafield] // <--- ENSURE SSN IS SAVED
        }
      }, shopifyConfig);
    }

    // 4. Return Credentials
    // We assume the email is the dummy one for login, 
    // BUT if the user already changed it to a real email, we must return the REAL email
    // or the login will fail.
    const currentEmail = searchRes.data.customers.length > 0 
                         ? searchRes.data.customers[0].email 
                         : dummyEmail;

    console.log("✅ Sync Success. Logging in with:", currentEmail);
    res.json({
      success: true,
      dummy_email: currentEmail, // Return actual email (real or dummy)
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
