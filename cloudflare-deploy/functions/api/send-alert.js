// Cloudflare Pages Function: /api/send-alert
// Sends subscriber alert notification emails via Resend API — one copy to the
// developer/admin, and one copy to the subscriber who registered their email.

export async function onRequestPost(context) {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    try {
        const body = await context.request.json();
        const { subscriberEmail, camera, riskScore, mode, timestamp, snapshotBase64 } = body;

        if (!subscriberEmail || !camera) {
            return jsonResponse({ error: 'Missing required parameters' }, 400, headers);
        }

        const activeMode = mode || 'flood';

        const apiKey = context.env.RESEND_API_KEY;
        const developerEmail = context.env.DEVELOPER_EMAIL || 'cadtc.larry@gmail.com';

        if (!apiKey) {
            console.error('RESEND_API_KEY is not configured on this Pages project.');
            return jsonResponse({ error: 'Email service is not configured' }, 500, headers);
        }

        const timeStr = timestamp || new Date().toLocaleString('zh-TW');
        const attachments = snapshotBase64
            ? [{ filename: 'snapshot.jpg', content: snapshotBase64, content_id: 'snapshot' }]
            : undefined;

        const adminEmail = buildAdminEmail(developerEmail, subscriberEmail, camera, riskScore, activeMode, timeStr, !!snapshotBase64);
        const adminResult = await sendResendEmail(apiKey, adminEmail.to, adminEmail.subject, adminEmail.html, attachments);
        if (!adminResult.ok) {
            console.error('Resend API rejected the admin send:', adminResult.status, adminResult.body);
        }

        let subscriberResult = { ok: true, skipped: true };
        const sameAsAdmin = subscriberEmail.trim().toLowerCase() === developerEmail.trim().toLowerCase();
        if (!sameAsAdmin) {
            const subEmail = buildSubscriberEmail(subscriberEmail, camera, riskScore, activeMode, timeStr, !!snapshotBase64);
            subscriberResult = await sendResendEmail(apiKey, subEmail.to, subEmail.subject, subEmail.html, attachments);
            if (!subscriberResult.ok) {
                console.error('Resend API rejected the subscriber send:', subscriberResult.status, subscriberResult.body);
            }
        }

        if (adminResult.ok || subscriberResult.ok) {
            return jsonResponse({
                ok: true,
                message: 'Notification email processed',
                adminDelivered: adminResult.ok,
                subscriberDelivered: subscriberResult.ok
            }, 200, headers);
        }

        return jsonResponse({ error: 'Failed to deliver email via Resend API' }, 500, headers);
    } catch (err) {
        return jsonResponse({ error: err.message }, 500, headers);
    }
}

function alertCopy(mode, camera, riskScore, timeStr) {
    const isParking = mode === 'parking';
    const isPeople = mode === 'people';
    return {
        isParking,
        isPeople,
        subjectPrefix: isPeople ? '🚨 [People Detected Alert]' : isParking ? '🚨 [Parking Watch Alert]' : '🚨 [VisionWatch Alert]',
        subjectStatus: isPeople ? 'PERSON DETECTED' : isParking ? 'PARKED' : 'CRITICAL',
        title: isPeople ? '⚠️ 監控區域偵測到人員 (VisionWatch AI)' : isParking ? '⚠️ 車位占用即時警報 (Parking Watch AI)' : '⚠️ 淹水即時警報 (VisionWatch AI)',
        bodyDesc: isPeople
            ? '系統偵測到有人進入您設定的監控區域，請多加留意。'
            : isParking
            ? '系統偵測到車位被長時間占用 / 違規停車，請多加留意。'
            : '系統偵測到高度淹水風險，請多加留意安全。',
        statusLabel: isPeople ? '偵測狀態' : isParking ? '車位狀態' : '安全層級',
        statusValue: isPeople ? 'PERSON DETECTED (有人)' : isParking ? 'PARKED (占用)' : 'CRITICAL (危險)',
        riskLabelText: isPeople ? '信心度' : isParking ? '空間判定值' : '淹水風險值',
        camera,
        riskScore,
        timeStr
    };
}

function detailsTable(c) {
    return `<table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: rgba(255,255,255,0.02); border-radius: 8px; overflow: hidden;">
        <tr>
            <td style="padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); color: #6b7fa0; font-weight: bold;">監控點</td>
            <td style="padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); color: #ffffff;">${c.camera}</td>
        </tr>
        <tr>
            <td style="padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); color: #6b7fa0; font-weight: bold;">${c.riskLabelText}</td>
            <td style="padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); color: #ff3355; font-weight: bold; font-size: 18px;">${Math.round(c.riskScore)}%</td>
        </tr>
        <tr>
            <td style="padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); color: #6b7fa0; font-weight: bold;">偵測時間</td>
            <td style="padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); color: #ffffff;">${c.timeStr}</td>
        </tr>
        <tr>
            <td style="padding: 12px; color: #6b7fa0; font-weight: bold;">${c.statusLabel}</td>
            <td style="padding: 12px; color: #ff3355; font-weight: bold;">${c.statusValue}</td>
        </tr>
    </table>`;
}

function emailShell(innerHtml) {
    return `<div style="background-color: #030810; color: #e0e8f0; font-family: sans-serif; padding: 30px; border-radius: 12px; max-width: 600px; margin: 0 auto; border: 1px solid #ff3355;">${innerHtml}</div>`;
}

function snapshotBlock(hasSnapshot) {
    if (!hasSnapshot) return '';
    return `<img src="cid:snapshot" alt="Camera snapshot" style="width: 100%; border-radius: 8px; margin: 16px 0; border: 1px solid rgba(255,255,255,0.1); display: block;" />`;
}

function buildAdminEmail(developerEmail, subscriberEmail, camera, riskScore, mode, timeStr, hasSnapshot) {
    const c = alertCopy(mode, camera, riskScore, timeStr);
    const subject = `${c.subjectPrefix} ${c.camera} - Status: ${c.subjectStatus} (${Math.round(c.riskScore)}%)`;
    const html = emailShell(`
        <h2 style="color: #ff3355; font-size: 24px; border-bottom: 1px solid rgba(255,51,85,0.2); padding-bottom: 10px; margin-top: 0;">${c.title}</h2>
        <p style="font-size: 16px; line-height: 1.6;">${c.bodyDesc}</p>
        ${snapshotBlock(hasSnapshot)}
        <div style="background: rgba(255, 51, 85, 0.1); border: 1px solid #ff3355; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h4 style="margin: 0 0 8px 0; color: #ff3355;">🔔 訂閱者聯絡資訊 (Subscriber Email)</h4>
            <a href="mailto:${subscriberEmail}" style="color: #00e5a0; font-size: 18px; font-weight: bold; text-decoration: underline;">${subscriberEmail}</a>
            <p style="margin: 8px 0 0 0; font-size: 13px; color: #6b7fa0;">此訂閱者已同時收到本通知信件。</p>
        </div>
        ${detailsTable(c)}
        <p style="font-size: 13px; color: #6b7fa0; margin-top: 30px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 15px; text-align: center;">此信件由 VisionWatch AI 監控系統自動發送，請勿直接回信。</p>
    `);
    return { to: developerEmail, subject, html };
}

function buildSubscriberEmail(subscriberEmail, camera, riskScore, mode, timeStr, hasSnapshot) {
    const c = alertCopy(mode, camera, riskScore, timeStr);
    const subject = `${c.subjectPrefix} ${c.camera} - Status: ${c.subjectStatus} (${Math.round(c.riskScore)}%)`;
    const html = emailShell(`
        <h2 style="color: #ff3355; font-size: 24px; border-bottom: 1px solid rgba(255,51,85,0.2); padding-bottom: 10px; margin-top: 0;">${c.title}</h2>
        <p style="font-size: 16px; line-height: 1.6;">${c.bodyDesc}</p>
        ${snapshotBlock(hasSnapshot)}
        ${detailsTable(c)}
        <p style="font-size: 13px; color: #6b7fa0; margin-top: 30px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 15px; text-align: center;">此信件由 VisionWatch AI 監控系統自動發送，請勿直接回信。</p>
    `);
    return { to: subscriberEmail, subject, html };
}

async function sendResendEmail(apiKey, toEmail, subject, html, attachments) {
    try {
        const payload = {
            from: "alerts@dona-anna.com",
            to: toEmail,
            subject: subject,
            html: html
        };
        if (attachments) payload.attachments = attachments;

        const resp = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });
        const bodyText = await resp.text();
        return { ok: resp.ok, status: resp.status, body: bodyText };
    } catch (e) {
        console.error("Resend email failed:", e);
        return { ok: false, status: 0, body: String(e) };
    }
}

function jsonResponse(data, status = 200, headers = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers
    });
}

export function onRequestOptions() {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'POST, OPTIONS'
        }
    });
}
