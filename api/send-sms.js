const TWILIO_SID   = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const WHATSAPP_FROM = "whatsapp:+14155238886"; // Twilio WhatsApp sandbox number

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { to, message } = req.body;
  if (!to || !message) return res.status(400).json({ error: "Missing to or message" });

  const phones = Array.isArray(to) ? to : [to];
  const results = [];

  for (const phone of phones) {
    try {
      const credentials = `${TWILIO_SID}:${TWILIO_TOKEN}`;
      const encoded = Buffer.from(credentials).toString("base64");

      // Send via WhatsApp sandbox
      const toWhatsApp = "whatsapp:" + phone;

      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
        {
          method: "POST",
          headers: {
            "Authorization": `Basic ${encoded}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To:   toWhatsApp,
            From: WHATSAPP_FROM,
            Body: message,
          }),
        }
      );

      const text = await response.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }

      results.push({
        phone,
        httpStatus: response.status,
        sid: data.sid,
        status: data.status,
        twilioError: data.message,
        twilioCode: data.code,
      });
    } catch (err) {
      results.push({ phone, error: err.message });
    }
  }

  return res.status(200).json({ results });
}
