// Local workerd test service only. No real Telegram token or messages.
let messages = [], botName = 'DeParraTest_bot', nextSendStatus = 200, delayMs = 0, activeSends = 0;

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/__state') return Response.json({messages, botName, activeSends});
    if (url.pathname === '/__reset') {messages = []; botName = 'DeParraTest_bot'; nextSendStatus = 200; delayMs = 0; activeSends = 0; return Response.json({ok: true})}
    if (url.pathname === '/__bot') {botName = url.searchParams.get('name') || ''; return Response.json({ok: true})}
    if (url.pathname === '/__next-send') {nextSendStatus = Number(url.searchParams.get('status')); return Response.json({ok: true})}
    if (url.pathname === '/__send-delay') {delayMs = Number(url.searchParams.get('ms')) || 0; return Response.json({ok: true})}
    if (url.pathname.endsWith('/getMe')) return Response.json({ok: true, result: {id: 123456, is_bot: true, username: botName}});
    const data = await request.json();
    if (url.pathname.endsWith('/getChat')) return Response.json({ok: true, result: {id: Number(data.chat_id), type: 'private'}});
    if (url.pathname.endsWith('/sendMessage')) {
      const status = nextSendStatus; nextSendStatus = 200;
      if (status === 429) return Response.json({ok: false, parameters: {retry_after: 30}}, {status});
      if (status !== 200) return Response.json({ok: false}, {status});
      activeSends++;
      if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
      activeSends--;
      messages.push({chat_id: data.chat_id, text: data.text});
      return Response.json({ok: true, result: {message_id: messages.length}});
    }
    return Response.json({ok: false}, {status: 404});
  }
};
