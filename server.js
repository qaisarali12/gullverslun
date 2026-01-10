const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const COMPANY_KEY = process.env.COMPANY_KEY;
const API_KEY = process.env.API_KEY;

// ✅ CORRECT AUTH HOST
const TAKTIKAL_BASE_URL = "https://onboarding.taktikal.is";

// =========================================================
// START LOGIN
// =========================================================
app.post("/api/goldMarket-login-ver", async (req, res) => {
  try {
    const { phone } = req.body;

    console.log("----------------------------------------");
    console.log("Incoming Login Request:", phone);

    if (!phone) {
      return res.status(400).json({ error: "Phone missing" });
    }

    let cleanPhone = phone.toString().replace(/\D/g, "");

    if (cleanPhone.length === 7) {
      cleanPhone = `+354${cleanPhone}`;
    } else if (!cleanPhone.startsWith("354")) {
      cleanPhone = `+${cleanPhone}`;
    } else {
      cleanPhone = `+${cleanPhone}`;
    }

    console.log("Sending to Taktikal:", cleanPhone);

    const response = await axios.post(
      `${TAKTIKAL_BASE_URL}/api/auth/start`,
      {
        phoneNumber: cleanPhone,
        type: "sim",
        message: "Log in to Gold Market"
      },
      {
        auth: {
          username: COMPANY_KEY,
          password: API_KEY
        },
        headers: {
          "Content-Type": "application/json"
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
      return res
        .status(error.response.status)
        .json(error.response.data);
    }

    res.status(500).json({ error: "Server Error" });
  }
});

// =========================================================
// CHECK STATUS
// =========================================================
app.post("/api/check-auth-status", async (req, res) => {
  try {
    const { authRequestId } = req.body;

    const response = await axios.get(
      `${TAKTIKAL_BASE_URL}/api/auth/status/${authRequestId}`,
      {
        auth: {
          username: COMPANY_KEY,
          password: API_KEY
        }
      }
    );

    res.json(response.data);

  } catch (error) {
    console.error("❌ Polling Error:", error.message);
    res.status(500).json({ error: "Polling Failed" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
