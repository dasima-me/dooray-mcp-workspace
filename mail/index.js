#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { z } from 'zod';

const SMTP_HOST = process.env.MAIL_SMTP_HOST || 'smtp.dooray.com';
const SMTP_PORT = parseInt(process.env.MAIL_SMTP_PORT || '465');
const IMAP_HOST = process.env.MAIL_IMAP_HOST || 'imap.dooray.com';
const IMAP_PORT = parseInt(process.env.MAIL_IMAP_PORT || '993');
const MAIL_USER = process.env.MAIL_USER;
const MAIL_PASS = process.env.MAIL_PASS;

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
    const transporter = createTransporter();
    const info = await transporter.sendMail({
      from: MAIL_USER,
      to,
      cc,
      bcc,
      subject,
      [isHtml ? 'html' : 'text']: body,
    });
    return ok({ messageId: info.messageId, response: info.response, accepted: info.accepted });
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

      // 텍스트/HTML 본문 추출
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
      const folders = [];
      for await (const folder of client.list()) {
        folders.push({ name: folder.name, path: folder.path, delimiter: folder.delimiter });
      }
      return ok({ folders });
    } finally {
      await client.logout();
    }
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
