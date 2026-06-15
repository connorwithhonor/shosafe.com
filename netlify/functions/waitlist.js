// ShoSafe waitlist handler
// Receives the founding-member form POST and upserts the lead into the
// ShoSafe HonorElevate (GoHighLevel) sub-account.
//
// Security: the PIT and locationId are read from Netlify environment variables
// only. They are NEVER in the page, NEVER in git. Set them with:
//   netlify env:set HE_SHOSAFE_PIT  <pit>          --site <site-id>
//   netlify env:set SHOSAFE_LOCATION_ID <locationId> --site <site-id>
//
// GHL v2 upsert: POST https://services.leadconnectorhq.com/contacts/upsert
// Headers: Authorization: Bearer <PIT>, Version: 2021-07-28, Content-Type: application/json

const GHL_UPSERT_URL = 'https://services.leadconnectorhq.com/contacts/upsert';

const json = (statusCode, obj) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(obj),
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed' });
  }

  const PIT = process.env.HE_SHOSAFE_PIT;
  const LOCATION_ID = process.env.SHOSAFE_LOCATION_ID;
  if (!PIT || !LOCATION_ID) {
    console.error('Missing HE_SHOSAFE_PIT or SHOSAFE_LOCATION_ID env var');
    return json(500, { ok: false, error: 'Server not configured' });
  }

  let data;
  try {
    data = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { ok: false, error: 'Invalid JSON' });
  }

  // Honeypot caught server-side too
  if (data.company) {
    return json(200, { ok: true });
  }

  const email = (data.email || '').trim();
  const phone = (data.phone || '').trim();
  if (!email && !phone) {
    return json(400, { ok: false, error: 'Email or phone required' });
  }

  const tags = ['shosafe-waitlist', 'founding-member'];
  if (data.role) tags.push('role: ' + String(data.role).toLowerCase());
  if (data.prepay === true || data.prepay === 'yes') tags.push('founding-prepay-intent');

  const payload = {
    locationId: LOCATION_ID,
    firstName: (data.firstName || '').trim(),
    lastName: (data.lastName || '').trim(),
    email,
    phone,
    source: data.source || 'shosafe.com waitlist',
    tags,
  };

  try {
    const res = await fetch(GHL_UPSERT_URL, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + PIT,
        Version: '2021-07-28',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    if (!res.ok) {
      console.error('GHL upsert failed', res.status, text);
      return json(502, { ok: false, error: 'CRM rejected the request' });
    }
    return json(200, { ok: true });
  } catch (err) {
    console.error('GHL upsert threw', err);
    return json(502, { ok: false, error: 'CRM unreachable' });
  }
};
