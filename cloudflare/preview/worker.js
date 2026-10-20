var __defProp = Object.defineProperty;

var __name = (target, value) => __defProp(target, "name", { value, configurable: true });



// worker.js

var encoder = new TextEncoder();

var cors = {

  "Access-Control-Allow-Origin": "*",

  "Access-Control-Allow-Headers": "Content-Type, Authorization",

  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",

  "Access-Control-Max-Age": "86400"

};

var json = /* @__PURE__ */ __name((data, status = 200) => new Response(JSON.stringify(data), {

  status,

  headers: {

    ...cors,

    "Content-Type": "application/json; charset=utf-8",

    "Cache-Control": "no-store",

    "X-Content-Type-Options": "nosniff"

  }

}), "json");

async function sign(key, message) {

  const imported = await crypto.subtle.importKey(

    "raw",

    key,

    { name: "HMAC", hash: "SHA-256" },

    false,

    ["sign"]

  );

  return new Uint8Array(

    await crypto.subtle.sign("HMAC", imported, encoder.encode(message))

  );

}

__name(sign, "sign");

function same(a, b) {

  if (a.length !== b.length) return false;

  let diff = 0;

  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];

  return diff === 0;

}

__name(same, "same");

async function verify(initData, token) {

  if (typeof initData !== "string" || !initData || initData.length > 16384 || !token) throw Error("AUTH_REQUIRED");

  const entries = [...new URLSearchParams(initData).entries()];

  const params = new URLSearchParams(initData);

  if (new Set(entries.map(([k]) => k)).size !== entries.length || !params.has("user") || !params.has("hash") || !params.has("auth_date")) throw Error("INVALID_TELEGRAM_DATA");

  const authDate = Number(params.get("auth_date"));

  const now = Math.floor(Date.now() / 1e3);

  if (!Number.isSafeInteger(authDate) || authDate > now + 60 || now - authDate > 3600) throw Error("TELEGRAM_SESSION_EXPIRED");

  const hash = params.get("hash");

  if (!/^[0-9a-f]{64}$/i.test(hash || ""))

    throw Error("INVALID_TELEGRAM_SIGNATURE");

  const check = entries.filter(([k]) => k !== "hash").sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${k}=${v}`).join("\n");

  const secret = await sign(encoder.encode("WebAppData"), token);

  const expected = await sign(secret, check);

  const received = new Uint8Array(

    hash.match(/.{2}/g).map((x) => parseInt(x, 16))

  );

  if (!same(expected, received))

    throw Error("INVALID_TELEGRAM_SIGNATURE");

  let user;

  try {

    user = JSON.parse(params.get("user"));

  } catch {

    throw Error("INVALID_TELEGRAM_USER");

  }

  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0)

    throw Error("INVALID_TELEGRAM_USER");

  return user;

}

__name(verify, "verify");

async function userFromRequest(request, env) {

  const auth = request.headers.get("Authorization") || "";

  if (!auth.startsWith("tma ")) throw Error("AUTH_REQUIRED");

  return verify(auth.slice(4), env.TELEGRAM_BOT_TOKEN);

}

__name(userFromRequest, "userFromRequest");

async function profile(env, user) {

  const first = typeof user.first_name === "string" ? user.first_name.slice(0, 128) : "";

  const last = typeof user.last_name === "string" ? user.last_name.slice(0, 128) : "";

  const username = typeof user.username === "string" ? user.username.slice(0, 64) : null;

  const photo = typeof user.photo_url === "string" && user.photo_url.startsWith("https://") ? user.photo_url.slice(0, 2048) : null;

  await env.DB.prepare(

    `INSERT INTO users(id,username,first_name,last_name,photo_url)



     VALUES(?,?,?,?,?)



     ON CONFLICT(id) DO UPDATE SET



       username=excluded.username,



       first_name=excluded.first_name,



       last_name=excluded.last_name,



       photo_url=excluded.photo_url,



       updated_at=CURRENT_TIMESTAMP`

  ).bind(user.id, username, first, last, photo).run();

  return env.DB.prepare(

    `SELECT id,username,first_name,last_name,photo_url,



            group_id,bio,privacy,xp,level,created_at,updated_at



     FROM users WHERE id=?`

  ).bind(user.id).first();

}

__name(profile, "profile");

var authErrors = /* @__PURE__ */ new Set([

  "AUTH_REQUIRED",

  "INVALID_TELEGRAM_DATA",

  "INVALID_TELEGRAM_SIGNATURE",

  "INVALID_TELEGRAM_USER",

  "TELEGRAM_SESSION_EXPIRED"

]);

function validState(s) {

  return s && typeof s === "object" && !Array.isArray(s) && Array.isArray(s.tasks) && s.tasks.length <= 2e3 && Array.isArray(s.notes) && s.notes.length <= 2e3 && Array.isArray(s.grades) && s.grades.length <= 2e3 && s.attendance && typeof s.attendance === "object" && !Array.isArray(s.attendance) && Number.isSafeInteger(s.xp) && s.xp >= 0 && s.xp <= 1e8 && typeof s.group === "string" && s.group.length <= 80 && typeof s.groupName === "string" && s.groupName.length <= 160;

}

__name(validState, "validState");

function bad(code, status = 400) {

  return json({ ok: false, error: code }, status);

}

__name(bad, "bad");

function numericId(value) {

  const n = Number(value);

  return Number.isSafeInteger(n) && n > 0 ? n : null;

}

__name(numericId, "numericId");

async function bodyJSON(request) {

  const raw = await request.text();

  if (raw.length > 12e3) throw Error("PAYLOAD_TOO_LARGE");

  try {

    return JSON.parse(raw);

  } catch {

    throw Error("INVALID_JSON");

  }

}

__name(bodyJSON, "bodyJSON");

function messageBody(value) {

  return typeof value === "string" && value.trim().length >= 1 && value.trim().length <= 2e3 ? value.trim() : null;

}

__name(messageBody, "messageBody");

async function isFriend(env, a, b) {

  return Boolean(

    await env.DB.prepare(

      "SELECT 1 FROM social_friends WHERE user_id=? AND friend_id=?"

    ).bind(a, b).first()

  );

}

__name(isFriend, "isFriend");

async function socialRoute(request, env, path, url) {

  const user = await userFromRequest(request, env);

  await profile(env, user);

  const id = user.id;

  if (path === "/api/social/search" && request.method === "GET") {

    const q = (url.searchParams.get("q") || "").trim().replace(/^@/, "");

    if (q.length < 2 || q.length > 64)

      return bad("INVALID_QUERY");

    const rows = await env.DB.prepare(

      `SELECT id,username,first_name,last_name,photo_url



       FROM users



       WHERE id<>?



         AND username IS NOT NULL



         AND LOWER(username) LIKE LOWER(?) ESCAPE '\\\\'



         AND privacy <> 'private'



       ORDER BY



         CASE WHEN LOWER(username)=LOWER(?) THEN 0 ELSE 1 END,



         username



       LIMIT 20`

    ).bind(

      id,

      "%" + q.replace(/[\\\\%_]/g, "\\\\$&") + "%",

      q

    ).all();

    return json({ ok: true, users: rows.results });

  }

  if (path === "/api/social/friends" && request.method === "GET") {

    const friends = await env.DB.prepare(

      `SELECT u.id,u.username,u.first_name,u.last_name,u.photo_url



       FROM social_friends f



       JOIN users u ON u.id=f.friend_id



       WHERE f.user_id=?



       ORDER BY u.first_name,u.id



       LIMIT 200`

    ).bind(id).all();

    return json({ ok: true, friends: friends.results });

  }

  if (path === "/api/social/requests" && request.method === "GET") {

    const incoming = await env.DB.prepare(

      `SELECT r.id,r.sender_id,r.created_at,



              u.username,u.first_name,u.last_name,u.photo_url



       FROM social_friend_requests r



       JOIN users u ON u.id=r.sender_id



       WHERE r.receiver_id=? AND r.status='pending'



       ORDER BY r.id DESC LIMIT 100`

    ).bind(id).all();

    const outgoing = await env.DB.prepare(

      `SELECT r.id,r.receiver_id,r.created_at,



              u.username,u.first_name,u.last_name,u.photo_url



       FROM social_friend_requests r



       JOIN users u ON u.id=r.receiver_id



       WHERE r.sender_id=? AND r.status='pending'



       ORDER BY r.id DESC LIMIT 100`

    ).bind(id).all();

    return json({

      ok: true,

      incoming: incoming.results,

      outgoing: outgoing.results

    });

  }

  if (path === "/api/social/requests" && request.method === "POST") {

    const body = await bodyJSON(request);

    const target = numericId(body?.userId);

    if (!target || target === id)

      return bad("INVALID_USER");

    const other = await env.DB.prepare(

      "SELECT id,privacy FROM users WHERE id=?"

    ).bind(target).first();

    if (!other || other.privacy === "private")

      return bad("USER_NOT_FOUND", 404);

    if (await isFriend(env, id, target))

      return bad("ALREADY_FRIENDS", 409);

    const reverse = await env.DB.prepare(

      `SELECT id FROM social_friend_requests



       WHERE sender_id=? AND receiver_id=? AND status='pending'



       ORDER BY id DESC LIMIT 1`

    ).bind(target, id).first();

    if (reverse)

      return bad("ACCEPT_INCOMING_REQUEST_FIRST", 409);

    const existing = await env.DB.prepare(

      `SELECT id FROM social_friend_requests



       WHERE sender_id=? AND receiver_id=? AND status='pending'`

    ).bind(id, target).first();

    if (existing)

      return json({

        ok: true,

        requestId: existing.id,

        alreadyPending: true

      });

    await env.DB.prepare(

      `INSERT INTO social_friend_requests(sender_id,receiver_id,status)



       VALUES(?,?,'pending')`

    ).bind(id, target).run();

    return json({ ok: true });

  }

  if (path === "/api/social/requests/respond" && request.method === "POST") {

    const body = await bodyJSON(request);

    const requestId = numericId(body?.requestId);

    if (!requestId || !["accept", "reject"].includes(body?.action)) return bad("INVALID_REQUEST");

    const row = await env.DB.prepare(

      `SELECT sender_id FROM social_friend_requests



       WHERE id=? AND receiver_id=? AND status='pending'`

    ).bind(requestId, id).first();

    if (!row) return bad("REQUEST_NOT_FOUND", 404);

    const result = await env.DB.prepare(

      `UPDATE social_friend_requests



       SET status=?,updated_at=CURRENT_TIMESTAMP



       WHERE id=? AND receiver_id=? AND status='pending'`

    ).bind(

      body.action === "accept" ? "accepted" : "rejected",

      requestId,

      id

    ).run();

    if (result.meta.changes !== 1)

      return bad("REQUEST_ALREADY_HANDLED", 409);

    if (body.action === "accept") {

      await env.DB.batch([

        env.DB.prepare(

          `INSERT OR IGNORE INTO social_friends(user_id,friend_id)



           VALUES(?,?)`

        ).bind(id, row.sender_id),

        env.DB.prepare(

          `INSERT OR IGNORE INTO social_friends(user_id,friend_id)



           VALUES(?,?)`

        ).bind(row.sender_id, id)

      ]);

    }

    return json({ ok: true });

  }

  if (path === "/api/social/dm" && request.method === "GET") {

    const other = numericId(url.searchParams.get("userId"));

    if (!other || !await isFriend(env, id, other))

      return bad("FRIEND_REQUIRED", 403);

    const rows = await env.DB.prepare(

      `SELECT id,sender_id,receiver_id,body,created_at



       FROM social_direct_messages



       WHERE (sender_id=? AND receiver_id=?)



          OR (sender_id=? AND receiver_id=?)



       ORDER BY id DESC LIMIT 100`

    ).bind(id, other, other, id).all();

    return json({

      ok: true,

      messages: rows.results.reverse()

    });

  }

  if (path === "/api/social/dm" && request.method === "POST") {

    const body = await bodyJSON(request);

    const other = numericId(body?.userId);

    const msg = messageBody(body?.body);

    if (!other || !msg)

      return bad("INVALID_MESSAGE");

    if (!await isFriend(env, id, other))

      return bad("FRIEND_REQUIRED", 403);

    const result = await env.DB.prepare(

      `INSERT INTO social_direct_messages(sender_id,receiver_id,body)



       VALUES(?,?,?)`

    ).bind(id, other, msg).run();

    return json({

      ok: true,

      messageId: result.meta.last_row_id

    });

  }

  if (path === "/api/social/group" && request.method === "GET") {

    const group = (url.searchParams.get("groupId") || "").trim();

    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(group))

      return bad("INVALID_GROUP");

    const rows = await env.DB.prepare(

      `SELECT m.id,m.group_id,m.sender_id,m.body,m.created_at,



              u.first_name,u.last_name,u.username



       FROM social_group_messages m



       JOIN users u ON u.id=m.sender_id



       WHERE m.group_id=?



       ORDER BY m.id DESC LIMIT 100`

    ).bind(group).all();

    return json({

      ok: true,

      messages: rows.results.reverse()

    });

  }

  if (path === "/api/social/group" && request.method === "POST") {

    const body = await bodyJSON(request);

    const group = String(body?.groupId || "").trim();

    const msg = messageBody(body?.body);

    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(group) || !msg) return bad("INVALID_MESSAGE");

    const result = await env.DB.prepare(

      `INSERT INTO social_group_messages(group_id,sender_id,body)



       VALUES(?,?,?)`

    ).bind(group, id, msg).run();

    return json({

      ok: true,

      messageId: result.meta.last_row_id

    });

  }

  if (path === "/api/social/inbox" && request.method === "GET") {

    const rows = await env.DB.prepare(`



      SELECT



        u.id, u.username, u.first_name, u.last_name, u.photo_url,



        (



          SELECT m.body



          FROM social_direct_messages m



          WHERE (m.sender_id=? AND m.receiver_id=u.id)



             OR (m.sender_id=u.id AND m.receiver_id=?)



          ORDER BY m.id DESC LIMIT 1



        ) AS last_message,



        (



          SELECT MAX(m.id)



          FROM social_direct_messages m



          WHERE (m.sender_id=? AND m.receiver_id=u.id)



             OR (m.sender_id=u.id AND m.receiver_id=?)



        ) AS last_id,



        (



          SELECT COUNT(*)



          FROM social_direct_messages m



          WHERE m.sender_id=u.id AND m.receiver_id=?



            AND m.id > COALESCE((



              SELECT last_message_id



              FROM social_read_state



              WHERE user_id=?



                AND conversation_key='dm:' || u.id



            ), 0)



        ) AS unread



      FROM social_friends f



      JOIN users u ON u.id=f.friend_id



      WHERE f.user_id=?



      ORDER BY last_id DESC, u.first_name



      LIMIT 200



    `).bind(id, id, id, id, id, id, id).all();

    return json({ ok: true, dialogs: rows.results });

  }

  if (path === "/api/social/read" && request.method === "POST") {

    const body = await bodyJSON(request);

    const other = numericId(body?.userId);

    if (!other || !await isFriend(env, id, other))

      return bad("FRIEND_REQUIRED", 403);

    const last = await env.DB.prepare(`



      SELECT MAX(id) AS last_id



      FROM social_direct_messages



      WHERE sender_id=? AND receiver_id=?



    `).bind(other, id).first();

    const lastId = last?.last_id || 0;

    await env.DB.prepare(`



      INSERT INTO social_read_state



        (user_id,conversation_key,last_message_id,updated_at)



      VALUES(?,?,?,CURRENT_TIMESTAMP)



      ON CONFLICT(user_id,conversation_key)



      DO UPDATE SET



        last_message_id=MAX(



          social_read_state.last_message_id,



          excluded.last_message_id



        ),



        updated_at=CURRENT_TIMESTAMP



    `).bind(id, "dm:" + other, lastId).run();

    return json({ ok: true, lastMessageId: lastId });

  }

  if (path === "/api/social/read-status" && request.method === "GET") {

    const other = numericId(url.searchParams.get("userId"));

    if (!other || !await isFriend(env, id, other))

      return bad("FRIEND_REQUIRED", 403);

    const row = await env.DB.prepare(`



      SELECT last_message_id



      FROM social_read_state



      WHERE user_id=? AND conversation_key=?



    `).bind(other, "dm:" + id).first();

    return json({

      ok: true,

      readThrough: row?.last_message_id || 0

    });

  }

  return bad("NOT_FOUND", 404);

}

__name(socialRoute, "socialRoute");


/**
 * Prepare an authenticated, bot-authored Telegram share message.
 * Preview only. No image storage is configured, so this sends formatted text.
 */
async function prepareScheduleShare(request, env) {
  const user = await userFromRequest(request, env);
  const body = await request.json();
  const schedule = typeof body?.schedule === "string" ? body.schedule.trim() : "";
  if (!schedule || schedule.length > 3200) return bad("INVALID_SCHEDULE");
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 100) : "Розклад пар";
  const message = "📅 " + (title || "Розклад пар") + "\n\n" + schedule + "\n\nДеПара? REBORN";
  // Upload the image directly to R2: no temporary Telegram DM or notification.
  let photoUrl = null;
  let thumbnailUrl = null;
  let photoError = typeof body?.imageBase64 === "string" ? "IMAGE_UPLOAD_FAILED" : "IMAGE_NOT_RECEIVED";
  if (typeof body?.imageBase64 === "string" && body.imageBase64.length <= 3800000 && /^[A-Za-z0-9+/]+={0,2}$/.test(body.imageBase64)) {
    try {
      const binary = atob(body.imageBase64);
      if (binary.length <= 2800000 && binary.charCodeAt(0) === 255 && binary.charCodeAt(1) === 216 && env.SHARE_IMAGES) {
        const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
        const key = "shared/" + crypto.randomUUID() + ".jpg";
        await env.SHARE_IMAGES.put(key, bytes, { httpMetadata: { contentType: "image/jpeg" }, customMetadata: { expiresAt: String(Date.now() + 86400000) } });
        photoUrl = new URL(request.url).origin + "/api/share/image/" + key.slice(7);
        if (typeof body?.thumbnailBase64 === "string" && body.thumbnailBase64.length <= 280000 && /^[A-Za-z0-9+/]+={0,2}$/.test(body.thumbnailBase64)) {
          const thumbBinary = atob(body.thumbnailBase64);
          if (thumbBinary.length <= 200000 && thumbBinary.charCodeAt(0) === 255 && thumbBinary.charCodeAt(1) === 216) {
            const thumbKey = "shared/" + crypto.randomUUID() + ".jpg";
            await env.SHARE_IMAGES.put(thumbKey, Uint8Array.from(thumbBinary, ch => ch.charCodeAt(0)), {
              httpMetadata: { contentType: "image/jpeg" },
              customMetadata: { expiresAt: String(Date.now() + 86400000) }
            });
            thumbnailUrl = new URL(request.url).origin + "/api/share/image/" + thumbKey.slice(7);
          }
        }
        photoError = thumbnailUrl ? null : "THUMBNAIL_NOT_RECEIVED";
        if (!thumbnailUrl) photoUrl = null;
      } else photoError = env.SHARE_IMAGES ? "IMAGE_TOO_LARGE" : "R2_NOT_CONFIGURED";
    } catch (err) { photoError = "R2_UPLOAD_FAILED"; console.warn("Share R2 upload failed", String(err)); }
  }
  const buttons = { inline_keyboard: [[{
    text: "Відкрити ДеПара?",
    url: "https://t.me/DePara_Reborn_Test_Bot?startapp=shared_schedule"
  }]] };
  const result = photoUrl ? {
    type: "photo",
    id: "depara-photo-" + crypto.randomUUID(),
    photo_url: photoUrl,
    thumbnail_url: thumbnailUrl,
    caption: "",
    reply_markup: buttons
  } : {
    type: "article",
    id: "depara-share-" + crypto.randomUUID(),
    title: "Поділитися розкладом",
    input_message_content: { message_text: message },
    reply_markup: buttons
  };
  const response = await fetch("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/savePreparedInlineMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: user.id,
      result,
      allow_user_chats: true,
      allow_bot_chats: true,
      allow_group_chats: true,
      allow_channel_chats: true
    })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok || typeof data.result?.id !== "string") {
    console.error("Telegram share preparation failed", response.status, data?.error_code);
    return bad("TELEGRAM_SHARE_FAILED", 502);
  }
  return json({ ok: true, id: data.result.id, mode: photoUrl ? 'photo' : 'text', photoError: photoUrl ? null : photoError, expiration_date: data.result.expiration_date });
}

var worker_default = {

  async fetch(request, env) {

    if (request.method === "OPTIONS")

      return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);

    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path === "/health" && request.method === "GET")

      return json({

        ok: true,

        service: "depara-api",

        database: Boolean(env.DB),

        telegramConfigured: Boolean(env.TELEGRAM_BOT_TOKEN)

      });

    // Public image endpoint used by Telegram to fetch a prepared inline photo.
    if (path.startsWith("/api/share/image/") && request.method === "GET") {
      const id = path.slice("/api/share/image/".length);
      if (!/^[0-9a-f-]{36}\.jpg$/i.test(id) || !env.SHARE_IMAGES) return bad("NOT_FOUND", 404);
      const object = await env.SHARE_IMAGES.get("shared/" + id);
      if (!object) return bad("NOT_FOUND", 404);
      if (Number(object.customMetadata?.expiresAt || 0) < Date.now()) {
        await env.SHARE_IMAGES.delete("shared/" + id);
        return bad("EXPIRED", 404);
      }
      return new Response(object.body, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } });
    }
    if (!env.DB || !env.TELEGRAM_BOT_TOKEN)

      return json({

        ok: false,

        error: "SERVER_NOT_CONFIGURED"

      }, 503);

    try {

      if (path === "/api/share/prepare" && request.method === "POST")
        return await prepareScheduleShare(request, env);

      if (path === "/api/auth/telegram" && request.method === "POST") {

        const body = await request.json();

        const user = await verify(

          body.initData,

          env.TELEGRAM_BOT_TOKEN

        );

        return json({

          ok: true,

          user: await profile(env, user)

        });

      }

      if (path === "/api/me" && request.method === "GET") {

        const user = await userFromRequest(request, env);

        return json({

          ok: true,

          user: await profile(env, user)

        });

      }

      if (path === "/api/sync" && request.method === "GET") {

        const user = await userFromRequest(request, env);

        const row = await env.DB.prepare(

          `SELECT payload,revision,updated_at



           FROM user_state WHERE user_id=?`

        ).bind(user.id).first();

        return json({

          ok: true,

          exists: Boolean(row),

          state: row ? JSON.parse(row.payload) : null,

          revision: row?.revision || 0,

          updatedAt: row?.updated_at || null

        });

      }

      if (path === "/api/sync" && request.method === "PUT") {

        const user = await userFromRequest(request, env);

        const raw = await request.text();

        if (raw.length > 25e4)

          return json({

            ok: false,

            error: "PAYLOAD_TOO_LARGE"

          }, 413);

        let body;

        try {

          body = JSON.parse(raw);

        } catch {

          return bad("INVALID_JSON");

        }

        if (!validState(body.state) || !Number.isSafeInteger(body.revision) || body.revision < 0) return bad("INVALID_STATE");

        const payload = JSON.stringify({

          tasks: body.state.tasks,

          notes: body.state.notes,

          grades: body.state.grades,

          attendance: body.state.attendance,

          xp: body.state.xp,

          group: body.state.group,

          groupName: body.state.groupName

        });

        if (payload.length > 2e5)

          return bad("PAYLOAD_TOO_LARGE", 413);

        const result = await env.DB.prepare(

          `INSERT INTO user_state(user_id,payload,revision,updated_at)



           SELECT ?,?,1,CURRENT_TIMESTAMP WHERE ?=0



           ON CONFLICT(user_id) DO NOTHING`

        ).bind(user.id, payload, body.revision).run();

        if (result.meta.changes === 1)

          return json({ ok: true, revision: 1 });

        const update = await env.DB.prepare(

          `UPDATE user_state



           SET payload=?,revision=revision+1,



               updated_at=CURRENT_TIMESTAMP



           WHERE user_id=? AND revision=?`

        ).bind(payload, user.id, body.revision).run();

        if (update.meta.changes === 1)

          return json({

            ok: true,

            revision: body.revision + 1

          });

        return bad("REVISION_CONFLICT", 409);

      }

      if (path.startsWith("/api/social/"))

        return await socialRoute(request, env, path, url);

      return bad("NOT_FOUND", 404);

    } catch (err) {

      if (authErrors.has(err.message))

        return bad(err.message, 401);

      if (err.message === "PAYLOAD_TOO_LARGE")

        return bad("PAYLOAD_TOO_LARGE", 413);

      if (err.message === "INVALID_JSON" || err instanceof SyntaxError) return bad("INVALID_JSON");

      console.error("API error", err);

      return bad("INTERNAL_ERROR", 500);

    }

  }

};

export {

  worker_default as default

};

//# sourceMappingURL=worker.js.map