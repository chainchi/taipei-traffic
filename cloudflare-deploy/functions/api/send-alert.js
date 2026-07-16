// Cloudflare Pages Function: /api/send-alert
// Sends subscriber alert notification emails to the developer using Resend API

export async function onRequestPost(context) {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    try {
        const body = await context.request.json();
        const { subscriberEmail, camera, riskScore, mode, timestamp } = body;

        if (!subscriberEmail || !camera) {
            return jsonResponse({ error: 'Missing required parameters' }, 400, headers);
        }

        const activeMode = mode || 'flood';

        // Developer Resend credentials (hardcoded fallback + environment variable support)
        const apiKey = context.env.RESEND_API_KEY || 're_erxqwPC9_4PEkKQkUeRg57fRLGLNaypqa';
        const developerEmail = context.env.DEVELOPER_EMAIL || 'cadtc.larry@gmail.com';

        const success = await sendResendNotification(apiKey, developerEmail, subscriberEmail, camera, riskScore, activeMode, timestamp);
        if (success) {
            return jsonResponse({ ok: true, message: 'Notification email successfully sent to developer' }, 200, headers);
        } else {
            return jsonResponse({ error: 'Failed to deliver email via Resend API' }, 500, headers);
        }
    } catch (err) {
        return jsonResponse({ error: err.message }, 500, headers);
    }
}

async function sendResendNotification(apiKey, toEmail, subscriberEmail, camera, riskScore, mode, timestamp) {
    const timeStr = timestamp || new Date().toLocaleString('zh-TW');
    const isParking = mode === 'parking';

    // Dynamic content configuration based on mode
    const subjectPrefix = isParking ? '🚨 [Parking Watch Alert]' : '🚨 [FloodWatch Alert]';
    const subject = `${subjectPrefix} ${camera} - Status: ${isParking ? 'PARKED' : 'CRITICAL'} (${Math.round(riskScore)}%)`;
    
    const title = isParking ? '⚠️ 車位占用即時警報 (Parking Watch AI)' : '⚠️ 淹水即時警報 (FloodWatch AI)';
    const bodyDesc = isParking 
        ? '系統偵測到車位被長時間占用 / 違規停車，請多加留意。' 
        : '系統偵測到高度淹水風險，請多加留意安全。';

    const statusLabel = isParking ? '車位狀態' : '安全層級';
    const statusValue = isParking ? 'PARKED (占用)' : 'CRITICAL (危險)';
    const riskLabelText = isParking ? '空間判定值' : '淹水風險值';

    try {
        const resp = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from: "FloodWatch AI <onboarding@resend.dev>",
                to: toEmail,
                subject: subject,
                html: `<div style="background-color: #030810; color: #e0e8f0; font-family: sans-serif; padding: 30px; border-radius: 12px; max-width: 600px; margin: 0 auto; border: 1px solid #ff3355;">
                    <h2 style="color: #ff3355; font-size: 24px; border-bottom: 1px solid rgba(255,51,85,0.2); padding-bottom: 10px; margin-top: 0;">
                        ${title}
                    </h2>
                    <p style="font-size: 16px; line-height: 1.6;">
                        ${bodyDesc}
                    </p>
                    
                    <div style="background: rgba(255, 51, 85, 0.1); border: 1px solid #ff3355; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <h4 style="margin: 0 0 8px 0; color: #ff3355;">🔔 訂閱者聯絡資訊 (Subscriber Email)</h4>
                        <a href="mailto:${subscriberEmail}" style="color: #00e5a0; font-size: 18px; font-weight: bold; text-decoration: underline;">
                            ${subscriberEmail}
                        </a>
                        <p style="margin: 8px 0 0 0; font-size: 13px; color: #6b7fa0;">
                            請使用您的 Gmail 帳號發信通知此使用者，或協助處理相關防汛/違停事宜。
                        </p>
                    </div>

                    <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: rgba(255,255,255,0.02); border-radius: 8px; overflow: hidden;">
                        <tr>
                            <td style="padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); color: #6b7fa0; font-weight: bold;">監控點</td>
                            <td style="padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); color: #ffffff;">${camera}</td>
                        </tr>
                        <tr>
                            <td style="padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); color: #6b7fa0; font-weight: bold;">${riskLabelText}</td>
                            <td style="padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); color: #ff3355; font-weight: bold; font-size: 18px;">${Math.round(riskScore)}%</td>
                        </tr>
                        <tr>
                            <td style="padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); color: #6b7fa0; font-weight: bold;">偵測時間</td>
                            <td style="padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); color: #ffffff;">${timeStr}</td>
                        </tr>
                        <tr>
                            <td style="padding: 12px; color: #6b7fa0; font-weight: bold;">${statusLabel}</td>
                            <td style="padding: 12px; color: #ff3355; font-weight: bold;">${statusValue}</td>
                        </tr>
                    </table>
                    <p style="font-size: 13px; color: #6b7fa0; margin-top: 30px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 15px; text-align: center;">
                        此信件由 FloodWatch AI 監控系統自動發送，請勿直接回信。
                    </p>
                </div>`
            })
        });
        return resp.ok;
    } catch (e) {
        console.error("Resend email failed:", e);
        return false;
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
