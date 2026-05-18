#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import { z } from 'zod';

const BASE_URL = process.env.DOORAY_API_BASE_URL || 'https://api.dooray.com';
const TOKEN = process.env.DOORAY_API_TOKEN;

if (!TOKEN) {
  process.stderr.write('DOORAY_API_TOKEN environment variable is required\n');
  process.exit(1);
}

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    Authorization: `dooray-api ${TOKEN}`,
  },
});

async function request(method, url, data, params) {
  try {
    const res = await client.request({ method, url, data, params });
    const { header, result, totalCount } = res.data;
    if (!header.isSuccessful) {
      throw new Error(header.resultMessage || 'API request failed');
    }
    return totalCount !== undefined ? { data: result, totalCount } : result;
  } catch (e) {
    if (e.response) {
      const status = e.response.status;
      const body = JSON.stringify(e.response.data);
      throw new Error(`HTTP ${status}: ${body}`);
    }
    throw e;
  }
}

function ok(data) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

function err(e) {
  return {
    content: [{ type: 'text', text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
    isError: true,
  };
}

// 참석자 배열을 Dooray API users 구조로 변환
function buildUsers(to, cc) {
  return {
    to: (to || []).map((a) =>
      a.type === 'member'
        ? { type: 'member', member: { organizationMemberId: a.organizationMemberId } }
        : { type: 'emailUser', emailAddress: a.emailAddress, name: a.name }
    ),
    cc: (cc || []).map((a) =>
      a.type === 'member'
        ? { type: 'member', member: { organizationMemberId: a.organizationMemberId } }
        : { type: 'emailUser', emailAddress: a.emailAddress, name: a.name }
    ),
  };
}

// ── Zod schemas ──────────────────────────────────────────────────────────────

const GetCalendarListSchema = z.object({
  page: z.number().optional(),
  size: z.number().optional(),
});

const GetCalendarSchema = z.object({
  calendarId: z.string(),
});

const CreateCalendarSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  color: z.string().optional(),
});

const DeleteCalendarSchema = z.object({
  calendarId: z.string(),
});

const UpdateCalendarMembersSchema = z.object({
  calendarId: z.string(),
  members: z.array(z.object({
    organizationMemberId: z.string(),
    role: z.enum(['read', 'write']).optional(),
  })),
});

const GetCalendarEventsSchema = z.object({
  timeMin: z.string().optional(),
  timeMax: z.string().optional(),
  calendarId: z.string().optional(),
  page: z.number().optional(),
  size: z.number().optional(),
});

const GetCalendarEventSchema = z.object({
  calendarId: z.string(),
  eventId: z.string(),
});

const AttendeeSchema = z.object({
  type: z.enum(['member', 'emailUser']),
  organizationMemberId: z.string().optional(),
  emailAddress: z.string().optional(),
  name: z.string().optional(),
});

const CreateCalendarEventSchema = z.object({
  calendarId: z.string(),
  subject: z.string(),
  startedAt: z.string(),
  endedAt: z.string(),
  wholeDayFlag: z.boolean().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  attendeesTo: z.array(AttendeeSchema).optional(),
  attendeesCc: z.array(AttendeeSchema).optional(),
});

const UpdateCalendarEventSchema = z.object({
  calendarId: z.string(),
  eventId: z.string(),
  subject: z.string().optional(),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  wholeDayFlag: z.boolean().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  attendeesTo: z.array(AttendeeSchema).optional(),
  attendeesCc: z.array(AttendeeSchema).optional(),
});

const DeleteCalendarEventSchema = z.object({
  calendarId: z.string(),
  eventId: z.string(),
});

// ── Tool definitions ──────────────────────────────────────────────────────────

const tools = [
  {
    name: 'get-calendar-list',
    description: '내 캘린더 목록을 조회합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number', description: '페이지 번호 (0부터 시작)' },
        size: { type: 'number', description: '페이지 크기 (최대 100)' },
      },
    },
  },
  {
    name: 'get-calendar',
    description: '특정 캘린더의 상세 정보를 조회합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        calendarId: { type: 'string', description: '캘린더 ID' },
      },
      required: ['calendarId'],
    },
  },
  {
    name: 'create-calendar',
    description: '새 캘린더를 생성합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '캘린더 이름' },
        description: { type: 'string', description: '캘린더 설명' },
        color: { type: 'string', description: '캘린더 색상 (예: #FF0000)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'delete-calendar',
    description: '캘린더를 삭제합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        calendarId: { type: 'string', description: '삭제할 캘린더 ID' },
      },
      required: ['calendarId'],
    },
  },
  {
    name: 'update-calendar-members',
    description: '캘린더 멤버를 업데이트합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        calendarId: { type: 'string', description: '캘린더 ID' },
        members: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              organizationMemberId: { type: 'string' },
              role: { type: 'string', enum: ['read', 'write'] },
            },
            required: ['organizationMemberId'],
          },
          description: '멤버 목록',
        },
      },
      required: ['calendarId', 'members'],
    },
  },
  {
    name: 'get-calendar-events',
    description: '캘린더 이벤트(일정) 목록을 조회합니다. 특정 기간의 일정을 확인할 수 있습니다.',
    inputSchema: {
      type: 'object',
      properties: {
        timeMin: { type: 'string', description: '조회 시작 시간 (ISO 8601, 예: 2026-05-01T00:00:00+09:00)' },
        timeMax: { type: 'string', description: '조회 종료 시간 (ISO 8601, 예: 2026-05-31T23:59:59+09:00)' },
        calendarId: { type: 'string', description: '특정 캘린더 ID (없으면 전체 캘린더)' },
        page: { type: 'number', description: '페이지 번호' },
        size: { type: 'number', description: '페이지 크기' },
      },
    },
  },
  {
    name: 'get-calendar-event',
    description: '특정 캘린더 이벤트(일정)의 상세 정보를 조회합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        calendarId: { type: 'string', description: '캘린더 ID' },
        eventId: { type: 'string', description: '이벤트 ID' },
      },
      required: ['calendarId', 'eventId'],
    },
  },
  {
    name: 'create-calendar-event',
    description: '캘린더에 새 이벤트(약속/일정)를 생성합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        calendarId: { type: 'string', description: '이벤트를 생성할 캘린더 ID' },
        subject: { type: 'string', description: '이벤트 제목' },
        startedAt: { type: 'string', description: '시작 시간 (ISO 8601, 예: 2026-05-20T14:00:00+09:00)' },
        endedAt: { type: 'string', description: '종료 시간 (ISO 8601, 예: 2026-05-20T15:00:00+09:00)' },
        wholeDayFlag: { type: 'boolean', description: '종일 여부 (기본값: false)' },
        location: { type: 'string', description: '장소' },
        description: { type: 'string', description: '이벤트 내용/메모' },
        attendeesTo: {
          type: 'array',
          description: '주 참석자 목록 (to)',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['member', 'emailUser'] },
              organizationMemberId: { type: 'string', description: '조직 멤버 ID (type=member)' },
              emailAddress: { type: 'string', description: '이메일 주소 (type=emailUser)' },
              name: { type: 'string', description: '이름 (type=emailUser)' },
            },
            required: ['type'],
          },
        },
        attendeesCc: {
          type: 'array',
          description: '참조 참석자 목록 (cc)',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['member', 'emailUser'] },
              organizationMemberId: { type: 'string' },
              emailAddress: { type: 'string' },
              name: { type: 'string' },
            },
            required: ['type'],
          },
        },
      },
      required: ['calendarId', 'subject', 'startedAt', 'endedAt'],
    },
  },
  {
    name: 'update-calendar-event',
    description: '기존 캘린더 이벤트(일정)를 수정합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        calendarId: { type: 'string', description: '캘린더 ID' },
        eventId: { type: 'string', description: '수정할 이벤트 ID' },
        subject: { type: 'string', description: '이벤트 제목' },
        startedAt: { type: 'string', description: '시작 시간 (ISO 8601)' },
        endedAt: { type: 'string', description: '종료 시간 (ISO 8601)' },
        wholeDayFlag: { type: 'boolean', description: '종일 여부' },
        location: { type: 'string', description: '장소' },
        description: { type: 'string', description: '이벤트 내용/메모' },
        attendeesTo: {
          type: 'array',
          description: '주 참석자 목록 (to)',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['member', 'emailUser'] },
              organizationMemberId: { type: 'string' },
              emailAddress: { type: 'string' },
              name: { type: 'string' },
            },
            required: ['type'],
          },
        },
        attendeesCc: {
          type: 'array',
          description: '참조 참석자 목록 (cc)',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['member', 'emailUser'] },
              organizationMemberId: { type: 'string' },
              emailAddress: { type: 'string' },
              name: { type: 'string' },
            },
            required: ['type'],
          },
        },
      },
      required: ['calendarId', 'eventId'],
    },
  },
  {
    name: 'delete-calendar-event',
    description: '캘린더 이벤트(일정)를 삭제합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        calendarId: { type: 'string', description: '캘린더 ID' },
        eventId: { type: 'string', description: '삭제할 이벤트 ID' },
      },
      required: ['calendarId', 'eventId'],
    },
  },
];

// ── Handlers ──────────────────────────────────────────────────────────────────

const handlers = {
  'get-calendar-list': async (args) => {
    const { page, size } = GetCalendarListSchema.parse(args);
    const data = await request('GET', '/calendar/v1/calendars', null, { page, size });
    return ok(data);
  },

  'get-calendar': async (args) => {
    const { calendarId } = GetCalendarSchema.parse(args);
    const data = await request('GET', `/calendar/v1/calendars/${calendarId}`);
    return ok(data);
  },

  'create-calendar': async (args) => {
    const body = CreateCalendarSchema.parse(args);
    const data = await request('POST', '/calendar/v1/calendars', body);
    return ok(data);
  },

  'delete-calendar': async (args) => {
    const { calendarId } = DeleteCalendarSchema.parse(args);
    const data = await request('DELETE', `/calendar/v1/calendars/${calendarId}`);
    return ok(data ?? { message: '캘린더가 삭제되었습니다.' });
  },

  'update-calendar-members': async (args) => {
    const { calendarId, members } = UpdateCalendarMembersSchema.parse(args);
    const data = await request('PUT', `/calendar/v1/calendars/${calendarId}/members`, { members });
    return ok(data ?? { message: '멤버가 업데이트되었습니다.' });
  },

  'get-calendar-events': async (args) => {
    const { calendarId, timeMin, timeMax, page, size } = GetCalendarEventsSchema.parse(args);
    const calId = calendarId || '*';
    const data = await request('GET', `/calendar/v1/calendars/${calId}/events`, null, {
      timeMin,
      timeMax,
      page,
      size,
    });
    return ok(data);
  },

  'get-calendar-event': async (args) => {
    const { calendarId, eventId } = GetCalendarEventSchema.parse(args);
    const data = await request('GET', `/calendar/v1/calendars/${calendarId}/events/${eventId}`);
    return ok(data);
  },

  'create-calendar-event': async (args) => {
    const { calendarId, attendeesTo, attendeesCc, description, ...rest } = CreateCalendarEventSchema.parse(args);
    const body = {
      ...rest,
      users: buildUsers(attendeesTo, attendeesCc),
      body: { mimeType: 'text/html', content: description ?? '' },
    };
    const data = await request('POST', `/calendar/v1/calendars/${calendarId}/events`, body);
    return ok(data);
  },

  'update-calendar-event': async (args) => {
    const { calendarId, eventId, attendeesTo, attendeesCc, description, ...rest } = UpdateCalendarEventSchema.parse(args);
    const body = {
      ...rest,
      body: { mimeType: 'text/html', content: description ?? '' },
    };
    if (attendeesTo !== undefined || attendeesCc !== undefined) {
      body.users = buildUsers(attendeesTo, attendeesCc);
    }
    const data = await request('PUT', `/calendar/v1/calendars/${calendarId}/events/${eventId}`, body);
    return ok(data ?? { message: '이벤트가 수정되었습니다.' });
  },

  'delete-calendar-event': async (args) => {
    const { calendarId, eventId } = DeleteCalendarEventSchema.parse(args);
    const data = await request('POST', `/calendar/v1/calendars/${calendarId}/events/${eventId}/delete`, {});
    return ok(data ?? { message: '이벤트가 삭제되었습니다.' });
  },
};

// ── Server ────────────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'dooray-calendar-mcp', version: '1.0.0' },
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
process.stderr.write('Dooray Calendar MCP Server started\n');
