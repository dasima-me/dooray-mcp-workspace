#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { z } from 'zod';
import http from 'http';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import localtunnel from 'localtunnel';

const SMTP_HOST = process.env.MAIL_SMTP_HOST || 'smtp.dooray.com';
const SMTP_PORT = parseInt(process.env.MAIL_SMTP_PORT || '465');
const IMAP_HOST = process.env.MAIL_IMAP_HOST || 'imap.dooray.com';
const IMAP_PORT = parseInt(process.env.MAIL_IMAP_PORT || '993');
const MAIL_USER = process.env.MAIL_USER;
const MAIL_PASS = process.env.MAIL_PASS;

const TRACKING_PORT = parseInt(process.env.TRACKING_PORT || '3456');
const TRACKING_DB = join(homedir(), '.dooray-mail-tracking.json');

// TRACKING_BASE_URL: 환경변수로 고정 URL 지정 가능, 없으면 localtunnel로 자동 생성
let TRACKING_BASE_URL = process.env.TRACKING_BASE_URL || null;

// 1x1 transparent GIF
const PIXEL_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

if (!MAIL_USER || !MAIL_PASS) {
  process.stderr.write('MAIL_USER and MAIL_PASS environment variables are required\n');
  process.exit(1);
}

function ok(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function err(e) {
  return {
    content: [{ type: 'text', text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
    isError: true,
  };
}

function loadTracking() {
  if (!existsSync(TRACKING_DB)) return {};
  try { return JSON.parse(readFileSync(TRACKING_DB, 'utf8')); } catch { return {}; }
}

function saveTracking(data) {
  writeFileSync(TRACKING_DB, JSON.stringify(data, null, 2));
}

// ── Tracking HTTP server ──────────────────────────────────────────────────────

const trackingServer = http.createServer((req, res) => {
  // 픽셀 요청
  const pixelMatch = req.url?.match(/^\/pixel\/([a-zA-Z0-9-]+)\.gif$/);
  if (pixelMatch) {
    const emailId = pixelMatch[1];
    const db = loadTracking();
    if (db[emailId] && !db[emailId].readAt) {
      db[emailId].readAt = new Date().toISOString();
      saveTracking(db);
    }
    res.writeHead(200, { 'Content-Type': 'image/gif', 'Cache-Control': 'no-cache, no-store' });
    res.end(PIXEL_GIF);
    return;
  }

  // 읽음 현황 페이지
  if (req.url === '/' || req.url === '') {
    const db = loadTracking();
    const rows = Object.entries(db)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));

    const tableRows = rows.map(r => {
      const read = !!r.readAt;
      const badge = read
        ? `<span style="color:#16a34a;font-weight:600">✔ 읽음</span><br><small style="color:#6b7280">${new Date(r.readAt).toLocaleString('ko-KR')}</small>`
        : `<span style="color:#9ca3af">— 미확인</span>`;
      return `<tr>
        <td>${new Date(r.sentAt).toLocaleString('ko-KR')}</td>
        <td>${r.to}</td>
        <td>${r.subject}</td>
        <td>${badge}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="30">
  <title>메일 읽음 현황</title>
  <style>
    body { font-family: -apple-system, sans-serif; padding: 32px; background: #f9fafb; color: #111; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    p.sub { color: #6b7280; font-size: 13px; margin-bottom: 24px; }
    table { border-collapse: collapse; width: 100%; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    th { background: #f3f4f6; padding: 10px 16px; text-align: left; font-size: 13px; color: #374151; }
    td { padding: 10px 16px; border-top: 1px solid #e5e7eb; font-size: 14px; vertical-align: top; }
    tr:hover td { background: #f9fafb; }
  </style>
</head>
<body>
  <h1>메일 읽음 현황</h1>
  <p class="sub">30초마다 자동 새로고침</p>
  <table>
    <thead><tr><th>발송 시각</th><th>수신자</th><th>제목</th><th>읽음 여부</th></tr></thead>
    <tbody>${tableRows || '<tr><td colspan="4" style="text-align:center;color:#9ca3af;padding:32px">발송 내역이 없습니다</td></tr>'}</tbody>
  </table>
</body>
</html>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  res.writeHead(404);
  res.end();
});

trackingServer.listen(TRACKING_PORT, async () => {
  process.stderr.write(`Tracking server listening on port ${TRACKING_PORT}\n`);
  if (!TRACKING_BASE_URL) {
    try {
      const tunnel = await localtunnel({ port: TRACKING_PORT });
      TRACKING_BASE_URL = tunnel.url;
      process.stderr.write(`Tracking tunnel URL: ${TRACKING_BASE_URL}\n`);
      tunnel.on('error', (e) => process.stderr.write(`Tunnel error: ${e.message}\n`));
      tunnel.on('close', () => process.stderr.write('Tunnel closed\n'));
    } catch (e) {
      TRACKING_BASE_URL = `http://localhost:${TRACKING_PORT}`;
      process.stderr.write(`Tunnel failed, falling back to localhost: ${e.message}\n`);
    }
  }
});

// ── Tool definitions ──────────────────────────────────────────────────────────

const tools = [
  {
    name: 'send-mail',
    description: '메일을 발송합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: '수신자 이메일 (여러 명은 쉼표로 구분, 예: a@b.com,c@d.com)' },
        cc: { type: 'string', description: '참조 이메일 (선택, 쉼표로 구분)' },
        bcc: { type: 'string', description: '숨은참조 이메일 (선택, 쉼표로 구분)' },
        subject: { type: 'string', description: '메일 제목' },
        body: { type: 'string', description: '메일 본문 (HTML 또는 일반 텍스트)' },
        isHtml: { type: 'boolean', description: 'HTML 본문 여부 (기본값: false)' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'get-mail-list',
    description: '받은 메일함의 메일 목록을 조회합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        folder: { type: 'string', description: '폴더명 (기본값: INBOX)' },
        limit: { type: 'number', description: '조회할 메일 수 (기본값: 20, 최대 50)' },
        unreadOnly: { type: 'boolean', description: '읽지 않은 메일만 조회 (기본값: false)' },
      },
    },
  },
  {
    name: 'get-mail',
    description: '특정 메일의 상세 내용을 조회합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        uid: { type: 'number', description: '메일 UID' },
        folder: { type: 'string', description: '폴더명 (기본값: INBOX)' },
      },
      required: ['uid'],
    },
  },
  {
    name: 'get-mail-folders',
    description: '메일 폴더 목록을 조회합니다.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get-read-receipts',
    description: '발송한 메일의 읽음 여부를 확인합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: '조회할 메일 수 (기본값: 20)' },
      },
    },
  },
];

// ── Handlers ──────────────────────────────────────────────────────────────────

const SendMailSchema = z.object({
  to: z.string(),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  subject: z.string(),
  body: z.string(),
  isHtml: z.boolean().optional(),
});

const GetMailListSchema = z.object({
  folder: z.string().optional(),
  limit: z.number().optional(),
  unreadOnly: z.boolean().optional(),
});

const GetMailSchema = z.object({
  uid: z.number(),
  folder: z.string().optional(),
});

const GetReadReceiptsSchema = z.object({
  limit: z.number().optional(),
});

function createTransporter() {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: true,
    auth: { user: MAIL_USER, pass: MAIL_PASS },
  });
}

function createImapClient() {
  return new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: true,
    auth: { user: MAIL_USER, pass: MAIL_PASS },
    logger: false,
  });
}

const handlers = {
  'send-mail': async (args) => {
    const { to, cc, bcc, subject, body, isHtml } = SendMailSchema.parse(args);

    const trackingId = randomUUID();
    const pixelUrl = `${TRACKING_BASE_URL}/pixel/${trackingId}.gif`;
    const pixelTag = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none">`;

    const htmlBody = isHtml
      ? `${body}${pixelTag}`
      : `<pre style="font-family:sans-serif;white-space:pre-wrap">${body}</pre>${pixelTag}`;

    const transporter = createTransporter();
    const info = await transporter.sendMail({
      from: MAIL_USER,
      to,
      cc,
      bcc,
      subject,
      text: isHtml ? undefined : body,
      html: htmlBody,
      headers: { 'Disposition-Notification-To': MAIL_USER },
    });

    const db = loadTracking();
    db[trackingId] = { messageId: info.messageId, subject, to, sentAt: new Date().toISOString(), readAt: null };
    saveTracking(db);

    // Save to Sent folder via IMAP
    try {
      const client = createImapClient();
      await client.connect();
      try {
        const folders = await client.list();
        let sentFolder = 'Sent';
        for (const f of folders) {
          if (f.specialUse === '\\Sent' || (f.flags && f.flags.has('\\Sent'))) {
            sentFolder = f.path;
            break;
          }
        }

        const rawLines = [`From: ${MAIL_USER}`, `To: ${to}`];
        if (cc) rawLines.push(`Cc: ${cc}`);
        rawLines.push(
          `Subject: ${subject}`,
          `Date: ${new Date().toUTCString()}`,
          `Message-ID: ${info.messageId}`,
          `MIME-Version: 1.0`,
          `Disposition-Notification-To: ${MAIL_USER}`,
          `Content-Type: text/html; charset=UTF-8`,
          ``,
          htmlBody,
        );
        await client.append(sentFolder, Buffer.from(rawLines.join('\r\n')), ['\\Seen']);
      } finally {
        await client.logout();
      }
    } catch (appendErr) {
      process.stderr.write(`Failed to save to Sent folder: ${appendErr.message}\n`);
    }

    return ok({ messageId: info.messageId, response: info.response, accepted: info.accepted, trackingId });
  },

  'get-mail-list': async (args) => {
    const { folder = 'INBOX', limit = 20, unreadOnly = false } = GetMailListSchema.parse(args);
    const client = createImapClient();
    await client.connect();
    const mails = [];
    try {
      await client.mailboxOpen(folder);
      const searchCriteria = unreadOnly ? { unseen: true } : { all: true };
      const uids = await client.search(searchCriteria, { uid: true });
      const recentUids = uids.slice(-Math.min(limit, 50)).reverse();

      for await (const msg of client.fetch(recentUids, {
        uid: true, flags: true, envelope: true,
      }, { uid: true })) {
        mails.push({
          uid: msg.uid,
          subject: msg.envelope.subject,
          from: msg.envelope.from?.map(a => `${a.name || ''} <${a.mailbox}@${a.host}>`).join(', '),
          date: msg.envelope.date,
          seen: msg.flags.has('\\Seen'),
        });
      }
    } finally {
      await client.logout();
    }
    return ok({ folder, total: mails.length, mails });
  },

  'get-mail': async (args) => {
    const { uid, folder = 'INBOX' } = GetMailSchema.parse(args);
    const client = createImapClient();
    await client.connect();
    try {
      await client.mailboxOpen(folder);
      const msg = await client.fetchOne(`${uid}`, {
        uid: true, flags: true, envelope: true, bodyStructure: true, source: true,
      }, { uid: true });
      if (!msg) throw new Error(`메일 UID ${uid}를 찾을 수 없습니다.`);

      const source = msg.source.toString();
      const bodyMatch = source.match(/\r?\n\r?\n([\s\S]*)/);
      const bodyText = bodyMatch ? bodyMatch[1].substring(0, 5000) : '';

      return ok({
        uid: msg.uid,
        subject: msg.envelope.subject,
        from: msg.envelope.from?.map(a => `${a.name || ''} <${a.mailbox}@${a.host}>`).join(', '),
        to: msg.envelope.to?.map(a => `${a.name || ''} <${a.mailbox}@${a.host}>`).join(', '),
        date: msg.envelope.date,
        seen: msg.flags.has('\\Seen'),
        body: bodyText,
      });
    } finally {
      await client.logout();
    }
  },

  'get-mail-folders': async () => {
    const client = createImapClient();
    await client.connect();
    try {
      const list = await client.list();
      const folders = list.map(f => ({ name: f.name, path: f.path, delimiter: f.delimiter, specialUse: f.specialUse }));
      return ok({ folders });
    } finally {
      await client.logout();
    }
  },

  'get-read-receipts': async (args) => {
    const { limit = 20 } = GetReadReceiptsSchema.parse(args);
    const db = loadTracking();
    const receipts = Object.entries(db)
      .map(([trackingId, v]) => ({ trackingId, ...v }))
      .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt))
      .slice(0, limit)
      .map(r => ({ ...r, read: !!r.readAt }));
    return ok({ receipts });
  },
};

// ── Server ────────────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'dooray-mail-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  const handler = handlers[name];
  if (!handler) {
    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  }
  try {
    return await handler(args || {});
  } catch (e) {
    return err(e);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write('Dooray Mail MCP Server started\n');
