const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};

const ALLOWED_INTERESTS = new Set([
  "ERP advisory",
  "Implementation",
  "Optimization",
  "Integration",
  "Managed support",
  "Not sure yet"
]);

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders }
  });
}

function clean(value, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

async function verifyTurnstile(token, request, env) {
  if (!env.TURNSTILE_SECRET_KEY) return { success: true, developmentBypass: true };
  if (!token) return { success: false };

  const formData = new FormData();
  formData.append("secret", env.TURNSTILE_SECRET_KEY);
  formData.append("response", token);
  formData.append("remoteip", request.headers.get("CF-Connecting-IP") || "");

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: formData
  });
  return response.json();
}

async function sendLead(lead, env) {
  if (!env.LEAD_WEBHOOK_URL) {
    console.log(JSON.stringify({ event: "lead_received", id: lead.id, interest: lead.interest }));
    return { delivered: false, developmentBypass: true };
  }

  const response = await fetch(env.LEAD_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(env.LEAD_WEBHOOK_TOKEN ? { authorization: `Bearer ${env.LEAD_WEBHOOK_TOKEN}` } : {})
    },
    body: JSON.stringify(lead)
  });

  if (!response.ok) throw new Error(`Lead delivery failed with status ${response.status}`);
  return { delivered: true };
}

async function handleContact(request, env) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return json({ ok: false, message: "Send the form as JSON." }, 415);
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 12000) return json({ ok: false, message: "Request is too large." }, 413);

  let input;
  try {
    input = await request.json();
  } catch {
    return json({ ok: false, message: "The form data is invalid." }, 400);
  }

  if (clean(input.website, 100)) return json({ ok: true, message: "Thank you. We will be in touch." });

  const name = clean(input.name, 100);
  const email = clean(input.email, 254).toLowerCase();
  const company = clean(input.company, 150);
  const interest = clean(input.interest, 60);
  const message = clean(input.message, 1500);
  const consent = input.consent === true;

  const errors = {};
  if (name.length < 2) errors.name = "Enter your name.";
  if (!isEmail(email)) errors.email = "Enter a valid work email.";
  if (company.length < 2) errors.company = "Enter your company name.";
  if (!ALLOWED_INTERESTS.has(interest)) errors.interest = "Choose an area of interest.";
  if (!consent) errors.consent = "Confirm that we may respond to your enquiry.";
  if (Object.keys(errors).length) return json({ ok: false, message: "Check the highlighted fields.", errors }, 422);

  const verification = await verifyTurnstile(clean(input.turnstileToken, 2048), request, env);
  if (!verification.success) return json({ ok: false, message: "Verification failed. Please try again." }, 403);

  const lead = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    name,
    email,
    company,
    role: clean(input.role, 100),
    platform: clean(input.platform, 100),
    interest,
    message,
    source: clean(input.source, 200),
    campaign: clean(input.campaign, 200)
  };

  try {
    await sendLead(lead, env);
  } catch (error) {
    console.error(JSON.stringify({ event: "lead_delivery_error", id: lead.id, error: error.message }));
    return json({ ok: false, message: "We could not send your enquiry. Please email hello@nexora.example." }, 502);
  }

  return json({ ok: true, message: "Thank you. An ERP specialist will respond within one business day." });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/contact") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: { allow: "POST, OPTIONS" } });
      }
      if (request.method !== "POST") return json({ ok: false, message: "Method not allowed." }, 405, { allow: "POST" });
      return handleContact(request, env);
    }

    if (url.pathname === "/api/health") {
      return json({ ok: true, service: "nexora-erp-website" });
    }

    return env.ASSETS.fetch(request);
  }
};
